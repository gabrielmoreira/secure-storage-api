import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPropertyRegistry,
  createSecureDiagnostics,
  createSecureStorage,
  createMemorySecureStorageBackend,
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

test('property registry tracks registered properties and rejects duplicates', () => {
  const registry = createPropertyRegistry();
  const property = defineSecureStorageProperty({
    namespace: 'auth',
    name: 'refreshToken',
  });

  registry.register(property);

  assert.deepEqual(registry.list(), [property]);
  assert.equal(registry.get('auth', 'refreshToken'), property);
  assert.throws(() => registry.register(property), /already registered/i);
});

test('secure diagnostics report only safe metadata and never stored values', async () => {
  const storage = await createSecureStorage({
    backend: createMemorySecureStorageBackend(),
    authStateProvider: createAuthStateProvider({
      hasBoundUser: true,
      hasActiveSession: true,
    }),
  });

  const refreshToken = defineSecureStorageProperty({
    namespace: 'auth',
    name: 'refreshToken',
  });
  const consent = defineSecureStorageProperty({
    namespace: 'payments',
    name: 'consentToken',
    access: 'userPresence',
  });

  await storage.set(refreshToken, 'secret-token');

  const diagnostics = await createSecureDiagnostics({ storage }).inspectProperties([
    refreshToken,
    consent,
  ]);

  assert.deepEqual(diagnostics, [
    {
      namespace: 'auth',
      name: 'refreshToken',
      scope: 'user',
      access: 'default',
      version: 1,
      exists: true,
      legacyCleanupStatus: 'notNeeded',
      createdAt: diagnostics[0].createdAt,
      updatedAt: diagnostics[0].updatedAt,
    },
    {
      namespace: 'payments',
      name: 'consentToken',
      scope: 'user',
      access: 'userPresence',
      version: 1,
      exists: false,
      legacyCleanupStatus: null,
      createdAt: null,
      updatedAt: null,
    },
  ]);

  assert.equal('encodedValue' in diagnostics[0], false);
  assert.equal('value' in diagnostics[0], false);
  assert.equal(JSON.stringify(diagnostics).includes('secret-token'), false);
});

test('createZodJsonCodec parses valid values through a schema-like contract', () => {
  const codec = createZodJsonCodec({
    parse(value) {
      if (!value || typeof value !== 'object' || typeof value.selectedAccountId !== 'string') {
        throw new Error('invalid');
      }

      return value;
    },
  });

  const decoded = codec.decode('{"selectedAccountId":"acc-1"}', {
    propertyMetadata: {
      namespace: 'profile',
      name: 'preferences',
      scope: 'user',
      access: 'default',
      version: 1,
    },
    itemMetadata: {
      namespace: 'profile',
      name: 'preferences',
      scope: 'user',
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      legacyCleanupStatus: 'notNeeded',
    },
    codecs: {},
  });

  assert.deepEqual(decoded, {
    value: {
      selectedAccountId: 'acc-1',
    },
  });
});

test('createZodJsonCodec wraps schema validation failures without leaking values', () => {
  const codec = createZodJsonCodec({
    parse() {
      throw new Error('schema rejected value');
    },
  });

  assert.throws(
    () => codec.decode('{"selectedAccountId":"acc-1"}', {
      propertyMetadata: {
        namespace: 'profile',
        name: 'preferences',
        scope: 'user',
        access: 'default',
        version: 1,
      },
      itemMetadata: {
        namespace: 'profile',
        name: 'preferences',
        scope: 'user',
        version: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        legacyCleanupStatus: 'notNeeded',
      },
      codecs: {},
    }),
    /zod|schema|decode/i,
  );
});
