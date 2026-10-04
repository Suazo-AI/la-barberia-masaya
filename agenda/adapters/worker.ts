import type { AgendaMode, AgendaService } from '../core/contracts.ts';
import { agendaUnavailableResponse, createAgendaRouter } from '../http/router.ts';
import type { AgendaHandler, MutationRateLimiter, TrustedIdentityResolver } from '../http/ports.ts';

/** Environment fields are supplied by a verified host integration, not invented bindings. */
export interface AgendaWorkerOptions<Environment extends object> {
  mode(environment: Environment): AgendaMode;
  createService(environment: Environment): Promise<AgendaService>;
  allowedOrigins(environment: Environment): readonly string[];
  adminSubjects(environment: Environment): readonly string[];
  identityResolver?(environment: Environment): TrustedIdentityResolver | undefined;
  createRateLimiter?(environment: Environment): MutationRateLimiter | Promise<MutationRateLimiter>;
  bodyLimitBytes?: number;
}

export interface AgendaWorker<Environment extends object> {
  fetch(request: Request, environment: Environment): Promise<Response>;
}

/** No sender, runner, Cron, Queue, Durable Object or identity header is assumed. */
export function createAgendaWorker<Environment extends object>(
  options: AgendaWorkerOptions<Environment>,
): AgendaWorker<Environment> {
  const handlers = new WeakMap<Environment, Promise<AgendaHandler>>();
  async function initialize(environment: Environment): Promise<AgendaHandler> {
    const mode = options.mode(environment);
    // Fixture mode is restricted to loopback Node and tests, never a hosted Worker.
    if (mode === 'fixture' || mode === 'unconfigured')
      return async () => agendaUnavailableResponse();
    const adminSubjects = options.adminSubjects(environment);
    const identityResolver = options.identityResolver?.(environment);
    if (!identityResolver || !adminSubjects.some((subject) => subject.length > 0)) {
      return async () => agendaUnavailableResponse();
    }
    const service = await options.createService(environment);
    const rateLimiter = await options.createRateLimiter?.(environment);
    return createAgendaRouter({
      service,
      mode,
      allowedOrigins: options.allowedOrigins(environment),
      adminSubjects,
      identityResolver,
      rateLimiter,
      bodyLimitBytes: options.bodyLimitBytes,
    });
  }
  return {
    async fetch(request, environment) {
      try {
        let handler = handlers.get(environment);
        if (!handler) {
          handler = initialize(environment);
          handlers.set(environment, handler);
        }
        return await (
          await handler
        )(request, { runtime: 'worker' });
      } catch {
        // A transient initialization failure may be retried; never log request data.
        handlers.delete(environment);
        return agendaUnavailableResponse();
      }
    },
  };
}
