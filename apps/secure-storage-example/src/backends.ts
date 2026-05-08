import * as ExpoSecureStore from 'expo-secure-store';
import * as ReactNativeKeychain from 'react-native-keychain';
import * as ReactNativeSensitiveInfo from 'react-native-sensitive-info';
import type {
  SecureStorageBackend,
} from 'secure-storage-api';
import {
  createExpoSecureStoreBackend,
  type ExpoSecureStoreModule,
} from 'secure-storage-expo-secure-store';
import {
  createReactNativeKeychainBackend,
  type ReactNativeKeychainModule,
} from 'secure-storage-react-native-keychain';
import {
  createReactNativeSensitiveInfoBackend,
  type ReactNativeSensitiveInfoModule,
} from 'secure-storage-react-native-sensitive-info';

const expoSecureStoreModule: ExpoSecureStoreModule = ExpoSecureStore;

const reactNativeKeychainModule = {
  ACCESS_CONTROL: ReactNativeKeychain.ACCESS_CONTROL,
  getAllGenericPasswordServices: ReactNativeKeychain.getAllGenericPasswordServices,
  getGenericPassword: ReactNativeKeychain.getGenericPassword,
  resetGenericPassword: ReactNativeKeychain.resetGenericPassword,
  setGenericPassword: ReactNativeKeychain.setGenericPassword,
} as unknown as ReactNativeKeychainModule;

const reactNativeSensitiveInfoModule: ReactNativeSensitiveInfoModule = {
  clearService: async (options) => {
    await ReactNativeSensitiveInfo.clearService(options as never);
  },
  deleteItem: (key, options) => ReactNativeSensitiveInfo.deleteItem(key, options as never),
  getAllItems: (options) => ReactNativeSensitiveInfo.getAllItems(options as never),
  getItem: (key, options) => ReactNativeSensitiveInfo.getItem(key, options as never),
  setItem: async (key, value, options) => {
    await ReactNativeSensitiveInfo.setItem(key, value, options as never);
  },
};
export const backendCatalog = [
  {
    id: 'expoSecureStore',
    label: 'Expo Secure Store',
    description: 'Expo Secure Store adapter with synthetic key index.',
    createBackend(): SecureStorageBackend {
      return createExpoSecureStoreBackend({
        secureStore: expoSecureStoreModule,
        baseOptions: {
          keychainService: 'secure-storage-example',
        },
        userPresenceOptions: {
          requireAuthentication: true,
          authenticationPrompt: 'Authenticate to access secure values',
          keychainService: 'secure-storage-example',
        },
      });
    },
  },
  {
    id: 'reactNativeKeychain',
    label: 'React Native Keychain',
    description: 'Keychain/Keystore adapter using one service entry per key.',
    createBackend(): SecureStorageBackend {
      return createReactNativeKeychainBackend({
        keychain: reactNativeKeychainModule,
        servicePrefix: 'secure-storage-example',
        userPresenceOptions: {
          authenticationPrompt: {
            title: 'Authenticate to access secure values',
          },
        },
      });
    },
  },
  {
    id: 'reactNativeSensitiveInfo',
    label: 'React Native Sensitive Info',
    description: 'Sensitive Info adapter using native item listing.',
    createBackend(): SecureStorageBackend {
      return createReactNativeSensitiveInfoBackend({
        sensitiveInfo: reactNativeSensitiveInfoModule,
        service: 'secure-storage-example',
        baseOptions: {
          accessControl: 'none',
        },
        userPresenceOptions: {
          accessControl: 'biometryAny',
          authenticationPrompt: {
            title: 'Authenticate to access secure values',
          },
        }
      });
    },
  },
] as const;

export type BackendId = (typeof backendCatalog)[number]['id'];

export function getBackendDefinition(id: BackendId) {
  const entry = backendCatalog.find((item) => item.id === id);
  if (!entry) {
    throw new Error(`Unknown backend: ${id}`);
  }
  return entry;
}
