import type { AgendaConfig } from './contracts.ts';

export function canonicalStringify(value: unknown): string {
  function ordered(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(ordered);
    if (input !== null && typeof input === 'object') {
      return Object.fromEntries(
        Object.keys(input)
          .sort()
          .map((key) => [key, ordered((input as Record<string, unknown>)[key])]),
      );
    }
    return input;
  }
  return JSON.stringify(ordered(value));
}

export async function hashValue(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalStringify(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const hashConfiguration = (config: AgendaConfig): Promise<string> => hashValue(config);
