export function defineSecureStorageProperty(input) {
  return {
    scope: 'user',
    access: 'default',
    version: 1,
    codec: 'string',
    ...input,
  };
}

export const builtInCodecs = Object.freeze({
  string: {
    encode(value) {
      return String(value);
    },
    decode(encodedValue) {
      return { value: encodedValue };
    },
  },
  number: {
    encode(value) {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new TypeError('Number codec expects a valid number.');
      }

      return String(value);
    },
    decode(encodedValue) {
      const value = Number(encodedValue);

      if (Number.isNaN(value)) {
        throw new TypeError('Number codec could not decode the stored value.');
      }

      return { value };
    },
  },
  boolean: {
    encode(value) {
      if (typeof value !== 'boolean') {
        throw new TypeError('Boolean codec expects a boolean.');
      }

      return value ? 'true' : 'false';
    },
    decode(encodedValue) {
      if (encodedValue !== 'true' && encodedValue !== 'false') {
        throw new TypeError('Boolean codec could not decode the stored value.');
      }

      return { value: encodedValue === 'true' };
    },
  },
  json: {
    encode(value) {
      return JSON.stringify(value);
    },
    decode(encodedValue) {
      return { value: JSON.parse(encodedValue) };
    },
  },
});

export function createMemorySecureStorageBackend() {
  const items = new Map();

  return {
    async getItem(key) {
      return items.get(key) ?? null;
    },
    async setItem(key, value) {
      items.set(key, value);
    },
    async removeItem(key) {
      items.delete(key);
    },
    async getAllKeys() {
      return [...items.keys()];
    },
  };
}

export async function createSecureStorage() {
  throw new Error('createSecureStorage is not implemented yet.');
}
