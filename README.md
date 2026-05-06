# secure-storage-api

A dependency-free, API-first secure storage contract for applications that want one property-based storage model before committing to any specific secure storage backend.

## What this repository is

This repository currently focuses on **defining the API clearly first**.

Today it gives you:
- a property-based secure storage API
- codecs and migration helpers
- metadata and cleanup rules
- registry and diagnostics helpers
- executable samples and tests

Today it does **not** give you:
- a real secure storage backend adapter
- native secure storage integration
- platform-specific auth prompts or biometrics integration

The in-memory backend in the package exists only for prototype validation, tests, and executable examples.
It is **not** intended as a real secure storage backend.

The long-term direction is to keep the API stable and add adapters for different secure storage providers behind that contract.

## Dependency model

The package currently has **no runtime dependencies**.

That matters because the current goal is to make the API and orchestration layer easy to adopt before choosing backend integrations.

## Repository layout

This repository is a small monorepo.

### Packages

- `packages/secure-storage-api` — the secure storage API package

## Install and run

From the repository root:

```bash
mise install
npm test
npm run check
npm run typecheck
```

## Usage

The main package documentation currently lives here in the repository root because the main goal right now is to explain how to use the API.

### Quick example

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

That example uses the in-memory backend because the package is currently API-only. The value today is the contract and orchestration layer, not a real secure backend adapter yet.

### Property-based API

```ts
const refreshToken = defineSecureStorageProperty({
  namespace: 'auth',
  name: 'refreshToken',
});

await secureStorage.set(refreshToken, token);
await secureStorage.get(refreshToken);
await secureStorage.remove(refreshToken);
await secureStorage.has(refreshToken);
```

### Built-in codecs

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

### Migration through codecs

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

The property version expresses the final target shape. The codec is responsible for upgrading any supported older stored version to that final typed shape.

### Legacy fallback and cleanup

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

## Samples

The package includes `packages/secure-storage-api/test/samples.test.ts`, a sample-driven suite with end-to-end usage scenarios that can be used as executable reference examples.

## Technical package docs

For the more package-internal, contribution-oriented technical view, see:

- `packages/secure-storage-api/README.md`

## License

MIT
