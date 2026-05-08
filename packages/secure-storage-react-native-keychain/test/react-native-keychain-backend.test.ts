import test from 'node:test';
import assert from 'node:assert/strict';

import { createReactNativeKeychainBackend, createReactNativeKeychainOptions } from '../src/index.ts';

function createReactNativeKeychainMock() {
  const items = new Map();
  const setCalls = [];
  const getCalls = [];
  const resetCalls = [];

  return {
    items,
    setCalls,
    getCalls,
    resetCalls,
    module: {
      ACCESS_CONTROL: {
        BIOMETRY_ANY_OR_DEVICE_PASSCODE: 'BIOMETRY_ANY_OR_DEVICE_PASSCODE',
        DEVICE_PASSCODE: 'DEVICE_PASSCODE',
      },
      async setGenericPassword(username, password, options = undefined) {
        setCalls.push({ username, password, options });
        items.set(options.service, { username, password });
        return { service: options.service, username, password };
      },
      async getGenericPassword(options = undefined) {
        getCalls.push({ options });
        const entry = items.get(options.service);
        return entry ? { service: options.service, username: entry.username, password: entry.password } : false;
      },
      async resetGenericPassword(options = undefined) {
        resetCalls.push({ options });
        return items.delete(options.service);
      },
      async getAllGenericPasswordServices() {
        return [...items.keys()];
      },
    },
  };
}

test('react-native-keychain adapter stores values by encoded service and reads them back as logical keys', async () => {
  const keychain = createReactNativeKeychainMock();
  const backend = createReactNativeKeychainBackend({ keychain: keychain.module });

  await backend.setItem('secure-storage:user:auth:token', 'token-123');

  assert.equal(await backend.getItem('secure-storage:user:auth:token'), 'token-123');
  assert.deepEqual(await backend.getAllKeys(), ['secure-storage:user:auth:token']);
  assert.equal(keychain.items.has('secure-storage.7365637572652d73746f726167653a757365723a617574683a746f6b656e'), true);
});

test('react-native-keychain adapter filters unrelated generic password services by prefix', async () => {
  const keychain = createReactNativeKeychainMock();
  keychain.items.set('outside:key', { username: 'outside', password: 'value' });
  const backend = createReactNativeKeychainBackend({ keychain: keychain.module });

  await backend.setItem('key-a', 'value-a');

  assert.deepEqual(await backend.getAllKeys(), ['key-a']);
});

test('react-native-keychain adapter deletes a stored service entry', async () => {
  const keychain = createReactNativeKeychainMock();
  const backend = createReactNativeKeychainBackend({ keychain: keychain.module });

  await backend.setItem('key-a', 'value-a');
  await backend.removeItem('key-a');

  assert.equal(await backend.getItem('key-a'), null);
  assert.deepEqual(await backend.getAllKeys(), []);
});

test('react-native-keychain adapter maps user presence to keychain access control', async () => {
  const keychain = createReactNativeKeychainMock();
  const backend = createReactNativeKeychainBackend({
    keychain: keychain.module,
    userPresenceOptions: {
      authenticationPrompt: { title: 'Authenticate now' },
    },
  });

  await backend.setItem('key-a', 'value-a', { requiresUserPresence: true });
  await backend.getItem('key-a', { requiresUserPresence: true });

  assert.equal(keychain.setCalls[0].options.accessControl, 'BIOMETRY_ANY_OR_DEVICE_PASSCODE');
  assert.deepEqual(keychain.setCalls[0].options.authenticationPrompt, { title: 'Authenticate now' });
  assert.equal(keychain.getCalls[0].options.accessControl, 'BIOMETRY_ANY_OR_DEVICE_PASSCODE');
});

test('react-native-keychain adapter merges property-specific options from backend access options', async () => {
  const keychain = createReactNativeKeychainMock();
  const backend = createReactNativeKeychainBackend({ keychain: keychain.module });

  await backend.setItem(
    'key-a',
    'value-a',
    {
      propertyOptions: createReactNativeKeychainOptions({
        authenticationPrompt: { title: 'Unlock value' },
        accessGroup: 'shared.group',
      }),
      requiresUserPresence: true,
    },
  );

  assert.deepEqual(keychain.setCalls[0].options.authenticationPrompt, { title: 'Unlock value' });
  assert.equal(keychain.setCalls[0].options.accessGroup, 'shared.group');
  assert.equal(keychain.setCalls[0].options.accessControl, 'BIOMETRY_ANY_OR_DEVICE_PASSCODE');
});

test('react-native-keychain adapter ignores unrelated or undecodable services when listing keys', async () => {
  const keychain = createReactNativeKeychainMock();
  keychain.items.set('secure-storage.not-hex', { username: 'bad', password: 'value' });
  keychain.items.set('outside:key', { username: 'outside', password: 'value' });
  const backend = createReactNativeKeychainBackend({ keychain: keychain.module });

  await backend.setItem('key-a', 'value-a');

  assert.deepEqual(await backend.getAllKeys(), ['key-a']);
});

test('react-native-keychain adapter can resolve the native module through global require when injection is not provided', async () => {
  const keychain = createReactNativeKeychainMock();
  const originalRequire = globalThis.require;
  globalThis.require = ((moduleName) => moduleName === 'react-native-keychain' ? keychain.module : originalRequire?.(moduleName)) as typeof globalThis.require;

  try {
    const backend = createReactNativeKeychainBackend();
    await backend.setItem('key-a', 'value-a');
    assert.equal(await backend.getItem('key-a'), 'value-a');
  } finally {
    globalThis.require = originalRequire;
  }
});
