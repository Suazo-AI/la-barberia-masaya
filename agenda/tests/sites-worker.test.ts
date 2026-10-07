import assert from 'node:assert/strict';
import test from 'node:test';
import { createSitesAgendaWorker } from '../adapters/sites.ts';
import type { SitesAgendaEnvironment } from '../adapters/sites.ts';
import type { D1Binding, D1PreparedStatement, D1StatementResult } from '../adapters/d1.ts';
import { SqliteStore, migrateSqlite } from '../adapters/sqlite.ts';
import type { SqlStatement, SqlResult, SqlValue } from '../core/contracts.ts';
import { localFixtureConfig } from '../fixtures/local.ts';

const origin = 'https://agenda.example.test';
const api = `${origin}/api/agenda/v1`;
const subject = 'approved-site-test-subject';
const config = {
  ...structuredClone(localFixtureConfig),
  mode: 'production',
  verified: true,
  verifiedAt: '2026-10-04T00:00:00Z',
  minLeadMinutes: 0,
  professionals: localFixtureConfig.professionals.map((professional) => ({
    ...professional,
    weeklyHours: Array.from({ length: 7 }, () => [[0, 1440]]),
  })),
};

// Local SQL-backed structural D1 double; no remote D1 integration is claimed.
function binding(store: SqliteStore): D1Binding {
  const statements = new WeakMap<D1PreparedStatement, SqlStatement>();
  const result = (value: SqlResult): D1StatementResult => ({
    success: true,
    results: value.rows,
    meta: { changes: value.changes, last_row_id: Number(value.lastInsertRowid ?? 0) },
  });
  return {
    prepare(sql) {
      const statement: D1PreparedStatement = {
        bind(...values) {
          statements.set(statement, { sql, params: values as SqlValue[] });
          return statement;
        },
        async all<T>() {
          return {
            success: true,
            results: await store.all<T>(sql, statements.get(statement)?.params),
          };
        },
        async run() {
          return result(await store.run(sql, statements.get(statement)?.params));
        },
      };
      statements.set(statement, { sql });
      return statement;
    },
    async batch(prepared) {
      return (await store.batch(prepared.map((statement) => statements.get(statement)!))).map(
        result,
      );
    },
  };
}

function environment(DB?: D1Binding): SitesAgendaEnvironment {
  return {
    DB,
    AGENDA_CONFIG_JSON: JSON.stringify(config),
    AGENDA_ADMIN_SUBJECTS_JSON: JSON.stringify([subject]),
    AGENDA_ALLOWED_ORIGINS_JSON: JSON.stringify([origin]),
  };
}

test('Sites API fails closed before any DB access for missing/invalid configuration and owner setup', async () => {
  let calls = 0;
  const DB: D1Binding = {
    prepare() {
      calls++;
      throw new Error('must not reach storage');
    },
    async batch() {
      calls++;
      throw new Error('must not reach storage');
    },
  };
  const worker = createSitesAgendaWorker({});
  const cases: SitesAgendaEnvironment[] = [
    {},
    environment(),
    { ...environment(DB), AGENDA_CONFIG_JSON: 'null' },
    { ...environment(DB), AGENDA_CONFIG_JSON: '{' },
    { ...environment(DB), AGENDA_CONFIG_JSON: JSON.stringify(localFixtureConfig) },
    { ...environment(DB), AGENDA_CONFIG_JSON: JSON.stringify({ ...config, verified: false }) },
    { ...environment(DB), AGENDA_ADMIN_SUBJECTS_JSON: '[]' },
    { ...environment(DB), AGENDA_ADMIN_SUBJECTS_JSON: JSON.stringify(['owner,other']) },
    {
      ...environment(DB),
      AGENDA_ALLOWED_ORIGINS_JSON: JSON.stringify(['https://agenda.example.test/']),
    },
    {
      ...environment(DB),
      AGENDA_ALLOWED_ORIGINS_JSON: JSON.stringify(['http://agenda.example.test']),
    },
  ];
  for (const env of cases) {
    const response = await worker.fetch(new Request(`${api}/catalog`), env);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal((await response.json()).error.code, 'CONFIGURATION_REQUIRED');
  }
  assert.equal(calls, 0);
});

test('Sites adapter uses exact approved dispatcher subject and ignores email/client roles', async (t) => {
  const store = new SqliteStore(':memory:');
  t.after(() => store.close());
  await migrateSqlite(store);
  const worker = createSitesAgendaWorker({});
  const env = environment(binding(store));
  const catalog = await worker.fetch(new Request(`${api}/catalog`), env);
  assert.equal(catalog.status, 200);
  assert.equal((await catalog.json()).notifications, 'disabled');
  const deniedHeaders: Record<string, string>[] = [
    {},
    { 'oai-authenticated-user-email': subject },
    { 'oai-authenticated-user-id': 'unapproved-site-subject', 'x-role': 'admin' },
    { 'x-user-id': subject, 'x-role': 'admin' },
  ];
  for (const headers of deniedHeaders) {
    const response = await worker.fetch(new Request(`${api}/admin/export`, { headers }), env);
    assert.ok([401, 403].includes(response.status));
  }
  const allowed = await worker.fetch(
    new Request(`${api}/admin/export`, {
      headers: { 'oai-authenticated-user-id': subject },
    }),
    env,
  );
  assert.equal(allowed.status, 200);
  assert.match(allowed.headers.get('Cache-Control')!, /no-store/);
});

test('Sites anonymous booking stores one allocation and replays its receipt through D1 adapter', async (t) => {
  const store = new SqliteStore(':memory:');
  t.after(() => store.close());
  await migrateSqlite(store);
  const env = environment(binding(store));
  const worker = createSitesAgendaWorker({});
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const headers = {
    Origin: origin,
    'Content-Type': 'application/json',
    'Idempotency-Key': crypto.randomUUID(),
  };
  const body = JSON.stringify({
    serviceId: 'cut',
    date,
    startMinute: 840,
    configVersion: 1,
    managementToken: Buffer.alloc(32, 7).toString('base64url'),
  });
  const call = () =>
    worker.fetch(new Request(`${api}/bookings`, { method: 'POST', headers, body }), env);
  const first = await call();
  assert.equal(first.status, 201);
  const receipt = await first.json();
  const replay = await call();
  assert.equal(replay.status, 201);
  assert.deepEqual(await replay.json(), receipt);
  assert.equal((await store.all('SELECT * FROM agenda_entries')).length, 1);
  assert.equal((await store.all('SELECT * FROM agenda_outbox')).length, 1);
  assert.equal(
    (await store.all<{ status: string }>('SELECT status FROM agenda_outbox'))[0]?.status,
    'disabled',
  );
  const denied = await worker.fetch(
    new Request(`${api}/bookings`, {
      method: 'POST',
      headers: { ...headers, Origin: 'https://evil.example.test' },
      body,
    }),
    env,
  );
  assert.equal(denied.status, 403);
});

test('Sites assets stay reachable while APIs are closed; private/generated paths are never served', async () => {
  const worker = createSitesAgendaWorker({
    '/index.html': { type: 'text/html; charset=utf-8', base64: btoa('<h1>Public site</h1>') },
    '/404.html': { type: 'text/html; charset=utf-8', base64: btoa('<h1>Missing</h1>') },
  });
  for (const path of ['/', '/index.html?cache=1']) {
    const response = await worker.fetch(new Request(`${origin}${path}`), {});
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '<h1>Public site</h1>');
    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  }
  for (const path of [
    '/.openai/hosting.json',
    '/server/index.js',
    '/agenda/config.example.json',
    '/constructor',
    '/signin-with-chatgpt',
  ])
    assert.equal((await worker.fetch(new Request(`${origin}${path}`), {})).status, 404);
  const head = await worker.fetch(new Request(origin, { method: 'HEAD' }), {});
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await worker.fetch(new Request(origin, { method: 'POST' }), {})).status, 405);
});

test('Sites image CSP permits only exact verified configured photo origins', async () => {
  const worker = createSitesAgendaWorker({
    '/index.html': { type: 'text/html', base64: btoa('<h1>Public</h1>') },
  });
  const DB: D1Binding = {
    prepare() {
      throw new Error('asset serving must not query DB');
    },
    async batch() {
      throw new Error('asset serving must not query DB');
    },
  };
  for (const photoUrl of [
    'https://approved-photos.example.test/path/photo.webp',
    'https://example.test;script-src.evil.test/photo.webp',
  ]) {
    const env = environment(DB);
    env.AGENDA_CONFIG_JSON = JSON.stringify({
      ...config,
      professionals: config.professionals.map((professional) => ({ ...professional, photoUrl })),
    });
    const response = await worker.fetch(new Request(origin), env);
    assert.equal(response.status, 200);
    const csp = response.headers.get('Content-Security-Policy')!;
    if (photoUrl.includes('approved-photos'))
      assert.match(csp, /img-src 'self' https:\/\/approved-photos\.example\.test;/);
    else assert.match(csp, /img-src 'self';/);
    assert.doesNotMatch(csp, /img-src 'self' https:;/);
    assert.match(csp, /script-src 'self';/);
    assert.equal(csp.split('script-src').length, 2);
  }
  const closed = await worker.fetch(new Request(origin), {});
  assert.match(closed.headers.get('Content-Security-Policy')!, /img-src 'self';/);
});

test('Sites server mapping isolates barber scope and rejects ambiguous identity configuration', async (t) => {
  const store = new SqliteStore(':memory:');
  t.after(() => store.close());
  await migrateSqlite(store);
  const worker = createSitesAgendaWorker({});
  const env = {
    ...environment(binding(store)),
    AGENDA_BARBER_SUBJECTS_JSON: JSON.stringify({ 'site-barber': 'a' }),
  };
  const headers = {
    'oai-authenticated-user-id': 'site-barber',
    'X-Role': 'owner',
    'X-Professional-Id': 'b',
  };
  const session = await worker.fetch(new Request(`${api}/admin/session`, { headers }), env);
  assert.equal(session.status, 200);
  assert.deepEqual(await session.json(), {
    role: 'barber',
    professionalId: 'a',
    capabilities: { manageShop: false, reportAbsence: true },
  });
  assert.equal(
    (await worker.fetch(new Request(`${api}/admin/export`, { headers }), env)).status,
    403,
  );
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  assert.equal(
    (
      await worker.fetch(
        new Request(`${api}/admin/schedule?date=${date}&professionalId=b`, { headers }),
        env,
      )
    ).status,
    403,
  );
  const own = await worker.fetch(
    new Request(`${api}/admin/absences`, {
      method: 'POST',
      headers: {
        ...headers,
        Origin: origin,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'site-absence-own',
      },
      body: JSON.stringify({
        professionalId: 'a',
        startDate: date,
        startMinute: 800,
        endDate: date,
        endMinute: 900,
        configVersion: 1,
      }),
    }),
    env,
  );
  assert.equal(own.status, 201);
  assert.equal((await own.json()).status, 'active');
  for (const value of [
    '[]',
    'null',
    '{',
    JSON.stringify({ [subject]: 'a' }),
    JSON.stringify({ 'site-barber': 'missing' }),
    JSON.stringify({ 'site-barber': 1 }),
    JSON.stringify({ 'bad subject': 'a' }),
  ]) {
    const invalid = { ...env, AGENDA_BARBER_SUBJECTS_JSON: value };
    const response = await worker.fetch(new Request(`${api}/catalog`), invalid);
    assert.equal(response.status, 503, value);
    assert.equal((await response.json()).error.code, 'CONFIGURATION_REQUIRED');
  }
});

test('Sites self-identity is available before configuration without DB access or role grants', async () => {
  let calls = 0;
  const DB = {
    prepare() {
      calls++;
      throw new Error('must not read DB');
    },
    async batch() {
      calls++;
      throw new Error('must not write DB');
    },
  };
  const worker = createSitesAgendaWorker({});
  const env = { DB };
  const anonymous = await worker.fetch(new Request(`${api}/identity`), env);
  assert.equal(anonymous.status, 200);
  assert.deepEqual(await anonymous.json(), {
    authenticated: false,
    signInPath: '/signin-with-chatgpt?return_to=%2Fadmin.html',
    signOutPath: '/signout-with-chatgpt?return_to=%2Fadmin.html',
  });
  const signedIn = await worker.fetch(
    new Request(`${api}/identity`, {
      headers: {
        'oai-authenticated-user-id': 'self-only-site-subject',
        'oai-authenticated-user-email': 'synthetic@example.test',
        'X-Role': 'owner',
      },
    }),
    env,
  );
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.headers.get('Cache-Control'), 'no-store');
  assert.equal(signedIn.headers.get('Pragma'), 'no-cache');
  assert.equal(signedIn.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(signedIn.headers.get('Access-Control-Allow-Origin'), null);
  const own = await signedIn.json();
  assert.deepEqual(own, {
    authenticated: true,
    subject: 'self-only-site-subject',
    signInPath: '/signin-with-chatgpt?return_to=%2Fadmin.html',
    signOutPath: '/signout-with-chatgpt?return_to=%2Fadmin.html',
  });
  assert.doesNotMatch(JSON.stringify(own), /synthetic@example|owner|barber|role|email/);
  assert.equal(
    (
      await worker.fetch(
        new Request(`${api}/admin/session`, {
          headers: { 'oai-authenticated-user-id': own.subject },
        }),
        env,
      )
    ).status,
    503,
  );
  assert.equal(calls, 0);
});

test('Sites self-identity ignores fallback identity/email/role headers and rejects malformed dispatcher subjects', async () => {
  const worker = createSitesAgendaWorker({});
  for (const headers of [
    {
      'x-user-id': subject,
      'x-role': 'owner',
      'oai-authenticated-user-email': 'synthetic@example.test',
    },
    { 'oai-authenticated-user-id': 'one,two' },
    { 'oai-authenticated-user-id': 'a'.repeat(257) },
    { 'oai-authenticated-user-id': '' },
  ] as Record<string, string>[]) {
    const response = await worker.fetch(new Request(`${api}/identity`, { headers }), {});
    const body = await response.json();
    assert.equal(body.authenticated, false);
    assert.equal(body.subject, undefined);
    assert.equal(body.email, undefined);
  }
});

test('Sites self-identity is GET-only, no-store and same-origin with no query-based identity', async () => {
  const worker = createSitesAgendaWorker({});
  const cases = [
    new Request(`${api}/identity`, { method: 'POST' }),
    new Request(`${api}/identity`, { headers: { Origin: 'https://other.example.test' } }),
    new Request(`${api}/identity`, { headers: { Origin: 'null' } }),
    new Request(`${api}/identity`, { headers: { 'Sec-Fetch-Site': 'cross-site' } }),
    new Request(`${api}/identity`, { headers: { 'Sec-Fetch-Site': 'same-site' } }),
    new Request(`${api}/identity?subject=someone-else`),
  ];
  for (const [index, request] of cases.entries()) {
    const response = await worker.fetch(request, {});
    assert.equal(response.status, index === 0 ? 405 : index === 5 ? 400 : 403);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal((await response.json()).subject, undefined);
  }
  assert.equal(
    (
      await worker.fetch(
        new Request(`${api}/identity`, {
          headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin' },
        }),
        {},
      )
    ).status,
    200,
  );
});
