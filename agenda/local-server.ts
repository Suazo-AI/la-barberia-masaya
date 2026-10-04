import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SqliteStore, migrateSqlite } from './adapters/sqlite.ts';
import { startAgendaNodeServer } from './adapters/node-server.ts';
import { createAgendaService } from './core/index.ts';
import type { AgendaConfig } from './core/contracts.ts';
import { createSqlRateLimiter } from './http/rate-limit.ts';

const configuredMode = process.env.AGENDA_MODE ?? 'unconfigured';
if (!['unconfigured', 'fixture', 'production'].includes(configuredMode))
  throw new Error('AGENDA_MODE must be unconfigured, fixture or production.');
if (configuredMode === 'fixture' && process.env.NODE_ENV === 'production')
  throw new Error('Local fixtures are unavailable in a production process.');
if (configuredMode !== 'fixture' && (process.env.AGENDA_NOW || process.env.AGENDA_EPHEMERAL))
  throw new Error('Fixture clock and ephemeral storage are unavailable outside fixture mode.');

let config: AgendaConfig;
if (configuredMode === 'fixture') {
  config = structuredClone((await import('./fixtures/local.ts')).localFixtureConfig);
} else {
  config = JSON.parse(
    await readFile(resolve(process.env.AGENDA_CONFIG ?? 'agenda/config.example.json'), 'utf8'),
  ) as AgendaConfig;
  if (config.mode !== configuredMode) throw new Error('Configuration mode must match AGENDA_MODE.');
}
const fixedNow = process.env.AGENDA_NOW ? new Date(process.env.AGENDA_NOW) : undefined;
if (fixedNow && !Number.isFinite(fixedNow.getTime())) throw new Error('Invalid fixture clock.');
const now = () => (fixedNow ? new Date(fixedNow) : new Date());
const storageRoot = resolve('.local-agenda');
await mkdir(storageRoot, { recursive: true });
const databasePath = resolve(
  process.env.AGENDA_DB ??
    `${storageRoot}/${config.mode}${process.env.AGENDA_EPHEMERAL === '1' ? `-${randomUUID()}` : ''}.sqlite`,
);
const privateRoots = [storageRoot, resolve('.agenda-private'), resolve('.private-evidence')];
if (!privateRoots.some((directory) => databasePath.startsWith(`${directory}${sep}`)))
  throw new Error('AGENDA_DB must be inside an ignored local private directory.');
const store = new SqliteStore(databasePath);
await migrateSqlite(store);
const service = createAgendaService(store, config, { now });
const staticRoot = resolve('dist');
const mediaTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};
const running = await startAgendaNodeServer({
  service,
  mode: config.mode,
  rateLimiter: createSqlRateLimiter(store, { now }),
  fixtureAdmin: config.mode === 'fixture',
  port: Number(process.env.PORT ?? 4183),
  // This local runner deliberately has no production identity implementation.
  // Production mode requires explicit origins and still fails closed at the router.
  ...(config.mode === 'production'
    ? {
        publicOrigin: process.env.AGENDA_ORIGIN,
        allowedOrigins: process.env.AGENDA_ORIGIN ? [process.env.AGENDA_ORIGIN] : [],
      }
    : {}),
  async fallback(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET')
      return Response.json(
        { status: 'ok', mode: config.mode, notifications: 'disabled' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    const filename = resolve(
      staticRoot,
      `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`,
    );
    if (!filename.startsWith(`${staticRoot}${sep}`) || !mediaTypes[extname(filename)])
      return new Response('Not found', { status: 404 });
    const headers = {
      'Content-Type': mediaTypes[extname(filename)],
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; img-src 'self'; font-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
    };
    try {
      return new Response(
        request.method === 'HEAD' ? null : new Uint8Array(await readFile(filename)),
        { headers },
      );
    } catch {
      return new Response('Not found', {
        status: 404,
        headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  },
});
console.log(`Local agenda: ${running.origin} · ${config.mode} · notifications disabled`);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await running.close();
  store.close();
}
process.once('SIGINT', () => {
  void stop();
});
process.once('SIGTERM', () => {
  void stop();
});
