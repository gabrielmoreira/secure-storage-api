const path = require('node:path');

const sensitiveInfoPackageJson = require.resolve('react-native-sensitive-info/package.json');
const sensitiveInfoPlugin = path.join(path.dirname(sensitiveInfoPackageJson), 'app.plugin.js');

module.exports = {
  expo: {
    name: 'secure-storage-example',
    slug: 'secure-storage-example',
    scheme: 'secure-storage-example',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    newArchEnabled: true,
    plugins: [
      [
        'expo-secure-store',
        {
          configureAndroidBackup: true,
          faceIDPermission: 'Allow Secure Storage Example to access biometric data for secure storage demonstrations.',
        },
      ],
      sensitiveInfoPlugin,
    ],
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.gabrielmoreira.securestorageexample',
      infoPlist: {
        NSFaceIDUsageDescription: 'Allow Secure Storage Example to access biometric data for secure storage demonstrations.',
      },
    },
    android: {
      package: 'com.gabrielmoreira.securestorageexample',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      permissions: [
        'android.permission.USE_BIOMETRIC',
        'android.permission.USE_FINGERPRINT',
      ],
    },
    web: {
      favicon: './assets/favicon.png',
    },
  },
};