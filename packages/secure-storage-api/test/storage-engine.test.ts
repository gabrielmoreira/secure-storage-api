import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SecureStorageAccessError,
  createMemorySecureStorageBackend,
  createSecureStorage,
  defineSecureStorageProperty,
} from '../src/index.ts';

function createAuthStateProvider(state) {
  return {
    async getAuthState() {
      return state;
    },
  };
}

test('set and get round-trip a stored string value through the memory backend', async () => {
  // Given
  const storage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });
  const property = defineSecureStorageProperty({ namespace: 'auth', name: 'refreshToken' });

  // When
  await storage.set(property, 'token-123');

  // Then
  assert.equal(await storage.get(property), 'token-123');
  assert.equal(await storage.has(property), true);
});

test('remove deletes only the new stored value', async () => {
  // Given
  const storage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });
  const property = defineSecureStorageProperty({ namespace: 'auth', name: 'refreshToken' });
  await storage.set(property, 'token-123');

  // When
  await storage.remove(property);

  // Then
  assert.equal(await storage.get(property), null);
  assert.equal(await storage.has(property), false);
});

test('clearUserStorage removes only user-scoped values and preserves app-scoped values', async () => {
  // Given
  const storage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });
  const userProperty = defineSecureStorageProperty({ namespace: 'auth', name: 'refreshToken' });
  const appProperty = defineSecureStorageProperty({ namespace: 'core', name: 'devicePrivateId', scope: 'app' });
  await storage.set(userProperty, 'user-token');
  await storage.set(appProperty, 'device-1');

  // When
  await storage.clearUserStorage();

  // Then
  assert.equal(await storage.get(userProperty), null);
  assert.equal(await storage.get(appProperty), 'device-1');
});

test('activeSession properties reject reads and writes when there is no active session', async () => {
  // Given
  const storage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: false }),
  });
  const property = defineSecureStorageProperty({
    namespace: 'auth',
    name: 'sessionSecret',
    access: 'activeSession',
  });

  // Then
  await assert.rejects(
    () => storage.set(property, 'secret'),
    (error) => error instanceof SecureStorageAccessError && error.code === 'access_error',
  );
  await assert.rejects(
    () => storage.get(property),
    (error) => error instanceof SecureStorageAccessError && error.code === 'access_error',
  );
});

test('user scoped properties require a bound user, while app scoped properties do not', async () => {
  // Given
  const storage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: false, hasActiveSession: false }),
  });
  const userProperty = defineSecureStorageProperty({ namespace: 'auth', name: 'refreshToken' });
  const appProperty = defineSecureStorageProperty({ namespace: 'core', name: 'devicePrivateId', scope: 'app' });

  // Then
  await assert.rejects(() => storage.set(userProperty, 'token'), SecureStorageAccessError);
  await storage.set(appProperty, 'device-1');
  assert.equal(await storage.get(appProperty), 'device-1');
});

test('userPresence properties pass backend access options for reads and writes', async () => {
  // Given
  const calls = [];
  const backend = {
    async getItem(key, options) {
      calls.push({ method: 'getItem', key, options });
      return null;
    },
    async setItem(key, value, options) {
      calls.push({ method: 'setItem', key, value, options });
    },
    async removeItem(key) {
      calls.push({ method: 'removeItem', key });
    },
    async getAllKeys() {
      calls.push({ method: 'getAllKeys' });
      return [];
    },
  };
  const storage = await createSecureStorage({
    backend,
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });
  const property = defineSecureStorageProperty({
    namespace: 'payments',
    name: 'consentToken',
    access: 'userPresence',
  });

  // When
  await storage.set(property, 'consent-1');
  await storage.get(property);

  // Then
  const sensitiveCalls = calls.filter((call) => call.method === 'setItem' || call.method === 'getItem');
  assert.ok(sensitiveCalls.length >= 2);
  assert.deepEqual(
    sensitiveCalls.map((call) => call.options),
    sensitiveCalls.map(() => ({ propertyOptions: undefined, requiresUserPresence: true })),
  );
});

test('stored items include metadata timestamps and preserve createdAt on overwrite', async () => {
  // Given
  const timestamps = [
    new Date('2026-01-01T00:00:00.000Z'),
    new Date('2026-01-01T00:00:10.000Z'),
  ];
  const storage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
    now: () => timestamps.shift() ?? new Date('2026-01-01T00:00:20.000Z'),
  });
  const property = defineSecureStorageProperty({ namespace: 'auth', name: 'refreshToken' });

  // When
  await storage.set(property, 'token-1');
  await storage.set(property, 'token-2');
  const debugItem = await storage._inspect(property);

  // Then
  assert.equal(debugItem.metadata.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(debugItem.metadata.updatedAt, '2026-01-01T00:00:10.000Z');
  assert.equal(debugItem.metadata.version, 1);
  assert.equal(debugItem.metadata.legacyCleanupStatus, 'notNeeded');
});

test('get persists direct defaultValue when the new storage is empty', async () => {
  // Given
  const storage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });
  const property = defineSecureStorageProperty({
    namespace: 'onboarding',
    name: 'hasAcceptedTerms',
    codec: 'boolean',
    defaultValue: false,
  });

  // Then
  assert.equal(await storage.get(property), false);
  assert.equal(await storage.has(property), true);
});

test('get persists async defaultValue only after storage miss', async () => {
  // Given
  const storage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });
  let calls = 0;
  const property = defineSecureStorageProperty({
    namespace: 'profile',
    name: 'preferences',
    codec: 'json',
    defaultValue: async () => {
      calls += 1;
      return { selectedAccountId: null };
    },
  });

  // When
  const first = await storage.get(property);
  const second = await storage.get(property);

  // Then
  assert.deepEqual(first, { selectedAccountId: null });
  assert.deepEqual(second, { selectedAccountId: null });
  assert.equal(calls, 1);
});

test('get writes back normalized encoded values returned by codecs', async () => {
  // Given
  const backend = createMemorySecureStorageBackend();
  const storage = await createSecureStorage({
    backend,
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });
  const property = defineSecureStorageProperty({
    namespace: 'profile',
    name: 'alias',
    codec: {
      encode(value) {
        return String(value).trim().toUpperCase();
      },
      decode(encodedValue) {
        const normalized = encodedValue.trim().toUpperCase();
        return { value: normalized, normalizedEncodedValue: normalized };
      },
    },
  });
  await backend.setItem(
    'secure-storage:user:profile:alias',
    JSON.stringify({
      metadata: {
        namespace: 'profile',
        name: 'alias',
        scope: 'user',
        version: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        legacyCleanupStatus: 'notNeeded',
      },
      encodedValue: '  mixed-case  ',
    }),
    { requiresUserPresence: false },
  );

  // When
  const value = await storage.get(property);
  const debugItem = await storage._inspect(property);

  // Then
  assert.equal(value, 'MIXED-CASE');
  assert.equal(debugItem.encodedValue, 'MIXED-CASE');
});

test('missing values without fallback or default return null', async () => {
  // Given
  const storage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });
  const property = defineSecureStorageProperty({ namespace: 'auth', name: 'missingToken' });

  // Then
  assert.equal(await storage.get(property), null);
});

test('metadata mismatch throws a typed metadata error', async () => {
  // Given
  const backend = createMemorySecureStorageBackend();
  const storage = await createSecureStorage({
    backend,
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });
  const property = defineSecureStorageProperty({ namespace: 'auth', name: 'refreshToken' });
  await backend.setItem(
    'secure-storage:user:auth:refreshToken',
    JSON.stringify({
      metadata: {
        namespace: 'other',
        name: 'refreshToken',
        scope: 'user',
        version: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        legacyCleanupStatus: 'notNeeded',
      },
      encodedValue: 'token',
    }),
    { requiresUserPresence: false },
  );

  // Then
  await assert.rejects(() => storage.get(property), /metadata/i);
});
