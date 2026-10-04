import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';

// Import the shipped browser module; no browser DOM is needed by this helper.
const clientModule = new URL('../../src/booking-client.js', import.meta.url).href;
const { mutationReloadGuard } = await import(clientModule);

function storageFor(t: TestContext) {
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  });
  return { entries, storage };
}

for (const scope of ['create', 'manage', 'admin']) {
  test(`${scope} reload guard persists only a boolean sentinel until explicitly resolved`, (t) => {
    const { entries } = storageFor(t);
    const original = mutationReloadGuard(scope);
    assert.equal(original.status(), 'clear');
    assert.equal(original.arm(), true);
    assert.deepEqual([...entries], [[`agenda:pending:${scope}`, '1']]);
    // New helper instances have no in-memory request state, but see the sentinel.
    const newDocumentGuard = mutationReloadGuard(scope);
    assert.equal(newDocumentGuard.status(), 'pending');
    assert.equal(original.arm(), true);
    assert.deepEqual([...entries], [[`agenda:pending:${scope}`, '1']]);
    original.clear();
    assert.equal(newDocumentGuard.status(), 'clear');
    assert.equal(entries.size, 0);
  });
}

test('reload guard fails closed when session storage access is denied', (t) => {
  storageFor(t);
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    get() {
      throw new DOMException('Storage denied', 'SecurityError');
    },
  });
  const guard = mutationReloadGuard('create');
  assert.equal(guard.status(), 'unavailable');
  assert.equal(guard.arm(), false);
  assert.doesNotThrow(() => guard.clear());
});

test('reload guard detects throwing or silently discarded marker writes', (t) => {
  const { storage } = storageFor(t);
  const guard = mutationReloadGuard('admin');
  storage.setItem = () => {
    throw new DOMException('Storage quota reached', 'QuotaExceededError');
  };
  assert.equal(guard.arm(), false);
  storage.setItem = () => {};
  assert.equal(guard.arm(), false);
  assert.equal(guard.status(), 'clear');
});

test('a failed marker clear or unrecognized existing marker cannot reopen writes', (t) => {
  const { entries, storage } = storageFor(t);
  const guard = mutationReloadGuard('manage');
  assert.equal(guard.arm(), true);
  storage.removeItem = () => {
    throw new DOMException('Storage denied', 'SecurityError');
  };
  assert.doesNotThrow(() => guard.clear());
  assert.equal(mutationReloadGuard('manage').status(), 'pending');
  entries.set('agenda:pending:manage', 'unexpected');
  assert.equal(mutationReloadGuard('manage').status(), 'pending');
  assert.equal(mutationReloadGuard('admin').status(), 'clear');
});

test('reload guard accepts only known application scopes', () => {
  assert.throws(() => mutationReloadGuard('token-or-private-data'), TypeError);
});
