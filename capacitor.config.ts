import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for YOUSIVAR–Ω.
 *
 * The Android shell loads the deployed frontend and talks to the independent API
 * over HTTPS. Nothing is bundled against Base44.
 *
 *   npm run build && npx cap add android && npx cap sync android
 *   CAPACITOR_SERVER_URL=https://staging.example npm run build && npx cap sync
 *
 * `server.url` is only set when CAPACITOR_SERVER_URL is provided, which is how a
 * device build points at a staging deployment instead of bundled assets.
 */
const liveUrl = process.env.CAPACITOR_SERVER_URL || '';

const config: CapacitorConfig = {
  appId: 'com.yousivar.omega',
  appName: 'YOUSIVAR–Ω',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
    ...(liveUrl ? { url: liveUrl, cleartext: false } : {}),
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      backgroundColor: '#121212',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
};

export default config;