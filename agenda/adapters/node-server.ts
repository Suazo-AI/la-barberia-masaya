import { createServer } from 'node:http';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import {
  agendaUnavailableResponse,
  AGENDA_API_PREFIX,
  createAgendaRouter,
} from '../http/router.ts';
import type { AgendaHandler, AgendaRouterOptions, TrustedIdentityResolver } from '../http/ports.ts';

export interface AgendaNodeServerOptions extends Omit<
  AgendaRouterOptions,
  'allowedOrigins' | 'adminSubjects'
> {
  hostname?: '127.0.0.1' | '::1';
  port?: number;
  publicOrigin?: string;
  allowedOrigins?: readonly string[];
  adminSubjects?: readonly string[];
  /** Explicit local/test opt-in. Refused for every mode except fixture. */
  fixtureAdmin?: boolean;
  fallback?: AgendaHandler;
}

export interface RunningAgendaNodeServer {
  server: Server;
  origin: string;
  close(): Promise<void>;
}

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function publicOrigin(value: string): string {
  const parsed = new URL(value);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('publicOrigin must be an exact HTTP(S) origin.');
  }
  return parsed.origin;
}

async function writeResponse(response: Response, outgoing: ServerResponse): Promise<void> {
  outgoing.statusCode = response.status;
  for (const [name, value] of response.headers) outgoing.setHeader(name, value);
  if (!response.body) {
    outgoing.end();
    return;
  }
  const reader = response.body.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (!outgoing.write(next.value)) await once(outgoing, 'drain');
    }
    outgoing.end();
  } finally {
    reader.releaseLock();
  }
}

function webRequest(incoming: IncomingMessage, origin: string): Request {
  if (!incoming.url?.startsWith('/') || incoming.url.length > 2048) {
    throw new Error('Invalid request target.');
  }
  const parsed = new URL(incoming.url, origin);
  if (parsed.origin !== origin) throw new Error('Invalid request target.');
  const headers = new Headers();
  for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
    headers.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
  }
  const controller = new AbortController();
  incoming.once('aborted', () => controller.abort());
  const method = incoming.method ?? 'GET';
  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers,
    signal: controller.signal,
  };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
    init.duplex = 'half';
  }
  return new Request(parsed, init);
}

/** Always binds loopback. Hosting-specific public servers use a separately reviewed adapter. */
export async function startAgendaNodeServer(
  options: AgendaNodeServerOptions,
): Promise<RunningAgendaNodeServer> {
  const hostname = options.hostname ?? '127.0.0.1';
  if (!['127.0.0.1', '::1'].includes(hostname)) {
    throw new Error('The local agenda server only accepts a loopback bind address.');
  }
  const port = options.port ?? 0;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid server port.');
  if (options.fixtureAdmin && options.mode !== 'fixture') {
    throw new Error('The fixture administrator is unavailable outside fixture mode.');
  }
  if (options.mode === 'fixture' && process.env.NODE_ENV === 'production') {
    throw new Error('Fixture mode is unavailable in a production process.');
  }
  if (options.mode === 'production' && !options.publicOrigin) {
    throw new Error('Production requires an explicitly configured publicOrigin.');
  }
  if (options.mode === 'production' && !options.allowedOrigins?.length) {
    throw new Error('Production requires explicitly configured allowedOrigins.');
  }
  const explicitOrigin = options.publicOrigin ? publicOrigin(options.publicOrigin) : undefined;
  let origin = explicitOrigin ?? '';
  let handler: AgendaHandler = async () => agendaUnavailableResponse();
  const server = createServer(async (incoming, outgoing) => {
    try {
      // Do not trust Host or proxy headers to select the origin or local fixture identity.
      if (!origin || incoming.headers.host !== new URL(origin).host) {
        await writeResponse(
          new Response(
            JSON.stringify({
              error: { code: 'FORBIDDEN', message: 'This request is not authorized.' },
            }),
            {
              status: 403,
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff',
              },
            },
          ),
          outgoing,
        );
        return;
      }
      const request = webRequest(incoming, origin);
      const context = { runtime: 'node' as const, remoteAddress: incoming.socket.remoteAddress };
      const url = new URL(request.url);
      const response =
        url.pathname.startsWith(`${AGENDA_API_PREFIX}/`) || !options.fallback
          ? await handler(request, context)
          : await options.fallback(request, context);
      await writeResponse(response, outgoing);
    } catch {
      if (outgoing.headersSent) outgoing.destroy();
      else
        await writeResponse(agendaUnavailableResponse(), outgoing).catch(() => outgoing.destroy());
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 40;
  server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, hostname, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const boundPort = (server.address() as AddressInfo).port;
  origin = explicitOrigin ?? `http://${hostname === '::1' ? '[::1]' : hostname}:${boundPort}`;
  let identityResolver: TrustedIdentityResolver | undefined = options.identityResolver;
  let adminSubjects = options.adminSubjects ?? [];
  if (options.fixtureAdmin) {
    const subject = 'local-fixture-owner';
    identityResolver = {
      async resolve(_request, context) {
        return context.runtime === 'node' && isLoopback(context.remoteAddress) ? { subject } : null;
      },
    };
    adminSubjects = [subject];
  }
  try {
    handler = createAgendaRouter({
      service: options.service,
      mode: options.mode,
      allowedOrigins: options.allowedOrigins ?? [origin],
      adminSubjects,
      identityResolver,
      rateLimiter: options.rateLimiter,
      bodyLimitBytes: options.bodyLimitBytes,
    });
  } catch (error) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw error;
  }
  return {
    server,
    origin,
    async close() {
      server.closeIdleConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
