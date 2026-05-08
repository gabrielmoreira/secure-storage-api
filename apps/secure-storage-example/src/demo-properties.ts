import {
  createPropertyRegistry,
  defineSecureStorageProperty,
} from 'secure-storage-api';

const registry = createPropertyRegistry();

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
  demoProperties.sessionCounter,
  demoProperties.acceptedTerms,
  demoProperties.preferences,
  demoProperties.secureNote,
] as const;

export const demoPropertyCatalog = [
  {
    id: 'appInstallId',
    label: 'App install id',
    description: 'App-scoped string value',
    property: demoProperties.appInstallId,
    exampleValueText: 'install-android-001',
  },
  {
    id: 'refreshToken',
    label: 'Refresh token',
    description: 'User-scoped string value',
    property: demoProperties.refreshToken,
    exampleValueText: 'token-123',
  },
  {
    id: 'sessionCounter',
    label: 'Session counter',
    description: 'Requires active session',
    property: demoProperties.sessionCounter,
    exampleValueText: '41',
  },
  {
    id: 'acceptedTerms',
    label: 'Accepted terms',
    description: 'Boolean with default false',
    property: demoProperties.acceptedTerms,
    exampleValueText: 'true',
  },
  {
    id: 'preferences',
    label: 'Preferences',
    description: 'JSON profile preferences',
    property: demoProperties.preferences,
    exampleValueText: '{"theme":"dark","marketingOptIn":true}',
  },
  {
    id: 'secureNote',
    label: 'Secure note',
    description: 'User presence required',
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

export function createDirectJsonProperty(namespace: string, name: string) {
  return defineSecureStorageProperty<{ value: string }>({
    namespace,
    name,
    codec: 'json',
  });
}
