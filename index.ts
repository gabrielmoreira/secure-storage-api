/**
 * Expo's Android export:embed path resolves from the workspace root in this monorepo.
 * Keep one explicit root entry that forwards to the example app entrypoint so local and CI
 * Android builds bundle the same app code.
 */
import './apps/secure-storage-example/index.ts';
