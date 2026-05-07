import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMemorySecureStorageBackend,
  createSecureStorage,
  defineSecureStorageProperty,
  createZodJsonCodec,
} from '../src/index.ts';

function createAuthStateProvider(state) {
  return {
    async getAuthState() {
      return state;
    },
  };
}

function expectNumber(_value: number) {}
function expectNumberOrNull(_value: number | null) {}
function expectBoolean(_value: boolean) {}
function expectBooleanOrNull(_value: boolean | null) {}

test('typed contract: number codec property returns number from get and accepts number in set', async () => {
  // Given
  const retryCount = defineSecureStorageProperty({
    namespace: 'sync',
    name: 'retryCount',
    codec: 'number',
  });
  const secureStorage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });

  // When
  await secureStorage.set(retryCount, 3);
  const value = await secureStorage.get(retryCount);

  // Then
  assert.equal(typeof value, 'number');
  assert.equal(value, 3);
});

test('typed contract: get stays nullable when the property has no default or legacy guarantee', async () => {
  // Given
  const retryCount = defineSecureStorageProperty({
    namespace: 'sync',
    name: 'nullableRetryCount',
    codec: 'number',
  });
  const secureStorage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });

  // When
  const value = await secureStorage.get(retryCount);

  // Then
  expectNumberOrNull(value);
  assert.equal(value, null);
});

test('typed contract: non-null defaultValue makes get return the codec value type without null', async () => {
  // Given
  const retryCount = defineSecureStorageProperty({
    namespace: 'sync',
    name: 'defaultedRetryCount',
    codec: 'number',
    defaultValue: 0,
  });
  const secureStorage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });

  // When
  const value = await secureStorage.get(retryCount);

  // Then
  expectNumber(value);
  assert.equal(value, 0);
});

test('typed contract: non-null legacyFallback makes get return the codec value type without null', async () => {
  // Given
  const hasAcceptedTerms = defineSecureStorageProperty({
    namespace: 'onboarding',
    name: 'legacyAcceptedTerms',
    codec: 'boolean',
    legacyFallback: async () => true,
    legacyCleanup: async () => {},
  });
  const secureStorage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });

  // When
  const value = await secureStorage.get(hasAcceptedTerms);

  // Then
  expectBoolean(value);
  assert.equal(value, true);
});

test('typed contract: nullable legacy plus non-null default still makes get non-null', async () => {
  // Given
  const hasAcceptedTerms = defineSecureStorageProperty({
    namespace: 'onboarding',
    name: 'resolvedAcceptedTerms',
    codec: 'boolean',
    legacyFallback: async () => null,
    legacyCleanup: async () => {},
    defaultValue: false,
  });
  const secureStorage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });

  // When
  const value = await secureStorage.get(hasAcceptedTerms);

  // Then
  expectBoolean(value);
  assert.equal(value, false);
});

test('typed contract: boolean codec property returns boolean from get and accepts boolean in set', async () => {
  // Given
  const hasAcceptedTerms = defineSecureStorageProperty({
    namespace: 'onboarding',
    name: 'hasAcceptedTerms',
    codec: 'boolean',
  });
  const secureStorage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });

  // When
  await secureStorage.set(hasAcceptedTerms, true);
  const value = await secureStorage.get(hasAcceptedTerms);

  // Then
  assert.equal(typeof value, 'boolean');
  assert.equal(value, true);
});

test('typed contract: custom schema codec property returns the schema type from get', async () => {
  // Given
  const preferences = defineSecureStorageProperty({
    namespace: 'profile',
    name: 'preferences',
    codec: createZodJsonCodec<{ selectedAccountId: string }>({
      parse(value) {
        const parsed = value as any;

        if (!parsed || typeof parsed !== 'object' || typeof parsed.selectedAccountId !== 'string') {
          throw new Error('invalid');
        }
        return parsed;
      },
    }),
  });
  const secureStorage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({ hasBoundUser: true, hasActiveSession: true }),
  });

  // When
  await secureStorage.set(preferences, { selectedAccountId: 'acc-1' });
  const value = await secureStorage.get(preferences);

  // Then
  assert.deepEqual(value, { selectedAccountId: 'acc-1' });
});
