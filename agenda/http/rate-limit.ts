import { AgendaError } from '../core/contracts.ts';
import type { SqlStore } from '../core/contracts.ts';
import type { MutationRateLimiter, RateScope } from './ports.ts';

export interface SqlRateLimiterOptions {
  now?: () => Date;
  windowSeconds?: number;
  limits?: Partial<Record<RateScope, number>>;
}

const DEFAULT_LIMITS: Record<RateScope, number> = {
  'public-booking': 30,
  'customer-management': 60,
  'admin-mutation': 120,
};

/** Global buckets contain no client address, identity, token or customer data. */
export function createSqlRateLimiter(
  store: SqlStore,
  options: SqlRateLimiterOptions = {},
): MutationRateLimiter {
  const now = options.now ?? (() => new Date());
  const windowSeconds = options.windowSeconds ?? 60;
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  if (!Number.isInteger(windowSeconds) || windowSeconds < 10 || windowSeconds > 3600) {
    throw new Error('Rate window must be an integer between 10 and 3600 seconds.');
  }
  for (const limit of Object.values(limits)) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
      throw new Error('Rate limits must be integers between 1 and 10000.');
    }
  }
  return {
    async consume(scope) {
      const instant = Math.floor(now().getTime() / 1000);
      if (!Number.isSafeInteger(instant)) {
        throw new AgendaError('STORAGE_UNAVAILABLE', 503, 'Rate limiter unavailable.');
      }
      const bucket = Math.floor(instant / windowSeconds) * windowSeconds;
      try {
        const result = await store.batch([
          {
            sql: `DELETE FROM agenda_rate_limits
              WHERE (scope, bucket) IN (
                SELECT scope, bucket FROM agenda_rate_limits WHERE bucket < ? LIMIT 32
              )`,
            params: [bucket - 86_400],
          },
          {
            sql: `INSERT INTO agenda_rate_limits (scope, bucket, count) VALUES (?, ?, 1)
              ON CONFLICT(scope, bucket) DO UPDATE SET count = count + 1
              WHERE count < ? RETURNING count`,
            params: [scope, bucket, limits[scope]],
          },
        ]);
        return {
          allowed: (result[1]?.rows?.length ?? 0) === 1,
          retryAfterSeconds: Math.max(1, bucket + windowSeconds - instant),
        };
      } catch {
        throw new AgendaError('STORAGE_UNAVAILABLE', 503, 'Rate limiter unavailable.');
      }
    },
  };
}
