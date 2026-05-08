# secure-storage-react-native-sensitive-info

A thin `react-native-sensitive-info` backend adapter for `secure-storage-api`.

## What it does

This package adapts `react-native-sensitive-info` to the `SecureStorageBackend` contract expected by `secure-storage-api`.

It supports:
- iOS
- Android

## Installation

```bash
npm install secure-storage-api secure-storage-react-native-sensitive-info react-native-sensitive-info react-native-nitro-modules
```

Follow the upstream installation steps for Nitro Modules, iOS Face ID usage descriptions, Android biometric permissions, and any Expo custom-dev-client requirements.

## Usage

```ts
import { createSecureStorage } from 'secure-storage-api';
import { createReactNativeSensitiveInfoBackend } from 'secure-storage-react-native-sensitive-info';

const storage = await createSecureStorage({
  backend: createReactNativeSensitiveInfoBackend(),
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

This adapter uses the provider's native item listing support.
It maps each storage key directly to a provider key inside one logical service namespace.

Because the provider already exposes `getAllItems()` and `clearService()`, this adapter does not need a synthetic index.

## Options

```ts
createReactNativeSensitiveInfoBackend({
  service: 'com.example.secure-storage',
  baseOptions: {
    accessControl: 'none',
  },
  userPresenceOptions: {
    accessControl: 'biometryAny',
    authenticationPrompt: {
      title: 'Authenticate to access secure values',
    },
  },
})
```

## Platform notes

- upstream docs describe the default access policy as strong security by default; this adapter explicitly uses `accessControl: 'none'` for normal reads and writes unless `requiresUserPresence` is requested
- when `requiresUserPresence` is requested, the adapter switches to a stricter access-control policy
- this package targets React Native environments that satisfy the provider's platform/runtime requirements

## Testing

This package uses provider injection and mocks in tests, so the test suite does not require a native React Native runtime.
