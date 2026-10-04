import type { SqlStore, SqlValue } from '../core/contracts.ts';

export interface OutboxMessage {
  /** Transport must use this stable event ID for provider-side deduplication. */
  id: string;
  entryId: string;
  eventType: 'booking.confirmed' | 'booking.cancelled' | 'booking.rescheduled';
  entryVersion: number;
  recipient: string;
  payload: unknown;
}

export interface NotificationTransport {
  send(message: OutboxMessage): Promise<void>;
}

export interface OutboxOptions {
  /** Deliberate opt-in only. This module provisions no provider or runner. */
  enabled?: boolean;
  transport?: NotificationTransport;
  now?: () => Date;
  newLeaseId?: () => string;
  leaseSeconds?: number;
  retryBaseSeconds?: number;
  limit?: number;
}

export interface OutboxReport {
  disabled: boolean;
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  staleLease: number;
}

interface OutboxRow extends Record<string, SqlValue> {
  id: string;
  entry_id: string;
  event_type: OutboxMessage['eventType'];
  entry_version: number;
  recipient: string | null;
  payload_json: string;
  attempts: number;
}

const seconds = (now: () => Date): number => {
  const time = Math.floor(now().getTime() / 1000);
  if (!Number.isSafeInteger(time)) throw new TypeError('Outbox clock is invalid.');
  return time;
};
const integerOption = (value: number, min: number, max: number): number => {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new TypeError('Outbox option is outside its permitted range.');
  return value;
};

/**
 * At-least-once delivery with bounded attempts and a compare-and-set lease.
 * External delivery and SQL cannot be one transaction: provider deduplication
 * by event ID is still required if a process dies after sending but before ack.
 * Disabled records are never activated implicitly.
 */
export async function processOutbox(
  store: SqlStore,
  options: OutboxOptions = {},
): Promise<OutboxReport> {
  const report: OutboxReport = {
    disabled: options.enabled !== true,
    claimed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    staleLease: 0,
  };
  if (report.disabled) return report;
  const transport = options.transport;
  if (!transport) throw new TypeError('An explicitly approved notification transport is required.');
  const now = options.now ?? (() => new Date());
  const newLeaseId = options.newLeaseId ?? (() => crypto.randomUUID());
  const leaseSeconds = integerOption(options.leaseSeconds ?? 60, 10, 600);
  const retryBase = integerOption(options.retryBaseSeconds ?? 60, 1, 3600);
  const limit = integerOption(options.limit ?? 10, 1, 100);
  const recovered = await store.run(
    `UPDATE agenda_outbox SET status = 'failed', lease_id = NULL,
    lease_until = NULL, next_attempt_at = NULL, last_error = 'DELIVERY_RETRY_LIMIT'
    WHERE status = 'processing' AND attempts >= 5 AND lease_until <= ?`,
    [seconds(now)],
  );
  report.failed += recovered.changes;

  for (let index = 0; index < limit; index += 1) {
    const at = seconds(now);
    const leaseId = newLeaseId();
    if (!/^[a-zA-Z0-9_-]{22,128}$/.test(leaseId))
      throw new TypeError('Outbox lease ID must be unique and high entropy.');
    const claimed = await store.batch([
      {
        sql: `UPDATE agenda_outbox SET status = 'processing', attempts = attempts + 1,
        lease_id = ?, lease_until = ?, next_attempt_at = NULL
        WHERE id = (SELECT id FROM agenda_outbox WHERE attempts < 5 AND
          ((status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
            OR (status = 'processing' AND lease_until <= ?))
          ORDER BY created_at, id LIMIT 1)`,
        params: [leaseId, at + leaseSeconds, at, at],
      },
      {
        sql: "SELECT * FROM agenda_outbox WHERE lease_id = ? AND status = 'processing'",
        params: [leaseId],
      },
    ]);
    const rows = claimed[1]?.rows ?? [];
    if (rows.length === 0) break;
    if (rows.length !== 1 || claimed[0]?.changes !== 1)
      throw new Error('Outbox lease invariant failed.');
    const row = rows[0] as OutboxRow;
    report.claimed += 1;
    let succeeded = false;
    let permanentError: string | undefined;
    if (
      typeof row.recipient !== 'string' ||
      row.recipient.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.recipient)
    ) {
      permanentError = 'RECIPIENT_REQUIRED';
    } else {
      try {
        await transport.send({
          id: row.id,
          entryId: row.entry_id,
          eventType: row.event_type,
          entryVersion: row.entry_version,
          recipient: row.recipient,
          payload: JSON.parse(row.payload_json) as unknown,
        });
        succeeded = true;
      } catch {
        // Never store raw provider errors, tokens, message bodies or PII.
      }
    }
    const completedAt = seconds(now);
    const exhausted = row.attempts >= 5 || permanentError !== undefined;
    const status = succeeded ? 'sent' : exhausted ? 'failed' : 'pending';
    const retryAt =
      status === 'pending'
        ? completedAt + Math.min(retryBase * 2 ** (row.attempts - 1), 3600)
        : null;
    const result = await store.run(
      `UPDATE agenda_outbox SET status = ?, sent_at = ?,
      next_attempt_at = ?, lease_until = NULL, lease_id = NULL, last_error = ?
      WHERE id = ? AND status = 'processing' AND lease_id = ? AND lease_until > ?`,
      [
        status,
        succeeded ? completedAt : null,
        retryAt,
        succeeded ? null : (permanentError ?? 'TRANSPORT_FAILED'),
        row.id,
        leaseId,
        completedAt,
      ],
    );
    if (result.changes === 0) report.staleLease += 1;
    else if (succeeded) report.sent += 1;
    else if (exhausted) report.failed += 1;
    else report.retried += 1;
  }
  return report;
}
