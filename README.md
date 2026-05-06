# secure-storage-api workspace

This repository is organized as a small monorepo.

## Packages

- `packages/secure-storage-api` — API-first secure storage package

## Current focus

The current package is intentionally **API only**.

That means:
- it defines the secure storage API shape
- it defines codecs, metadata behavior, migration behavior, and extension points
- it does **not** ship a real secure platform backend implementation
- the in-memory backend exists only for prototype validation, tests, and executable samples

The long-term direction is to keep the API contract stable and evolve adapters for different secure storage providers behind it.

## Workspace commands

From the repository root:

```bash
mise install
npm test
npm run check
npm run typecheck
```

## Package docs

See:

- `packages/secure-storage-api/README.md`
