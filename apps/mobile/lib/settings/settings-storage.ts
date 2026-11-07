/**
 * Reads and writes the app settings (`app-settings.ts`) as one small JSON file in the app's
 * document directory. It holds no personal data, so it is not encrypted; Android backup is off
 * for the whole app (`allowBackup: false`).
 *
 * The file is read once, synchronously — so the first frame can already use the saved
 * language — and cached. Writes run one at a time and go beside the live file before being
 * moved over it, so a crash mid-write cannot leave it half written. A file that cannot be read
 * counts as a first launch.
 */

import { File, Paths } from 'expo-file-system';

import {
  type AppSettings,
  DEFAULT_APP_SETTINGS,
  parseAppSettings,
  serialiseAppSettings,
  withAppSettings,
} from './app-settings';

const FILE_NAME = 'settings.json';

let cached: AppSettings | null = null;
let queue: Promise<unknown> = Promise.resolve();

function settingsFile(): File {
  return new File(Paths.document, FILE_NAME);
}

/** The saved settings, or the defaults when there are none or they cannot be read. */
export function readAppSettings(): AppSettings {
  if (cached) return cached;
  try {
    const file = settingsFile();
    cached = file.exists ? parseAppSettings(file.textSync()) : DEFAULT_APP_SETTINGS;
  } catch {
    cached = DEFAULT_APP_SETTINGS;
  }
  return cached;
}

/**
 * Saves `change` on top of the current settings. The cache is updated at once, so a read right
 * after sees it; the file follows. Failing to write only means the change is not remembered
 * next launch, so it resolves rather than throws.
 */
export function updateAppSettings(change: Partial<AppSettings>): Promise<void> {
  const next = withAppSettings(readAppSettings(), change);
  cached = next;
  const write = async () => {
    try {
      const pending = new File(Paths.document, `${FILE_NAME}.pending`);
      pending.write(serialiseAppSettings(next));
      await pending.move(settingsFile(), { overwrite: true });
    } catch {
      // Not remembered next launch; nothing else depends on it.
    }
  };
  const run = queue.then(write, write);
  queue = run;
  return run;
}
