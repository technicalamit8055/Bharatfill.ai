/**
 * Save Document route — after scan review. The screen lives in
 * `components/save-document/SaveDocumentScreen.tsx`; the pages still live in the capture
 * session, so Edit Scan and Back return to the review with nothing lost.
 *
 * Save to Vault schedules the expiry reminder first, when there is one, then seals the pages
 * and the details into one encrypted vault document. If sealing fails the reminder is cancelled
 * again; if only the reminder fails the document is still saved and the citizen is told.
 */

import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';

import { SaveDocumentScreen } from '../components/save-document/SaveDocumentScreen';
import { useTranslation } from '../lib/i18n/I18nProvider';
import { formatDateOfBirth, MONTH_KEYS } from '../lib/profile/date-of-birth';
import { saveSession, useCaptureSession } from '../lib/scan/capture-session';
import { PRESET_DOCUMENT_TYPE } from '../lib/scan/presets';
import {
  cancelExpiryReminder,
  ensureReminderPermission,
  scheduleExpiryReminder,
} from '../lib/vault/expiry-reminders';
import { reminderTime } from '../lib/vault/save-document';
import type { DocumentDetails } from '../lib/vault/vault-index';

export default function SaveDocumentRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const { pages, preset } = useCaptureSession();
  const [saving, setSaving] = useState(false);

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/scan-review');
  }, [router]);

  // The session was thrown away under this screen: there is nothing left to save.
  useEffect(() => {
    if (pages.length === 0 && !saving) back();
  }, [back, pages.length, saving]);

  const enableReminder = useCallback(async () => {
    try {
      if (await ensureReminderPermission()) return true;
      Alert.alert(t('saveDocument.reminder.deniedTitle'), t('saveDocument.reminder.deniedBody'), [
        { text: t('saveDocument.reminder.notNow'), style: 'cancel' },
        {
          text: t('saveDocument.reminder.openSettings'),
          onPress: () => void Linking.openSettings(),
        },
      ]);
    } catch {
      Alert.alert(t('common.errorTitle'), t('saveDocument.reminder.permissionFailed'), [
        { text: t('common.ok') },
      ]);
    }
    return false;
  }, [t]);

  /** Schedules the reminder. Null when there is none to set; throws when setting it fails. */
  const scheduleReminder = useCallback(
    async (expiresOn: string): Promise<string | null> => {
      const at = reminderTime(expiresOn, new Date());
      if (!at) return null;
      const monthNames = MONTH_KEYS.map((key) => t(`profileSetup.months.${key}`));
      return scheduleExpiryReminder(at, {
        title: t('saveDocument.notification.title'),
        body: t('saveDocument.notification.body', {
          date: formatDateOfBirth(expiresOn, monthNames) ?? expiresOn,
        }),
        channelName: t('saveDocument.notification.channel'),
      });
    },
    [t],
  );

  const save = useCallback(
    async (details: DocumentDetails) => {
      setSaving(true);

      let reminderId: string | null = null;
      let reminderFailed = false;
      if (details.expiresOn) {
        try {
          reminderId = await scheduleReminder(details.expiresOn);
        } catch {
          reminderFailed = true;
        }
      }

      let documentId: string;
      try {
        documentId = await saveSession(reminderId ? { ...details, reminderId } : details);
      } catch {
        if (reminderId) await cancelExpiryReminder(reminderId);
        setSaving(false);
        Alert.alert(t('scanner.errors.title'), t('scanReview.saveFailed'), [
          { text: t('common.ok') },
        ]);
        return;
      }

      // Close the camera, review and this screen, so Done on the result goes back to the tabs.
      router.dismissAll();
      router.push({ pathname: '/scan-result', params: { id: documentId } });
      if (reminderFailed) {
        Alert.alert(t('saveDocument.reminder.failedTitle'), t('saveDocument.reminder.failed'), [
          { text: t('common.ok') },
        ]);
      }
    },
    [router, scheduleReminder, t],
  );

  return (
    <SaveDocumentScreen
      pages={pages}
      saving={saving}
      initialType={PRESET_DOCUMENT_TYPE[preset]}
      onBack={back}
      onEditScan={back}
      onEnableReminder={enableReminder}
      onSave={(details) => void save(details)}
    />
  );
}
