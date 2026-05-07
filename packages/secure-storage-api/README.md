# secure-storage-api

An API-first, backend-agnostic secure storage package.

This package focuses on defining a clear secure storage API before shipping real secure backend adapters.

## What this package is

This package currently provides:
- the secure storage API shape
- property definition helpers
- codecs and migration helpers
- metadata rules
- typed safe errors
- optional registry and diagnostics helpers
- a composable storage core

## What this package is not

This package does **not** currently ship a real secure storage backend adapter.

Important:
- the in-memory backend exists for prototype validation, tests, and executable samples
- it is **not** a real secure storage implementation
- it is **not** the intended production backend

The direction is to evolve this package by adding adapters for different secure storage providers while keeping the API contract stable.

## Principles

- one storage API for all modules
- property-based usage
- backend agnostic core
- safe metadata and typed errors
- explicit migration through codecs
- explicit legacy migration and cleanup
- progressive complexity instead of a large day-one API

## Installation

This repository uses a workspace layout. From the repository root:

```bash
mise install
npm test
npm run check
npm run typecheck
```

## Quick example

```ts
import {
  createMemorySecureStorageBackend,
  createSecureStorage,
  defineSecureStorageProperty,
} from 'secure-storage-api';

const refreshToken = defineSecureStorageProperty({
  namespace: 'auth',
  name: 'refreshToken',
});

const secureStorage = await createSecureStorage({
  backend: createMemorySecureStorageBackend(),
  authStateProvider: {
    async getAuthState() {
      return {
        hasBoundUser: true,
        hasActiveSession: true,
      };
    },
  },
});

await secureStorage.set(refreshToken, 'token-123');
const token = await secureStorage.get(refreshToken);
await secureStorage.remove(refreshToken);
```

That example uses the in-memory backend because this package is currently API-first. The value of the package today is the contract and orchestration layer, not a real secure backend adapter yet.

## Built-in codecs

The package ships four built-in codec names:

```ts
codec: 'string'
codec: 'number'
codec: 'boolean'
codec: 'json'
```

Typical examples:

```ts
const refreshToken = defineSecureStorageProperty({
  namespace: 'auth',
  name: 'refreshToken',
  codec: 'string',
});

const retryCount = defineSecureStorageProperty({
  namespace: 'sync',
  name: 'retryCount',
  codec: 'number',
});

const hasAcceptedTerms = defineSecureStorageProperty({
  namespace: 'onboarding',
  name: 'hasAcceptedTerms',
  codec: 'boolean',
});

const preferences = defineSecureStorageProperty({
  namespace: 'profile',
  name: 'preferences',
  codec: 'json',
});
```

Custom codecs are supported as long as they expose `encode()` and `decode()`.

## Typed property values

The package is designed so the property carries the value type implied by its codec.

In practice:
- `secureStorage.set(property, value)` expects the codec value type
- `secureStorage.get(property)` returns either `T | null` or `T`, depending on whether the resolution chain can still end without a value

That means:
- no `legacyFallback` or `defaultValue` guarantee -> `get()` returns `T | null`
- non-null `legacyFallback` -> `get()` returns `T`
- non-null `defaultValue` -> `get()` returns `T`
- nullable `legacyFallback` plus non-null `defaultValue` -> `get()` still returns `T`

Example:

```ts
const retryCount = defineSecureStorageProperty({
  namespace: 'sync',
  name: 'retryCount',
  codec: 'number',
});

const maybeRetryCount = await secureStorage.get(retryCount);
// maybeRetryCount: number | null

const defaultedRetryCount = defineSecureStorageProperty({
  namespace: 'sync',
  name: 'defaultedRetryCount',
  codec: 'number',
  defaultValue: 0,
});

const retryCountValue = await secureStorage.get(defaultedRetryCount);
// retryCountValue: number
```

This also works for custom codecs such as `createZodJsonCodec(...)`.

## Migration through codecs

Version migration belongs to codecs.

```ts
import {
  createMigratingJsonCodec,
  defineSecureStorageProperty,
} from 'secure-storage-api';

const profileCodec = createMigratingJsonCodec({
  migrate({ value, fromVersion, toVersion }) {
    if (toVersion !== 3) {
      throw new Error('Unsupported target version');
    }

    // The codec should know how to reach the final shape from every supported older version.
    if (fromVersion === 1) {
      return {
        customerId: value.customerId,
        selectedAccountId: value.accountId,
        preferredAccountType: 'current',
      };
    }

    if (fromVersion === 2) {
      return {
        customerId: value.customerId,
        selectedAccountId: value.selectedAccountId,
        preferredAccountType: value.preferredAccountType ?? 'current',
      };
    }

    if (fromVersion === 3) {
      return value;
    }

    throw new Error(`Unsupported version ${fromVersion}`);
  },
});

const secureUserProfile = defineSecureStorageProperty({
  namespace: 'profile',
  name: 'secureUserProfile',
  version: 3,
  codec: profileCodec,
});
```

In practice, the property version expresses the final target shape. The codec is responsible for upgrading any supported older stored version to that final typed shape.

## Legacy fallback and cleanup

Legacy reads stay explicit on the property.

```ts
const refreshToken = defineSecureStorageProperty({
  namespace: 'auth',
  name: 'refreshToken',
  legacyFallback: async () => legacyStore.get('refreshToken'),
  legacyCleanup: async () => legacyStore.remove('refreshToken'),
});
```

Behavior:
1. read new storage first
2. if missing, try legacy fallback
3. if found, write into the new storage
4. mark cleanup as pending
5. optionally run cleanup later, once

## Optional extensions

### Property registry

The registry is optional. The base API does not require it.

Use it when you want one central inventory of secure properties and stricter runtime guarantees.

```ts
import {
  createPropertyRegistry,
  createSecureStorage,
} from 'secure-storage-api';

const registry = createPropertyRegistry();

const refreshToken = registry.defineProperty({
  namespace: 'auth',
  name: 'refreshToken',
});

const secureStorage = await createSecureStorage({
  backend,
  authStateProvider,
  registry,
});
```

You can still use `registry.register(defineSecureStorageProperty(...))` when the property is created elsewhere.

What the registry gives you:
- rejects duplicate `namespace + name` registrations
- gives you one central place to discover declared secure properties
- when passed to `createSecureStorage({ registry })`, the storage instance rejects unregistered properties at runtime

That makes usage more robust in larger codebases because typos, shadow properties, or ad-hoc property definitions fail early instead of silently creating new storage entries.

### Safe diagnostics

```ts
import { createSecureDiagnostics } from 'secure-storage-api';

const diagnostics = createSecureDiagnostics({ storage });
const report = await diagnostics.inspectProperties([refreshToken]);
```

Example response shape:

```ts
[
  {
    namespace: 'auth',
    name: 'refreshToken',
    scope: 'user',
    access: 'default',
    version: 1,
    exists: true,
    legacyCleanupStatus: 'notNeeded',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:05:00.000Z',
  },
]
```

The diagnostics helper reports only safe metadata. It never exposes stored values.

### Zod-style helper

```ts
import { createZodJsonCodec } from 'secure-storage-api';

const codec = createZodJsonCodec({
  parse(value) {
    return schema.parse(value);
  },
});
```

The helper accepts a `parse()` contract so it can work with Zod-like schemas while keeping the core free of a required dependency.

## Samples and tests

This package includes `test/samples.test.ts`, a sample-driven suite with end-to-end usage scenarios that can be used as executable reference examples.

## Package layout

```txt
src/api.ts
src/codecs.ts
src/memory-backend.ts
src/secure-storage-backend-adapter.ts
src/secure-storage.ts
src/support.ts
src/index.ts
test/samples.test.ts
```

What each main code file is responsible for:

- `src/api.ts` — public API contracts, property definition, errors, registries
- `src/codecs.ts` — built-in codecs and codec helpers
- `src/memory-backend.ts` — in-memory backend for prototype/tests only
- `src/secure-storage-backend-adapter.ts` — backend-facing adapter and envelope parsing boundary
- `src/secure-storage.ts` — storage orchestration and policy rules
- `src/support.ts` — small shared internal helpers
- `src/index.ts` — public package exports
- `test/samples.test.ts` — executable sample scenarios that double as usage reference

## Future direction

The intended next step is not to grow the core sideways with platform details.
The intended next step is to add backend adapters for secure storage providers behind the existing API contract.

Examples of future adapters:
- secure native mobile storage
- web secure storage wrappers
- test/deterministic adapters
- migration shims around legacy storage providers

## License

MIT
