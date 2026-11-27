/// <reference types="node" />
// Runs in Node on the computer (Expo CLI / EAS), not on the phone.
import { networkInterfaces } from 'node:os';

import type { ConfigContext, ExpoConfig } from 'expo/config';

// Environments and their Supabase projects. JSON because this file can't import TypeScript;
// the app reads the same file through src/config/environments.ts.
import environments from './src/config/environments.json';

type AppEnv = 'local' | 'dev' | 'prod';

/** Same rule as parseAppEnv in src/config/environments.ts: unset means dev. */
function parseAppEnv(value: string | undefined): AppEnv {
  const v = value || 'dev';
  if (v === 'local' || v === 'dev' || v === 'prod') return v;
  throw new Error(`EXPO_PUBLIC_APP_ENV must be "local", "dev" or "prod" (got "${v}").`);
}

/** Android package / iOS bundle id of the real app. */
const BASE_APP_ID = 'com.kresala.bote';

/**
 * This computer's address on the Wi-Fi, so a phone on the same network can reach local Supabase.
 * Prefers Wi-Fi adapters and skips usual virtual ones (VirtualBox 192.168.56.x, Docker/WSL/Hyper-V),
 * which a phone can't reach. Override with LOCAL_SUPABASE_URL if it still picks the wrong one.
 */
function lanAddress(): string {
  const candidates = Object.entries(networkInterfaces()).flatMap(([name, addresses]) =>
    (addresses ?? [])
      .filter((a) => a.family === 'IPv4' && !a.internal)
      .map((a) => ({ name, address: a.address })),
  );
  const isVirtual = (c: { name: string; address: string }) =>
    /virtualbox|vmware|vethernet|docker|wsl|hyper-v/i.test(c.name) || c.address.startsWith('192.168.56.');
  const isWifi = (c: { name: string }) => /wi-?fi|wlan|wireless/i.test(c.name);
  const best =
    candidates.find((c) => isWifi(c) && !isVirtual(c)) ?? candidates.find((c) => !isVirtual(c)) ?? candidates[0];
  return best?.address ?? '127.0.0.1';
}

export default ({ config }: ConfigContext): ExpoConfig => {
  // APP_ENV is still accepted for older commands.
  const env = parseAppEnv(process.env.EXPO_PUBLIC_APP_ENV ?? process.env.APP_ENV);
  const supabase =
    env === 'local'
      ? {
          url: process.env.LOCAL_SUPABASE_URL ?? `http://${lanAddress()}:54321`,
          key: process.env.LOCAL_SUPABASE_KEY ?? environments.localDefaultKey,
        }
      : environments.cloud[env];

  // Prod is com.kresala.bote; others get a suffix so they can be installed next to it.
  // The prod id can never change once the app is installed or published.
  const appId = env === 'prod' ? BASE_APP_ID : `${BASE_APP_ID}.${env}`;

  return {
    ...config,
    // Different names so dev/local builds are never mistaken for the real app.
    name: env === 'prod' ? 'Bote' : `Bote (${env})`,
    slug: config.slug ?? 'bote',
    // Deep-link scheme, also per environment so links open the right app.
    scheme: env === 'prod' ? 'bote' : `bote-${env}`,
    ios: { ...config.ios, bundleIdentifier: appId },
    android: {
      ...config.android,
      package: appId,
      // Firebase project "bote-kresala" (push notifications on Android). One file holds both the
      // prod and dev apps; local isn't registered in Firebase, so it doesn't use it.
      ...(env === 'local' ? {} : { googleServicesFile: './firebase/google-services.json' }),
      // Invitation links (https://<host>/join?code=…) open the app instead of the browser.
      // The web at that host publishes public/.well-known/assetlinks.json with this app's signature.
      ...(env === 'local'
        ? {}
        : {
            intentFilters: [
              {
                action: 'VIEW',
                autoVerify: true,
                data: [{ scheme: 'https', host: environments.inviteHost[env], pathPrefix: '/join' }],
                category: ['BROWSABLE', 'DEFAULT'],
              },
            ],
          }),
      // Added by default by the template but not needed: drawing over other apps and file storage.
      blockedPermissions: [
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
      ],
    },
    extra: {
      ...config.extra,
      appEnv: env,
      supabaseUrl: supabase.url,
      supabaseKey: supabase.key,
    },
  };
};
