# Repository notes for agents

## `.local/` usage

- `.local/` is intentionally gitignored and must stay uncommitted.
- Use `.local/` for local-only artifacts such as:
  - debug logs
  - generated evidence
  - ad hoc Maestro flows
  - one-off inspection outputs
  - implementation notes that should not ship
- Use `.local/tmp/` specifically for disposable scratch artifacts created while experimenting, debugging, or emitting temporary files.
- If you need a temporary file and it does not belong in the product or tests, default to `.local/tmp/`.
- Clean up temporary artifacts when they are no longer needed.

## Practical guidance

- Prefer committed tests and fixtures for durable verification.
- Prefer `.local/tmp/` for short-lived debug files created during investigation.
- Never reference `.local/` contents from shipped source code, package exports, or documentation intended for end users.
- Do not commit `.local/` contents.
