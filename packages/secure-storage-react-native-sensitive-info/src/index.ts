import type {
  SecureStorageBackend,
  SecureStorageBackendAccessOptions,
} from 'secure-storage-api';

const DEFAULT_SERVICE = 'secure-storage';

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

  function createItemOptions(accessOptions?: SecureStorageBackendAccessOptions): ReactNativeSensitiveInfoOptions {
    if (accessOptions?.requiresUserPresence) {
      return {
        service,
        ...options.baseOptions,
        accessControl: 'biometryAny',
        ...options.userPresenceOptions,
      };
    }

    return {
      service,
      accessControl: 'none',
      ...options.baseOptions,
    };
  }

  function toNativeKey(key: string) {
    return `ss_${encodeStorageKey(key)}`;
  }

  return {
    async getItem(key, accessOptions = undefined) {
      const sensitiveInfo = await getSensitiveInfo();
      const item = await sensitiveInfo.getItem(toNativeKey(key), {
        ...createItemOptions(accessOptions),
        includeValue: true,
      });
      return item?.value ?? null;
    },

    async setItem(key, value, accessOptions = undefined) {
      const sensitiveInfo = await getSensitiveInfo();
      await sensitiveInfo.setItem(toNativeKey(key), value, createItemOptions(accessOptions));
    },

    async removeItem(key, accessOptions = undefined) {
      const sensitiveInfo = await getSensitiveInfo();
      await sensitiveInfo.deleteItem(toNativeKey(key), createItemOptions(accessOptions));
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
