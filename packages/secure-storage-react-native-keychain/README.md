# secure-storage-react-native-keychain

A thin `react-native-keychain` backend adapter for `secure-storage-api`.

## What it does

This package adapts `react-native-keychain` to the `SecureStorageBackend` contract expected by `secure-storage-api`.

It supports:
- iOS
- Android

## Installation

```bash
npm install secure-storage-api secure-storage-react-native-keychain react-native-keychain
```

Follow the native installation and Face ID configuration steps from the `react-native-keychain` documentation.

## Usage

```ts
import { createSecureStorage } from 'secure-storage-api';
import { createReactNativeKeychainBackend } from 'secure-storage-react-native-keychain';

const storage = await createSecureStorage({
  backend: createReactNativeKeychainBackend(),
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

## Design notes

This adapter uses one `react-native-keychain` generic-password service per storage key inside an adapter-owned service prefix.
That lets `getAllKeys()` rely on the provider's native `getAllGenericPasswordServices()` support without needing a synthetic index, while still filtering out unrelated generic-password entries.

The adapter stores the secure payload in the credential password field and uses a constant placeholder username.

## Options

```ts
createReactNativeKeychainBackend({
  baseOptions: {
    accessible: 'WHEN_UNLOCKED',
  },
  userPresenceOptions: {
    accessControl: 'BIOMETRY_ANY_OR_DEVICE_PASSCODE',
    authenticationPrompt: {
      title: 'Authenticate to access secure values',
    },
  },
})
```

## Platform notes

- user-presence behavior depends on native capabilities and chosen `accessControl`
- `react-native-keychain` exposes stronger native listing support than Expo Secure Store, so no synthetic index is required here
- review the upstream library docs for recommended iOS and Android security settings

## Testing

This package uses provider injection and mocks in tests, so the test suite does not require a native React Native runtime.
