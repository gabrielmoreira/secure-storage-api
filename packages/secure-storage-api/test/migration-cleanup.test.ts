import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SecureStorageDefaultValueError,
  SecureStorageLegacyFallbackError,
  SecureStorageMigrationError,
  createMemorySecureStorageBackend,
  createMigratingJsonCodec,
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

test('legacy fallback migrates the value into new storage and marks cleanup as pending', async () => {
  // Given
  let legacyReads = 0;
  const storage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });
  const property = defineSecureStorageProperty({
    namespace: 'auth',
    name: 'refreshToken',
    legacyFallback: async () => {
      legacyReads += 1;
      return 'legacy-token';
    },
    legacyCleanup: async () => {},
  });

  // When
  const first = await storage.get(property);
  const second = await storage.get(property);
  const item = await storage._inspect(property);

  // Then
  assert.equal(first, 'legacy-token');
  assert.equal(second, 'legacy-token');
  assert.equal(legacyReads, 1);
  assert.equal(item.metadata.legacyCleanupStatus, 'pending');
});

test('legacy cleanup stays pending by default when cleanup execution is disabled', async () => {
  // Given
  let cleanupRuns = 0;
  const storage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });
  const property = defineSecureStorageProperty({
    namespace: 'auth',
    name: 'refreshToken',
    legacyFallback: async () => 'legacy-token',
    legacyCleanup: async () => {
      cleanupRuns += 1;
    },
  });

  // When
  const value = await storage.get(property);
  const item = await storage._inspect(property);

  // Then
  assert.equal(value, 'legacy-token');
  assert.equal(cleanupRuns, 0);
  assert.equal(item.metadata.legacyCleanupStatus, 'pending');
});

test('runLegacyCleanup executes pending cleanups at most once and marks success', async () => {
  // Given
  let cleanupRuns = 0;
  const backend = createMemorySecureStorageBackend();
  const migrateOnlyStorage = await createSecureStorage({
    backend,
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });
  const property = defineSecureStorageProperty({
    namespace: 'auth',
    name: 'refreshToken',
    legacyFallback: async () => 'legacy-token',
    legacyCleanup: async () => {
      cleanupRuns += 1;
    },
  });
  await migrateOnlyStorage.get(property);
  const cleanupStorage = await createSecureStorage({
    backend,
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
    featureFlags: { legacyCleanupEnabled: true },
  });

  // When
  const first = await cleanupStorage.runLegacyCleanup([property]);
  const second = await cleanupStorage.runLegacyCleanup([property]);
  const item = await cleanupStorage._inspect(property);

  // Then
  assert.deepEqual(first, {
    checked: 1,
    pending: 1,
    succeeded: 1,
    failed: 0,
    skipped: 0,
  });
  assert.deepEqual(second, {
    checked: 1,
    pending: 0,
    succeeded: 0,
    failed: 0,
    skipped: 1,
  });
  assert.equal(cleanupRuns, 1);
  assert.equal(item.metadata.legacyCleanupStatus, 'succeeded');
});

test('cleanup failure does not block reads and marks the item as failed', async () => {
  // Given
  let cleanupRuns = 0;
  const storage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
    featureFlags: { legacyCleanupEnabled: true },
  });
  const property = defineSecureStorageProperty({
    namespace: 'auth',
    name: 'refreshToken',
    legacyFallback: async () => 'legacy-token',
    legacyCleanup: async () => {
      cleanupRuns += 1;
      throw new Error('cleanup boom');
    },
  });

  // When
  const first = await storage.get(property);
  const item = await storage._inspect(property);
  const second = await storage.get(property);

  // Then
  assert.equal(first, 'legacy-token');
  assert.equal(second, 'legacy-token');
  assert.equal(cleanupRuns, 1);
  assert.equal(item.metadata.legacyCleanupStatus, 'failed');
});

test('legacy fallback failures are wrapped in typed safe errors', async () => {
  // Given
  const storage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });
  const property = defineSecureStorageProperty({
    namespace: 'auth',
    name: 'refreshToken',
    legacyFallback: async () => {
      throw new Error('legacy boom');
    },
    legacyCleanup: async () => {},
  });

  // Then
  await assert.rejects(
    () => storage.get(property),
    (error) => error instanceof SecureStorageLegacyFallbackError && error.metadata.name === 'refreshToken',
  );
});

test('default value failures are wrapped in typed safe errors', async () => {
  // Given
  const storage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });
  const property = defineSecureStorageProperty({
    namespace: 'profile',
    name: 'preferences',
    codec: 'json',
    defaultValue: async () => {
      throw new Error('default boom');
    },
  });

  // Then
  await assert.rejects(
    () => storage.get(property),
    (error) => error instanceof SecureStorageDefaultValueError && error.metadata.name === 'preferences',
  );
});

test('migrating codec upgrades old stored values and writes back the latest version', async () => {
  // Given
  const backend = createMemorySecureStorageBackend();
  const storage = await createSecureStorage({
    backend,
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });
  const profileCodec = createMigratingJsonCodec({
    migrate({ value, fromVersion, toVersion }) {
      if (toVersion !== 3) {
        throw new Error('unsupported target');
      }
      if (fromVersion === 1) {
        return {
          customerId: value.customerId,
          selectedAccountId: value.accountId,
          preferredAccountType: 'current',
        };
      }
      if (fromVersion === 3) {
        return value;
      }
      throw new Error(`unsupported version ${fromVersion}`);
    },
  });
  const property = defineSecureStorageProperty({
    namespace: 'profile',
    name: 'secureUserProfile',
    version: 3,
    codec: profileCodec,
  });
  await backend.setItem(
    'secure-storage:user:profile:secureUserProfile',
    JSON.stringify({
      metadata: {
        namespace: 'profile',
        name: 'secureUserProfile',
        scope: 'user',
        version: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        legacyCleanupStatus: 'notNeeded',
      },
      encodedValue: JSON.stringify({ customerId: 'c-1', accountId: 'a-1' }),
    }),
    { requiresUserPresence: false },
  );

  // When
  const value = await storage.get(property);
  const item = await storage._inspect(property);

  // Then
  assert.deepEqual(value, {
    customerId: 'c-1',
    selectedAccountId: 'a-1',
    preferredAccountType: 'current',
  });
  assert.equal(item.metadata.version, 3);
  assert.match(item.encodedValue, /preferredAccountType/);
});

test('migrating codec rejects newer stored versions instead of downgrading', async () => {
  // Given
  const backend = createMemorySecureStorageBackend();
  const storage = await createSecureStorage({
    backend,
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });
  const property = defineSecureStorageProperty({
    namespace: 'profile',
    name: 'secureUserProfile',
    version: 2,
    codec: createMigratingJsonCodec({
      migrate({ value }) {
        return value;
      },
    }),
  });
  await backend.setItem(
    'secure-storage:user:profile:secureUserProfile',
    JSON.stringify({
      metadata: {
        namespace: 'profile',
        name: 'secureUserProfile',
        scope: 'user',
        version: 3,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        legacyCleanupStatus: 'notNeeded',
      },
      encodedValue: JSON.stringify({
        customerId: 'c-1',
        selectedAccountId: 'a-1',
        preferredAccountType: 'current',
      }),
    }),
    { requiresUserPresence: false },
  );

  // Then
  await assert.rejects(() => storage.get(property), SecureStorageMigrationError);
});
