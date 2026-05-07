import {
  assertNonEmptyString,
  assertOneOf,
  assertPositiveInteger,
  freezeSafeMetadata,
} from './support.ts';

/** Stable public literals keep the API backend-agnostic and avoid enum runtime baggage. */
export const secureStorageScopes = Object.freeze(['app', 'user']);
export const secureStorageAccessModes = Object.freeze(['default', 'activeSession', 'userPresence']);
export const secureStorageCodecNames = Object.freeze(['string', 'number', 'boolean', 'json']);
export const secureStorageLegacyCleanupStatuses = Object.freeze(['notNeeded', 'pending', 'succeeded', 'failed']);

export type SecureStorageScope = (typeof secureStorageScopes)[number];
export type SecureStorageAccessMode = (typeof secureStorageAccessModes)[number];
export type SecureStorageCodecName = (typeof secureStorageCodecNames)[number];
export type SecureStorageLegacyCleanupStatus = (typeof secureStorageLegacyCleanupStatuses)[number];

export interface SecureStoragePropertyMetadata {
  namespace: string;
  name: string;
  scope: SecureStorageScope;
  access: SecureStorageAccessMode;
  version: number;
}

export interface SecureStorageItemMetadata {
  namespace: string;
  name: string;
  scope: SecureStorageScope;
  version: number;
  createdAt: string;
  updatedAt: string;
  legacyCleanupStatus: SecureStorageLegacyCleanupStatus;
}

export interface SecureStorageCodecContext {
  propertyMetadata: SecureStoragePropertyMetadata;
  itemMetadata: SecureStorageItemMetadata;
  codecs: Record<string, SecureStorageCodec<unknown>>;
}

export interface SecureStorageDecodeResult<TValue> {
  value: TValue;
  normalizedEncodedValue?: string;
}

export interface SecureStorageCodec<TValue> {
  encode(value: TValue, context: SecureStorageCodecContext): string;
  decode(encodedValue: string, context: SecureStorageCodecContext): SecureStorageDecodeResult<TValue>;
}

export interface SecureStorageBackendAccessOptions {
  requiresUserPresence: boolean;
}

export interface SecureStorageBackend {
  getItem(key: string, options?: SecureStorageBackendAccessOptions): Promise<string | null> | string | null;
  setItem(key: string, value: string, options?: SecureStorageBackendAccessOptions): Promise<void> | void;
  removeItem(key: string, options?: SecureStorageBackendAccessOptions): Promise<void> | void;
  getAllKeys(): Promise<string[]> | string[];
}

export interface SecureStorageAuthState {
  hasBoundUser?: boolean;
  hasActiveSession?: boolean;
}

export interface SecureStorageAuthStateProvider {
  getAuthState(): Promise<SecureStorageAuthState | null | undefined> | SecureStorageAuthState | null | undefined;
}

export interface SecureStorageFeatureFlags {
  legacyCleanupEnabled?: boolean;
}

export type SecureStorageCodecValue<TCodec> =
  TCodec extends 'string' ? string :
  TCodec extends 'number' ? number :
  TCodec extends 'boolean' ? boolean :
  TCodec extends 'json' ? unknown :
  TCodec extends SecureStorageCodec<infer TValue> ? TValue :
  never;

export type SecureStorageDefaultValueInput<TResult> =
  TResult | (() => TResult | Promise<TResult>);

export type SecureStorageLegacyFallbackInput<TResult> =
  () => TResult | Promise<TResult>;

type AwaitedValue<TValue> =
  TValue extends Promise<infer TResult> ? AwaitedValue<TResult> : TValue;

export interface SecureStorageProperty<
  TValue = string,
  TCodec extends SecureStorageCodecName | SecureStorageCodec<TValue> = 'string',
  TDefaultValue extends SecureStorageDefaultValueInput<TValue> | undefined = undefined,
  TLegacyFallback extends SecureStorageLegacyFallbackInput<TValue | null> | undefined = undefined,
> {
  namespace: string;
  name: string;
  scope: SecureStorageScope;
  access: SecureStorageAccessMode;
  version: number;
  codec: TCodec;
  defaultValue?: TDefaultValue;
  legacyFallback?: TLegacyFallback;
  legacyCleanup?: () => void | Promise<void>;
}

type SecureStoragePropertyInputBase<
  TValue,
  TCodec extends SecureStorageCodecName | SecureStorageCodec<TValue>,
  TDefaultValue extends SecureStorageDefaultValueInput<TValue> | undefined = undefined,
  TLegacyFallback extends SecureStorageLegacyFallbackInput<TValue | null> | undefined = undefined,
> = {
  namespace: string;
  name: string;
  scope?: SecureStorageScope;
  access?: SecureStorageAccessMode;
  version?: number;
  codec?: TCodec;
  defaultValue?: TDefaultValue;
  legacyFallback?: TLegacyFallback;
  legacyCleanup?: () => void | Promise<void>;
};

export type SecureStoragePropertyValue<TProperty extends SecureStorageProperty<any, any, any, any>> =
  TProperty extends SecureStorageProperty<infer TValue, any, any, any> ? TValue : never;

type SecureStoragePropertyDefaultValue<TProperty extends SecureStorageProperty<any, any, any, any>> =
  TProperty extends SecureStorageProperty<any, any, infer TDefaultValue, any> ? TDefaultValue : never;

type SecureStoragePropertyLegacyFallback<TProperty extends SecureStorageProperty<any, any, any, any>> =
  TProperty extends SecureStorageProperty<any, any, any, infer TLegacyFallback> ? TLegacyFallback : never;

type SecureStorageResolvedDefaultValue<TProperty extends SecureStorageProperty<any, any, any, any>> =
  [SecureStoragePropertyDefaultValue<TProperty>] extends [undefined] ? never :
  SecureStoragePropertyDefaultValue<TProperty> extends (...args: any[]) => infer TResult ? AwaitedValue<TResult> :
  SecureStoragePropertyDefaultValue<TProperty>;

type SecureStorageResolvedLegacyFallbackValue<TProperty extends SecureStorageProperty<any, any, any, any>> =
  SecureStoragePropertyLegacyFallback<TProperty> extends (...args: any[]) => infer TResult ? AwaitedValue<TResult> :
  never;

type SecureStorageGuaranteesValue<TValue> =
  [TValue] extends [never] ? false :
  null extends TValue ? false :
  true;

export type SecureStorageGetResult<TProperty extends SecureStorageProperty<any, any, any, any>> =
  SecureStorageGuaranteesValue<SecureStorageResolvedLegacyFallbackValue<TProperty>> extends true ? SecureStoragePropertyValue<TProperty> :
  SecureStorageGuaranteesValue<SecureStorageResolvedDefaultValue<TProperty>> extends true ? SecureStoragePropertyValue<TProperty> :
  SecureStoragePropertyValue<TProperty> | null;

export interface SecureStorageCleanupSummary {
  checked: number;
  pending: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export interface SecureStorageStoredEnvelope<TValue = unknown> {
  metadata: SecureStorageItemMetadata;
  encodedValue: string;
  _value?: TValue;
}

export interface SecureStorageDiagnosticsEntry {
  namespace: string;
  name: string;
  scope: SecureStorageScope;
  access: SecureStorageAccessMode;
  version: number;
  exists: boolean;
  legacyCleanupStatus: SecureStorageLegacyCleanupStatus | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SecureStorage {
  get<TProperty extends SecureStorageProperty<any, any, any, any>>(property: TProperty): Promise<SecureStorageGetResult<TProperty>>;
  set<TProperty extends SecureStorageProperty<any, any, any, any>>(property: TProperty, value: SecureStoragePropertyValue<TProperty>): Promise<void>;
  remove<TProperty extends SecureStorageProperty<any, any, any, any>>(property: TProperty): Promise<void>;
  has<TProperty extends SecureStorageProperty<any, any, any, any>>(property: TProperty): Promise<boolean>;
  clearUserStorage(): Promise<void>;
  runLegacyCleanup(properties: ReadonlyArray<SecureStorageProperty<any, any, any, any>>): Promise<SecureStorageCleanupSummary>;
  _inspect<TProperty extends SecureStorageProperty<any, any, any, any>>(property: TProperty): Promise<SecureStorageStoredEnvelope<SecureStoragePropertyValue<TProperty>> | null>;
}

export interface SecureStorageDiagnostics {
  inspectProperties(properties: ReadonlyArray<SecureStorageProperty<any, any, any, any>>): Promise<SecureStorageDiagnosticsEntry[]>;
}

export interface CreateSecureStorageOptions {
  backend: SecureStorageBackend;
  authStateProvider: SecureStorageAuthStateProvider;
  registry?: SecureStoragePropertyRegistry | null;
  featureFlags?: SecureStorageFeatureFlags;
  now?: () => Date;
}

export interface SecureStoragePropertyRegistry {
  register<TProperty extends SecureStorageProperty<any, any, any, any>>(
    property: TProperty,
  ): TProperty;
  defineProperty<
    TDefaultValue extends SecureStorageDefaultValueInput<string> | undefined = undefined,
    TLegacyFallback extends SecureStorageLegacyFallbackInput<string | null> | undefined = undefined,
  >(input: SecureStoragePropertyInputBase<string, 'string', TDefaultValue, TLegacyFallback> & { codec?: undefined | 'string' }): SecureStorageProperty<string, 'string', TDefaultValue, TLegacyFallback>;
  defineProperty<
    TDefaultValue extends SecureStorageDefaultValueInput<number> | undefined = undefined,
    TLegacyFallback extends SecureStorageLegacyFallbackInput<number | null> | undefined = undefined,
  >(input: SecureStoragePropertyInputBase<number, 'number', TDefaultValue, TLegacyFallback> & { codec: 'number' }): SecureStorageProperty<number, 'number', TDefaultValue, TLegacyFallback>;
  defineProperty<
    TDefaultValue extends SecureStorageDefaultValueInput<boolean> | undefined = undefined,
    TLegacyFallback extends SecureStorageLegacyFallbackInput<boolean | null> | undefined = undefined,
  >(input: SecureStoragePropertyInputBase<boolean, 'boolean', TDefaultValue, TLegacyFallback> & { codec: 'boolean' }): SecureStorageProperty<boolean, 'boolean', TDefaultValue, TLegacyFallback>;
  defineProperty<
    TValue,
    TDefaultValue extends SecureStorageDefaultValueInput<TValue> | undefined = undefined,
    TLegacyFallback extends SecureStorageLegacyFallbackInput<TValue | null> | undefined = undefined,
  >(input: SecureStoragePropertyInputBase<TValue, 'json', TDefaultValue, TLegacyFallback> & { codec: 'json' }): SecureStorageProperty<TValue, 'json', TDefaultValue, TLegacyFallback>;
  defineProperty<
    TValue,
    TCodec extends SecureStorageCodec<TValue>,
    TDefaultValue extends SecureStorageDefaultValueInput<TValue> | undefined = undefined,
    TLegacyFallback extends SecureStorageLegacyFallbackInput<TValue | null> | undefined = undefined,
  >(
    input: SecureStoragePropertyInputBase<TValue, TCodec, TDefaultValue, TLegacyFallback> & { codec: TCodec },
  ): SecureStorageProperty<TValue, TCodec, TDefaultValue, TLegacyFallback>;
  get(namespace: string, name: string): SecureStorageProperty<any, any, any, any> | null;
  list(): Array<SecureStorageProperty<any, any, any, any>>;
}

function createErrorClass(name, code) {
  return class extends SecureStorageError {
    constructor(message, metadata = {}, options = {}) {
      super(message, code, metadata, options);
      this.name = name;
    }
  };
}

/**
 * Base error for the package.
 * Metadata is allowlisted so callers can diagnose by property identity without leaking values.
 */
export class SecureStorageError extends Error {
  code;
  metadata;

  constructor(message: string, code: string, metadata = {}, options = {}) {
    super(message, options);
    this.name = 'SecureStorageError';
    this.code = code;
    this.metadata = freezeSafeMetadata(metadata);
  }
}

export const SecureStorageAccessError = createErrorClass('SecureStorageAccessError', 'access_error');
export const SecureStorageCodecEncodeError = createErrorClass('SecureStorageCodecEncodeError', 'codec_encode_error');
export const SecureStorageCodecDecodeError = createErrorClass('SecureStorageCodecDecodeError', 'codec_decode_error');
export const SecureStorageMigrationError = createErrorClass('SecureStorageMigrationError', 'migration_error');
export const SecureStorageNativeStorageError = createErrorClass('SecureStorageNativeStorageError', 'native_storage_error');
export const SecureStorageLegacyFallbackError = createErrorClass('SecureStorageLegacyFallbackError', 'legacy_fallback_error');
export const SecureStorageLegacyCleanupError = createErrorClass('SecureStorageLegacyCleanupError', 'legacy_cleanup_error');
export const SecureStorageDefaultValueError = createErrorClass('SecureStorageDefaultValueError', 'default_value_error');
export const SecureStorageMetadataError = createErrorClass('SecureStorageMetadataError', 'metadata_error');

/**
 * Codec resolution stays tiny on purpose.
 * String refs are ergonomic for common cases; object refs keep extension easy later.
 * @param {{ builtInCodecs?: Record<string, SecureStorageCodec<unknown>> }} [options]
 */
export function createCodecRegistry(options = {}) {
  const builtInCodecs = options?.['builtInCodecs'] ?? {};

  return {
    builtInCodecs,
    resolve<TValue, TCodec extends SecureStorageCodecName | SecureStorageCodec<TValue>>(codecRef: TCodec): TCodec extends SecureStorageCodecName ? SecureStorageCodec<SecureStorageCodecValue<TCodec>> : TCodec {
      const codecs = builtInCodecs;
      if (typeof codecRef === 'string') {
        const codec = codecs[codecRef];
        if (!codec) {
          throw new TypeError(`Unknown codec: ${codecRef}.`);
        }
        return codec as any;
      }
      if (!codecRef || typeof codecRef.encode !== 'function' || typeof codecRef.decode !== 'function') {
        throw new TypeError('Codec reference must be a built-in codec name or a codec object.');
      }
      return codecRef as any;
    },
  };
}

/**
 * Optional registry for teams that want one central inventory of declared properties.
 * The core API does not require it, but it helps governance and diagnostics.
 */
export function createPropertyRegistry(): SecureStoragePropertyRegistry {
  const properties = new Map();

  function toKey(namespace: string, name: string) {
    return `${namespace}:${name}`;
  }

  function register<TProperty extends SecureStorageProperty<any, any, any, any>>(
    property: TProperty,
  ): TProperty {
    const key = toKey(property.namespace, property.name);
    if (properties.has(key)) {
      throw new Error(`Property ${key} is already registered.`);
    }
    properties.set(key, property);
    return property;
  }

  const defineProperty = ((input: SecureStoragePropertyInputBase<any, any>) => {
    return register(defineSecureStorageProperty(input));
  }) as SecureStoragePropertyRegistry['defineProperty'];

  return {
    register,
    defineProperty,
    get(namespace, name) {
      return properties.get(toKey(namespace, name)) ?? null;
    },
    list() {
      return [...properties.values()];
    },
  };
}

/**
 * Public property definition helper.
 * This is the semantic center for property defaults, so callers stay terse at use sites.
 */
export function defineSecureStorageProperty<
  TDefaultValue extends SecureStorageDefaultValueInput<string> | undefined = undefined,
  TLegacyFallback extends SecureStorageLegacyFallbackInput<string | null> | undefined = undefined,
>(
  input: SecureStoragePropertyInputBase<string, 'string', TDefaultValue, TLegacyFallback> & { codec?: undefined | 'string' },
): SecureStorageProperty<string, 'string', TDefaultValue, TLegacyFallback>;
export function defineSecureStorageProperty<
  TDefaultValue extends SecureStorageDefaultValueInput<number> | undefined = undefined,
  TLegacyFallback extends SecureStorageLegacyFallbackInput<number | null> | undefined = undefined,
>(
  input: SecureStoragePropertyInputBase<number, 'number', TDefaultValue, TLegacyFallback> & { codec: 'number' },
): SecureStorageProperty<number, 'number', TDefaultValue, TLegacyFallback>;
export function defineSecureStorageProperty<
  TDefaultValue extends SecureStorageDefaultValueInput<boolean> | undefined = undefined,
  TLegacyFallback extends SecureStorageLegacyFallbackInput<boolean | null> | undefined = undefined,
>(
  input: SecureStoragePropertyInputBase<boolean, 'boolean', TDefaultValue, TLegacyFallback> & { codec: 'boolean' },
): SecureStorageProperty<boolean, 'boolean', TDefaultValue, TLegacyFallback>;
export function defineSecureStorageProperty<
  TValue,
  TDefaultValue extends SecureStorageDefaultValueInput<TValue> | undefined = undefined,
  TLegacyFallback extends SecureStorageLegacyFallbackInput<TValue | null> | undefined = undefined,
>(
  input: SecureStoragePropertyInputBase<TValue, 'json', TDefaultValue, TLegacyFallback> & { codec: 'json' },
): SecureStorageProperty<TValue, 'json', TDefaultValue, TLegacyFallback>;
export function defineSecureStorageProperty<
  TValue,
  TCodec extends SecureStorageCodec<TValue>,
  TDefaultValue extends SecureStorageDefaultValueInput<TValue> | undefined = undefined,
  TLegacyFallback extends SecureStorageLegacyFallbackInput<TValue | null> | undefined = undefined,
>(
  input: SecureStoragePropertyInputBase<TValue, TCodec, TDefaultValue, TLegacyFallback> & { codec: TCodec },
): SecureStorageProperty<TValue, TCodec, TDefaultValue, TLegacyFallback>;
export function defineSecureStorageProperty(input: any): SecureStorageProperty<any, any, any, any> {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Property input must be an object.');
  }

  const property = {
    scope: 'user',
    access: 'default',
    version: 1,
    codec: 'string',
    ...input,
  };

  assertNonEmptyString(property.namespace, 'namespace');
  assertNonEmptyString(property.name, 'name');
  assertOneOf(property.scope, secureStorageScopes, 'scope');
  assertOneOf(property.access, secureStorageAccessModes, 'access');
  assertPositiveInteger(property.version, 'version');

  if (
    typeof property.codec !== 'string'
    && (!property.codec || typeof property.codec.encode !== 'function' || typeof property.codec.decode !== 'function')
  ) {
    throw new TypeError('codec must be a built-in codec name or a codec object.');
  }
  if (typeof property.codec === 'string') {
    assertOneOf(property.codec, secureStorageCodecNames, 'codec');
  }

  if (property.defaultValue !== undefined) {
    const type = typeof property.defaultValue;
    if (!(type === 'function' || type === 'string' || type === 'number' || type === 'boolean' || type === 'object')) {
      throw new TypeError('defaultValue must be a supported value or function.');
    }
  }
  if (property.legacyFallback !== undefined && typeof property.legacyFallback !== 'function') {
    throw new TypeError('legacyFallback must be a function when provided.');
  }
  if (property.legacyCleanup !== undefined && typeof property.legacyCleanup !== 'function') {
    throw new TypeError('legacyCleanup must be a function when provided.');
  }

  // NOTE precedence from the spec: fallback without explicit cleanup is not allowed.
  if (property.legacyFallback && !property.legacyCleanup) {
    throw new TypeError('legacyCleanup is required when legacyFallback is defined.');
  }
  return Object.freeze(property);
}
