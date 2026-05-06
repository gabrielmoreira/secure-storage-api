import test from 'node:test';
import assert from 'node:assert/strict';

import * as secureStorageApi from '../src/index.ts';

test('public entry exports the planned bootstrap surface', () => {
  assert.equal(typeof secureStorageApi.createSecureStorage, 'function');
  assert.equal(typeof secureStorageApi.createMemorySecureStorageBackend, 'function');
  assert.equal(typeof secureStorageApi.defineSecureStorageProperty, 'function');
  assert.equal(typeof secureStorageApi.builtInCodecs, 'object');
});

test('public entry exposes built-in codec names needed by the spec', () => {
  assert.deepEqual(Object.keys(secureStorageApi.builtInCodecs).sort(), [
    'boolean',
    'json',
    'number',
    'string',
  ]);
});

test('createSecureStorage bootstrap placeholder throws a clear not-implemented error', async () => {
  await assert.rejects(
    Promise.resolve().then(() => secureStorageApi.createSecureStorage()),
    /not implemented/i,
  );
});

test('defineSecureStorageProperty applies spec defaults in bootstrap slice', () => {
  const property = secureStorageApi.defineSecureStorageProperty({
    namespace: 'auth',
    name: 'refreshToken',
  });

  assert.deepEqual(property, {
    namespace: 'auth',
    name: 'refreshToken',
    scope: 'user',
    access: 'default',
    version: 1,
    codec: 'string',
  });
});
