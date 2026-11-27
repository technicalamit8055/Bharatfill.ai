/**
 * Upload — add a photo or a PDF that is already on the phone, without opening the camera. Photos
 * (the phone's photo picker), PDF or file (the system file picker: Downloads, WhatsApp
 * documents, Drive), and — where PDFs can be read — DigiLocker or e-Aadhaar: the same picker
 * for PDFs alone, for a document downloaded from DigiLocker or UIDAI. Such a PDF is unlocked
 * with the e-Aadhaar rule and its QR code checked on Save. A link opens DigiLocker to download
 * one first: this app sits on top of DigiLocker, it does not replace it. What is picked goes on
 * to scan review like a scan.
 *
 * The same screen is where review comes back to: to add more pages, to replace one (Replace,
 * the upload's Retake), or with Back, when it also offers to review the pages already added.
 *
 * Presentational only: the route (`app/import.tsx`) owns the pickers and the session.
 */

import { StatusBar } from 'expo-status-bar';
import type { LucideIcon } from 'lucide-react-native';
import {
  ArrowRight,
  ChevronLeft,
  ExternalLink,
  FileText,
  Images,
  Landmark,
  ShieldCheck,
} from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { importPalette as palette } from './palette';

/** What is in progress: a picker open, or the pages of a PDF being drawn. */
export type ImportBusy = 'picking' | 'reading' | null;

export type ImportScreenProps = {
  readonly busy: ImportBusy;
  /** Whether this phone can turn PDFs into pages; without it, files means images only. */
  readonly pdfAvailable: boolean;
  readonly pageCount: number;
  /** A page in review is being replaced: whatever is picked next takes its place. */
  readonly replacing: boolean;
  readonly onPickPhotos: () => void;
  readonly onPickFiles: () => void;
  /** DigiLocker or e-Aadhaar: PDFs only, unlocked and their QR checked on the way in. */
  readonly onPickOfficial: () => void;
  readonly onOpenDigiLocker: () => void;
  readonly onReview: () => void;
  readonly onClose: () => void;
};

export function ImportScreen(props: ImportScreenProps) {
  const { t } = useTranslation();
  const { busy, pageCount, replacing } = props;
  const disabled = busy !== null;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('importFiles.close')}
            hitSlop={4}
            onPress={props.onClose}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <ChevronLeft color={palette.backIcon} size={26} strokeWidth={2.2} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text accessibilityRole="header" style={styles.title}>
            {t(replacing ? 'importFiles.replaceTitle' : 'importFiles.title')}
          </Text>
          <Text style={styles.subtitle}>
            {t(replacing ? 'importFiles.replaceBody' : 'importFiles.body')}
          </Text>

          <ChoiceCard
            icon={Images}
            tile={palette.photosTile}
            iconColor={palette.photosIcon}
            label={t('importFiles.photos.label')}
            caption={t('importFiles.photos.caption')}
            disabled={disabled}
            onPress={props.onPickPhotos}
          />
          <ChoiceCard
            icon={FileText}
            tile={palette.filesTile}
            iconColor={palette.filesIcon}
            label={t(
              props.pdfAvailable ? 'importFiles.files.label' : 'importFiles.files.labelImages',
            )}
            caption={t(
              props.pdfAvailable ? 'importFiles.files.caption' : 'importFiles.files.captionImages',
            )}
            disabled={disabled}
            onPress={props.onPickFiles}
          />

          {props.pdfAvailable && !replacing ? (
            <>
              <ChoiceCard
                icon={Landmark}
                tile={palette.officialTile}
                iconColor={palette.officialIcon}
                label={t('importFiles.official.label')}
                caption={t('importFiles.official.caption')}
                disabled={disabled}
                onPress={props.onPickOfficial}
              />
              <Pressable
                accessibilityRole="link"
                accessibilityHint={t('importFiles.official.openHint')}
                onPress={props.onOpenDigiLocker}
                style={({ pressed }) => [styles.openLink, pressed && styles.pressed]}
              >
                <Text style={styles.openLinkLabel}>{t('importFiles.official.open')}</Text>
                <ExternalLink color={palette.brandBlue} size={16} strokeWidth={2.3} />
              </Pressable>
            </>
          ) : null}

          <View style={styles.note}>
            <ShieldCheck color={palette.noteIcon} size={20} strokeWidth={2.1} />
            <Text style={styles.noteText}>{t('importFiles.privacy')}</Text>
          </View>

          {busy !== null ? (
            <View style={styles.busy} accessibilityLiveRegion="polite">
              <ActivityIndicator color={palette.brandBlue} />
              <Text style={styles.busyText}>
                {t(busy === 'reading' ? 'importFiles.reading' : 'importFiles.opening')}
              </Text>
            </View>
          ) : pageCount > 0 && !replacing ? (
            <Pressable
              accessibilityRole="button"
              onPress={props.onReview}
              style={({ pressed }) => [styles.review, pressed && styles.reviewPressed]}
            >
              <Text style={styles.reviewLabel}>
                {t('importFiles.review', { count: pageCount })}
              </Text>
              <ArrowRight color={palette.onBrand} size={20} strokeWidth={2.3} />
            </Pressable>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function ChoiceCard({
  icon: Icon,
  tile,
  iconColor,
  label,
  caption,
  disabled,
  onPress,
}: {
  readonly icon: LucideIcon;
  readonly tile: string;
  readonly iconColor: string;
  readonly label: string;
  readonly caption: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${caption}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.card, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <View style={[styles.cardTile, { backgroundColor: tile }]}>
        <Icon color={iconColor} size={28} strokeWidth={2} />
      </View>
      <View style={styles.cardCopy}>
        <Text style={styles.cardLabel}>{label}</Text>
        <Text style={styles.cardCaption}>{caption}</Text>
      </View>
      <ArrowRight color={palette.textSecondary} size={20} strokeWidth={2.1} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  topBar: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.backButton,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.55,
  },
  content: {
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: palette.heading,
  },
  subtitle: {
    marginBottom: 6,
    fontSize: 15,
    lineHeight: 22,
    color: palette.textSecondary,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 84,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    shadowColor: palette.cardShadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  cardTile: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCopy: {
    flex: 1,
    gap: 3,
  },
  cardLabel: {
    fontSize: 16.5,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  cardCaption: {
    fontSize: 13.5,
    lineHeight: 19,
    color: palette.textSecondary,
  },
  openLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 4,
  },
  openLinkLabel: {
    fontSize: 14.5,
    fontWeight: '700',
    color: palette.brandBlue,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: palette.noteSurface,
  },
  noteText: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 19,
    color: palette.noteText,
  },
  busy: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  busyText: {
    fontSize: 14.5,
    color: palette.textSecondary,
  },
  review: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    marginTop: 6,
    borderRadius: 26,
    backgroundColor: palette.brandBlue,
  },
  reviewPressed: {
    backgroundColor: palette.brandBluePressed,
  },
  reviewLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.onBrand,
  },
});
