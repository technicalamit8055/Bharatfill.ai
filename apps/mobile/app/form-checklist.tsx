/**
 * Form checklist route — `/form-checklist?slug=<scheme>`: what one form asks for, ticked against
 * the vault. The list is the catalogue's typical one, not a notification: the screen says so,
 * does not claim the form is open, and links to the official site.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { ExternalLink } from 'lucide-react-native';
import { useCallback } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChecklistPage, ChecklistSection } from '../components/checklist/ChecklistPage';
import { ChecklistProgressBar } from '../components/checklist/ChecklistProgressBar';
import { ChecklistRows } from '../components/checklist/ChecklistRows';
import { homePalette as palette } from '../components/home/palette';
import { checklistProgress, formBySlug, formChecklist } from '../lib/checklist/checklist';
import { useChecklistActions } from '../lib/checklist/use-checklist-actions';
import { useVaultDocuments } from '../lib/checklist/use-vault-documents';
import { showDialog } from '../lib/dialog/dialog-store';
import { useTranslation } from '../lib/i18n/I18nProvider';

export default function FormChecklistRoute() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const params = useLocalSearchParams<{ slug?: string }>();
  const scheme = formBySlug(params.slug);
  const { documents, failed, now } = useVaultDocuments();
  const onItem = useChecklistActions(
    scheme ? { screen: 'form', slug: scheme.slug } : { screen: 'checklist' },
  );

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/checklist');
  }, [router]);

  const officialUrl = scheme?.officialNotificationUrl ?? null;
  const openOfficial = useCallback(() => {
    if (!officialUrl) return;
    Linking.openURL(officialUrl).catch(() =>
      showDialog(
        t('common.errorTitle'),
        t('checklist.forms.linkFailed'),
        [{ text: t('common.ok') }],
        { tone: 'warning' },
      ),
    );
  }, [officialUrl, t]);

  if (!scheme) {
    return (
      <ChecklistPage title={t('checklist.forms.title')} status="ready" onBack={back}>
        <Text style={styles.note}>{t('checklist.forms.notFound')}</Text>
      </ChecklistPage>
    );
  }

  const items = formChecklist(scheme, documents ?? [], now);
  const progress = checklistProgress(items);

  return (
    <ChecklistPage
      title={scheme.title[locale]}
      status={failed ? 'failed' : documents ? 'ready' : 'loading'}
      onBack={back}
    >
      <ChecklistSection
        title={t('checklist.forms.needed')}
        note={t('checklist.progress', progress)}
      >
        <ChecklistProgressBar {...progress} />
        <ChecklistRows items={items} onItem={onItem} />
      </ChecklistSection>

      <View style={styles.notice}>
        <Text style={styles.note}>{t('checklist.forms.disclaimer')}</Text>
        <Text style={styles.note}>{t('checklist.forms.reservation')}</Text>
        {officialUrl ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('checklist.forms.official')}
            hitSlop={8}
            onPress={openOfficial}
            style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          >
            <Text style={styles.linkLabel}>{t('checklist.forms.official')}</Text>
            <ExternalLink color={palette.brandBlue} size={15} strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>
    </ChecklistPage>
  );
}

const styles = StyleSheet.create({
  notice: {
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: palette.avatarSurface,
  },
  note: {
    fontSize: 13.5,
    lineHeight: 20,
    color: palette.textSecondary,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  linkLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: palette.brandBluePressed,
  },
  pressed: {
    opacity: 0.6,
  },
});
