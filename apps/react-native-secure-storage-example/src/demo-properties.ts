import {
  createPropertyRegistry,
  defineSecureStorageProperty,
  withOptions,
} from 'secure-storage-api';
import { createExpoSecureStoreOptions } from 'secure-storage-expo-secure-store';
import { createReactNativeKeychainOptions } from 'secure-storage-react-native-keychain';
import { createReactNativeSensitiveInfoOptions } from 'secure-storage-react-native-sensitive-info';

const registry = createPropertyRegistry();

const configuredTokenOptions = withOptions(
  createExpoSecureStoreOptions({
    keychainService: 'react-native-secure-storage-example.configured-token',
  }),
  createReactNativeKeychainOptions({
    service: 'react-native-secure-storage-example.configured-token',
  }),
  createReactNativeSensitiveInfoOptions({
    service: 'react-native-secure-storage-example.configured-token',
  }),
);

export const demoProperties = {
  appInstallId: registry.defineProperty({
    namespace: 'device',
    name: 'appInstallId',
    scope: 'app',
    codec: 'string',
  }),
  refreshToken: registry.defineProperty({
    namespace: 'auth',
    name: 'refreshToken',
    scope: 'user',
    codec: 'string',
  }),
  configuredToken: registry.defineProperty({
    namespace: 'auth',
    name: 'configuredToken',
    scope: 'user',
    codec: 'string',
    options: configuredTokenOptions,
  }),
  sessionCounter: registry.defineProperty({
    namespace: 'session',
    name: 'counter',
    scope: 'user',
    access: 'activeSession',
    codec: 'number',
  }),
  acceptedTerms: registry.defineProperty({
    namespace: 'onboarding',
    name: 'acceptedTerms',
    scope: 'user',
    codec: 'boolean',
    defaultValue: false,
  }),
  preferences: registry.defineProperty({
    namespace: 'profile',
    name: 'preferences',
    scope: 'user',
    codec: 'json',
    defaultValue: () => ({
      theme: 'system',
      marketingOptIn: false,
    }),
  }),
  secureNote: registry.defineProperty({
    namespace: 'vault',
    name: 'secureNote',
    scope: 'user',
    access: 'userPresence',
    codec: 'string',
  }),
};

export const demoPropertyList = [
  demoProperties.appInstallId,
  demoProperties.refreshToken,
  demoProperties.configuredToken,
  demoProperties.sessionCounter,
  demoProperties.acceptedTerms,
  demoProperties.preferences,
  demoProperties.secureNote,
] as const;

export const demoPropertyCatalog = [
  {
    id: 'appInstallId',
    label: 'App install id',
    description: 'App-scoped string value that survives user-scoped cleanup.',
    testFocus: 'Shows the difference between app-scoped storage and user-scoped storage.',
    property: demoProperties.appInstallId,
    exampleValueText: 'install-android-001',
  },
  {
    id: 'refreshToken',
    label: 'Refresh token',
    description: 'Baseline user-scoped string value.',
    testFocus: 'Good default property for quick set/get/remove/has checks.',
    property: demoProperties.refreshToken,
    exampleValueText: 'token-123',
  },
  {
    id: 'configuredToken',
    label: 'Configured token',
    description: 'User-scoped string with composed per-adapter property options.',
    testFocus: 'Exercises property.options composition without depending on biometric UI prompts.',
    property: demoProperties.configuredToken,
    exampleValueText: 'configured-token-001',
  },
  {
    id: 'sessionCounter',
    label: 'Session counter',
    description: 'Numeric value that requires an active session.',
    testFocus: 'Flip Active session off to confirm access enforcement errors.',
    property: demoProperties.sessionCounter,
    exampleValueText: '41',
  },
  {
    id: 'acceptedTerms',
    label: 'Accepted terms',
    description: 'Boolean property with default false.',
    testFocus: 'Useful for checking defaultValue behavior and boolean codec handling.',
    property: demoProperties.acceptedTerms,
    exampleValueText: 'true',
  },
  {
    id: 'preferences',
    label: 'Preferences',
    description: 'JSON profile preferences object.',
    testFocus: 'Exercises the JSON codec and object round-tripping.',
    property: demoProperties.preferences,
    exampleValueText: '{"theme":"dark","marketingOptIn":true}',
  },
  {
    id: 'secureNote',
    label: 'Secure note',
    description: 'Protected value that requires user presence.',
    testFocus: 'Compare provider behavior when a protected operation may prompt for authentication.',
    property: demoProperties.secureNote,
    exampleValueText: 'open sesame',
  },
] as const;

export type DemoPropertyId = (typeof demoPropertyCatalog)[number]['id'];

export function getDemoPropertyById(id: DemoPropertyId) {
  const entry = demoPropertyCatalog.find((item) => item.id === id);
  if (!entry) {
    throw new Error(`Unknown demo property: ${id}`);
  }
  return entry;
}

export function getDemoRegistry() {
  return registry;
}

export function createDirectJsonProperty<TValue = unknown>(namespace: string, name: string) {
  return defineSecureStorageProperty<TValue>({
    namespace,
    name,
    codec: 'json',
  });
}
