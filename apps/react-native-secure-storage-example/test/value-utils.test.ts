import assert from 'node:assert/strict';
import test from 'node:test';

import { getDemoPropertyById } from '../src/demo-properties.ts';
import { parseInputValue, stringifyValue } from '../src/value-utils.ts';

test('configured token demo property exposes composed property options for app evidence', () => {
  const configuredToken = getDemoPropertyById('configuredToken').property;

  assert.deepEqual(configuredToken.options, {
    expoSecureStore: {
      keychainService: 'react-native-secure-storage-example.configured-token',
    },
    reactNativeKeychain: {
      service: 'react-native-secure-storage-example.configured-token',
    },
    reactNativeSensitiveInfo: {
      service: 'react-native-secure-storage-example.configured-token',
    },
  });
});

test('parseInputValue converts string input for primitive and json demo properties', () => {
  assert.equal(parseInputValue(getDemoPropertyById('refreshToken').property, 'token-123'), 'token-123');
  assert.equal(parseInputValue(getDemoPropertyById('sessionCounter').property, '41'), 41);
  assert.equal(parseInputValue(getDemoPropertyById('acceptedTerms').property, 'true'), true);
  assert.deepEqual(
    parseInputValue(getDemoPropertyById('preferences').property, '{"theme":"dark","marketingOptIn":true}'),
    { theme: 'dark', marketingOptIn: true },
  );
});

test('parseInputValue reports a readable error for malformed json input', () => {
  assert.throws(
    () => parseInputValue(getDemoPropertyById('preferences').property, '{bad json}'),
    (error) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, 'JSON properties require a valid JSON input.');
      assert.ok(error.cause instanceof Error);
      return true;
    },
  );
});

test('stringifyValue keeps strings readable and pretty-prints objects', () => {
  assert.equal(stringifyValue('plain text'), 'plain text');
  assert.equal(
    stringifyValue({ theme: 'dark', marketingOptIn: true }),
    '{\n  "theme": "dark",\n  "marketingOptIn": true\n}',
  );
});
