import type { AgendaConfig } from '../core/contracts.ts';
import { createAgendaService, validateAgendaConfig } from '../core/index.ts';
import { createSqlRateLimiter } from '../http/rate-limit.ts';
import type { TrustedIdentityResolver } from '../http/ports.ts';
import { D1Store } from './d1.ts';
import type { D1Binding } from './d1.ts';
import { createAgendaWorker } from './worker.ts';

/** Only wire this adapter behind the Sites dispatcher, never a generic HTTP server. */
export interface SitesAgendaEnvironment {
  DB?: D1Binding;
  AGENDA_CONFIG_JSON?: string;
  AGENDA_ADMIN_SUBJECTS_JSON?: string;
  AGENDA_ALLOWED_ORIGINS_JSON?: string;
}

export interface PublicAsset {
  type: string;
  base64: string;
}

interface Settings {
  config: AgendaConfig;
  subjects: string[];
  origins: string[];
  store: D1Store;
}

const validSubject = (subject: unknown): subject is string =>
  typeof subject === 'string' && /^[^\s,\u0000-\u001f\u007f]{1,256}$/.test(subject);

function stringList(value: string | undefined): string[] {
  const parsed: unknown = JSON.parse(value ?? 'null');
  if (
    !Array.isArray(parsed) ||
    parsed.length < 1 ||
    parsed.length > 20 ||
    !parsed.every((item) => typeof item === 'string') ||
    new Set(parsed).size !== parsed.length
  )
    throw new Error('Explicit server-side configuration is required.');
  return parsed;
}

function settings(environment: SitesAgendaEnvironment): Settings {
  const config = JSON.parse(environment.AGENDA_CONFIG_JSON ?? 'null') as AgendaConfig;
  if (validateAgendaConfig(config).length || config.mode !== 'production')
    throw new Error('Verified production configuration is required.');
  const subjects = stringList(environment.AGENDA_ADMIN_SUBJECTS_JSON);
  if (!subjects.every(validSubject)) throw new Error('Invalid administrator subject allowlist.');
  const origins = stringList(environment.AGENDA_ALLOWED_ORIGINS_JSON);
  for (const origin of origins) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password)
      throw new Error('Exact HTTPS origins are required.');
  }
  if (
    !environment.DB ||
    typeof environment.DB.prepare !== 'function' ||
    typeof environment.DB.batch !== 'function'
  )
    throw new Error('D1 is unavailable.');
  return { config, subjects, origins, store: new D1Store(environment.DB) };
}

// Sites dispatch authenticates and owns this header. Email is never an authorization key.
// The portable Worker/Node adapters deliberately do not use this resolver.
const sitesIdentity: TrustedIdentityResolver = {
  async resolve(request, context) {
    if (context.runtime !== 'worker') return null;
    const subject = request.headers.get('oai-authenticated-user-id');
    return validSubject(subject) ? { subject } : null;
  },
};

const publicHeaders = {
  'Cache-Control': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; img-src 'self'; font-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
};

/** Assets are build-time allowlisted public bytes, with no assumed platform asset binding. */
export function createSitesAgendaWorker(assets: Readonly<Record<string, PublicAsset>>) {
  const configured = new WeakMap<SitesAgendaEnvironment, Settings>();
  const getSettings = (environment: SitesAgendaEnvironment) => {
    const previous = configured.get(environment);
    if (previous) return previous;
    const result = settings(environment);
    configured.set(environment, result);
    return result;
  };
  const agenda = createAgendaWorker<SitesAgendaEnvironment>({
    mode(environment) {
      return getSettings(environment).config.mode;
    },
    async createService(environment) {
      const { store, config } = getSettings(environment);
      return createAgendaService(store, config);
    },
    allowedOrigins: (environment) => getSettings(environment).origins,
    adminSubjects: (environment) => getSettings(environment).subjects,
    identityResolver: () => sitesIdentity,
    createRateLimiter: (environment) => createSqlRateLimiter(getSettings(environment).store),
  });
  function assetHeaders(environment: SitesAgendaEnvironment) {
    // Only verified configured photo origins enter CSP, never a broad HTTPS wildcard.
    // Missing setup still serves the original self-contained public site.
    try {
      const { config } = getSettings(environment);
      const photoOrigins = [
        ...new Set(
          config.professionals.flatMap(({ photoUrl }) => {
            if (!photoUrl?.startsWith('https://')) return [];
            const origin = new URL(photoUrl).origin;
            return /^https:\/\/(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(?::\d+)?$/.test(origin)
              ? [origin]
              : [];
          }),
        ),
      ];
      if (photoOrigins.length)
        return {
          ...publicHeaders,
          'Content-Security-Policy': publicHeaders['Content-Security-Policy'].replace(
            "img-src 'self'",
            `img-src 'self' ${photoOrigins.join(' ')}`,
          ),
        };
    } catch {
      // No business configuration is required for the static site.
    }
    return publicHeaders;
  }
  return {
    async fetch(request: Request, environment: SitesAgendaEnvironment): Promise<Response> {
      const pathname = new URL(request.url).pathname;
      if (pathname === '/api/agenda/v1' || pathname.startsWith('/api/agenda/v1/'))
        return agenda.fetch(request, environment);
      if (!['GET', 'HEAD'].includes(request.method))
        return new Response('Method not allowed', {
          status: 405,
          headers: { ...publicHeaders, Allow: 'GET, HEAD' },
        });
      const path = pathname === '/' ? '/index.html' : pathname;
      // Own-property lookup prevents prototype names from becoming public assets.
      const found = Object.hasOwn(assets, path) ? assets[path] : undefined;
      const asset = found ?? (Object.hasOwn(assets, '/404.html') ? assets['/404.html'] : undefined);
      const body = asset
        ? Uint8Array.from(atob(asset.base64), (character) => character.charCodeAt(0))
        : 'Not found';
      return new Response(request.method === 'HEAD' ? null : body, {
        status: found ? 200 : 404,
        headers: {
          ...assetHeaders(environment),
          'Content-Type': asset?.type ?? 'text/plain; charset=utf-8',
        },
      });
    },
  };
}
