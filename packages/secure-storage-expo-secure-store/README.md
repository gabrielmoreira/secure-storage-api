# secure-storage-expo-secure-store

A thin `expo-secure-store` backend adapter for `secure-storage-api`.

## What it does

This package adapts Expo Secure Store to the `SecureStorageBackend` contract expected by `secure-storage-api`.

It supports:
- iOS
- Android
- Expo projects using `expo-secure-store`

## Installation

Install the API package and the Expo provider in your app:

```bash
npm install secure-storage-api secure-storage-expo-secure-store expo-secure-store
```

If you are using Expo Secure Store in a bare React Native app, follow Expo's module installation steps as well.

## Usage

```ts
import { createSecureStorage } from 'secure-storage-api';
import { createExpoSecureStoreBackend } from 'secure-storage-expo-secure-store';

const storage = await createSecureStorage({
  backend: createExpoSecureStoreBackend(),
  authStateProvider: {
    async getAuthState() {
      return {
        hasBoundUser: true,
        hasActiveSession: true,
      };
    },
  },
});
```

## Options

```ts
createExpoSecureStoreBackend({
  baseOptions: {
    keychainService: 'com.example.secure-storage',
  },
  userPresenceOptions: {
    requireAuthentication: true,
    authenticationPrompt: 'Authenticate to access secure values',
  },
})
```

### `getAllKeys()` support

Expo Secure Store does not expose a native key-listing API.
To satisfy the `secure-storage-api` backend contract, this adapter maintains a reserved serialized index key.

Important details:
- mutations are serialized per backend instance to avoid in-process index overwrite races
- the reserved index key is never returned by `getAllKeys()`
- the index is updated and rolled back carefully on failed writes/removals when possible
- this makes same-process behavior much safer, but it cannot fully solve cross-process or external mutation drift

If you need stronger native key listing semantics, prefer adapters backed by providers that expose listing directly.

## Platform notes

- `requireAuthentication` behavior depends on the underlying Expo Secure Store provider and platform support
- Expo Secure Store has payload size caveats on some iOS versions
- read the provider docs for native configuration requirements such as Face ID usage descriptions and Android backup configuration

## Testing

This package uses provider injection in tests, so the test suite does not require a native Expo runtime.
