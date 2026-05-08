import test from 'node:test';
import assert from 'node:assert/strict';

import { createReactNativeSensitiveInfoBackend } from '../src/index.ts';

function createReactNativeSensitiveInfoMock() {
  const items = new Map();
  const setCalls = [];
  const getCalls = [];
  const deleteCalls = [];
  const listCalls = [];

  return {
    items,
    setCalls,
    getCalls,
    deleteCalls,
    listCalls,
    module: {
      async setItem(key, value, options = undefined) {
        setCalls.push({ key, value, options });
        items.set(key, value);
      },
      async getItem(key, options = undefined) {
        getCalls.push({ key, options });
        if (!items.has(key)) {
          return null;
        }
        return {
          key,
          value: items.get(key),
        };
      },
      async deleteItem(key, options = undefined) {
        deleteCalls.push({ key, options });
        return items.delete(key);
      },
      async getAllItems(options = undefined) {
        listCalls.push({ options });
        return [...items.keys()].map((key) => ({ key }));
      },
      async clearService() {
        items.clear();
      },
    },
  };
}

test('react-native-sensitive-info adapter stores provider-safe keys and lists logical keys through native provider support', async () => {
  const sensitiveInfo = createReactNativeSensitiveInfoMock();
  const backend = createReactNativeSensitiveInfoBackend({ sensitiveInfo: sensitiveInfo.module });

  await backend.setItem('secure-storage:user:auth:token', 'token-123');

  assert.equal(await backend.getItem('secure-storage:user:auth:token'), 'token-123');
  assert.deepEqual(await backend.getAllKeys(), ['secure-storage:user:auth:token']);
  assert.equal(sensitiveInfo.items.has('ss_7365637572652d73746f726167653a757365723a617574683a746f6b656e'), true);
});

test('react-native-sensitive-info adapter deletes a stored value', async () => {
  const sensitiveInfo = createReactNativeSensitiveInfoMock();
  const backend = createReactNativeSensitiveInfoBackend({ sensitiveInfo: sensitiveInfo.module });

  await backend.setItem('key-a', 'value-a');
  await backend.removeItem('key-a');

  assert.equal(await backend.getItem('key-a'), null);
  assert.deepEqual(await backend.getAllKeys(), []);
});

test('react-native-sensitive-info adapter uses non-interactive defaults for normal operations', async () => {
  const sensitiveInfo = createReactNativeSensitiveInfoMock();
  const backend = createReactNativeSensitiveInfoBackend({ sensitiveInfo: sensitiveInfo.module });

  await backend.setItem('key-a', 'value-a');
  await backend.getItem('key-a');

  assert.equal(sensitiveInfo.setCalls[0].options.accessControl, 'none');
  assert.equal(sensitiveInfo.getCalls[0].options.accessControl, 'none');
});

test('react-native-sensitive-info adapter enables stronger access control for user presence reads and writes', async () => {
  const sensitiveInfo = createReactNativeSensitiveInfoMock();
  const backend = createReactNativeSensitiveInfoBackend({
    sensitiveInfo: sensitiveInfo.module,
    userPresenceOptions: {
      authenticationPrompt: {
        title: 'Authenticate now',
      },
    },
  });

  await backend.setItem('key-a', 'value-a', { requiresUserPresence: true });
  await backend.getItem('key-a', { requiresUserPresence: true });

  assert.equal(sensitiveInfo.setCalls[0].options.accessControl, 'biometryAny');
  assert.deepEqual(sensitiveInfo.setCalls[0].options.authenticationPrompt, { title: 'Authenticate now' });
  assert.equal(sensitiveInfo.getCalls[0].options.accessControl, 'biometryAny');
});

test('react-native-sensitive-info adapter ignores unrelated or undecodable native keys when listing', async () => {
  const sensitiveInfo = createReactNativeSensitiveInfoMock();
  sensitiveInfo.items.set('other-key', 'outside');
  sensitiveInfo.items.set('ss_nothex', 'broken');
  const backend = createReactNativeSensitiveInfoBackend({ sensitiveInfo: sensitiveInfo.module });

  await backend.setItem('key-a', 'value-a');

  assert.deepEqual(await backend.getAllKeys(), ['key-a']);
});

test('react-native-sensitive-info adapter can resolve the native module through global require when injection is not provided', async () => {
  const sensitiveInfo = createReactNativeSensitiveInfoMock();
  const originalRequire = globalThis.require;
  globalThis.require = ((moduleName) => moduleName === 'react-native-sensitive-info' ? sensitiveInfo.module : originalRequire?.(moduleName)) as typeof globalThis.require;

  try {
    const backend = createReactNativeSensitiveInfoBackend();
    await backend.setItem('key-a', 'value-a');
    assert.equal(await backend.getItem('key-a'), 'value-a');
  } finally {
    globalThis.require = originalRequire;
  }
});
