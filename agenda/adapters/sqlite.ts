import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import type { SqlResult, SqlStatement, SqlStore, SqlValue } from '../core/contracts.ts';

export interface SqliteOptions {
  readOnly?: boolean;
  busyTimeoutMs?: number;
}

interface Migration {
  name: string;
  sql: string;
  sha256: string;
}

/** Local/offline adapter. Synchronous SQL never yields inside a transaction. */
export class SqliteStore implements SqlStore {
  private database: DatabaseSync;
  private readOnly: boolean;
  private closed = false;

  constructor(filePath: string, options: SqliteOptions = {}) {
    const timeout = options.busyTimeoutMs ?? 5000;
    if (!Number.isInteger(timeout) || timeout < 0 || timeout > 60000) {
      throw new TypeError('SQLite busy timeout must be an integer from 0 to 60000 milliseconds.');
    }
    this.readOnly = options.readOnly === true;
    this.database = new DatabaseSync(filePath, {
      readOnly: this.readOnly,
      enableForeignKeyConstraints: true,
      enableDoubleQuotedStringLiterals: false,
      allowExtension: false,
      timeout,
    });
    if (!this.readOnly) this.database.exec('PRAGMA journal_mode = WAL');
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('SQLite store is closed.');
  }

  async all<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    this.assertOpen();
    return this.database
      .prepare(sql)
      .all(...params)
      .map((row) => ({ ...row }) as T);
  }

  private execute(statement: SqlStatement): SqlResult {
    const prepared = this.database.prepare(statement.sql);
    const params = statement.params ?? [];
    if (prepared.columns().length === 0) {
      const result = prepared.run(...params);
      return {
        changes: Number(result.changes),
        lastInsertRowid: Number(result.lastInsertRowid),
        rows: [],
      };
    }
    // SELECT and DML RETURNING both expose columns. total_changes distinguishes
    // a read from a write without executing the prepared statement twice.
    const before = this.database.prepare('SELECT total_changes() AS total').get();
    const rows = prepared.all(...params).map((row) => ({ ...row }) as Record<string, SqlValue>);
    const after = this.database
      .prepare(
        'SELECT total_changes() AS total, changes() AS changes, last_insert_rowid() AS rowid',
      )
      .get();
    return {
      changes: after?.total !== before?.total ? Number(after?.changes) : 0,
      lastInsertRowid: Number(after?.rowid),
      rows,
    };
  }

  async run(sql: string, params: SqlValue[] = []): Promise<SqlResult> {
    this.assertOpen();
    return this.execute({ sql, params });
  }

  async batch(statements: SqlStatement[]): Promise<SqlResult[]> {
    this.assertOpen();
    if (statements.length === 0) return [];
    this.database.exec(this.readOnly ? 'BEGIN' : 'BEGIN IMMEDIATE');
    try {
      const results = statements.map((statement) => this.execute(statement));
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  /** Migration scripts may include trigger bodies; never split them on semicolons. */
  applyMigrations(migrations: Migration[]): void {
    this.assertOpen();
    if (this.readOnly) throw new Error('Cannot migrate a read-only SQLite store.');
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const version = this.database.prepare('PRAGMA user_version').get();
      const latest = Number(migrations.at(-1)?.name.slice(0, 4) ?? 0);
      if (Number(version?.user_version) > latest) {
        throw new Error('Agenda schema version is newer than the available migrations.');
      }
      this.database.exec(`CREATE TABLE IF NOT EXISTS _agenda_migrations (
        name TEXT PRIMARY KEY NOT NULL, sha256 TEXT NOT NULL
      )`);
      for (const migration of migrations) {
        const installed = this.database
          .prepare('SELECT sha256 FROM _agenda_migrations WHERE name = ?')
          .get(migration.name);
        if (installed) {
          if (installed.sha256 !== migration.sha256) {
            throw new Error(`An applied agenda migration was modified: ${migration.name}`);
          }
          continue;
        }
        this.database.exec(migration.sql);
        this.database
          .prepare('INSERT INTO _agenda_migrations (name, sha256) VALUES (?, ?)')
          .run(migration.name, migration.sha256);
      }
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }
}

export async function migrateSqlite(store: SqliteStore): Promise<void> {
  const directory = new URL('../migrations/', import.meta.url);
  const names = (await readdir(directory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  if (names.length === 0) throw new Error('No agenda migrations are available.');
  const migrations: Migration[] = [];
  for (const name of names) {
    const sql = await readFile(new URL(name, directory), 'utf8');
    migrations.push({ name, sql, sha256: createHash('sha256').update(sql).digest('hex') });
  }
  store.applyMigrations(migrations);
}
