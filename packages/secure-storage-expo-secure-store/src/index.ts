import type {
  SecureStorageBackend,
  SecureStorageBackendAccessOptions,
} from 'secure-storage-api';

const DEFAULT_INDEX_KEY = 'secure-storage.adapter.expo-secure-store.index';

export interface ExpoSecureStoreItemOptions {
  accessGroup?: string;
  authenticationPrompt?: string;
  keychainAccessible?: string | number;
  keychainService?: string;
  requireAuthentication?: boolean;
}

export interface ExpoSecureStoreModule {
  deleteItemAsync(key: string, options?: ExpoSecureStoreItemOptions): Promise<void>;
  getItemAsync(key: string, options?: ExpoSecureStoreItemOptions): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: ExpoSecureStoreItemOptions): Promise<void>;
}

export interface CreateExpoSecureStoreBackendOptions {
  baseOptions?: ExpoSecureStoreItemOptions;
  indexKey?: string;
  secureStore?: ExpoSecureStoreModule;
  userPresenceOptions?: ExpoSecureStoreItemOptions;
}

export function createExpoSecureStoreBackend(
  options: CreateExpoSecureStoreBackendOptions = {},
): SecureStorageBackend {
  const indexKey = options.indexKey ?? DEFAULT_INDEX_KEY;
  const secureStorePromise = options.secureStore
    ? Promise.resolve(options.secureStore)
    : loadModule<ExpoSecureStoreModule>('expo-secure-store');

  let pendingMutation = Promise.resolve();

  function enqueueMutation<TValue>(task: () => Promise<TValue>) {
    const nextMutation = pendingMutation.then(task, task);
    pendingMutation = nextMutation.then(() => undefined, () => undefined);
    return nextMutation;
  }

  async function getSecureStore() {
    const secureStore = await secureStorePromise;
    assertExpoSecureStoreModule(secureStore);
    return secureStore;
  }

  function createItemOptions(accessOptions?: SecureStorageBackendAccessOptions): ExpoSecureStoreItemOptions {
    if (accessOptions?.requiresUserPresence) {
      return {
        ...options.baseOptions,
        requireAuthentication: true,
        ...options.userPresenceOptions,
      };
    }

    return {
      ...options.baseOptions,
    };
  }

  const indexOptions: ExpoSecureStoreItemOptions = {
    ...options.baseOptions,
    requireAuthentication: false,
  };

  function toNativeKey(key: string) {
    return `ss_${encodeStorageKey(key)}`;
  }

  async function readIndex() {
    const secureStore = await getSecureStore();
    const rawIndex = await secureStore.getItemAsync(indexKey, indexOptions);

    if (rawIndex === null) {
      return [];
    }

    let parsedIndex;
    try {
      parsedIndex = JSON.parse(rawIndex);
    } catch (cause) {
      throw new TypeError('Expo Secure Store adapter index is malformed.', { cause });
    }

    if (!Array.isArray(parsedIndex) || parsedIndex.some((key) => typeof key !== 'string')) {
      throw new TypeError('Expo Secure Store adapter index must be an array of string keys.');
    }

    return [...new Set(parsedIndex)];
  }

  async function writeIndex(keys: string[]) {
    const secureStore = await getSecureStore();
    await secureStore.setItemAsync(indexKey, JSON.stringify(keys), indexOptions);
  }

  return {
    async getItem(key, accessOptions = undefined) {
      const secureStore = await getSecureStore();
      return secureStore.getItemAsync(toNativeKey(key), createItemOptions(accessOptions));
    },

    async setItem(key, value, accessOptions = undefined) {
      return enqueueMutation(async () => {
        const secureStore = await getSecureStore();
        const index = await readIndex();
        const hasKey = index.includes(key);
        const nativeKey = toNativeKey(key);

        if (!hasKey) {
          await writeIndex([...index, key]);
        }

        try {
          await secureStore.setItemAsync(nativeKey, value, createItemOptions(accessOptions));
        } catch (cause) {
          if (!hasKey) {
            await restoreIndexSilently(index);
          }
          throw cause;
        }
      });
    },

    async removeItem(key, accessOptions = undefined) {
      return enqueueMutation(async () => {
        const secureStore = await getSecureStore();
        const index = await readIndex();
        const hasKey = index.includes(key);
        const nextIndex = hasKey ? index.filter((entry) => entry !== key) : index;
        const nativeKey = toNativeKey(key);

        if (hasKey) {
          await writeIndex(nextIndex);
        }

        try {
          await secureStore.deleteItemAsync(nativeKey, createItemOptions(accessOptions));
        } catch (cause) {
          if (hasKey) {
            await restoreIndexSilently(index);
          }
          throw cause;
        }
      });
    },

    async getAllKeys() {
      await pendingMutation;
      return readIndex();
    },
  };

  async function restoreIndexSilently(keys: string[]) {
    try {
      await writeIndex(keys);
    } catch {
      // Best effort only. A later mutation may repair the index.
    }
  }
}

function assertExpoSecureStoreModule(value: unknown): asserts value is ExpoSecureStoreModule {
  if (!value || typeof value !== 'object') {
    throw new TypeError('Expo Secure Store module must be an object.');
  }

  if (
    typeof value['getItemAsync'] !== 'function'
    || typeof value['setItemAsync'] !== 'function'
    || typeof value['deleteItemAsync'] !== 'function'
  ) {
    throw new TypeError('Expo Secure Store module must implement getItemAsync, setItemAsync, and deleteItemAsync.');
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
