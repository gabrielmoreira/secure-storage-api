/**
 * Small in-memory backend used by the prototype and tests.
 * It deliberately matches the backend contract without adding provider semantics.
 */
export function createMemorySecureStorageBackend() {
  const items = new Map();

  return {
    async getItem(key, _options = undefined) {
      return items.get(key) ?? null;
    },
    async setItem(key, value, _options = undefined) {
      items.set(key, value);
    },
    async removeItem(key, _options = undefined) {
      items.delete(key);
    },
    async getAllKeys() {
      return [...items.keys()];
    },
  };
}
