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
