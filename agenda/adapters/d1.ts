import type { SqlResult, SqlStatement, SqlStore, SqlValue } from '../core/contracts.ts';

/** Structural subset of Workers D1. No Node dependency belongs in this module. */
export interface D1StatementResult<T = Record<string, unknown>> {
  success: boolean;
  error?: string;
  results?: T[];
  meta?: { changes?: number; last_row_id?: number };
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1StatementResult<T>>;
  run(): Promise<D1StatementResult>;
}
export interface D1Binding {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1StatementResult[]>;
}

function assertSuccess<T>(result: D1StatementResult<T>): D1StatementResult<T> {
  if (!result.success) throw new Error(result.error ?? 'D1 statement failed.');
  return result;
}

function sqlValue(value: unknown): SqlValue {
  if (value === null || typeof value === 'string' || typeof value === 'number') return value;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (
    Array.isArray(value) &&
    value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    return new Uint8Array(value);
  }
  throw new TypeError('D1 returned an unsupported SQL value.');
}

function resultValue(result: D1StatementResult): SqlResult {
  assertSuccess(result);
  const rows = result.results?.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, sqlValue(value)])),
  );
  return {
    changes: result.meta?.changes ?? 0,
    lastInsertRowid: result.meta?.last_row_id,
    rows: rows ?? [],
  };
}

/** Delegates the whole batch to D1's documented transaction, never independent runs. */
export class D1Store implements SqlStore {
  private binding: D1Binding;

  constructor(binding: D1Binding) {
    this.binding = binding;
  }

  private prepare(sql: string, params: SqlValue[] = []): D1PreparedStatement {
    const values = params.map((value) =>
      value instanceof Uint8Array ? new Uint8Array(value).buffer : value,
    );
    return this.binding.prepare(sql).bind(...values);
  }

  async all<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const result = assertSuccess(await this.prepare(sql, params).all());
    return (result.results ?? []).map(
      (row) =>
        Object.fromEntries(Object.entries(row).map(([key, value]) => [key, sqlValue(value)])) as T,
    );
  }

  async run(sql: string, params: SqlValue[] = []): Promise<SqlResult> {
    return resultValue(await this.prepare(sql, params).run());
  }

  async batch(statements: SqlStatement[]): Promise<SqlResult[]> {
    if (statements.length === 0) return [];
    const result = await this.binding.batch(
      statements.map((statement) => this.prepare(statement.sql, statement.params)),
    );
    if (result.length !== statements.length) throw new Error('D1 returned an incomplete batch.');
    return result.map(resultValue);
  }
}
