# secure-storage-api

A dependency-free, API-first secure storage contract for applications that want one property-based storage model before committing to any specific secure storage backend.

## Current status

This repository currently focuses on **defining the API clearly first**.

Today it gives you:
- a property-based secure storage API
- codec-aware typed properties
- migration helpers
- metadata and cleanup rules
- registry and diagnostics helpers
- executable samples and tests

Today it does **not** give you:
- a real secure storage backend adapter
- native secure storage integration
- platform-specific auth prompts or biometrics integration

The in-memory backend exists only for prototype validation, tests, and executable examples.
It is **not** intended as a real secure storage backend.

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

The main usage documentation lives here in the repository root for now.
The package-specific technical notes live in `packages/secure-storage-api/README.md`.

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

### Typed property values

The property carries the value type implied by its codec.
That means `set(property, value)` expects the codec value type, and `get(property)` returns that same type (or `null` when missing).

```ts
const retryCount = defineSecureStorageProperty({
  namespace: 'sync',
  name: 'retryCount',
  codec: 'number',
});

await secureStorage.set(retryCount, 3);
const value = await secureStorage.get(retryCount);
//    ^? number | null

const hasAcceptedTerms = defineSecureStorageProperty({
  namespace: 'onboarding',
  name: 'hasAcceptedTerms',
  codec: 'boolean',
});

await secureStorage.set(hasAcceptedTerms, true);
const accepted = await secureStorage.get(hasAcceptedTerms);
//    ^? boolean | null
```

The same applies to custom codecs. Once a property is defined with a typed codec, `get()` and `set()` follow that type.

### Built-in codecs

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

const preferences = defineSecureStorageProperty<{ selectedAccountId: string | null }>({
  namespace: 'profile',
  name: 'preferences',
  codec: 'json',
});
```

### Migration through codecs

Version migration belongs to codecs.
The property version expresses the final target shape. The codec is responsible for upgrading any supported older stored version to that final typed shape.

```ts
import {
  createMigratingJsonCodec,
  defineSecureStorageProperty,
} from 'secure-storage-api';

const profileCodec = createMigratingJsonCodec<{
  customerId: string;
  selectedAccountId: string;
  preferredAccountType: string;
}>({
  migrate({ value, fromVersion, toVersion }) {
    const source = value as any;

    if (toVersion !== 3) {
      throw new Error('Unsupported target version');
    }

    if (fromVersion === 1) {
      return {
        customerId: source.customerId,
        selectedAccountId: source.accountId,
        preferredAccountType: 'current',
      };
    }

    if (fromVersion === 2) {
      return {
        customerId: source.customerId,
        selectedAccountId: source.selectedAccountId,
        preferredAccountType: source.preferredAccountType ?? 'current',
      };
    }

    if (fromVersion === 3) {
      return source;
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

What the registry gives you:
- rejects duplicate `namespace + name` registrations
- gives you one central place to discover declared secure properties
- rejects unregistered properties at runtime when the storage instance is created with `registry`

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

### Samples

The package includes `packages/secure-storage-api/test/samples.test.ts`, a sample-driven suite with end-to-end usage scenarios that can be used as executable reference examples.

### Technical package notes

For the package-internal, contribution-oriented technical view, see:
- `packages/secure-storage-api/README.md`

## License

MIT
