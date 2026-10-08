import { serverEnv, type ServerEnv } from '../env';

/**
 * Pre-launch mode: whether visitors may create an account yet, and where the launch notice
 * points them meanwhile. Read on the server and handed to the pages that need it, so the
 * decision is never the browser's to make.
 */
export type LaunchState = {
  signupsOpen: boolean;
  /** The follow link on the launch notice, or null to show none. */
  channelUrl: string | null;
};

export function launchStateFrom(
  env: Pick<ServerEnv, 'SIGNUPS_ENABLED' | 'LAUNCH_CHANNEL_URL'>,
): LaunchState {
  return {
    signupsOpen: env.SIGNUPS_ENABLED !== 'off',
    channelUrl: env.LAUNCH_CHANNEL_URL ?? null,
  };
}

export function launchState(): LaunchState {
  return launchStateFrom(serverEnv());
}
