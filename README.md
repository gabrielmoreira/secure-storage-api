# secure-storage-api

A lean, backend-agnostic secure storage core for property-based storage APIs.

This repository is a pure Node-only TypeScript prototype of the secure storage specification. It is designed to stay small by default and extensible when needed.

## Principles

- one storage API for all modules
- property-based usage
- backend agnostic core
- safe metadata and typed errors
- explicit migration through codecs
- explicit legacy migration and cleanup
- progressive complexity instead of a large day-one API

## Status

Current implementation covers the phase-0 Node prototype and a first extension layer:

- property definitions with safe defaults
- built-in codecs: `string`, `number`, `boolean`, `json`
- custom codecs
- migrating JSON codec helper
- in-memory backend
- access modes: `default`, `activeSession`, `userPresence`
- scopes: `user`, `app`
- metadata envelope with timestamps and cleanup state
- default values
- legacy fallback migration
- explicit cleanup execution with at-most-once behavior
- optional property registry
- safe diagnostics helper
- optional Zod-style JSON codec helper via `parse()` contract

## Non-goals of this prototype

- no real secure native storage yet
- no React Native dependency
- no login ownership
- no platform-specific prompts or biometrics integration yet

The shape of the code is intentionally kept ready for future pluggable authentication, prompts, or native backends, without hard-coding those concerns into the day-one core.

## Installation

This project uses [mise](https://mise.jdx.dev/) to define the local Node version.

```bash
mise install
npm test
```

## Runtime model

- `mise.toml` pins Node 25
- source files are `.ts`
- tests run directly with `node --test`
- no TypeScript compilation step is required for local development in the prototype

## Quick example

```ts
import {
  createMemorySecureStorageBackend,
  createSecureStorage,
  defineSecureStorageProperty,
} from './src/index.ts';

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

## Property-based API

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

## Built-in codecs

```ts
codec: 'string'
codec: 'number'
codec: 'boolean'
codec: 'json'
```

Custom codecs are supported as long as they expose `encode()` and `decode()`.

## Migration through codecs

Version migration belongs to codecs.

```ts
import {
  createMigratingJsonCodec,
  defineSecureStorageProperty,
} from './src/index.ts';

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

```ts
import { createPropertyRegistry } from './src/index.ts';

const registry = createPropertyRegistry();
registry.register(refreshToken);
```

### Safe diagnostics

```ts
import { createSecureDiagnostics } from './src/index.ts';

const diagnostics = createSecureDiagnostics({ storage });
const report = await diagnostics.inspectProperties([refreshToken]);
```

The diagnostics helper reports only safe metadata. It never exposes stored values.

### Zod-style helper

```ts
import { createZodJsonCodec } from './src/index.ts';

const codec = createZodJsonCodec({
  parse(value) {
    return schema.parse(value);
  },
});
```

The helper accepts a `parse()` contract so it can work with Zod-like schemas while keeping the core free of a required dependency.

## Testing

```bash
npm test
npm run check
```

GitHub pull requests run the same test flow through a workflow that installs tools with `jdx/mise-action`.

## Current repository layout

```txt
src/index.ts
 test/bootstrap.test.ts
 test/core.test.ts
 test/storage-engine.test.ts
 test/migration-cleanup.test.ts
 test/extensions.test.ts
 .github/workflows/pr.yml
 mise.toml
```

## Notes on future extension points

This prototype intentionally keeps several things out of the core implementation while leaving room for them later:

- secure native backends
- React Native integration layers
- user presence prompts
- pluggable authentication/session adapters
- stricter cleanup policies
- richer diagnostics or governance workflows

The goal is to keep the default path small and predictable, while making later extension possible without rewriting the basic API shape.

## License

MIT
