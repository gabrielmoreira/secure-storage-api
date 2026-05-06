import type { SecureStorageCodec } from './api.ts';
import {
  SecureStorageCodecDecodeError,
  SecureStorageMigrationError,
} from './api.ts';

/** Built-ins stay exported so custom codecs can compose on top without copying logic. */
export const builtInCodecs = Object.freeze({
  string: {
    encode(value) {
      return String(value);
    },
    decode(encodedValue) {
      return { value: encodedValue };
    },
  } satisfies SecureStorageCodec<string>,
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
  } satisfies SecureStorageCodec<number>,
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
  } satisfies SecureStorageCodec<boolean>,
  json: {
    encode(value) {
      return JSON.stringify(value);
    },
    decode(encodedValue) {
      return { value: JSON.parse(encodedValue) };
    },
  } satisfies SecureStorageCodec<unknown>,
});

/** This stays dependency-free on purpose. Any schema object with parse() can adapt here. */
export function createZodJsonCodec<TValue>(schemaLike: { parse(value: unknown): TValue }): SecureStorageCodec<TValue> {
  if (!schemaLike || typeof schemaLike.parse !== 'function') {
    throw new TypeError('createZodJsonCodec expects a schema-like object with a parse() method.');
  }

  return {
    encode(value) {
      return JSON.stringify(value);
    },
    decode(encodedValue, context) {
      try {
        const parsed = JSON.parse(encodedValue);
        return { value: schemaLike.parse(parsed) };
      } catch (cause) {
        throw new SecureStorageCodecDecodeError('Schema-based JSON codec decode failed.', {
          ...context.propertyMetadata,
          operation: 'get',
        }, { cause });
      }
    },
  };
}

/** Migration belongs to codecs so version-specific shape evolution stays close to the value itself. */
export function createMigratingJsonCodec<TValue>({
  migrate,
}: {
  migrate(input: {
    value: unknown;
    fromVersion: number;
    toVersion: number;
    itemMetadata: any;
    propertyMetadata: any;
  }): TValue;
}): SecureStorageCodec<TValue> {
  if (typeof migrate !== 'function') {
    throw new TypeError('createMigratingJsonCodec requires a migrate function.');
  }

  return {
    encode(value) {
      return JSON.stringify(value);
    },
    decode(encodedValue, context) {
      const parsedValue = JSON.parse(encodedValue);
      const fromVersion = context.itemMetadata.version;
      const toVersion = context.propertyMetadata.version;
      if (fromVersion > toVersion) {
        throw new SecureStorageMigrationError('Stored version is newer than the property version.', {
          ...context.propertyMetadata,
          operation: 'get',
        });
      }
      if (fromVersion === toVersion) {
        return { value: parsedValue as TValue };
      }

      let migratedValue;
      try {
        migratedValue = migrate({
          value: parsedValue,
          fromVersion,
          toVersion,
          itemMetadata: context.itemMetadata,
          propertyMetadata: context.propertyMetadata,
        });
      } catch (cause) {
        throw new SecureStorageMigrationError('Value migration failed.', {
          ...context.propertyMetadata,
          operation: 'get',
        }, { cause });
      }

      return {
        value: migratedValue,
        normalizedEncodedValue: JSON.stringify(migratedValue),
      };
    },
  };
}
