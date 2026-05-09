# secure-storage-example

An Expo prebuild example app for the `secure-storage-api` monorepo.

## Goal

This app demonstrates the generic `secure-storage-api` surface on top of three different mobile backend adapters:
- Expo Secure Store
- react-native-keychain
- react-native-sensitive-info

## Why prebuild/native app

This app is **not** meant for Expo Go.
It uses native modules that require Expo prebuild / native builds, especially for:
- `react-native-keychain`
- `react-native-sensitive-info`

## What the app shows

- backend selection on the first screen
- one shared lab screen that explains what each property scenario is testing
- toggles for bound-user and active-session auth state
- copyable property metadata, property adapter options, latest result text, and debug evidence
- operations for set/get/remove/has/clear user storage
- a user-presence probe that performs a protected write and protected read so backend prompt behavior can be compared
- a configured property scenario that demonstrates composed `property.options` without forcing the test to depend on biometric prompt UI
- a debug JSON dump with:
  - backend identity
  - current auth state
  - selected property metadata
  - selected property adapter options
  - diagnostics output
  - decoded property values
  - raw backend entries read directly from the backend

## UI notes

The current screen is intentionally both technical and friendlier to use during manual debugging:

- editable inputs remain copyable
- read-only result fields are rendered as selectable text blocks so values and evidence can be copied easily
- the screen explains what the selected property is meant to prove before you run operations
- the information order now goes from context -> selected property -> input -> actions -> results -> technical evidence
## Local development

From the repository root:

```bash
mise install
npm install
mise run example:prebuild
```

### Full Android E2E flow

Use the one-shot task when you want the script to manage Metro, install the debug app, run Maestro, and clean up afterward.

```bash
mise run example:android:e2e
```

### Composable Android tasks

The Android example now exposes smaller tasks for faster local iteration:

```bash
mise run example:metro
mise run example:android:build
mise run example:android:install
mise run example:android:maestro
```

- `example:metro` starts the Expo dev-client Metro server on port `8081`. If Metro is already running on that port, the task exits successfully and reuses it.
- `example:android:build` builds the debug Android app.
- `example:android:install` installs the debug Android app without starting Metro.
- `example:android:maestro` runs only the Maestro flows and assumes Metro is already running and the app is already installed.
- `example:android:e2e` remains the full workflow and is the task used by CI.

### Suggested local usage

- JS-only changes: keep Metro running with `mise run example:metro`, then rerun `mise run example:android:maestro`.
- Native changes: rerun `mise run example:android:install` before `mise run example:android:maestro`.
- Clean end-to-end verification: use `mise run example:android:e2e`.


## User presence probe behavior

The app includes a **Probe user presence** action for comparing native backend behavior.

That probe currently does two protected backend calls in sequence:
- `setItem(..., { requiresUserPresence: true })`
- `getItem(..., { requiresUserPresence: true })`

That matters because the app is not asking only “did a protected read require auth?”
It is asking whether a protected write plus a protected read succeeds for the current provider and device state.

Because of that, biometric or fingerprint UI can differ across providers:
- `expo-secure-store` may show authentication twice because both the protected write and protected read can trigger auth.
- `react-native-keychain` may show authentication once because some OS versions or device configurations coalesce rapid sequential prompts, but that is not guaranteed.
- `react-native-sensitive-info` may still complete successfully without showing a clearly visible prompt in the same way on every device or emulator.

So the probe result should be interpreted as **backend-specific protected-operation behavior**, not as a guarantee that every provider will show the same visible biometric prompt sequence.

If you want to reason about prompt visibility, treat the result as provider-dependent and verify on the target device class instead of assuming the three adapters will behave identically.
## Maestro

The Android Maestro flows live in `.maestro/`.
They are meant to run against a built Android app in an emulator or device.