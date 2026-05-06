import {
  assertNonEmptyString,
  assertOneOf,
  assertPositiveInteger,
  freezeSafeMetadata,
} from './support.ts';

export const secureStorageScopes = Object.freeze(['app', 'user']);
export const secureStorageAccessModes = Object.freeze([
  'default',
  'activeSession',
  'userPresence',
]);
export const secureStorageCodecNames = Object.freeze([
  'string',
  'number',
  'boolean',
  'json',
]);
export const secureStorageLegacyCleanupStatuses = Object.freeze([
  'notNeeded',
  'pending',
  'succeeded',
  'failed',
]);

function createErrorClass(name, code) {
  return class extends SecureStorageError {
    constructor(message, metadata = {}, options = {}) {
      super(message, code, metadata, options);
      this.name = name;
    }
  };
}

export class SecureStorageError extends Error {
  code;
  metadata;

  constructor(message, code, metadata = {}, options = {}) {
    super(message, options);
    this.name = 'SecureStorageError';
    this.code = code;
    this.metadata = freezeSafeMetadata(metadata);
  }
}

export const SecureStorageAccessError = createErrorClass(
  'SecureStorageAccessError',
  'access_error',
);
export const SecureStorageCodecEncodeError = createErrorClass(
  'SecureStorageCodecEncodeError',
  'codec_encode_error',
);
export const SecureStorageCodecDecodeError = createErrorClass(
  'SecureStorageCodecDecodeError',
  'codec_decode_error',
);
export const SecureStorageMigrationError = createErrorClass(
  'SecureStorageMigrationError',
  'migration_error',
);
export const SecureStorageNativeStorageError = createErrorClass(
  'SecureStorageNativeStorageError',
  'native_storage_error',
);
export const SecureStorageLegacyFallbackError = createErrorClass(
  'SecureStorageLegacyFallbackError',
  'legacy_fallback_error',
);
export const SecureStorageLegacyCleanupError = createErrorClass(
  'SecureStorageLegacyCleanupError',
  'legacy_cleanup_error',
);
export const SecureStorageDefaultValueError = createErrorClass(
  'SecureStorageDefaultValueError',
  'default_value_error',
);
export const SecureStorageMetadataError = createErrorClass(
  'SecureStorageMetadataError',
  'metadata_error',
);

/**
 * @param {{ builtInCodecs?: Record<string, { encode: Function, decode: Function }> }} [options]
 */
export function createCodecRegistry(options = {}) {
  const builtInCodecs = options?.['builtInCodecs'];

  return {
    builtInCodecs,
    resolve(codecRef) {
      const codecs = builtInCodecs;

      if (typeof codecRef === 'string') {
        const codec = codecs[codecRef];

        if (!codec) {
          throw new TypeError(`Unknown codec: ${codecRef}.`);
        }

        return codec;
      }

      if (!codecRef || typeof codecRef.encode !== 'function' || typeof codecRef.decode !== 'function') {
        throw new TypeError('Codec reference must be a built-in codec name or a codec object.');
      }

      return codecRef;
    },
  };
}

export function createPropertyRegistry() {
  const properties = new Map();

  function toKey(namespace, name) {
    return `${namespace}:${name}`;
  }

  return {
    register(property) {
      const key = toKey(property.namespace, property.name);

      if (properties.has(key)) {
        throw new Error(`Property ${key} is already registered.`);
      }

      properties.set(key, property);
      return property;
    },
    get(namespace, name) {
      return properties.get(toKey(namespace, name)) ?? null;
    },
    list() {
      return [...properties.values()];
    },
  };
}

export function defineSecureStorageProperty(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Property input must be an object.');
  }

  const property = {
    scope: 'user',
    access: 'default',
    version: 1,
    codec: 'string',
    ...input,
  };

  assertNonEmptyString(property.namespace, 'namespace');
  assertNonEmptyString(property.name, 'name');
  assertOneOf(property.scope, secureStorageScopes, 'scope');
  assertOneOf(property.access, secureStorageAccessModes, 'access');
  assertPositiveInteger(property.version, 'version');

  if (
    typeof property.codec !== 'string'
    && (!property.codec || typeof property.codec.encode !== 'function' || typeof property.codec.decode !== 'function')
  ) {
    throw new TypeError('codec must be a built-in codec name or a codec object.');
  }

  if (typeof property.codec === 'string') {
    assertOneOf(property.codec, secureStorageCodecNames, 'codec');
  }

  if (property.defaultValue !== undefined) {
    const type = typeof property.defaultValue;
    if (type === 'function' || type === 'string' || type === 'number' || type === 'boolean' || type === 'object') {
      // allowed
    } else {
      throw new TypeError('defaultValue must be a supported value or function.');
    }
  }

  if (property.legacyFallback !== undefined && typeof property.legacyFallback !== 'function') {
    throw new TypeError('legacyFallback must be a function when provided.');
  }

  if (property.legacyCleanup !== undefined && typeof property.legacyCleanup !== 'function') {
    throw new TypeError('legacyCleanup must be a function when provided.');
  }

  if (property.legacyFallback && !property.legacyCleanup) {
    throw new TypeError('legacyCleanup is required when legacyFallback is defined.');
  }

  return Object.freeze(property);
}
