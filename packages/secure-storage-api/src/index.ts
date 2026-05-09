/**
 * Public package exports.
 * Keep this barrel explicit so package consumers see one stable surface.
 */
export {
  secureStorageScopes,
  secureStorageAccessModes,
  secureStorageCodecNames,
  secureStorageLegacyCleanupStatuses,
  SecureStorageError,
  SecureStorageAccessError,
  SecureStorageCodecEncodeError,
  SecureStorageCodecDecodeError,
  SecureStorageMigrationError,
  SecureStorageNativeStorageError,
  SecureStorageLegacyFallbackError,
  SecureStorageLegacyCleanupError,
  SecureStorageDefaultValueError,
  SecureStorageMetadataError,
  createCodecRegistry,
  createPropertyRegistry,
  defineSecureStorageProperty,
  withOptions,
} from './api.ts';

export type {
  CreateSecureStorageOptions,
  SecurePropertyOptions,
  SecureStorage,
  SecureStorageAccessMode,
  SecureStorageAuthState,
  SecureStorageAuthStateProvider,
  SecureStorageBackend,
  SecureStorageBackendAccessOptions,
  SecureStorageCleanupSummary,
  SecureStorageCodec,
  SecureStorageCodecContext,
  SecureStorageCodecName,
  SecureStorageCodecValue,
  SecureStorageDecodeResult,
  SecureStorageDiagnostics,
  SecureStorageDiagnosticsEntry,
  SecureStorageFeatureFlags,
  SecureStorageItemMetadata,
  SecureStorageLegacyCleanupStatus,
  SecureStorageProperty,
  SecureStoragePropertyMetadata,
  SecureStoragePropertyRegistry,
  SecureStorageScope,
  SecureStorageStoredEnvelope,
} from './api.ts';

export {
  builtInCodecs,
  createZodJsonCodec,
  createMigratingJsonCodec,
} from './codecs.ts';

export { createMemorySecureStorageBackend } from './memory-backend.ts';

export {
  createSecureDiagnostics,
  createSecureStorage,
} from './secure-storage.ts';
