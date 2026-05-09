import test from 'node:test';
import assert from 'node:assert/strict';

import { createExpoSecureStoreBackend, createExpoSecureStoreOptions } from '../src/index.ts';

function createDeferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createExpoSecureStoreMock() {
  const values = new Map();
  const setCalls = [];
  const getCalls = [];
  const deleteCalls = [];
  let failNextSetForKey = null;
  let pendingSet = null;

  return {
    values,
    setCalls,
    getCalls,
    deleteCalls,
    failSetForKey(key) {
      failNextSetForKey = key;
    },
    pauseNextSet() {
      pendingSet = createDeferred();
      return pendingSet;
    },
    module: {
      async getItemAsync(key, options = undefined) {
        getCalls.push({ key, options });
        return values.get(key) ?? null;
      },
      async setItemAsync(key, value, options = undefined) {
        setCalls.push({ key, value, options });
        if (pendingSet && key !== 'secure-storage.adapter.expo-secure-store.index') {
          const gate = pendingSet;
          pendingSet = null;
          await gate.promise;
        }
        if (failNextSetForKey === key) {
          failNextSetForKey = null;
          throw new Error(`set failed for ${key}`);
        }
        values.set(key, value);
      },
      async deleteItemAsync(key, options = undefined) {
        deleteCalls.push({ key, options });
        values.delete(key);
      },
    },
  };
}

test('expo adapter stores values behind provider-safe keys and tracks logical keys in a reserved index', async () => {
  const secureStore = createExpoSecureStoreMock();
  const backend = createExpoSecureStoreBackend({ secureStore: secureStore.module });

  await backend.setItem('secure-storage:user:auth:token', 'token-123');

  assert.equal(await backend.getItem('secure-storage:user:auth:token'), 'token-123');
  assert.deepEqual(await backend.getAllKeys(), ['secure-storage:user:auth:token']);
  assert.equal(secureStore.values.has('secure-storage.adapter.expo-secure-store.index'), true);
  assert.equal(secureStore.values.has('ss_7365637572652d73746f726167653a757365723a617574683a746f6b656e'), true);
});

test('expo adapter serializes concurrent mutations so the synthetic index keeps both keys', async () => {
  const secureStore = createExpoSecureStoreMock();
  const backend = createExpoSecureStoreBackend({ secureStore: secureStore.module });
  const gate = secureStore.pauseNextSet();

  const firstWrite = backend.setItem('key-a', 'value-a');
  const secondWrite = backend.setItem('key-b', 'value-b');

  gate.resolve();
  await Promise.all([firstWrite, secondWrite]);

  assert.deepEqual((await backend.getAllKeys()).sort(), ['key-a', 'key-b']);
});

test('expo adapter rolls the index back when storing a new key fails', async () => {
  const secureStore = createExpoSecureStoreMock();
  const backend = createExpoSecureStoreBackend({ secureStore: secureStore.module });

  secureStore.failSetForKey('ss_6b65792d61');

  await assert.rejects(async () => backend.setItem('key-a', 'value-a'), /set failed/i);
  assert.deepEqual(await backend.getAllKeys(), []);
});

test('expo adapter removes keys from the synthetic index before deleting the value', async () => {
  const secureStore = createExpoSecureStoreMock();
  const backend = createExpoSecureStoreBackend({ secureStore: secureStore.module });

  await backend.setItem('key-a', 'value-a');
  await backend.removeItem('key-a');

  assert.equal(await backend.getItem('key-a'), null);
  assert.deepEqual(await backend.getAllKeys(), []);
});

test('expo adapter enables user presence through requireAuthentication when requested', async () => {
  const secureStore = createExpoSecureStoreMock();
  const backend = createExpoSecureStoreBackend({
    secureStore: secureStore.module,
    userPresenceOptions: {
      authenticationPrompt: 'Authenticate now',
    },
  });

  await backend.setItem('key-a', 'value-a', { requiresUserPresence: true });
  await backend.getItem('key-a', { requiresUserPresence: true });

  const dataWrite = secureStore.setCalls.find((call) => call.key === 'ss_6b65792d61');
  const dataRead = secureStore.getCalls.find((call) => call.key === 'ss_6b65792d61');

  assert.equal(dataWrite.options.requireAuthentication, true);
  assert.equal(dataWrite.options.authenticationPrompt, 'Authenticate now');
  assert.equal(dataRead.options.requireAuthentication, true);
});

test('expo adapter merges property-specific options from backend access options', async () => {
  const secureStore = createExpoSecureStoreMock();
  const backend = createExpoSecureStoreBackend({ secureStore: secureStore.module });

  await backend.setItem(
    'key-a',
    'value-a',
    {
      propertyOptions: createExpoSecureStoreOptions({
        authenticationPrompt: 'Unlock value',
        keychainService: 'vault-service',
      }),
      requiresUserPresence: true,
    },
  );

  const dataWrite = secureStore.setCalls.find((call) => call.key === 'ss_6b65792d61');
  assert.equal(dataWrite?.options.authenticationPrompt, 'Unlock value');
  assert.equal(dataWrite?.options.keychainService, 'vault-service');
  assert.equal(dataWrite?.options.requireAuthentication, true);
});

test('expo adapter never forwards colon-delimited logical keys directly to the provider', async () => {
  const secureStore = createExpoSecureStoreMock();
  const backend = createExpoSecureStoreBackend({ secureStore: secureStore.module });

  await backend.setItem('secure-storage:app:device:appInstallId', 'install-1');

  assert.equal(secureStore.setCalls.some((call) => call.key === 'secure-storage:app:device:appInstallId'), false);
  assert.equal(secureStore.getCalls.some((call) => call.key === 'secure-storage:app:device:appInstallId'), false);
});

test('expo adapter can resolve the native module through global require when injection is not provided', async () => {
  const secureStore = createExpoSecureStoreMock();
  const originalRequire = globalThis.require;
  globalThis.require = ((moduleName) => moduleName === 'expo-secure-store' ? secureStore.module : originalRequire?.(moduleName)) as typeof globalThis.require;

  try {
    const backend = createExpoSecureStoreBackend();
    await backend.setItem('key-a', 'value-a');
    assert.equal(await backend.getItem('key-a'), 'value-a');
  } finally {
    globalThis.require = originalRequire;
  }
});
