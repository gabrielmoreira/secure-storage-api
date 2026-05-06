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

const STORAGE_KEY_PREFIX = 'secure-storage';

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

export function createMigratingJsonCodec({ migrate }) {
  if (typeof migrate !== 'function') {
    throw new TypeError('createMigratingJsonCodec requires a migrate function.');
  }

  return {
    encode(value) {
      return JSON.stringify(value);
    },
    decode(encodedValue, context) {
      const parsedValue = JSON.parse(encodedValue);
      const fromVersion = context.itemMetadata.version;
      const toVersion = context.propertyMetadata.version;

      if (fromVersion > toVersion) {
        throw new SecureStorageMigrationError('Stored version is newer than the property version.', {
          ...context.propertyMetadata,
          operation: 'get',
        });
      }

      if (fromVersion === toVersion) {
        return { value: parsedValue };
      }

      let migratedValue;
      try {
        migratedValue = migrate({
          value: parsedValue,
          fromVersion,
          toVersion,
          itemMetadata: context.itemMetadata,
          propertyMetadata: context.propertyMetadata,
        });
      } catch (cause) {
        throw new SecureStorageMigrationError('Value migration failed.', {
          ...context.propertyMetadata,
          operation: 'get',
        }, { cause });
      }

      return {
        value: migratedValue,
        normalizedEncodedValue: JSON.stringify(migratedValue),
      };
    },
  };
}

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

function createPropertyMetadata(property) {
  return {
    namespace: property.namespace,
    name: property.name,
    scope: property.scope,
    access: property.access,
    version: property.version,
  };
}

function createBackendAccessOptions(property) {
  return {
    requiresUserPresence: property.access === 'userPresence',
  };
}

function getPhysicalKey(property) {
  return [STORAGE_KEY_PREFIX, property.scope, property.namespace, property.name].join(':');
}

function createItemMetadata(property, now, existingMetadata, cleanupStatus = existingMetadata?.legacyCleanupStatus ?? 'notNeeded') {
  const timestamp = now().toISOString();

  return {
    namespace: property.namespace,
    name: property.name,
    scope: property.scope,
    version: property.version,
    createdAt: existingMetadata?.createdAt ?? timestamp,
    updatedAt: timestamp,
    legacyCleanupStatus: cleanupStatus,
  };
}

function validateItemMetadata(metadata, property, operation) {
  if (!metadata || typeof metadata !== 'object') {
    throw new SecureStorageMetadataError('Stored metadata is missing or invalid.', {
      ...createPropertyMetadata(property),
      operation,
    });
  }

  if (
    metadata.namespace !== property.namespace
    || metadata.name !== property.name
    || metadata.scope !== property.scope
  ) {
    throw new SecureStorageMetadataError('Stored metadata does not match the property key.', {
      ...createPropertyMetadata(property),
      operation,
    });
  }

  try {
    assertPositiveInteger(metadata.version, 'metadata.version');
    assertNonEmptyString(metadata.createdAt, 'metadata.createdAt');
    assertNonEmptyString(metadata.updatedAt, 'metadata.updatedAt');
    assertOneOf(metadata.legacyCleanupStatus, secureStorageLegacyCleanupStatuses, 'metadata.legacyCleanupStatus');
  } catch (cause) {
    throw new SecureStorageMetadataError('Stored metadata is malformed.', {
      ...createPropertyMetadata(property),
      operation,
    }, { cause });
  }

  return metadata;
}

function parseEnvelope(rawValue, property, operation) {
  let envelope;

  try {
    envelope = JSON.parse(rawValue);
  } catch (cause) {
    throw new SecureStorageMetadataError('Stored envelope is malformed.', {
      ...createPropertyMetadata(property),
      operation,
    }, { cause });
  }

  if (!envelope || typeof envelope !== 'object' || typeof envelope.encodedValue !== 'string') {
    throw new SecureStorageMetadataError('Stored envelope is missing required fields.', {
      ...createPropertyMetadata(property),
      operation,
    });
  }

  validateItemMetadata(envelope.metadata, property, operation);
  return envelope;
}

function serializeEnvelope(envelope) {
  return JSON.stringify(envelope);
}

async function readEnvelopeFromBackend(backend, property, operation) {
  try {
    const rawValue = await backend.getItem(getPhysicalKey(property), createBackendAccessOptions(property));

    if (rawValue === null) {
      return null;
    }

    return parseEnvelope(rawValue, property, operation);
  } catch (error) {
    if (error instanceof SecureStorageError) {
      throw error;
    }

    throw new SecureStorageNativeStorageError('Backend read failed.', {
      ...createPropertyMetadata(property),
      operation,
    }, { cause: error });
  }
}

async function writeEnvelopeToBackend(backend, property, envelope, operation) {
  try {
    await backend.setItem(
      getPhysicalKey(property),
      serializeEnvelope(envelope),
      createBackendAccessOptions(property),
    );
  } catch (cause) {
    throw new SecureStorageNativeStorageError('Backend write failed.', {
      ...createPropertyMetadata(property),
      operation,
    }, { cause });
  }
}

async function removeKeyFromBackend(backend, property, operation) {
  try {
    await backend.removeItem(getPhysicalKey(property));
  } catch (cause) {
    throw new SecureStorageNativeStorageError('Backend remove failed.', {
      ...createPropertyMetadata(property),
      operation,
    }, { cause });
  }
}

async function assertAccess(authStateProvider, property, operation) {
  const authState = await authStateProvider.getAuthState();

  if (property.scope === 'user' && !authState?.hasBoundUser) {
    throw new SecureStorageAccessError('A bound user is required for this property.', {
      ...createPropertyMetadata(property),
      operation,
    });
  }

  if (property.access === 'activeSession' && !authState?.hasActiveSession) {
    throw new SecureStorageAccessError('An active session is required for this property.', {
      ...createPropertyMetadata(property),
      operation,
    });
  }
}

function createCodecContext(property, itemMetadata, codecRegistry) {
  return {
    propertyMetadata: createPropertyMetadata(property),
    itemMetadata,
    codecs: codecRegistry.builtInCodecs,
  };
}

function decodeStoredValue(property, envelope, codecRegistry, operation) {
  try {
    const codec = codecRegistry.resolve(property.codec);
    return codec.decode(
      envelope.encodedValue,
      createCodecContext(property, envelope.metadata, codecRegistry),
    );
  } catch (error) {
    if (error instanceof SecureStorageMigrationError) {
      throw error;
    }

    throw new SecureStorageCodecDecodeError('Codec decode failed.', {
      ...createPropertyMetadata(property),
      operation,
    }, { cause: error });
  }
}

function encodeStoredValue(property, value, itemMetadata, codecRegistry, operation) {
  try {
    const codec = codecRegistry.resolve(property.codec);
    return codec.encode(value, createCodecContext(property, itemMetadata, codecRegistry));
  } catch (cause) {
    throw new SecureStorageCodecEncodeError('Codec encode failed.', {
      ...createPropertyMetadata(property),
      operation,
    }, { cause });
  }
}

async function resolveDefaultValue(property, operation) {
  if (property.defaultValue === undefined) {
    return { hasValue: false, value: null };
  }

  try {
    if (typeof property.defaultValue === 'function') {
      return {
        hasValue: true,
        value: await property.defaultValue(),
      };
    }

    return {
      hasValue: true,
      value: property.defaultValue,
    };
  } catch (cause) {
    throw new SecureStorageDefaultValueError('Default value resolution failed.', {
      ...createPropertyMetadata(property),
      operation,
    }, { cause });
  }
}

async function persistValue(
  backend,
  property,
  value,
  codecRegistry,
  now,
  operation,
  existingEnvelope = null,
  cleanupStatus = existingEnvelope?.metadata?.legacyCleanupStatus ?? 'notNeeded',
) {
  const metadata = createItemMetadata(property, now, existingEnvelope?.metadata, cleanupStatus);
  const encodedValue = encodeStoredValue(property, value, metadata, codecRegistry, operation);
  const envelope = {
    metadata,
    encodedValue,
  };

  await writeEnvelopeToBackend(backend, property, envelope, operation);
  return envelope;
}

async function resolveLegacyFallback(property, operation) {
  if (!property.legacyFallback) {
    return { hasValue: false, value: null };
  }

  try {
    const value = await property.legacyFallback();
    return {
      hasValue: value !== null,
      value,
    };
  } catch (cause) {
    throw new SecureStorageLegacyFallbackError('Legacy fallback failed.', {
      ...createPropertyMetadata(property),
      operation,
    }, { cause });
  }
}

async function updateCleanupStatus(backend, property, envelope, now, status, operation) {
  const nextEnvelope = {
    metadata: createItemMetadata(property, now, envelope.metadata, status),
    encodedValue: envelope.encodedValue,
  };

  await writeEnvelopeToBackend(backend, property, nextEnvelope, operation);
  return nextEnvelope;
}

async function maybeRunLegacyCleanup(backend, property, envelope, now, enabled, operation) {
  if (!enabled || !property.legacyCleanup) {
    return envelope;
  }

  if (envelope.metadata.legacyCleanupStatus !== 'pending') {
    return envelope;
  }

  try {
    await property.legacyCleanup();
    return await updateCleanupStatus(backend, property, envelope, now, 'succeeded', operation);
  } catch (cause) {
    await updateCleanupStatus(backend, property, envelope, now, 'failed', operation);
    return {
      ...envelope,
      metadata: {
        ...envelope.metadata,
        legacyCleanupStatus: 'failed',
      },
    };
  }
}

async function runOneLegacyCleanup(backend, property, envelope, now) {
  if (!property.legacyCleanup || envelope.metadata.legacyCleanupStatus !== 'pending') {
    return { outcome: 'skipped', envelope };
  }

  try {
    await property.legacyCleanup();
    return {
      outcome: 'succeeded',
      envelope: await updateCleanupStatus(backend, property, envelope, now, 'succeeded', 'runLegacyCleanup'),
    };
  } catch (cause) {
    await updateCleanupStatus(backend, property, envelope, now, 'failed', 'runLegacyCleanup');
    return {
      outcome: 'failed',
      envelope: {
        ...envelope,
        metadata: {
          ...envelope.metadata,
          legacyCleanupStatus: 'failed',
        },
      },
      error: new SecureStorageLegacyCleanupError('Legacy cleanup failed.', {
        ...createPropertyMetadata(property),
        operation: 'runLegacyCleanup',
      }, { cause }),
    };
  }
}

export async function createSecureStorage(options) {
  if (!options || typeof options !== 'object') {
    throw new TypeError('createSecureStorage options must be an object.');
  }

  const {
    backend,
    authStateProvider,
    featureFlags = {},
    now = () => new Date(),
  } = options;

  if (!backend || typeof backend.getItem !== 'function' || typeof backend.setItem !== 'function' || typeof backend.removeItem !== 'function' || typeof backend.getAllKeys !== 'function') {
    throw new TypeError('backend must implement getItem, setItem, removeItem, and getAllKeys.');
  }

  if (!authStateProvider || typeof authStateProvider.getAuthState !== 'function') {
    throw new TypeError('authStateProvider must implement getAuthState.');
  }

  const codecRegistry = createCodecRegistry();
  const cleanupEnabled = Boolean(featureFlags.legacyCleanupEnabled);

  async function inspectEnvelope(property) {
    return readEnvelopeFromBackend(backend, property, 'inspect');
  }

  return {
    async get(property) {
      await assertAccess(authStateProvider, property, 'get');
      let envelope = await readEnvelopeFromBackend(backend, property, 'get');

      if (envelope) {
        const decoded = decodeStoredValue(property, envelope, codecRegistry, 'get');

        if (
          typeof decoded === 'object'
          && decoded !== null
          && typeof decoded.normalizedEncodedValue === 'string'
          && decoded.normalizedEncodedValue !== envelope.encodedValue
        ) {
          envelope = {
            metadata: createItemMetadata(property, now, envelope.metadata, envelope.metadata.legacyCleanupStatus),
            encodedValue: decoded.normalizedEncodedValue,
          };
          await writeEnvelopeToBackend(backend, property, envelope, 'get');
        }

        envelope = await maybeRunLegacyCleanup(
          backend,
          property,
          envelope,
          now,
          cleanupEnabled,
          'get',
        );

        return decoded.value;
      }

      const legacyResult = await resolveLegacyFallback(property, 'get');
      if (legacyResult.hasValue) {
        envelope = await persistValue(
          backend,
          property,
          legacyResult.value,
          codecRegistry,
          now,
          'get',
          null,
          property.legacyCleanup ? 'pending' : 'notNeeded',
        );

        await maybeRunLegacyCleanup(
          backend,
          property,
          envelope,
          now,
          cleanupEnabled,
          'get',
        );

        return legacyResult.value;
      }

      const defaultResult = await resolveDefaultValue(property, 'get');

      if (!defaultResult.hasValue) {
        return null;
      }

      await persistValue(backend, property, defaultResult.value, codecRegistry, now, 'get');
      return defaultResult.value;
    },

    async set(property, value) {
      await assertAccess(authStateProvider, property, 'set');
      const existingEnvelope = await readEnvelopeFromBackend(backend, property, 'set');
      await persistValue(backend, property, value, codecRegistry, now, 'set', existingEnvelope);
    },

    async remove(property) {
      await assertAccess(authStateProvider, property, 'remove');
      await removeKeyFromBackend(backend, property, 'remove');
    },

    async has(property) {
      await assertAccess(authStateProvider, property, 'has');
      const envelope = await readEnvelopeFromBackend(backend, property, 'has');
      return envelope !== null;
    },

    async clearUserStorage() {
      const keys = await backend.getAllKeys();
      const userPrefix = `${STORAGE_KEY_PREFIX}:user:`;

      await Promise.all(
        keys
          .filter((key) => key.startsWith(userPrefix))
          .map((key) => backend.removeItem(key)),
      );
    },

    async runLegacyCleanup(properties) {
      const summary = {
        checked: properties.length,
        pending: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
      };

      if (!cleanupEnabled) {
        summary.skipped = properties.length;
        return summary;
      }

      for (const property of properties) {
        const envelope = await readEnvelopeFromBackend(backend, property, 'runLegacyCleanup');

        if (!envelope || envelope.metadata.legacyCleanupStatus !== 'pending') {
          summary.skipped += 1;
          continue;
        }

        summary.pending += 1;
        const result = await runOneLegacyCleanup(backend, property, envelope, now);

        if (result.outcome === 'succeeded') {
          summary.succeeded += 1;
        } else if (result.outcome === 'failed') {
          summary.failed += 1;
        } else {
          summary.skipped += 1;
        }
      }

      return summary;
    },

    _inspect: inspectEnvelope,
  };
}
