/**
 * Document Details — one vault document: its pages in a dark viewer, Share / Download / Print /
 * More (a single image asks whether to share or save it as a PDF or as itself), the details card (file name, folder, date added, size, tags), the "Stored Securely"
 * note, and Move / Delete.
 *
 * Presentational apart from which sheet is open: the route loads and decrypts the document and
 * owns what every action does. Rename and Add Tag are checked here with the Save Document rules
 * before the route sees them. Light-only branded artwork like the Vault tab, so it does not read
 * from `useTheme()`.
 */

import {
  CalendarDays,
  ChevronLeft,
  CloudUpload,
  Download,
  Ellipsis,
  EllipsisVertical,
  File,
  FileCheck2,
  FileImage,
  FileText,
  Folder,
  FolderInput,
  type LucideIcon,
  Pencil,
  Plus,
  Printer,
  Share2,
  ShieldCheck,
  Smartphone,
  Star,
  Tag,
  Trash2,
} from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { VAULT_CATEGORIES, type VaultCategoryKey } from '../../lib/vault/categories';
import {
  documentKindKey,
  type ExportKind,
  folderLabelKey,
  formatAddedOn,
} from '../../lib/vault/document-details';
import { addTag, normaliseTitle } from '../../lib/vault/save-document';
import { MAX_TAG_LENGTH, MAX_TAGS, MAX_TITLE_LENGTH } from '../../lib/vault/vault-index';
import { formatFileSize } from '../../lib/vault/vault-screen';
import { CONTENT_MAX_WIDTH, PAGE_PADDING } from '../home/layout';
import { OptionSheet } from '../registration/OptionSheet';
import { type DocumentPage, DocumentPageViewer } from './DocumentPageViewer';
import { MenuSheet, TextEntrySheet } from './DocumentSheets';
import { documentDetailsPalette as palette } from './palette';

export type DocumentDetailsView = {
  readonly title: string;
  readonly category: VaultCategoryKey | null;
  readonly tags: readonly string[];
  readonly createdAt: Date;
  /** What the document is called when shared or saved, e.g. "Aadhaar_Card.pdf". */
  readonly fileName: string;
  /** Null when the size is not known. */
  readonly sizeBytes: number | null;
  /**
   * "JPG" when the document is a single image, which Share and Download offer as that image or
   * as a PDF; null for a booklet, which is always a PDF.
   */
  readonly imageFormat: string | null;
  readonly starred: boolean;
  /**
   * "Keep on this phone only" (docs/VAULT_BRIDGE_DESIGN.md §3.2). Null hides the choice: this
   * build has no cloud vault, or the document is a sample.
   */
  readonly phoneOnly: boolean | null;
  /** Offer Export for a form: a single photo or signature with portal presets. */
  readonly forPortal: boolean;
  /** The centre that added it for the citizen (0047), or null. */
  readonly addedByCentre?: string | null;
  readonly pages: readonly DocumentPage[];
};

export type DocumentDetailsState =
  | { readonly status: 'loading' }
  | { readonly status: 'notFound' }
  | { readonly status: 'unreadable' }
  | { readonly status: 'ready'; readonly document: DocumentDetailsView };

export const EXPORT_ACTIONS = ['share', 'download', 'print'] as const;
export type ExportAction = (typeof EXPORT_ACTIONS)[number];

export type DocumentDetailsScreenProps = {
  readonly state: DocumentDetailsState;
  /** The export being prepared, which blocks the screen until it is done. */
  readonly busy: ExportAction | null;
  readonly onBack: () => void;
  readonly onToggleStar: () => void;
  readonly onTogglePhoneOnly: () => void;
  /** `kind` is what the citizen picked for a single image; a booklet is always a PDF. */
  readonly onExport: (action: ExportAction, kind: ExportKind) => void;
  /** Opens the portal preset list; the route renders and shares the file. */
  readonly onExportForPortal: () => void;
  /** A name already normalised and different from the current one. */
  readonly onRename: (title: string) => void;
  readonly onChangeTags: (tags: readonly string[]) => void;
  /** Asks before removing; the route owns the confirmation. */
  readonly onRemoveTag: (tag: string) => void;
  readonly onMove: (category: VaultCategoryKey | null) => void;
  readonly onDelete: () => void;
};

type Sheet = 'menu' | 'rename' | 'tag' | 'move' | 'shareAs' | 'downloadAs';
type MoveOption = VaultCategoryKey | 'none';

export function DocumentDetailsScreen({
  state,
  busy,
  onBack,
  onToggleStar,
  onTogglePhoneOnly,
  onExport,
  onExportForPortal,
  onRename,
  onChangeTags,
  onRemoveTag,
  onMove,
  onDelete,
}: DocumentDetailsScreenProps) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = Math.min(windowWidth, CONTENT_MAX_WIDTH) - PAGE_PADDING * 2;
  const [sheet, setSheet] = useState<Sheet | null>(null);

  const document = state.status === 'ready' ? state.document : null;

  if (document === null) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <BackButton label={t('documentDetails.back')} onPress={onBack} />
        </View>
        <View style={styles.status}>
          {state.status === 'loading' ? (
            <ActivityIndicator color={palette.brandBlue} accessibilityLabel={t('common.loading')} />
          ) : (
            <Text style={styles.statusText}>
              {t(
                state.status === 'notFound'
                  ? 'documentDetails.errors.notFound'
                  : 'documentDetails.errors.unreadable',
              )}
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const exportDisabled = busy !== null;

  /** A single image asks which format first; a booklet goes straight out as a PDF. */
  const startExport = (action: 'share' | 'download') => {
    if (document.imageFormat === null) onExport(action, 'pdf');
    else setSheet(action === 'share' ? 'shareAs' : 'downloadAs');
  };

  const formatItems = (action: 'share' | 'download') => [
    {
      key: 'pdf',
      label: t('documentDetails.format.pdf'),
      icon: FileText,
      onPress: () => onExport(action, 'pdf'),
    },
    {
      key: 'image',
      label: t('documentDetails.format.image', { format: document.imageFormat ?? '' }),
      icon: FileImage,
      onPress: () => onExport(action, 'image'),
    },
  ];

  const rename = (raw: string): string | null => {
    const title = normaliseTitle(raw);
    if (title.length === 0) return t('documentDetails.rename.required');
    if (title !== document.title) onRename(title);
    return null;
  };

  const submitTag = (raw: string): string | null => {
    const result = addTag(document.tags, raw);
    switch (result.kind) {
      case 'empty':
        return null;
      case 'duplicate':
        return t('saveDocument.tags.duplicate');
      case 'full':
        return t('saveDocument.tags.full', { max: MAX_TAGS });
      case 'added':
        onChangeTags(result.tags);
        return null;
    }
  };

  const menuItems = [
    {
      key: 'rename',
      label: t('documentDetails.menu.rename'),
      icon: Pencil,
      onPress: () => setSheet('rename'),
    },
    {
      key: 'tag',
      label: t('documentDetails.menu.addTag'),
      icon: Tag,
      onPress: () => setSheet('tag'),
    },
    {
      key: 'move',
      label: t('documentDetails.menu.move'),
      icon: FolderInput,
      onPress: () => setSheet('move'),
    },
    ...(document.forPortal
      ? [
          {
            key: 'portal',
            label: t('documentDetails.menu.forPortal'),
            icon: FileCheck2,
            onPress: onExportForPortal,
          },
        ]
      : []),
    {
      key: 'star',
      label: t(document.starred ? 'documentDetails.menu.unstar' : 'documentDetails.menu.star'),
      icon: Star,
      onPress: onToggleStar,
    },
    ...(document.phoneOnly === null
      ? []
      : [
          {
            key: 'phoneOnly',
            label: t(
              document.phoneOnly
                ? 'documentDetails.menu.backUpToCloud'
                : 'documentDetails.menu.keepOnPhoneOnly',
            ),
            icon: document.phoneOnly ? CloudUpload : Smartphone,
            onPress: onTogglePhoneOnly,
          },
        ]),
    {
      key: 'delete',
      label: t('documentDetails.menu.delete'),
      icon: Trash2,
      destructive: true,
      onPress: onDelete,
    },
  ];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <BackButton label={t('documentDetails.back')} onPress={onBack} />
        <View style={styles.headerText}>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
            {document.title}
          </Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {t(documentKindKey(document.category))}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: document.starred }}
          accessibilityLabel={t(
            document.starred ? 'documentDetails.unstar' : 'documentDetails.star',
            { title: document.title },
          )}
          hitSlop={4}
          onPress={onToggleStar}
          style={({ pressed }) => [
            styles.roundButton,
            styles.starButton,
            pressed && styles.pressed,
          ]}
        >
          <Star
            color={palette.brandBlue}
            fill={document.starred ? palette.brandBlue : 'transparent'}
            size={24}
            strokeWidth={2}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('documentDetails.more', { title: document.title })}
          hitSlop={4}
          onPress={() => setSheet('menu')}
          style={({ pressed }) => [
            styles.roundButton,
            styles.moreButton,
            pressed && styles.pressed,
          ]}
        >
          <EllipsisVertical color={palette.headerIcon} size={22} strokeWidth={2.4} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <DocumentPageViewer pages={document.pages} width={contentWidth} />

        <View style={styles.actionBar}>
          <ActionTile
            label={t('documentDetails.actions.share')}
            icon={Share2}
            colors={palette.actions.share}
            disabled={exportDisabled}
            onPress={() => startExport('share')}
          />
          <View style={styles.actionDivider} />
          <ActionTile
            label={t('documentDetails.actions.download')}
            icon={Download}
            colors={palette.actions.download}
            disabled={exportDisabled}
            onPress={() => startExport('download')}
          />
          <View style={styles.actionDivider} />
          <ActionTile
            label={t('documentDetails.actions.print')}
            icon={Printer}
            colors={palette.actions.print}
            disabled={exportDisabled}
            onPress={() => onExport('print', 'image')}
          />
          <View style={styles.actionDivider} />
          <ActionTile
            label={t('documentDetails.actions.more')}
            icon={Ellipsis}
            colors={palette.actions.more}
            onPress={() => setSheet('menu')}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text accessibilityRole="header" style={styles.cardTitle}>
              {t('documentDetails.details.title')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('documentDetails.rename.title')}
              hitSlop={6}
              onPress={() => setSheet('rename')}
              style={({ pressed }) => [styles.editPill, pressed && styles.pressed]}
            >
              <Pencil color={palette.brandBlue} size={17} strokeWidth={2.4} />
              <Text style={styles.editLabel}>{t('documentDetails.details.edit')}</Text>
            </Pressable>
          </View>

          <DetailRow icon={FileText} label={t('documentDetails.details.fileName')}>
            <Text style={styles.rowValue}>{document.fileName}</Text>
          </DetailRow>
          <DetailRow icon={Folder} label={t('documentDetails.details.folder')}>
            <Text style={styles.rowValue}>{t(folderLabelKey(document.category))}</Text>
          </DetailRow>
          <DetailRow icon={CalendarDays} label={t('documentDetails.details.addedOn')}>
            <Text style={styles.rowValue}>{formatAddedOn(document.createdAt, t)}</Text>
          </DetailRow>
          <DetailRow icon={File} label={t('documentDetails.details.fileSize')}>
            <Text style={styles.rowValue}>
              {document.sizeBytes === null
                ? t('documentDetails.details.unknownSize')
                : formatFileSize(document.sizeBytes)}
            </Text>
          </DetailRow>
          <DetailRow icon={Tag} label={t('documentDetails.details.tags')} last>
            <View style={styles.tags}>
              {document.tags.map((tag) => (
                <Pressable
                  key={tag}
                  accessibilityRole="button"
                  accessibilityLabel={t('documentDetails.tag.remove', { tag })}
                  onPress={() => onRemoveTag(tag)}
                  style={({ pressed }) => [styles.tag, pressed && styles.pressed]}
                >
                  <Text numberOfLines={1} style={styles.tagText}>
                    {tag}
                  </Text>
                </Pressable>
              ))}
              {document.tags.length < MAX_TAGS ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSheet('tag')}
                  style={({ pressed }) => [styles.addTag, pressed && styles.pressed]}
                >
                  <Plus color={palette.addTagText} size={16} strokeWidth={2.4} />
                  <Text style={styles.addTagText}>{t('documentDetails.details.addTag')}</Text>
                </Pressable>
              ) : null}
            </View>
          </DetailRow>
        </View>

        <View style={styles.secure}>
          <View style={styles.secureBadge}>
            <ShieldCheck
              color={palette.onBrand}
              fill={palette.secureIcon}
              size={34}
              strokeWidth={1.8}
            />
          </View>
          <View style={styles.secureText}>
            <Text style={styles.secureTitle}>{t('documentDetails.secure.title')}</Text>
            <Text style={styles.secureBody}>
              {t(
                document.phoneOnly === false
                  ? 'documentDetails.secure.sharedBody'
                  : 'documentDetails.secure.body',
              )}
            </Text>
            {document.addedByCentre ? (
              <Text style={styles.secureBody}>
                {t('documentDetails.secure.addedBy', { centre: document.addedByCentre })}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSheet('move')}
            style={({ pressed }) => [
              styles.footerButton,
              styles.moveButton,
              pressed && styles.pressed,
            ]}
          >
            <FolderInput color={palette.brandBlue} size={22} strokeWidth={2.2} />
            <Text style={[styles.footerLabel, styles.moveLabel]}>{t('documentDetails.move')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onDelete}
            style={({ pressed }) => [
              styles.footerButton,
              styles.deleteButton,
              pressed && styles.pressed,
            ]}
          >
            <Trash2 color={palette.deleteText} size={22} strokeWidth={2.2} />
            <Text style={[styles.footerLabel, styles.deleteLabel]}>
              {t('documentDetails.delete')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {sheet === 'menu' ? (
        <MenuSheet
          title={document.title}
          closeLabel={t('documentDetails.sheetClose')}
          items={menuItems}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet === 'shareAs' || sheet === 'downloadAs' ? (
        <MenuSheet
          title={t(
            sheet === 'shareAs'
              ? 'documentDetails.format.shareTitle'
              : 'documentDetails.format.downloadTitle',
          )}
          closeLabel={t('documentDetails.sheetClose')}
          items={formatItems(sheet === 'shareAs' ? 'share' : 'download')}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet === 'rename' ? (
        <TextEntrySheet
          title={t('documentDetails.rename.title')}
          closeLabel={t('documentDetails.sheetClose')}
          inputLabel={t('documentDetails.rename.label')}
          placeholder={t('saveDocument.name.placeholder')}
          initialValue={document.title}
          maxLength={MAX_TITLE_LENGTH}
          submitLabel={t('documentDetails.rename.save')}
          onSubmit={rename}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet === 'tag' ? (
        <TextEntrySheet
          title={t('documentDetails.tag.title')}
          closeLabel={t('documentDetails.sheetClose')}
          inputLabel={t('saveDocument.tags.inputLabel')}
          placeholder={t('saveDocument.tags.placeholder')}
          maxLength={MAX_TAG_LENGTH}
          submitLabel={t('documentDetails.tag.save')}
          onSubmit={submitTag}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet === 'move' ? (
        <OptionSheet<MoveOption>
          title={t('documentDetails.moveTitle')}
          closeLabel={t('documentDetails.sheetClose')}
          options={[
            ...VAULT_CATEGORIES.map((category) => ({
              value: category,
              label: t(folderLabelKey(category)),
            })),
            { value: 'none' as const, label: t(folderLabelKey(null)) },
          ]}
          selected={document.category ?? 'none'}
          onSelect={(value) => {
            const category = value === 'none' ? null : value;
            if (category !== document.category) onMove(category);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {busy !== null ? (
        <View style={styles.busyOverlay} accessibilityViewIsModal>
          <View style={styles.busyCard}>
            <ActivityIndicator color={palette.brandBlue} size="large" />
            <Text style={styles.busyText} accessibilityLiveRegion="polite">
              {t(`documentDetails.working.${busy}`)}
            </Text>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function BackButton({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
    >
      <ChevronLeft color={palette.backIcon} size={32} strokeWidth={2.4} />
    </Pressable>
  );
}

function ActionTile({
  label,
  icon: Icon,
  colors,
  disabled = false,
  onPress,
}: {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly colors: { readonly circle: string; readonly icon: string };
  readonly disabled?: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.actionTile, pressed && styles.pressed]}
    >
      <View style={[styles.actionCircle, { backgroundColor: colors.circle }]}>
        <Icon color={colors.icon} size={26} strokeWidth={2.2} />
      </View>
      <Text numberOfLines={1} style={styles.actionLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

function DetailRow({
  icon: Icon,
  label,
  last = false,
  children,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly last?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Icon color={palette.rowIcon} size={22} strokeWidth={1.8} />
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValueWrap}>{children}</View>
    </View>
  );
}

const ROUND_BUTTON = 48;
const ACTION_CIRCLE = 56;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  pressed: {
    opacity: 0.6,
  },

  header: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: PAGE_PADDING,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 44,
    marginLeft: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    marginLeft: 6,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: palette.heading,
  },
  subtitle: {
    marginTop: 1,
    fontSize: 15,
    color: palette.subtitle,
  },
  roundButton: {
    width: ROUND_BUTTON,
    height: ROUND_BUTTON,
    borderRadius: ROUND_BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starButton: {
    backgroundColor: palette.starButton,
  },
  moreButton: {
    backgroundColor: palette.moreButton,
  },

  scroll: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    gap: 14,
    paddingHorizontal: PAGE_PADDING,
    paddingTop: 2,
    paddingBottom: 28,
  },

  status: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  statusText: {
    fontSize: 15.5,
    lineHeight: 22,
    textAlign: 'center',
    color: palette.textSecondary,
  },

  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: palette.actionBar,
  },
  actionDivider: {
    width: 1,
    height: 60,
    backgroundColor: palette.actionDivider,
  },
  actionTile: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  actionCircle: {
    width: ACTION_CIRCLE,
    height: ACTION_CIRCLE,
    borderRadius: ACTION_CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.actionLabel,
  },

  card: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    shadowColor: palette.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.heading,
  },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: palette.editPill,
  },
  editLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.brandBlue,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 48,
    paddingVertical: 10,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: palette.rowDivider,
  },
  rowLabel: {
    width: '30%',
    fontSize: 15,
    color: palette.rowLabel,
  },
  rowValueWrap: {
    flex: 1,
  },
  rowValue: {
    fontSize: 15,
    color: palette.rowValue,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  tag: {
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: palette.tag,
  },
  tagText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: palette.tagText,
  },
  addTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1.2,
    borderStyle: 'dashed',
    borderColor: palette.addTagBorder,
  },
  addTagText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: palette.addTagText,
  },

  secure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: palette.secureSurface,
  },
  secureBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.secureBadge,
  },
  secureText: {
    flex: 1,
    gap: 3,
  },
  secureTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.heading,
  },
  secureBody: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.textSecondary,
  },

  footer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
  },
  footerButton: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 26,
    borderWidth: 1.2,
  },
  moveButton: {
    borderColor: palette.moveBorder,
    backgroundColor: palette.moveSurface,
  },
  deleteButton: {
    borderColor: palette.deleteBorder,
    backgroundColor: palette.deleteSurface,
  },
  footerLabel: {
    fontSize: 17,
    fontWeight: '700',
  },
  moveLabel: {
    color: palette.brandBlue,
  },
  deleteLabel: {
    color: palette.deleteText,
  },

  busyOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.backdrop,
  },
  busyCard: {
    alignItems: 'center',
    gap: 12,
    minWidth: 200,
    paddingVertical: 22,
    paddingHorizontal: 24,
    borderRadius: 18,
    backgroundColor: palette.surface,
  },
  busyText: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.textPrimary,
  },
});
