/**
 * Environments for the app code. The values live in environments.json, which app.config.ts
 * also reads (it can't import TypeScript files), so there is a single source.
 *
 * The environment is chosen with EXPO_PUBLIC_APP_ENV (set by the npm scripts and eas.json).
 * EXPO_PUBLIC_* variables are written into the app's code at build time on every platform,
 * web included — unlike app config `extra`, which the web version doesn't receive.
 *
 * - local: Supabase on this computer (`npm run db:start`, needs Docker Desktop). Set aside for now.
 * - dev:   the "Bote" Supabase project, for development and testing. Default.
 * - prod:  the "Bote prod" Supabase project, used by the real app.
 */
import environments from './environments.json';

export type AppEnv = 'local' | 'dev' | 'prod';

/**
 * Supabase URL and publishable key per cloud project. Public by design (they ship inside the
 * app; Row Level Security protects the data), so they can live in the repo.
 */
export const CLOUD: Record<Exclude<AppEnv, 'local'>, { url: string; key: string }> = environments.cloud;

/** Web address whose /join?code=… links open the app (EAS Hosting). None for local. */
export const INVITE_HOST: Record<Exclude<AppEnv, 'local'>, string> = environments.inviteHost;

/** Default anon key of the local Supabase stack (the CLI's well-known demo key). */
export const LOCAL_DEFAULT_KEY: string = environments.localDefaultKey;

/** Unset means dev, so nothing ever points at prod by accident. */
export function parseAppEnv(value: string | undefined): AppEnv {
  const v = value || 'dev';
  if (v === 'local' || v === 'dev' || v === 'prod') return v;
  throw new Error(`EXPO_PUBLIC_APP_ENV must be "local", "dev" or "prod" (got "${v}").`);
}
