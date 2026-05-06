import {
  SecureStorageError,
  SecureStorageMetadataError,
  SecureStorageNativeStorageError,
  secureStorageLegacyCleanupStatuses,
} from './api.ts';
import {
  assertNonEmptyString,
  assertOneOf,
  assertPositiveInteger,
  createBackendAccessOptions,
  createPropertyMetadata,
  getPhysicalKey,
} from './support.ts';

/**
 * The adapter contains every backend-specific call shape in one place.
 * That keeps the storage engine focused on policy instead of transport details.
 */
export function assertSecureStorageBackend(backend) {
  if (
    !backend
    || typeof backend.getItem !== 'function'
    || typeof backend.setItem !== 'function'
    || typeof backend.removeItem !== 'function'
    || typeof backend.getAllKeys !== 'function'
  ) {
    throw new TypeError('backend must implement getItem, setItem, removeItem, and getAllKeys.');
  }
}

export function makeSecureStorageBackendAdapter({ backend }) {
  assertSecureStorageBackend(backend);

  return {
    async readEnvelope(property, operation) {
      try {
        const rawValue = await backend.getItem(getPhysicalKey(property), createBackendAccessOptions(property));
        if (rawValue === null) {
          return null;
        }
        return parseStoredEnvelope(rawValue, property, operation);
      } catch (error) {
        if (error instanceof SecureStorageError) {
          throw error;
        }
        throw new SecureStorageNativeStorageError('Backend read failed.', {
          ...createPropertyMetadata(property),
          operation,
        }, { cause: error });
      }
    },
    async writeEnvelope(property, envelope, operation) {
      try {
        await backend.setItem(
          getPhysicalKey(property),
          JSON.stringify(envelope),
          createBackendAccessOptions(property),
        );
      } catch (cause) {
        throw new SecureStorageNativeStorageError('Backend write failed.', {
          ...createPropertyMetadata(property),
          operation,
        }, { cause });
      }
    },
    async removeProperty(property, operation) {
      try {
        await backend.removeItem(getPhysicalKey(property));
      } catch (cause) {
        throw new SecureStorageNativeStorageError('Backend remove failed.', {
          ...createPropertyMetadata(property),
          operation,
        }, { cause });
      }
    },
    async listKeys() {
      return backend.getAllKeys();
    },
    async removeKey(key) {
      return backend.removeItem(key);
    },
  };
}

function parseStoredEnvelope(rawValue, property, operation) {
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
  validateStoredMetadata(envelope.metadata, property, operation);
  return envelope;
}

function validateStoredMetadata(metadata, property, operation) {
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
