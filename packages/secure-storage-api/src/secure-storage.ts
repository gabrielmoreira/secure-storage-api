import type {
  CreateSecureStorageOptions,
  SecureStorage,
  SecureStorageCodecContext,
  SecureStorageDiagnostics,
  SecureStorageGetResult,
  SecureStorageProperty,
  SecureStoragePropertyValue,
  SecureStorageStoredEnvelope,
} from './api.ts';
import {
  SecureStorageAccessError,
  SecureStorageCodecDecodeError,
  SecureStorageCodecEncodeError,
  SecureStorageDefaultValueError,
  SecureStorageLegacyCleanupError,
  SecureStorageLegacyFallbackError,
  SecureStorageMigrationError,
  createCodecRegistry,
} from './api.ts';
import { builtInCodecs } from './codecs.ts';
import { makeSecureStorageBackendAdapter } from './secure-storage-backend-adapter.ts';
import {
  createItemMetadata,
  createPropertyMetadata,
  STORAGE_KEY_PREFIX,
} from './support.ts';

/**
 * Diagnostics are intentionally read-only and metadata-only.
 * This keeps operational visibility available without making value inspection part of the main API.
 */
export function createSecureDiagnostics({ storage }: { storage: SecureStorage }): SecureStorageDiagnostics {
  if (!storage || typeof storage._inspect !== 'function') {
    throw new TypeError('createSecureDiagnostics requires a storage instance with internal inspection support.');
  }

  return {
    async inspectProperties(properties) {
      const rows = [];

      for (const property of properties) {
        const envelope = await storage._inspect(property);
        rows.push({
          namespace: property.namespace,
          name: property.name,
          scope: property.scope,
          access: property.access,
          version: property.version,
          exists: envelope !== null,
          legacyCleanupStatus: envelope?.metadata.legacyCleanupStatus ?? null,
          createdAt: envelope?.metadata.createdAt ?? null,
          updatedAt: envelope?.metadata.updatedAt ?? null,
        });
      }

      return rows;
    },
  };
}

/**
 * Public composition root.
 * Callers provide a ready backend and auth state provider; the storage core owns policy orchestration.
 */
export async function createSecureStorage(options: CreateSecureStorageOptions): Promise<SecureStorage> {
  const runtime = createSecureStorageRuntime(options);

  return {
    async get(property) {
      return runtime.readPropertyValue(property);
    },
    async set(property, value) {
      return runtime.writePropertyValue(property, value);
    },
    async remove(property) {
      return runtime.removePropertyValue(property);
    },
    async has(property) {
      return runtime.hasStoredValue(property);
    },
    async clearUserStorage() {
      return runtime.clearUserScopedStorage();
    },
    async runLegacyCleanup(properties) {
      return runtime.runPendingLegacyCleanup(properties);
    },
    _inspect: runtime.inspectStoredEnvelope,
  };
}

function createSecureStorageRuntime(options: CreateSecureStorageOptions) {
  if (!options || typeof options !== 'object') {
    throw new TypeError('createSecureStorage options must be an object.');
  }

  const {
    backend,
    authStateProvider,
    registry = null,
    featureFlags = {},
    now = () => new Date(),
  } = options;

  if (!authStateProvider || typeof authStateProvider.getAuthState !== 'function') {
    throw new TypeError('authStateProvider must implement getAuthState.');
  }

  const assertRegisteredProperty = makeRegisteredPropertyAssertion(registry);
  const codecRegistry = createCodecRegistry({ builtInCodecs });
  const storageBackend = makeSecureStorageBackendAdapter({ backend });
  const cleanupEnabled = Boolean(featureFlags.legacyCleanupEnabled);

  return {
    inspectStoredEnvelope<TProperty extends SecureStorageProperty<any, any, any, any>>(property: TProperty): Promise<SecureStorageStoredEnvelope<SecureStoragePropertyValue<TProperty>> | null> {
      return storageBackend.readEnvelope(property, 'inspect') as Promise<SecureStorageStoredEnvelope<SecureStoragePropertyValue<TProperty>> | null>;
    },

    async readPropertyValue<TProperty extends SecureStorageProperty<any, any, any, any>>(property: TProperty): Promise<SecureStorageGetResult<TProperty>> {
      assertRegisteredProperty(property);
      await assertAccessAllowed(authStateProvider, property, 'get');

      const storedEnvelope = await storageBackend.readEnvelope(property, 'get');
      if (storedEnvelope) {
        return readStoredValue({
          property,
          storedEnvelope,
          storageBackend,
          codecRegistry,
          now,
          cleanupEnabled,
        }) as Promise<SecureStorageGetResult<TProperty>>;
      }

      const migratedLegacyValue = await readLegacyFallbackValue(property);
      if (migratedLegacyValue.hasValue) {
        return migrateLegacyValueIntoStorage({
          property,
          value: migratedLegacyValue.value,
          storageBackend,
          codecRegistry,
          now,
          cleanupEnabled,
        }) as Promise<SecureStorageGetResult<TProperty>>;
      }

      const defaultValue = await readDefaultValue(property);
      if (!defaultValue.hasValue) {
        return null as SecureStorageGetResult<TProperty>;
      }

      await persistPropertyValue({
        property,
        value: defaultValue.value,
        storageBackend,
        codecRegistry,
        now,
        operation: 'get',
      });

      return defaultValue.value as SecureStorageGetResult<TProperty>;
    },

    async writePropertyValue<TProperty extends SecureStorageProperty<any, any, any, any>>(property: TProperty, value: SecureStoragePropertyValue<TProperty>) {
      assertRegisteredProperty(property);
      await assertAccessAllowed(authStateProvider, property, 'set');

      const existingEnvelope = await storageBackend.readEnvelope(property, 'set');
      await persistPropertyValue({
        property,
        value,
        storageBackend,
        codecRegistry,
        now,
        operation: 'set',
        existingEnvelope,
      });
    },

    async removePropertyValue<TProperty extends SecureStorageProperty<any, any, any, any>>(property: TProperty) {
      assertRegisteredProperty(property);
      await assertAccessAllowed(authStateProvider, property, 'remove');
      await storageBackend.removeProperty(property, 'remove');
    },

    async hasStoredValue<TProperty extends SecureStorageProperty<any, any, any, any>>(property: TProperty) {
      assertRegisteredProperty(property);
      await assertAccessAllowed(authStateProvider, property, 'has');
      const envelope = await storageBackend.readEnvelope(property, 'has');
      return envelope !== null;
    },

    async clearUserScopedStorage() {
      const keys = await storageBackend.listKeys();
      const userPrefix = `${STORAGE_KEY_PREFIX}:user:`;

      await Promise.all(keys.filter((key) => key.startsWith(userPrefix)).map((key) => storageBackend.removeKey(key)));
    },

    async runPendingLegacyCleanup(properties: ReadonlyArray<SecureStorageProperty<any, any, any, any>>) {
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
        assertRegisteredProperty(property);
        const envelope = await storageBackend.readEnvelope(property, 'runLegacyCleanup');

        if (!envelope || envelope.metadata.legacyCleanupStatus !== 'pending') {
          summary.skipped += 1;
          continue;
        }

        summary.pending += 1;
        const cleanupResult = await runPendingCleanupOnce({
          property,
          envelope,
          storageBackend,
          now,
        });

        if (cleanupResult.outcome === 'succeeded') {
          summary.succeeded += 1;
        } else if (cleanupResult.outcome === 'failed') {
          summary.failed += 1;
        } else {
          summary.skipped += 1;
        }
      }

      return summary;
    },
  };
}

function makeRegisteredPropertyAssertion(registry: CreateSecureStorageOptions['registry']) {
  if (!registry) {
    return function assertRegisteredProperty() {};
  }

  if (typeof registry.get !== 'function') {
    throw new TypeError('registry must implement get(namespace, name).');
  }

  return function assertRegisteredProperty(property: SecureStorageProperty<any, any, any, any>) {
    const registeredProperty = registry.get(property.namespace, property.name);

    if (!registeredProperty) {
      throw new TypeError(
        `Property ${property.namespace}.${property.name} must be registered before it can be used by this secure storage instance.`,
      );
    }
  };
}

async function readStoredValue<TValue>({
  property,
  storedEnvelope,
  storageBackend,
  codecRegistry,
  now,
  cleanupEnabled,
}: {
  property: SecureStorageProperty<TValue, any, any, any>;
  storedEnvelope: SecureStorageStoredEnvelope<TValue>;
  storageBackend: any;
  codecRegistry: ReturnType<typeof createCodecRegistry>;
  now: () => Date;
  cleanupEnabled: boolean;
}): Promise<TValue> {
  const decoded = decodePropertyValue(property, storedEnvelope, codecRegistry, 'get');
  const normalizedEnvelope = await normalizeDecodedValueIfNeeded({
    property,
    storedEnvelope,
    decoded,
    storageBackend,
    now,
  });

  await runInlineLegacyCleanupIfEnabled({
    property,
    envelope: normalizedEnvelope,
    storageBackend,
    now,
    cleanupEnabled,
    operation: 'get',
  });

  return decoded.value;
}

async function migrateLegacyValueIntoStorage<TValue>({
  property,
  value,
  storageBackend,
  codecRegistry,
  now,
  cleanupEnabled,
}: {
  property: SecureStorageProperty<TValue, any, any, any>;
  value: TValue;
  storageBackend: any;
  codecRegistry: ReturnType<typeof createCodecRegistry>;
  now: () => Date;
  cleanupEnabled: boolean;
}): Promise<TValue> {
  const envelope = await persistPropertyValue({
    property,
    value,
    storageBackend,
    codecRegistry,
    now,
    operation: 'get',
    cleanupStatus: property.legacyCleanup ? 'pending' : 'notNeeded',
  });

  await runInlineLegacyCleanupIfEnabled({
    property,
    envelope,
    storageBackend,
    now,
    cleanupEnabled,
    operation: 'get',
  });

  return value;
}

async function normalizeDecodedValueIfNeeded<TValue>({
  property,
  storedEnvelope,
  decoded,
  storageBackend,
  now,
}: {
  property: SecureStorageProperty<TValue, any, any, any>;
  storedEnvelope: SecureStorageStoredEnvelope<TValue>;
  decoded: { value: TValue; normalizedEncodedValue?: string };
  storageBackend: any;
  now: () => Date;
}): Promise<SecureStorageStoredEnvelope<TValue>> {
  if (
    typeof decoded !== 'object'
    || decoded === null
    || typeof decoded.normalizedEncodedValue !== 'string'
    || decoded.normalizedEncodedValue === storedEnvelope.encodedValue
  ) {
    return storedEnvelope;
  }

  const normalizedEnvelope = {
    metadata: createItemMetadata(property, now, storedEnvelope.metadata, storedEnvelope.metadata.legacyCleanupStatus),
    encodedValue: decoded.normalizedEncodedValue,
  };

  await storageBackend.writeEnvelope(property, normalizedEnvelope, 'get');
  return normalizedEnvelope;
}

async function runInlineLegacyCleanupIfEnabled<TValue>({
  property,
  envelope,
  storageBackend,
  now,
  cleanupEnabled,
  operation,
}: {
  property: SecureStorageProperty<TValue, any, any, any>;
  envelope: SecureStorageStoredEnvelope<TValue>;
  storageBackend: any;
  now: () => Date;
  cleanupEnabled: boolean;
  operation: string;
}) {
  if (!cleanupEnabled || !property.legacyCleanup) {
    return envelope;
  }

  if (envelope.metadata.legacyCleanupStatus !== 'pending') {
    return envelope;
  }

  try {
    await property.legacyCleanup();
    return updateLegacyCleanupStatus({
      property,
      envelope,
      storageBackend,
      now,
      status: 'succeeded',
      operation,
    });
  } catch (cause) {
    await updateLegacyCleanupStatus({
      property,
      envelope,
      storageBackend,
      now,
      status: 'failed',
      operation,
    });

    return {
      ...envelope,
      metadata: {
        ...envelope.metadata,
        legacyCleanupStatus: 'failed',
      },
    };
  }
}

async function runPendingCleanupOnce<TValue>({
  property,
  envelope,
  storageBackend,
  now,
}: {
  property: SecureStorageProperty<TValue, any, any, any>;
  envelope: SecureStorageStoredEnvelope<TValue>;
  storageBackend: any;
  now: () => Date;
}) {
  if (!property.legacyCleanup || envelope.metadata.legacyCleanupStatus !== 'pending') {
    return { outcome: 'skipped', envelope };
  }

  try {
    await property.legacyCleanup();
    return {
      outcome: 'succeeded',
      envelope: await updateLegacyCleanupStatus({
        property,
        envelope,
        storageBackend,
        now,
        status: 'succeeded',
        operation: 'runLegacyCleanup',
      }),
    };
  } catch (cause) {
    await updateLegacyCleanupStatus({
      property,
      envelope,
      storageBackend,
      now,
      status: 'failed',
      operation: 'runLegacyCleanup',
    });

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

async function updateLegacyCleanupStatus<TValue>({
  property,
  envelope,
  storageBackend,
  now,
  status,
  operation,
}: {
  property: SecureStorageProperty<TValue, any, any, any>;
  envelope: SecureStorageStoredEnvelope<TValue>;
  storageBackend: any;
  now: () => Date;
  status: string;
  operation: string;
}) {
  const nextEnvelope = {
    metadata: createItemMetadata(property, now, envelope.metadata, status as any),
    encodedValue: envelope.encodedValue,
  };

  await storageBackend.writeEnvelope(property, nextEnvelope, operation);
  return nextEnvelope;
}

async function persistPropertyValue<TValue>({
  property,
  value,
  storageBackend,
  codecRegistry,
  now,
  operation,
  existingEnvelope = null,
  cleanupStatus = existingEnvelope?.metadata?.legacyCleanupStatus ?? 'notNeeded',
}: {
  property: SecureStorageProperty<TValue, any, any, any>;
  value: TValue;
  storageBackend: any;
  codecRegistry: ReturnType<typeof createCodecRegistry>;
  now: () => Date;
  operation: string;
  existingEnvelope?: SecureStorageStoredEnvelope<TValue> | null;
  cleanupStatus?: any;
}) {
  const metadata = createItemMetadata(property, now, existingEnvelope?.metadata, cleanupStatus);
  const encodedValue = encodePropertyValue(property, value, metadata as any, codecRegistry, operation);
  const envelope = {
    metadata,
    encodedValue,
  };

  await storageBackend.writeEnvelope(property, envelope, operation);
  return envelope;
}

async function readLegacyFallbackValue<TProperty extends SecureStorageProperty<any, any, any, any>>(property: TProperty) {
  if (!property.legacyFallback) {
    return { hasValue: false, value: null as SecureStoragePropertyValue<TProperty> | null };
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
      operation: 'get',
    }, { cause });
  }
}

async function readDefaultValue<TProperty extends SecureStorageProperty<any, any, any, any>>(property: TProperty) {
  if (property.defaultValue === undefined) {
    return { hasValue: false, value: null as SecureStoragePropertyValue<TProperty> | null };
  }

  try {
    if (typeof property.defaultValue === 'function') {
      const buildDefaultValue = property.defaultValue as () => SecureStoragePropertyValue<TProperty> | Promise<SecureStoragePropertyValue<TProperty>>;
      return {
        hasValue: true,
        value: await buildDefaultValue(),
      };
    }

    return {
      hasValue: true,
      value: property.defaultValue,
    };
  } catch (cause) {
    throw new SecureStorageDefaultValueError('Default value resolution failed.', {
      ...createPropertyMetadata(property),
      operation: 'get',
    }, { cause });
  }
}

async function assertAccessAllowed(authStateProvider: CreateSecureStorageOptions['authStateProvider'], property: SecureStorageProperty<any, any, any, any>, operation: string) {
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

function decodePropertyValue<TValue>(
  property: SecureStorageProperty<TValue, any, any, any>,
  envelope: SecureStorageStoredEnvelope<TValue>,
  codecRegistry: ReturnType<typeof createCodecRegistry>,
  operation: string,
): { value: TValue; normalizedEncodedValue?: string } {
  try {
    const codec = codecRegistry.resolve(property.codec);
    return codec.decode(
      envelope.encodedValue,
      createCodecContext(property, envelope.metadata as any, codecRegistry),
    ) as { value: TValue; normalizedEncodedValue?: string };
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

function encodePropertyValue<TValue>(
  property: SecureStorageProperty<TValue, any, any, any>,
  value: TValue,
  itemMetadata: any,
  codecRegistry: ReturnType<typeof createCodecRegistry>,
  operation: string,
): string {
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

function createCodecContext(
  property: SecureStorageProperty<any, any, any, any>,
  itemMetadata: any,
  codecRegistry: ReturnType<typeof createCodecRegistry>,
): SecureStorageCodecContext {
  return {
    propertyMetadata: createPropertyMetadata(property),
    itemMetadata,
    codecs: codecRegistry.builtInCodecs,
  };
}
