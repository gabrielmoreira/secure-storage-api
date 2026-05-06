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

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string.`);
  }
}

function assertOneOf(value, allowedValues, fieldName) {
  if (!allowedValues.includes(value)) {
    throw new TypeError(`${fieldName} must be one of: ${allowedValues.join(', ')}.`);
  }
}

function assertPositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${fieldName} must be a positive integer.`);
  }
}

function createErrorClass(name, code) {
  return class extends SecureStorageError {
    constructor(message, metadata = {}, options = {}) {
      super(message, code, metadata, options);
      this.name = name;
    }
  };
}

export class SecureStorageError extends Error {
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

function freezeSafeMetadata(metadata) {
  const safeMetadata = {};

  if (metadata && typeof metadata === 'object') {
    for (const key of [
      'namespace',
      'name',
      'scope',
      'access',
      'version',
      'operation',
    ]) {
      if (key in metadata && metadata[key] !== undefined) {
        safeMetadata[key] = metadata[key];
      }
    }
  }

  return Object.freeze(safeMetadata);
}

export const builtInCodecs = Object.freeze({
  string: {
    encode(value) {
      return String(value);
    },
    decode(encodedValue) {
      return { value: encodedValue };
    },
  },
  number: {
    encode(value) {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new TypeError('Number codec expects a valid number.');
      }

      return String(value);
    },
    decode(encodedValue) {
      const value = Number(encodedValue);

      if (Number.isNaN(value)) {
        throw new TypeError('Number codec could not decode the stored value.');
      }

      return { value };
    },
  },
  boolean: {
    encode(value) {
      if (typeof value !== 'boolean') {
        throw new TypeError('Boolean codec expects a boolean.');
      }

      return value ? 'true' : 'false';
    },
    decode(encodedValue) {
      if (encodedValue !== 'true' && encodedValue !== 'false') {
        throw new TypeError('Boolean codec could not decode the stored value.');
      }

      return { value: encodedValue === 'true' };
    },
  },
  json: {
    encode(value) {
      return JSON.stringify(value);
    },
    decode(encodedValue) {
      return { value: JSON.parse(encodedValue) };
    },
  },
});

export function createCodecRegistry({ builtInCodecs: codecs = builtInCodecs } = {}) {
  return {
    builtInCodecs: codecs,
    resolve(codecRef) {
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

export function createMemorySecureStorageBackend() {
  const items = new Map();

  return {
    async getItem(key) {
      return items.get(key) ?? null;
    },
    async setItem(key, value) {
      items.set(key, value);
    },
    async removeItem(key) {
      items.delete(key);
    },
    async getAllKeys() {
      return [...items.keys()];
    },
  };
}

export async function createSecureStorage() {
  throw new Error('createSecureStorage is not implemented yet.');
}
