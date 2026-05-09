import type { SecureStorageProperty } from 'secure-storage-api';

export function parseInputValue(property: SecureStorageProperty<any, any, any, any, any>, rawValue: string) {
  if (property.codec === 'number') {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      throw new Error('Number properties require a finite numeric input.');
    }
    return parsed;
  }

  if (property.codec === 'boolean') {
    if (rawValue === 'true') {
      return true;
    }
    if (rawValue === 'false') {
      return false;
    }
    throw new Error('Boolean properties require "true" or "false".');
  }

  if (property.codec === 'json') {
    try {
      return JSON.parse(rawValue) as unknown;
    } catch (error) {
      throw new Error('JSON properties require a valid JSON input.', { cause: error });
    }
  }

  return rawValue;
}

export function stringifyValue(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value, null, 2);
}
