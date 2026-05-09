import test from 'node:test';
import assert from 'node:assert/strict';

import * as secureStorageApi from '../src/index.ts';

test('public entry exports the planned bootstrap surface', () => {
  // Then
  assert.equal(typeof secureStorageApi.createSecureStorage, 'function');
  assert.equal(typeof secureStorageApi.createMemorySecureStorageBackend, 'function');
  assert.equal(typeof secureStorageApi.defineSecureStorageProperty, 'function');
  assert.equal(typeof secureStorageApi.builtInCodecs, 'object');
});

test('public entry exposes built-in codec names needed by the spec', () => {
  // Then
  assert.deepEqual(Object.keys(secureStorageApi.builtInCodecs).sort(), [
    'boolean',
    'json',
    'number',
    'string',
  ]);
});

test('createSecureStorage returns the core storage methods once the engine exists', async () => {
  // Given
  const storage = await secureStorageApi.createSecureStorage({
    backend: secureStorageApi.createMemorySecureStorageBackend(),
    authStateProvider: {
      async getAuthState() {
        return {
          hasBoundUser: true,
          hasActiveSession: true,
        };
      },
    },
  });

  // Then
  assert.equal(typeof storage.get, 'function');
  assert.equal(typeof storage.set, 'function');
  assert.equal(typeof storage.remove, 'function');
  assert.equal(typeof storage.has, 'function');
  assert.equal(typeof storage.clearUserStorage, 'function');
});

test('defineSecureStorageProperty applies spec defaults in bootstrap slice', () => {
  // When
  const property = secureStorageApi.defineSecureStorageProperty({
    namespace: 'auth',
    name: 'refreshToken',
  });

  // Then
  assert.deepEqual(property, {
    namespace: 'auth',
    name: 'refreshToken',
    scope: 'user',
    access: 'default',
    version: 1,
    codec: 'string',
    options: undefined,
  });
});
