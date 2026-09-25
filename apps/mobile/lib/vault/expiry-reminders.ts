/**
 * Local "document expiring soon" reminders, via `expo-notifications`. Nothing leaves the phone:
 * these are scheduled on the device, with no push token and no server.
 *
 * A notification can show on the lock screen, so its text never carries the document's name,
 * tags or type. It says only that a vault document expires on a date. The caller passes that
 * text already translated.
 *
 * The library is loaded on first use, not imported at the top: the vault imports this module,
 * and a build without the library's native half (an older dev client) would otherwise crash on
 * every screen. There, reminders fail with `RemindersUnavailableError` and the rest still works.
 *
 * The `expo-notifications` config plugin is deliberately not in `app.json`: it would add the
 * iOS push entitlement, which local reminders do not need. The library's own Android manifest
 * already declares POST_NOTIFICATIONS and RECEIVE_BOOT_COMPLETED (reminders survive a reboot).
 */

import type * as NotificationsModule from 'expo-notifications';
import { Platform } from 'react-native';

type Notifications = typeof NotificationsModule;

const CHANNEL_ID = 'document-expiry';

export class RemindersUnavailableError extends Error {
  constructor() {
    super('Notifications are not available in this build of the app.');
    this.name = 'RemindersUnavailableError';
  }
}

let loaded: Promise<Notifications> | null = null;

function notifications(): Promise<Notifications> {
  loaded ??= import('expo-notifications').then(
    (module) => {
      // Show a reminder that fires while the app is open, too; by default it would be dropped.
      module.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      return module;
    },
    () => {
      loaded = null;
      throw new RemindersUnavailableError();
    },
  );
  return loaded;
}

/** Asks for permission to notify, if it has not been refused for good. */
export async function ensureReminderPermission(): Promise<boolean> {
  const Notifications = await notifications();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export type ReminderCopy = {
  readonly title: string;
  readonly body: string;
  /** The Android notification channel's name in system settings. */
  readonly channelName: string;
};

/** Schedules one reminder at `at`. Returns its id, which the vault stores to cancel it later. */
export async function scheduleExpiryReminder(at: Date, copy: ReminderCopy): Promise<string> {
  const Notifications = await notifications();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: copy.channelName,
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  return Notifications.scheduleNotificationAsync({
    content: { title: copy.title, body: copy.body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: at,
      channelId: CHANNEL_ID,
    },
  });
}

/** Best effort: a reminder that already fired or was cleared by the OS is simply gone. */
export async function cancelExpiryReminder(id: string): Promise<void> {
  try {
    await (await notifications()).cancelScheduledNotificationAsync(id);
  } catch {
    // Nothing to undo.
  }
}
