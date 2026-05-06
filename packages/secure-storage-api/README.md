# secure-storage-api package notes

This README is the package-oriented technical companion to the repository root README.

If you want the main usage documentation, examples, and API positioning, start at the repository root `README.md`.

## Current package intent

This package is currently **API-first / API-only**.

That means:
- it defines the secure storage API contract
- it defines codecs, metadata behavior, migration behavior, and extension points
- it does not yet ship a real secure storage backend adapter
- the in-memory backend is only for prototype validation, tests, and executable examples

## Technical design goals

- keep the public API property-based
- keep backend choice outside the public API surface
- keep migration logic close to codecs
- keep secure-storage-specific policies in the storage engine
- keep backend transport details behind an adapter boundary
- keep errors and diagnostics safe by default

## Workspace commands

From the repository root:

```bash
mise install
npm test
npm run check
npm run typecheck
```

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
- `src/support.ts` — shared internal helpers
- `src/index.ts` — public package exports
- `test/samples.test.ts` — executable sample scenarios used as a living reference base

## Current boundaries

### Public API boundary

The public surface is intentionally exposed through `src/index.ts`.
Consumers should treat that barrel as the stable entrypoint.

### Backend boundary

`src/secure-storage-backend-adapter.ts` isolates backend-specific calls and stored-envelope parsing.
This keeps the storage engine focused on policy rather than transport concerns.

### Engine boundary

`src/secure-storage.ts` is the composition root for the package runtime.
It assembles auth checks, codec behavior, cleanup behavior, and backend access into one coherent storage API.

## Contributing expectations

When changing the package:
- prefer function-first composition over class-heavy design
- preserve property-based usage
- keep backend details out of the public API surface
- keep comments focused on why and usage, not syntax narration
- keep tests readable and BDD-oriented with `// Given // When // Then`
- add or update sample scenarios when usage guidance changes

## Future direction

The next major evolution should be adding real backend adapters behind this API contract, not rewriting the public API itself.

Examples:
- secure native mobile adapters
- web-focused adapters
- deterministic test adapters
- migration shims around legacy storage systems

## License

MIT
