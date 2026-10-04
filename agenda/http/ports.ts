import type { Actor, AgendaMode, AgendaService } from '../core/contracts.ts';

/** Values in this context come from the server adapter, never request headers. */
export interface AgendaRequestContext {
  runtime: 'node' | 'worker' | 'test';
  remoteAddress?: string;
}

export interface TrustedIdentity {
  subject: string;
}

/** The host must verify an identity before returning it through this port. */
export interface TrustedIdentityResolver {
  resolve(request: Request, context: AgendaRequestContext): Promise<TrustedIdentity | null>;
}

export type RateScope = 'public-booking' | 'customer-management' | 'admin-mutation';

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface MutationRateLimiter {
  consume(scope: RateScope): Promise<RateLimitDecision>;
}

export interface AgendaRouterOptions {
  service: AgendaService;
  mode: AgendaMode;
  allowedOrigins: readonly string[];
  adminSubjects: readonly string[];
  /** Server-owned stable subject → professional mapping; never populated from request data. */
  barberSubjects?: Readonly<Record<string, string>>;
  identityResolver?: TrustedIdentityResolver;
  rateLimiter?: MutationRateLimiter;
  bodyLimitBytes?: number;
}

export type AgendaHandler = (request: Request, context?: AgendaRequestContext) => Promise<Response>;

export function adminActor(subject: string): Actor {
  return { kind: 'admin', id: subject };
}
