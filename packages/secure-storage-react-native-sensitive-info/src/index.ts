import type {
  SecurePropertyOptions,
  SecureStorageBackend,
  SecureStorageBackendAccessOptions,
} from 'secure-storage-api';

const DEFAULT_SERVICE = 'secure-storage';
const REACT_NATIVE_SENSITIVE_INFO_OPTIONS_KEY = 'reactNativeSensitiveInfo';

export interface ReactNativeSensitiveInfoItem {
  key: string;
  value?: string;
}

export interface ReactNativeSensitiveInfoPrompt {
  title?: string;
  subtitle?: string;
  description?: string;
  cancel?: string;
}

export interface ReactNativeSensitiveInfoOptions {
  accessControl?: string;
  authenticationPrompt?: ReactNativeSensitiveInfoPrompt;
  includeValue?: boolean;
  keychainGroup?: string;
  keychainService?: string;
  service?: string;
}

export interface ReactNativeSensitiveInfoReadResult {
  key: string;
  metadata?: unknown;
  value?: string;
}

export interface ReactNativeSensitiveInfoModule {
  clearService(options?: ReactNativeSensitiveInfoOptions): Promise<void>;
  deleteItem(key: string, options?: ReactNativeSensitiveInfoOptions): Promise<boolean>;
  getAllItems(options?: ReactNativeSensitiveInfoOptions): Promise<ReactNativeSensitiveInfoItem[]>;
  getItem(key: string, options?: ReactNativeSensitiveInfoOptions): Promise<ReactNativeSensitiveInfoReadResult | null>;
  setItem(key: string, value: string, options?: ReactNativeSensitiveInfoOptions): Promise<void>;
}

export interface CreateReactNativeSensitiveInfoBackendOptions {
  baseOptions?: ReactNativeSensitiveInfoOptions;
  sensitiveInfo?: ReactNativeSensitiveInfoModule;
  service?: string;
  userPresenceOptions?: ReactNativeSensitiveInfoOptions;
}

export interface ReactNativeSensitiveInfoPropertyOptions {
  accessControl?: string;
  authenticationPrompt?: ReactNativeSensitiveInfoPrompt;
  keychainGroup?: string;
  keychainService?: string;
  service?: string;
}

export function createReactNativeSensitiveInfoOptions<const TOptions extends ReactNativeSensitiveInfoPropertyOptions>(
  options: TOptions,
): { reactNativeSensitiveInfo: TOptions } {
  return {
    reactNativeSensitiveInfo: options,
  };
}

export function createReactNativeSensitiveInfoBackend(
  options: CreateReactNativeSensitiveInfoBackendOptions = {},
): SecureStorageBackend {
  const service = options.service ?? DEFAULT_SERVICE;
  const sensitiveInfoPromise = options.sensitiveInfo
    ? Promise.resolve(options.sensitiveInfo)
    : loadModule<ReactNativeSensitiveInfoModule>('react-native-sensitive-info');

  async function getSensitiveInfo() {
    const sensitiveInfo = await sensitiveInfoPromise;
    assertReactNativeSensitiveInfoModule(sensitiveInfo);
    return sensitiveInfo;
  }

  function createItemOptions(key: string, accessOptions?: SecureStorageBackendAccessOptions): ReactNativeSensitiveInfoOptions {
    const propertyOptions = readReactNativeSensitiveInfoPropertyOptions(accessOptions?.propertyOptions);

    if (accessOptions?.requiresUserPresence) {
      const accessControl = propertyOptions?.accessControl && propertyOptions.accessControl !== 'none'
        ? propertyOptions.accessControl
        : options.userPresenceOptions?.accessControl && options.userPresenceOptions.accessControl !== 'none'
          ? options.userPresenceOptions.accessControl
          : 'biometryAny';

      return {
        service,
        ...options.baseOptions,
        ...propertyOptions,
        ...options.userPresenceOptions,
        accessControl,
      };
    }

    return {
      service,
      accessControl: 'none',
      ...options.baseOptions,
      ...propertyOptions,
    };
  }

  function toNativeKey(key: string) {
    return `ss_${encodeStorageKey(key)}`;
  }

  return {
    async getItem(key, accessOptions = undefined) {
      const sensitiveInfo = await getSensitiveInfo();
      const item = await sensitiveInfo.getItem(toNativeKey(key), {
        ...createItemOptions(key, accessOptions),
        includeValue: true,
      });
      return item?.value ?? null;
    },

    async setItem(key, value, accessOptions = undefined) {
      const sensitiveInfo = await getSensitiveInfo();
      await sensitiveInfo.setItem(toNativeKey(key), value, createItemOptions(key, accessOptions));
    },

    async removeItem(key, accessOptions = undefined) {
      const sensitiveInfo = await getSensitiveInfo();
      await sensitiveInfo.deleteItem(toNativeKey(key), createItemOptions(key, accessOptions));
    },

    async getAllKeys() {
      const sensitiveInfo = await getSensitiveInfo();
      const items = await sensitiveInfo.getAllItems({
        service,
        includeValue: false,
      });
      return items
        .map((item) => item.key.startsWith('ss_') ? decodeStorageKey(item.key.slice(3)) : null)
        .filter((key): key is string => key !== null);
    },
  };
}

function assertReactNativeSensitiveInfoModule(value: unknown): asserts value is ReactNativeSensitiveInfoModule {
  if (!value || typeof value !== 'object') {
    throw new TypeError('react-native-sensitive-info module must be an object.');
  }

  if (
    typeof value['setItem'] !== 'function'
    || typeof value['getItem'] !== 'function'
    || typeof value['deleteItem'] !== 'function'
    || typeof value['getAllItems'] !== 'function'
    || typeof value['clearService'] !== 'function'
  ) {
    throw new TypeError('react-native-sensitive-info module must implement setItem, getItem, deleteItem, getAllItems, and clearService.');
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

function readReactNativeSensitiveInfoPropertyOptions(propertyOptions?: SecurePropertyOptions) {
  const candidate = propertyOptions?.[REACT_NATIVE_SENSITIVE_INFO_OPTIONS_KEY];
  return isRecord(candidate) ? candidate as ReactNativeSensitiveInfoPropertyOptions : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
