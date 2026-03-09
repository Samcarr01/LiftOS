import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * app.config.ts — dynamic Expo config.
 *
 * Reads env vars so secrets never get hardcoded.
 * Ref: https://docs.expo.dev/workflow/configuration/
 *
 * To add a new env var:
 *  1. Prefix with EXPO_PUBLIC_ if it should be bundled into the client app.
 *  2. Add to `extra` below and to .env / .env.example.
 *  3. Access in code via process.env.EXPO_PUBLIC_* or Constants.expoConfig.extra.*
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,

  // ── Identity ───────────────────────────────────────────────────────────────
  name:        'LiftOS',
  slug:        'liftos',
  scheme:      'liftos',
  version:     '1.0.0',
  orientation: 'portrait',

  // ── Assets ────────────────────────────────────────────────────────────────
  icon:               './assets/images/icon.png',
  userInterfaceStyle: 'dark',

  // ── New Architecture ──────────────────────────────────────────────────────
  newArchEnabled: true,

  // ── Platform config ───────────────────────────────────────────────────────
  ios: {
    supportsTablet:   false,
    bundleIdentifier: 'com.liftos.app',
    usesAppleSignIn:  true,
    infoPlist: {
      NSPhotoLibraryUsageDescription:
        'LiftOS uses your photo library to set a profile photo.',
      NSCameraUsageDescription:
        'LiftOS uses your camera to capture progress photos.',
    },
  },

  android: {
    adaptiveIcon: {
      foregroundImage:  './assets/images/adaptive-icon.png',
      backgroundColor:  '#09090b',
    },
    package:           'com.liftos.app',
    versionCode:       1,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },

  web: {
    bundler: 'metro',
    output:  'static',
    favicon: './assets/images/favicon.png',
  },

  // ── Plugins ───────────────────────────────────────────────────────────────
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-splash-screen',
      {
        backgroundColor:    '#09090b',
        // image:           './assets/images/splash-icon.png',
        // imageWidth:      200,
        // resizeMode:      'contain',
      },
    ],
    'expo-sqlite',
    // Uncomment after installing @sentry/react-native:
    // [
    //   '@sentry/react-native/expo',
    //   {
    //     url:   'https://sentry.io/',
    //     organization: 'your-org',
    //     project:      'liftos',
    //   },
    // ],
  ],

  // ── Experiments ───────────────────────────────────────────────────────────
  experiments: {
    typedRoutes: true,
  },

  // ── EAS ───────────────────────────────────────────────────────────────────
  // projectId is set by `eas init` — fill in after running it
  extra: {
    eas: {
      projectId: '69da7227-57fa-43b3-a20f-552e5e24ae15',
    },

    // Supabase (EXPO_PUBLIC_ prefix makes these available in the client bundle)
    supabaseUrl:     process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,

    // Analytics
    posthogKey:  process.env.EXPO_PUBLIC_POSTHOG_KEY,
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,

    // Sentry
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  },

  // ── Updates (EAS Update) ──────────────────────────────────────────────────
  updates: {
    url: 'https://u.expo.dev/69da7227-57fa-43b3-a20f-552e5e24ae15',
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
});
