/**
 * Scan result route — `/scan-result?id=<document id>`. Loads the document from the on-device
 * vault and decrypts its pages one by one for display. The screen lives in
 * `components/scanner/ScanResultScreen.tsx`.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { z } from 'zod';

import { type ScanResultState, ScanResultScreen } from '../components/scanner/ScanResultScreen';
import { useTranslation } from '../lib/i18n/I18nProvider';
import { deleteDocument, getDocument, readPageDataUri } from '../lib/vault/vault-storage';

const documentIdSchema = z.string().uuid();

export default function ScanResultRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();

  const parsedId = documentIdSchema.safeParse(params.id);
  const documentId = parsedId.success ? parsedId.data : null;

  const [state, setState] = useState<ScanResultState>({ kind: 'loading' });

  useEffect(() => {
    if (!documentId) {
      setState({ kind: 'notFound' });
      return;
    }

    let active = true;
    void (async () => {
      try {
        const document = await getDocument(documentId);
        if (!active) return;
        if (!document) {
          setState({ kind: 'notFound' });
          return;
        }

        const pages: (string | null)[] = document.pages.map(() => null);
        setState({ kind: 'ready', pages: [...pages] });

        // One page at a time keeps only what is on screen, not a whole booklet, in memory at once.
        for (const pageIndex of pages.keys()) {
          pages[pageIndex] = await readPageDataUri(document, pageIndex);
          if (!active) return;
          setState({ kind: 'ready', pages: [...pages] });
        }
      } catch {
        if (active) setState({ kind: 'unreadable' });
      }
    })();

    return () => {
      active = false;
    };
  }, [documentId]);

  const done = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  const scanAnother = useCallback(() => {
    router.replace('/scanner');
  }, [router]);

  const confirmDelete = useCallback(() => {
    if (!documentId) return;
    Alert.alert(t('scanResult.deleteTitle'), t('scanResult.deleteBody'), [
      { text: t('scanResult.cancel'), style: 'cancel' },
      {
        text: t('scanResult.delete'),
        style: 'destructive',
        onPress: () => {
          void deleteDocument(documentId)
            .then(done)
            .catch(() => {
              Alert.alert(t('common.errorTitle'), t('scanResult.deleteFailed'), [
                { text: t('common.ok') },
              ]);
            });
        },
      },
    ]);
  }, [documentId, done, t]);

  return (
    <ScanResultScreen
      state={state}
      onDone={done}
      onScanAnother={scanAnother}
      onDelete={confirmDelete}
    />
  );
}
