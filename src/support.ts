export const STORAGE_KEY_PREFIX = 'secure-storage';

export function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${fieldName} must be a non-empty string.`);
  }
}

export function assertOneOf(value, allowedValues, fieldName) {
  if (!allowedValues.includes(value)) {
    throw new TypeError(`${fieldName} must be one of: ${allowedValues.join(', ')}.`);
  }
}

export function assertPositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${fieldName} must be a positive integer.`);
  }
}

/**
 * Safe metadata is intentionally narrow.
 * This helper is the last line of defense against accidental value leakage in errors.
 */
export function freezeSafeMetadata(metadata) {
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

export function createPropertyMetadata(property) {
  return {
    namespace: property.namespace,
    name: property.name,
    scope: property.scope,
    access: property.access,
    version: property.version,
  };
}

/**
 * User presence is expressed as a generic access hint so the backend can adapt later
 * without the core naming itself after biometrics or one platform API.
 */
export function createBackendAccessOptions(property) {
  return {
    requiresUserPresence: property.access === 'userPresence',
  };
}

export function getPhysicalKey(property) {
  return [STORAGE_KEY_PREFIX, property.scope, property.namespace, property.name].join(':');
}

export function createItemMetadata(
  property,
  now,
  existingMetadata,
  cleanupStatus = existingMetadata?.legacyCleanupStatus ?? 'notNeeded',
) {
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
