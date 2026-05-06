import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SecureStorageError,
  SecureStorageAccessError,
  SecureStorageCodecDecodeError,
  builtInCodecs,
  defineSecureStorageProperty,
  createCodecRegistry,
} from '../src/index.ts';

test('defineSecureStorageProperty preserves explicit values and defaults the rest', () => {
  // When
  const property = defineSecureStorageProperty({
    namespace: 'payments',
    name: 'consentToken',
    scope: 'app',
    access: 'userPresence',
    version: 3,
    codec: 'json',
    defaultValue: false,
  });

  // Then
  assert.deepEqual(property, {
    namespace: 'payments',
    name: 'consentToken',
    scope: 'app',
    access: 'userPresence',
    version: 3,
    codec: 'json',
    defaultValue: false,
  });
});

test('defineSecureStorageProperty requires legacyCleanup when legacyFallback exists', () => {
  // Then
  assert.throws(
    () => defineSecureStorageProperty({
      namespace: 'auth',
      name: 'refreshToken',
      legacyFallback: async () => 'legacy-token',
    }),
    /legacyCleanup/i,
  );
});

test('defineSecureStorageProperty rejects invalid namespace, name, and version', () => {
  // Then
  assert.throws(() => defineSecureStorageProperty({ namespace: '', name: 'token' }), /namespace/i);
  assert.throws(() => defineSecureStorageProperty({ namespace: 'auth', name: '' }), /name/i);
  assert.throws(
    () => defineSecureStorageProperty({ namespace: 'auth', name: 'token', version: 0 }),
    /version/i,
  );
});

test('built-in codecs encode and decode the supported primitive shapes', () => {
  // Then
  assert.equal(builtInCodecs.string.encode('abc'), 'abc');
  assert.deepEqual(builtInCodecs.string.decode('abc'), { value: 'abc' });
  assert.equal(builtInCodecs.number.encode(42.5), '42.5');
  assert.deepEqual(builtInCodecs.number.decode('42.5'), { value: 42.5 });
  assert.equal(builtInCodecs.boolean.encode(true), 'true');
  assert.deepEqual(builtInCodecs.boolean.decode('false'), { value: false });
  assert.equal(builtInCodecs.json.encode({ hello: 'world' }), '{"hello":"world"}');
  assert.deepEqual(builtInCodecs.json.decode('{"hello":"world"}'), { value: { hello: 'world' } });
});

test('built-in codecs reject malformed values instead of silently coercing them', () => {
  // Then
  assert.throws(() => builtInCodecs.number.encode(Number.NaN), /number/i);
  assert.throws(() => builtInCodecs.number.decode('not-a-number'), /decode/i);
  assert.throws(() => builtInCodecs.boolean.encode('yes'), /boolean/i);
  assert.throws(() => builtInCodecs.boolean.decode('yes'), /decode/i);
  assert.throws(() => builtInCodecs.json.decode('{'), SyntaxError);
});

test('createCodecRegistry resolves built-in codec names and custom codecs', () => {
  // Given
  const customCodec = {
    encode(value) {
      return `custom:${value}`;
    },
    decode(encodedValue) {
      return { value: encodedValue.slice('custom:'.length) };
    },
  };
  const registry = createCodecRegistry({ builtInCodecs });

  // Then
  assert.equal(registry.resolve('string'), builtInCodecs.string);
  assert.equal(registry.resolve(customCodec), customCodec);
  assert.throws(() => registry.resolve('missing'), /unknown codec/i);
});

test('typed secure storage errors expose only safe metadata', () => {
  // Given
  const error = new SecureStorageCodecDecodeError('Decode failed.', {
    namespace: 'auth',
    name: 'refreshToken',
    scope: 'user',
    access: 'default',
    version: 2,
    operation: 'get',
  }, {
    cause: new Error('Boom'),
  });

  // Then
  assert.equal(error.name, 'SecureStorageCodecDecodeError');
  assert.equal(error.code, 'codec_decode_error');
  assert.equal(error.metadata.namespace, 'auth');
  assert.equal(error.metadata.name, 'refreshToken');
  assert.equal(error.metadata.operation, 'get');
  assert.ok(error.cause instanceof Error);
  assert.equal('value' in error.metadata, false);
  assert.equal('secret' in error.metadata, false);
});

test('typed secure storage errors share a stable base class', () => {
  // Given
  const error = new SecureStorageAccessError('Access denied.', {
    namespace: 'payments',
    name: 'consentToken',
    scope: 'user',
    access: 'userPresence',
    version: 1,
    operation: 'set',
  });

  // Then
  assert.ok(error instanceof Error);
  assert.ok(error instanceof SecureStorageError);
  assert.equal(error.code, 'access_error');
});
