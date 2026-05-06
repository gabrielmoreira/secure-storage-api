import test from 'node:test';
import assert from 'node:assert/strict';

import {
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

test('storage composition root accepts ready dependencies and exposes a stable public surface', async () => {
  // Given
  const backend = createMemorySecureStorageBackend();
  const authStateProvider = createAuthStateProvider({
    hasBoundUser: true,
    hasActiveSession: true,
  });

  // When
  const storage = await createSecureStorage({
    backend,
    authStateProvider,
  });

  // Then
  assert.equal(typeof storage.get, 'function');
  assert.equal(typeof storage.set, 'function');
  assert.equal(typeof storage.remove, 'function');
  assert.equal(typeof storage.has, 'function');
  assert.equal(typeof storage.runLegacyCleanup, 'function');
});

test('storage keeps backend-specific key handling behind the adapter boundary', async () => {
  // Given
  const backend = createMemorySecureStorageBackend();
  const storage = await createSecureStorage({
    backend,
    authStateProvider: createAuthStateProvider({
      hasBoundUser: true,
      hasActiveSession: true,
    }),
  });
  const property = defineSecureStorageProperty({
    namespace: 'auth',
    name: 'refreshToken',
  });

  // When
  await storage.set(property, 'token-123');
  const inspected = await storage._inspect(property);

  // Then
  assert.equal(inspected.metadata.namespace, 'auth');
  assert.equal(inspected.metadata.name, 'refreshToken');
  assert.equal(inspected.encodedValue, 'token-123');
});
