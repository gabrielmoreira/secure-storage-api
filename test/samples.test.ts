import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMemorySecureStorageBackend,
  createMigratingJsonCodec,
  createPropertyRegistry,
  createSecureDiagnostics,
  createSecureStorage,
  createZodJsonCodec,
  defineSecureStorageProperty,
} from '../src/index.ts';

function createAuthStateProvider(state) {
  return {
    async getAuthState() {
      return state;
    },
  };
}

test('sample: quick start auth token round-trip', async () => {
  // Given
  const refreshToken = defineSecureStorageProperty({
    namespace: 'auth',
    name: 'refreshToken',
  });
  const secureStorage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({
      hasBoundUser: true,
      hasActiveSession: true,
    }),
  });

  // When
  await secureStorage.set(refreshToken, 'token-123');
  const token = await secureStorage.get(refreshToken);
  await secureStorage.remove(refreshToken);

  // Then
  assert.equal(token, 'token-123');
  assert.equal(await secureStorage.get(refreshToken), null);
});

test('sample: registry governed storage with defineProperty', async () => {
  // Given
  const registry = createPropertyRegistry();
  const refreshToken = registry.defineProperty({
    namespace: 'auth',
    name: 'refreshToken',
  });
  const secureStorage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({
      hasBoundUser: true,
      hasActiveSession: true,
    }),
    registry,
  });
  const adHocProperty = defineSecureStorageProperty({
    namespace: 'auth',
    name: 'accessToken',
  });

  // When
  await secureStorage.set(refreshToken, 'token-123');

  // Then
  assert.equal(await secureStorage.get(refreshToken), 'token-123');
  await assert.rejects(() => secureStorage.get(adHocProperty), /registered/i);
});

test('sample: default value bootstraps initial preferences once', async () => {
  // Given
  let builds = 0;
  const preferences = defineSecureStorageProperty({
    namespace: 'profile',
    name: 'preferences',
    codec: 'json',
    defaultValue: async () => {
      builds += 1;
      return { selectedAccountId: null, theme: 'system' };
    },
  });
  const secureStorage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({
      hasBoundUser: true,
      hasActiveSession: true,
    }),
  });

  // When
  const first = await secureStorage.get(preferences);
  const second = await secureStorage.get(preferences);

  // Then
  assert.deepEqual(first, { selectedAccountId: null, theme: 'system' });
  assert.deepEqual(second, { selectedAccountId: null, theme: 'system' });
  assert.equal(builds, 1);
});

test('sample: legacy fallback migrates a token into the new storage', async () => {
  // Given
  let legacyReads = 0;
  const refreshToken = defineSecureStorageProperty({
    namespace: 'auth',
    name: 'refreshToken',
    legacyFallback: async () => {
      legacyReads += 1;
      return 'legacy-token';
    },
    legacyCleanup: async () => {},
  });
  const secureStorage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({
      hasBoundUser: true,
      hasActiveSession: true,
    }),
  });

  // When
  const first = await secureStorage.get(refreshToken);
  const second = await secureStorage.get(refreshToken);
  const item = await secureStorage._inspect(refreshToken);

  // Then
  assert.equal(first, 'legacy-token');
  assert.equal(second, 'legacy-token');
  assert.equal(legacyReads, 1);
  assert.equal(item.metadata.legacyCleanupStatus, 'pending');
});

test('sample: versioned profile data migrates through a codec', async () => {
  // Given
  const backend = createMemorySecureStorageBackend();
  const secureUserProfile = defineSecureStorageProperty({
    namespace: 'profile',
    name: 'secureUserProfile',
    version: 3,
    codec: createMigratingJsonCodec({
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
        version: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        legacyCleanupStatus: 'notNeeded',
      },
      encodedValue: JSON.stringify({ customerId: 'c-1', accountId: 'a-1' }),
    }),
    { requiresUserPresence: false },
  );
  const secureStorage = await createSecureStorage({
    backend,
    authStateProvider: createAuthStateProvider({
      hasBoundUser: true,
      hasActiveSession: true,
    }),
  });

  // When
  const value = await secureStorage.get(secureUserProfile);
  const item = await secureStorage._inspect(secureUserProfile);

  // Then
  assert.deepEqual(value, {
    customerId: 'c-1',
    selectedAccountId: 'a-1',
    preferredAccountType: 'current',
  });
  assert.equal(item.metadata.version, 3);
});

test('sample: diagnostics provide safe visibility into stored properties', async () => {
  // Given
  const registry = createPropertyRegistry();
  const refreshToken = registry.defineProperty({
    namespace: 'auth',
    name: 'refreshToken',
  });
  const devicePrivateId = registry.defineProperty({
    namespace: 'core',
    name: 'devicePrivateId',
    scope: 'app',
  });
  const secureStorage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({
      hasBoundUser: true,
      hasActiveSession: true,
    }),
    registry,
  });
  await secureStorage.set(refreshToken, 'token-123');

  // When
  const report = await createSecureDiagnostics({ storage: secureStorage }).inspectProperties([
    refreshToken,
    devicePrivateId,
  ]);

  // Then
  assert.equal(report[0].exists, true);
  assert.equal(report[1].exists, false);
  assert.equal(JSON.stringify(report).includes('token-123'), false);
});

test('sample: schema-based codec validates decoded JSON values', async () => {
  // Given
  const preferences = defineSecureStorageProperty({
    namespace: 'profile',
    name: 'preferences',
    codec: createZodJsonCodec({
      parse(value) {
        if (!value || typeof value !== 'object' || typeof value.selectedAccountId !== 'string') {
          throw new Error('invalid schema value');
        }
        return value;
      },
    }),
  });
  const secureStorage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({
      hasBoundUser: true,
      hasActiveSession: true,
    }),
  });
  await secureStorage.set(preferences, { selectedAccountId: 'acc-1' });

  // When
  const value = await secureStorage.get(preferences);

  // Then
  assert.deepEqual(value, { selectedAccountId: 'acc-1' });
});

test('sample: app-scoped and user-scoped values behave differently during user clear', async () => {
  // Given
  const userToken = defineSecureStorageProperty({
    namespace: 'auth',
    name: 'refreshToken',
  });
  const devicePrivateId = defineSecureStorageProperty({
    namespace: 'core',
    name: 'devicePrivateId',
    scope: 'app',
  });
  const secureStorage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({
      hasBoundUser: true,
      hasActiveSession: true,
    }),
  });
  await secureStorage.set(userToken, 'user-token');
  await secureStorage.set(devicePrivateId, 'device-1');

  // When
  await secureStorage.clearUserStorage();

  // Then
  assert.equal(await secureStorage.get(userToken), null);
  assert.equal(await secureStorage.get(devicePrivateId), 'device-1');
});
