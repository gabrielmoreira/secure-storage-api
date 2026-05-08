import type {
  SecurePropertyOptions,
  SecureStorageBackend,
  SecureStorageBackendAccessOptions,
} from 'secure-storage-api';

const DEFAULT_SERVICE_PREFIX = 'secure-storage';
const DEFAULT_USERNAME = 'secure-storage';
const REACT_NATIVE_KEYCHAIN_OPTIONS_KEY = 'reactNativeKeychain';

export interface ReactNativeKeychainCredentials {
  password: string;
  service?: string;
  username: string;
}

export interface ReactNativeKeychainOptions {
  accessControl?: string;
  accessible?: string;
  accessGroup?: string;
  authenticationPrompt?: string | { title?: string; subtitle?: string; description?: string; cancel?: string };
  service?: string;
  securityLevel?: string;
}

export interface ReactNativeKeychainModule {
  getAllGenericPasswordServices(): Promise<string[]>;
  getGenericPassword(options?: ReactNativeKeychainOptions): Promise<false | ReactNativeKeychainCredentials>;
  resetGenericPassword(options?: ReactNativeKeychainOptions): Promise<boolean>;
  setGenericPassword(username: string, password: string, options?: ReactNativeKeychainOptions): Promise<false | ReactNativeKeychainCredentials>;
  ACCESS_CONTROL?: Record<string, string>;
}

export interface CreateReactNativeKeychainBackendOptions {
  baseOptions?: ReactNativeKeychainOptions;
  keychain?: ReactNativeKeychainModule;
  servicePrefix?: string;
  userPresenceOptions?: ReactNativeKeychainOptions;
  username?: string;
}

export interface ReactNativeKeychainPropertyOptions {
  accessControl?: string;
  accessible?: string;
  accessGroup?: string;
  authenticationPrompt?: string | { title?: string; subtitle?: string; description?: string; cancel?: string };
  service?: string;
  securityLevel?: string;
}

export function createReactNativeKeychainOptions<const TOptions extends ReactNativeKeychainPropertyOptions>(
  options: TOptions,
): { reactNativeKeychain: TOptions } {
  return {
    reactNativeKeychain: options,
  };
}

export function createReactNativeKeychainBackend(
  options: CreateReactNativeKeychainBackendOptions = {},
): SecureStorageBackend {
  const username = options.username ?? DEFAULT_USERNAME;
  const servicePrefix = options.servicePrefix ?? DEFAULT_SERVICE_PREFIX;
  const keychainPromise = options.keychain
    ? Promise.resolve(options.keychain)
    : loadModule<ReactNativeKeychainModule>('react-native-keychain');

  async function getKeychain() {
    const keychain = await keychainPromise;
    assertReactNativeKeychainModule(keychain);
    return keychain;
  }

  async function createItemOptions(key: string, accessOptions?: SecureStorageBackendAccessOptions) {
    const keychain = await getKeychain();
    const propertyOptions = readReactNativeKeychainPropertyOptions(accessOptions?.propertyOptions);

    if (accessOptions?.requiresUserPresence) {
      return {
        ...options.baseOptions,
        ...propertyOptions,
        ...createDefaultUserPresenceOptions(keychain),
        ...options.userPresenceOptions,
      };
    }

    return {
      ...options.baseOptions,
      ...propertyOptions,
    };
  }

  function createServiceName(key: string) {
    return `${servicePrefix}.${encodeStorageKey(key)}`;
  }

  function readKeyFromServiceName(serviceName: string) {
    if (!serviceName.startsWith(`${servicePrefix}.`)) {
      return null;
    }

    return decodeStorageKey(serviceName.slice(servicePrefix.length + 1));
  }
  return {
    async getItem(key, accessOptions = undefined) {
      const keychain = await getKeychain();
      const propertyOptions = await createItemOptions(key, accessOptions);
      const result = await keychain.getGenericPassword({
        ...propertyOptions,
        service: propertyOptions.service ?? createServiceName(key),
      });
      return result ? result.password : null;
    },

    async setItem(key, value, accessOptions = undefined) {
      const keychain = await getKeychain();
      const propertyOptions = await createItemOptions(key, accessOptions);
      await keychain.setGenericPassword(username, value, {
        ...propertyOptions,
        service: propertyOptions.service ?? createServiceName(key),
      });
    },

    async removeItem(key, accessOptions = undefined) {
      const keychain = await getKeychain();
      const propertyOptions = await createItemOptions(key, accessOptions);
      await keychain.resetGenericPassword({
        ...propertyOptions,
        service: propertyOptions.service ?? createServiceName(key),
      });
    },

    async getAllKeys() {
      const keychain = await getKeychain();
      return (await keychain.getAllGenericPasswordServices())
        .map(readKeyFromServiceName)
        .filter((key): key is string => key !== null);
    },
  };
}

function createDefaultUserPresenceOptions(keychain: ReactNativeKeychainModule): ReactNativeKeychainOptions {
  const accessControl = keychain.ACCESS_CONTROL?.['BIOMETRY_ANY_OR_DEVICE_PASSCODE']
    ?? keychain.ACCESS_CONTROL?.['BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE']
    ?? keychain.ACCESS_CONTROL?.['DEVICE_PASSCODE'];

  return accessControl ? { accessControl } : {};
}

function assertReactNativeKeychainModule(value: unknown): asserts value is ReactNativeKeychainModule {
  if (!value || typeof value !== 'object') {
    throw new TypeError('react-native-keychain module must be an object.');
  }

  if (
    typeof value['setGenericPassword'] !== 'function'
    || typeof value['getGenericPassword'] !== 'function'
    || typeof value['resetGenericPassword'] !== 'function'
    || typeof value['getAllGenericPasswordServices'] !== 'function'
  ) {
    throw new TypeError('react-native-keychain module must implement setGenericPassword, getGenericPassword, resetGenericPassword, and getAllGenericPasswordServices.');
  }
}

async function loadModule<TModule>(moduleName: string): Promise<TModule> {
  const requireModule = globalThis.require;
  if (typeof requireModule === 'function') {
    const loadedModule = requireModule(moduleName) as { default?: TModule } | TModule;
    return (loadedModule as { default?: TModule }).default ?? (loadedModule as TModule);
  }

  const importModule = new Function('target', 'return import(target);') as (target: string) => Promise<TModule>;
  const loadedModule = await importModule(moduleName);
  return (loadedModule as { default?: TModule }).default ?? loadedModule;
}

function encodeStorageKey(key: string) {
  const bytes = typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(key)
    : Uint8Array.from(unescape(encodeURIComponent(key)), (char) => char.charCodeAt(0));

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function decodeStorageKey(encodedKey: string) {
  if (encodedKey.length === 0 || encodedKey.length % 2 !== 0 || /[^0-9a-f]/i.test(encodedKey)) {
    return null;
  }

  const bytes = new Uint8Array(encodedKey.match(/.{2}/g).map((chunk) => parseInt(chunk, 16)));

  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }

  return decodeURIComponent(Array.from(bytes, (byte) => `%${byte.toString(16).padStart(2, '0')}`).join(''));
}

function readReactNativeKeychainPropertyOptions(propertyOptions?: SecurePropertyOptions) {
  const candidate = propertyOptions?.[REACT_NATIVE_KEYCHAIN_OPTIONS_KEY];
  return isRecord(candidate) ? candidate as ReactNativeKeychainPropertyOptions : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
