/**
 * Glue between a QR check and the screens that show it (Save Document, Document Details): the
 * card's state, and opening a code's link — straight away for a government site, after a
 * warning for any other, since a real certificate never sends you to a private site.
 */

import type { DocumentType } from '@assistigo/core';
import { ExternalLink } from 'lucide-react-native';
import { Linking } from 'react-native';

import type { QrCheckCardState } from '../../components/qr-check/QrCheckCard';
import { showDialog } from '../dialog/dialog-store';
import type { Translate } from '../i18n';
import { liveQrCheckView } from './qr-check-view';
import type { QrCheckState } from './use-qr-check';

export function qrCardState(
  state: QrCheckState,
  documentType: DocumentType | null,
): QrCheckCardState {
  if (state.status === 'done') {
    return { status: 'done', view: liveQrCheckView(state.check, documentType) };
  }
  return state;
}

/** Opens a code's link; asks first when it is not a government site. */
export function openQrLink(state: QrCheckState, t: Translate): void {
  if (state.status !== 'done') return;
  const { check } = state;
  if (check.result !== 'official_link' && check.result !== 'other_link') return;
  const open = () => {
    Linking.openURL(check.url).catch(() => {
      showDialog(
        t('qrCheck.openFailedTitle'),
        t('qrCheck.openFailed'),
        [{ text: t('common.ok') }],
        {
          tone: 'danger',
        },
      );
    });
  };
  if (check.result === 'official_link') {
    open();
    return;
  }
  showDialog(
    t('qrCheck.otherLinkTitle'),
    t('qrCheck.otherLinkBody', { host: check.host }),
    [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('qrCheck.openAnyway'), onPress: open },
    ],
    { tone: 'warning', icon: ExternalLink },
  );
}
