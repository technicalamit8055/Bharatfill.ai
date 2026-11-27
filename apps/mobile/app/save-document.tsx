/**
 * Save Document route — after scan review. The screen lives in
 * `components/save-document/SaveDocumentScreen.tsx`; the pages still live in the capture
 * session, so Edit Scan and Back return to the review with nothing lost.
 *
 * Save to Vault schedules the expiry reminder first, when there is one, then seals the pages
 * and the details into one encrypted vault document. If sealing fails the reminder is cancelled
 * again; if only the reminder fails the document is still saved and the citizen is told.
 * A scan started from a document checklist goes back to that checklist, now ticked, instead of
 * on to the scan result.
 */

import { BellOff } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking } from 'react-native';

import { showDialog } from '../lib/dialog/dialog-store';
import { SaveDocumentScreen } from '../components/save-document/SaveDocumentScreen';
import { memberValue, SELF } from '../lib/family/family';
import { useFamily } from '../lib/family/use-family';
import { useReminderCopy } from '../lib/family/use-reminder-copy';
import { useTranslation } from '../lib/i18n/I18nProvider';
import { cloudConfig } from '../lib/cloud/config';
import { READING_VERSION } from '../lib/ocr/document-reading';
import { useDocumentReading } from '../lib/ocr/use-document-reading';
import { suggestedDocumentType, summariseQrCheck } from '@assistigo/document-tools/qr';

import { QrCheckCard } from '../components/qr-check/QrCheckCard';
import { type SessionPage, saveSession, useCaptureSession } from '../lib/scan/capture-session';
import { openQrLink, qrCardState } from '../lib/scan/qr-card';
import { shouldAutoCheckQr } from '../lib/scan/qr-check-view';
import { useQrCheck } from '../lib/scan/use-qr-check';
import { PRESET_DOCUMENT_TYPE } from '../lib/scan/presets';
import {
  cancelExpiryReminder,
  ensureReminderPermission,
  scheduleExpiryReminder,
} from '../lib/vault/expiry-reminders';
import { reminderPlanFor } from '../lib/vault/save-document';
import type { DocumentDetails } from '../lib/vault/vault-index';

export default function SaveDocumentRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const { pages, preset, goal } = useCaptureSession();
  const initialType = goal?.documentType ?? PRESET_DOCUMENT_TYPE[preset];
  // Read on the phone while the citizen fills in the form (lib/ocr); saved with the document.
  const reading = useDocumentReading(pages, initialType);
  const [saving, setSaving] = useState(false);

  // What the document's QR code proves (lib/scan/qr-scan.ts), checked on the phone. Only its
  // summary is saved with the document; what the code says stays on this screen.
  const qrSources = useMemo(() => qrSourcesOf(pages), [pages]);
  const qrKey = qrSources ? qrSources.map((source) => source.uri).join('|') : '';
  const qr = useQrCheck(qrKey);
  const runQr = qr.run;
  const autoQr = shouldAutoCheckQr({
    pageSources: pages.map((page) => page.source),
    preset,
    documentType: initialType,
  });
  useEffect(() => {
    if (autoQr && qrSources) void runQr(qrSources);
    // Once per set of pages: `qrKey` names them.
  }, [autoQr, qrKey]);
  const family = useFamily();
  const reminderCopy = useReminderCopy();
  const owners = useMemo(
    () => [
      { value: SELF, label: family.labelOf(null) },
      ...family.members.map((member) => ({
        value: member.id,
        label: family.labelOf(member.id),
      })),
    ],
    [family.labelOf, family.members],
  );

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
      showDialog(
        t('saveDocument.reminder.deniedTitle'),
        t('saveDocument.reminder.deniedBody'),
        [
          { text: t('saveDocument.reminder.notNow'), style: 'cancel' },
          {
            text: t('saveDocument.reminder.openSettings'),
            onPress: () => void Linking.openSettings(),
          },
        ],
        { tone: 'warning', icon: BellOff },
      );
    } catch {
      showDialog(
        t('common.errorTitle'),
        t('saveDocument.reminder.permissionFailed'),
        [{ text: t('common.ok') }],
        { tone: 'danger' },
      );
    }
    return false;
  }, [t]);

  /**
   * Schedules the reminder, worded for whose document it is (by relation only — it can show on
   * the lock screen). Null when there is none to set; throws when setting it fails.
   */
  const scheduleReminder = useCallback(
    async (details: DocumentDetails): Promise<string | null> => {
      const plan = reminderPlanFor(details, new Date());
      if (!plan) return null;
      const owner = family.members.find((member) => member.id === details.memberId) ?? null;
      return scheduleExpiryReminder(plan.at, reminderCopy(owner, plan));
    },
    [family.members, reminderCopy],
  );

  const save = useCallback(
    async (details: DocumentDetails) => {
      setSaving(true);

      let reminderId: string | null = null;
      let reminderFailed = false;
      if (details.expiresOn) {
        try {
          reminderId = await scheduleReminder(details);
        } catch {
          reminderFailed = true;
        }
      }

      let documentId: string;
      try {
        const read = reading.status === 'done' ? reading.reading : null;
        documentId = await saveSession(
          {
            ...details,
            ...(reminderId ? { reminderId } : {}),
            ...(read ? { reading: { version: READING_VERSION, fields: [...read.fields] } } : {}),
            ...(qr.state.status === 'done'
              ? { qrCheck: summariseQrCheck(qr.state.check, new Date()) }
              : {}),
          },
          read?.searchText,
        );
      } catch {
        if (reminderId) await cancelExpiryReminder(reminderId);
        setSaving(false);
        showDialog(
          t('scanner.errors.title'),
          t('scanReview.saveFailed'),
          [{ text: t('common.ok') }],
          { tone: 'danger' },
        );
        return;
      }

      // Close the camera, review and this screen, so Done on the result goes back to the tabs.
      router.dismissAll();
      router.push(goal?.returnTo ?? { pathname: '/scan-result', params: { id: documentId } });
      if (reminderFailed) {
        showDialog(
          t('saveDocument.reminder.failedTitle'),
          t('saveDocument.reminder.failed'),
          [{ text: t('common.ok') }],
          { tone: 'warning', icon: BellOff },
        );
      }
    },
    [goal, qr.state, reading, router, scheduleReminder, t],
  );

  // Wait for the family, so the "whose document" choice starts on the person picked earlier.
  if (!family.loaded) return null;

  return (
    <SaveDocumentScreen
      pages={pages}
      saving={saving}
      initialType={initialType}
      reading={reading}
      owners={owners}
      initialOwner={memberValue(family.active)}
      cloudSync={cloudConfig() !== null}
      onBack={back}
      onEditScan={back}
      onEnableReminder={enableReminder}
      onSave={(details) => void save(details)}
      suggestedType={qr.state.status === 'done' ? suggestedDocumentType(qr.state.check) : null}
      qrCard={
        <QrCheckCard
          state={qrCardState(qr.state, initialType)}
          onOpenLink={() => openQrLink(qr.state, t)}
          {...(qrSources && !autoQr ? { onCheck: () => void runQr(qrSources) } : {})}
        />
      }
    />
  );
}

/**
 * The pages to search for a code, once every page is ready: a PDF's page as drawn, any other
 * page as cleaned up (just the document, so the search has less to cover). Null while a page is
 * still being processed.
 */
function qrSourcesOf(pages: readonly SessionPage[]): { kind: 'file'; uri: string }[] | null {
  const sources: { kind: 'file'; uri: string }[] = [];
  for (const page of pages) {
    const uri = page.source === 'pdf' ? page.photoUri : page.rendered?.uri;
    if (!uri) return null;
    sources.push({ kind: 'file', uri });
  }
  return sources.length > 0 ? sources : null;
}
