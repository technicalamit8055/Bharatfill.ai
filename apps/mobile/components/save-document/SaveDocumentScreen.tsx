/**
 * Save Document — between scan review and the vault. The scan at the top (swipe through the
 * pages of a booklet) with Edit Scan to go back to cropping, then the details the vault files
 * it under: a name, the document type, an optional folder and tags, and an optional expiry
 * reminder.
 *
 * Picking a type names the document after it until the citizen types a name of their own, and
 * files it in that type's folder until they pick one. A preset scan (a passport photo, a signature)
 * arrives with its type already picked. The form lives here; the route
 * (`app/save-document.tsx`) owns the capture session, notification permission and saving.
 *
 * Light-only branded artwork like the Vault tab, so it reads from `saveDocumentPalette`.
 */

import type { DocumentType } from '@assistigo/core';
import { StatusBar } from 'expo-status-bar';
import type { LucideIcon } from 'lucide-react-native';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  Crop,
  FileText,
  FolderOpen,
  Plus,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { formatDateOfBirth, MONTH_KEYS } from '../../lib/profile/date-of-birth';
import type { SessionPage } from '../../lib/scan/capture-session';
import { categoryOf, VAULT_CATEGORIES, type VaultCategoryKey } from '../../lib/vault/categories';
import {
  addTag,
  categoryAfterTypeChange,
  documentTypeLabelKey,
  expiryYearOptions,
  MAX_EXPIRY_YEARS,
  reminderTime,
  removeTag,
  SAVE_DOCUMENT_TYPES,
  type SaveDocumentErrors,
  type ScanStatus,
  scanStatus,
  titleAfterTypeChange,
  validateSaveDocument,
} from '../../lib/vault/save-document';
import {
  type DocumentDetails,
  MAX_TAG_LENGTH,
  MAX_TAGS,
  MAX_TITLE_LENGTH,
} from '../../lib/vault/vault-index';
import { DateOfBirthSheet } from '../registration/DateOfBirthSheet';
import { OptionSheet, type SheetOption } from '../registration/OptionSheet';
import { VAULT_CATEGORY_ICONS } from '../vault/categoryIcons';
import { saveDocumentPalette as palette } from './palette';

const NO_FOLDER = 'none';
type FolderChoice = VaultCategoryKey | typeof NO_FOLDER;

type Sheet = 'type' | 'folder' | 'expiry' | null;

type TagNotice = 'duplicate' | 'full' | null;

export type SaveDocumentScreenProps = {
  readonly pages: readonly SessionPage[];
  readonly saving: boolean;
  /** The type to start on, for a scan made with a preset that knows what it is. */
  readonly initialType: DocumentType | null;
  readonly onBack: () => void;
  readonly onEditScan: () => void;
  /** Asks for permission to notify. Resolves to whether reminders can be scheduled. */
  readonly onEnableReminder: () => Promise<boolean>;
  /** The validated details; `expiresOn` is set when the reminder is on. */
  readonly onSave: (details: DocumentDetails) => void;
};

export function SaveDocumentScreen({
  pages,
  saving,
  initialType,
  onBack,
  onEditScan,
  onEnableReminder,
  onSave,
}: SaveDocumentScreenProps) {
  const { t } = useTranslation();
  const [now] = useState(() => new Date());

  const [title, setTitle] = useState(() =>
    initialType ? t(documentTypeLabelKey(initialType)) : '',
  );
  const [documentType, setDocumentType] = useState<DocumentType | null>(initialType);
  const [category, setCategory] = useState<VaultCategoryKey | null>(() =>
    initialType ? categoryOf(initialType) : null,
  );
  const [categoryChosen, setCategoryChosen] = useState(false);
  const [tags, setTags] = useState<readonly string[]>([]);
  const [expiresOn, setExpiresOn] = useState<string | null>(null);
  const [reminderOn, setReminderOn] = useState(false);
  const [askingPermission, setAskingPermission] = useState(false);

  const [sheet, setSheet] = useState<Sheet>(null);
  const [errors, setErrors] = useState<Readonly<SaveDocumentErrors>>({});
  const [pageIndex, setPageIndex] = useState(0);

  const clearError = (...keys: (keyof SaveDocumentErrors)[]) =>
    setErrors((current) => {
      const next = { ...current };
      for (const key of keys) delete next[key];
      return next;
    });

  const typeLabel = (type: DocumentType) => t(documentTypeLabelKey(type));
  const monthNames = useMemo(() => MONTH_KEYS.map((key) => t(`profileSetup.months.${key}`)), [t]);
  const expiryYears = useMemo(() => expiryYearOptions(now), [now]);

  const typeOptions = useMemo<SheetOption<DocumentType>[]>(
    () =>
      SAVE_DOCUMENT_TYPES.map((type) => ({ value: type, label: t(documentTypeLabelKey(type)) })),
    [t],
  );
  const folderOptions = useMemo<SheetOption<FolderChoice>[]>(
    () => [
      ...VAULT_CATEGORIES.map((key) => ({ value: key, label: t(`vault.categories.${key}`) })),
      { value: NO_FOLDER, label: t('saveDocument.folder.none') },
    ],
    [t],
  );

  const pickType = (next: DocumentType) => {
    setTitle((current) =>
      titleAfterTypeChange(current, documentType ? typeLabel(documentType) : null, typeLabel(next)),
    );
    setDocumentType(next);
    setCategory((current) => categoryAfterTypeChange(current, categoryChosen, next));
    clearError('documentType', 'title');
  };

  const pickFolder = (next: FolderChoice) => {
    setCategory(next === NO_FOLDER ? null : next);
    setCategoryChosen(true);
  };

  const toggleReminder = async (on: boolean) => {
    if (!on) {
      setReminderOn(false);
      setExpiresOn(null);
      clearError('expiresOn');
      return;
    }
    setAskingPermission(true);
    try {
      if (await onEnableReminder()) setSheet('expiry');
    } finally {
      setAskingPermission(false);
    }
  };

  const confirmExpiry = (isoDate: string) => {
    setExpiresOn(isoDate);
    setReminderOn(true);
    clearError('expiresOn');
  };

  const save = () => {
    if (saving) return;
    const result = validateSaveDocument(
      { title, documentType, category, tags, expiresOn: reminderOn ? expiresOn : null },
      new Date(),
    );
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSave(result.details);
  };

  const status = scanStatus(pages);
  const shownIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* ---- Header ---- */}
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('saveDocument.back')}
            hitSlop={8}
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <ChevronLeft color={palette.heading} size={30} strokeWidth={2.2} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={styles.title} numberOfLines={1}>
              {t('saveDocument.title')}
            </Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              {t('saveDocument.subtitle')}
            </Text>
          </View>
          {pages.length > 0 ? (
            <View
              style={styles.pageBadge}
              accessible
              accessibilityLabel={t('saveDocument.pageOf', {
                number: shownIndex + 1,
                total: pages.length,
              })}
            >
              <Text style={styles.pageBadgeText}>
                {shownIndex + 1}/{pages.length}
              </Text>
            </View>
          ) : null}
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ---- Scan and status ---- */}
            <View style={styles.scanRow}>
              <ScanPreview pages={pages} onPageChange={setPageIndex} onEditScan={onEditScan} />
              <StatusCard status={status} />
            </View>

            {/* ---- Name ---- */}
            <FieldLabel label={t('saveDocument.name.label')} />
            <NameField
              value={title}
              invalid={errors.title !== undefined}
              onChange={(next) => {
                setTitle(next);
                if (errors.title) clearError('title');
              }}
            />
            {errors.title ? <FieldError message={t('saveDocument.errors.titleRequired')} /> : null}

            {/* ---- Type ---- */}
            <FieldLabel label={t('saveDocument.type.label')} />
            <SelectField
              icon={documentType ? typeIcon(documentType) : FileText}
              iconBadge
              value={documentType ? typeLabel(documentType) : null}
              placeholder={t('saveDocument.type.placeholder')}
              accessibilityLabel={t('saveDocument.type.label')}
              invalid={errors.documentType !== undefined}
              onPress={() => setSheet('type')}
            />
            {errors.documentType ? (
              <FieldError message={t('saveDocument.errors.typeRequired')} />
            ) : null}

            {/* ---- Folder ---- */}
            <FieldLabel label={t('saveDocument.folder.label')} optional />
            <SelectField
              icon={FolderOpen}
              value={category ? t(`vault.categories.${category}`) : null}
              placeholder={t('saveDocument.folder.placeholder')}
              accessibilityLabel={t('saveDocument.folder.label')}
              onPress={() => setSheet('folder')}
            />

            {/* ---- Tags ---- */}
            <FieldLabel label={t('saveDocument.tags.label')} optional />
            <TagEditor tags={tags} onChange={setTags} />

            {/* ---- Security note ---- */}
            <View style={styles.secureCard}>
              <View style={styles.secureBadge}>
                <ShieldCheck
                  color={palette.onBrand}
                  fill={palette.secureIcon}
                  size={30}
                  strokeWidth={2}
                />
              </View>
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>{t('saveDocument.secure.title')}</Text>
                <Text style={styles.cardBody}>{t('saveDocument.secure.body')}</Text>
              </View>
            </View>

            {/* ---- Reminder ---- */}
            <View style={styles.reminderCard}>
              <View style={styles.reminderRow}>
                <View style={styles.reminderBadge}>
                  <Bell color={palette.reminderIcon} size={24} strokeWidth={2} />
                </View>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>
                    {t('saveDocument.reminder.title')}
                    <Text style={styles.optional}> {t('saveDocument.optional')}</Text>
                  </Text>
                  <Text style={styles.cardBody}>
                    {reminderOn && expiresOn
                      ? t('saveDocument.reminder.expiresOn', {
                          date: formatDateOfBirth(expiresOn, monthNames) ?? expiresOn,
                        })
                      : t('saveDocument.reminder.body')}
                  </Text>
                </View>
                {askingPermission ? (
                  <ActivityIndicator color={palette.brandBlue} />
                ) : (
                  <Switch
                    accessibilityLabel={t('saveDocument.reminder.title')}
                    value={reminderOn}
                    onValueChange={(on) => void toggleReminder(on)}
                    trackColor={{ false: palette.switchTrackOff, true: palette.switchTrackOn }}
                    thumbColor={reminderOn ? palette.switchThumbOn : palette.switchThumbOff}
                    ios_backgroundColor={palette.switchTrackOff}
                  />
                )}
              </View>
              {reminderOn && expiresOn ? (
                <View style={styles.reminderFooter}>
                  <Text style={styles.reminderHint}>
                    {t('saveDocument.reminder.when', {
                      date: formatReminderDate(reminderTime(expiresOn, now), monthNames),
                    })}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('saveDocument.reminder.change')}
                    hitSlop={8}
                    onPress={() => setSheet('expiry')}
                  >
                    <Text style={styles.link}>{t('saveDocument.reminder.change')}</Text>
                  </Pressable>
                </View>
              ) : null}
              {errors.expiresOn ? (
                <FieldError
                  message={t(`saveDocument.errors.expiry.${errors.expiresOn}`, {
                    years: MAX_EXPIRY_YEARS,
                  })}
                />
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* ---- Save ---- */}
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('saveDocument.save')}
            accessibilityState={{ disabled: saving, busy: saving }}
            disabled={saving}
            onPress={save}
            style={({ pressed }) => [
              styles.saveButton,
              saving && styles.saveButtonDisabled,
              pressed && styles.saveButtonPressed,
            ]}
          >
            {saving ? (
              <>
                <ActivityIndicator color={palette.onBrand} />
                <Text style={styles.saveLabel}>{t('saveDocument.saving')}</Text>
              </>
            ) : (
              <>
                <Text style={styles.saveLabel}>{t('saveDocument.save')}</Text>
                <ArrowRight color={palette.onBrand} size={24} strokeWidth={2.2} />
              </>
            )}
          </Pressable>
        </View>
      </SafeAreaView>

      {sheet === 'type' ? (
        <OptionSheet
          title={t('saveDocument.type.sheetTitle')}
          closeLabel={t('saveDocument.sheetClose')}
          options={typeOptions}
          selected={documentType}
          onSelect={pickType}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'folder' ? (
        <OptionSheet
          title={t('saveDocument.folder.sheetTitle')}
          closeLabel={t('saveDocument.sheetClose')}
          options={folderOptions}
          selected={category ?? (categoryChosen ? NO_FOLDER : null)}
          onSelect={pickFolder}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'expiry' ? (
        <DateOfBirthSheet
          title={t('saveDocument.reminder.sheetTitle')}
          years={expiryYears}
          value={expiresOn}
          onConfirm={confirmExpiry}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </View>
  );
}

/** "12 Aug 2030" for the reminder's day; its 9:00 time is not worth the space. */
function formatReminderDate(at: Date | null, monthNames: readonly string[]): string {
  if (!at) return '';
  return `${at.getDate()} ${monthNames[at.getMonth()] ?? at.getMonth() + 1} ${at.getFullYear()}`;
}

function typeIcon(type: DocumentType): LucideIcon {
  const category = categoryOf(type);
  return category ? VAULT_CATEGORY_ICONS[category] : FileText;
}

// ---- Scan preview ---------------------------------------------------------------------------

function ScanPreview({
  pages,
  onPageChange,
  onEditScan,
}: {
  readonly pages: readonly SessionPage[];
  readonly onPageChange: (index: number) => void;
  readonly onEditScan: () => void;
}) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  const lastIndex = useRef(0);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width === 0) return;
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    if (index !== lastIndex.current) {
      lastIndex.current = index;
      onPageChange(index);
    }
  };

  return (
    <View style={styles.preview} onLayout={onLayout}>
      {width > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
        >
          {pages.map((page, index) => (
            <View key={page.id} style={[styles.previewPage, { width }]}>
              {page.rendered ? (
                <Image
                  source={{ uri: page.rendered.uri }}
                  resizeMode="contain"
                  accessibilityLabel={t('saveDocument.previewLabel', {
                    number: index + 1,
                    total: pages.length,
                  })}
                  accessibilityIgnoresInvertColors
                  style={styles.previewImage}
                />
              ) : (
                <ActivityIndicator color={palette.brandBlue} />
              )}
            </View>
          ))}
        </ScrollView>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('saveDocument.editScan')}
        onPress={onEditScan}
        style={({ pressed }) => [styles.editPill, pressed && styles.pressed]}
      >
        <Crop color={palette.onEditPill} size={18} strokeWidth={2.2} />
        <Text style={styles.editPillLabel}>{t('saveDocument.editScan')}</Text>
      </Pressable>
    </View>
  );
}

// ---- Status card ----------------------------------------------------------------------------

const STATUS_ICONS: Record<Exclude<ScanStatus, 'processing'>, LucideIcon> = {
  clear: Check,
  uncropped: AlertTriangle,
  failed: XCircle,
};

function StatusCard({ status }: { readonly status: ScanStatus }) {
  const { t } = useTranslation();
  const tone = palette.status[status];
  const Icon = status === 'processing' ? null : STATUS_ICONS[status];

  return (
    <View
      style={[styles.statusCard, { backgroundColor: tone.surface }]}
      accessible
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.statusBadge, { backgroundColor: tone.icon }]}>
        {Icon ? (
          <Icon color={palette.onBrand} size={26} strokeWidth={3} />
        ) : (
          <ActivityIndicator color={palette.onBrand} />
        )}
      </View>
      <Text style={[styles.statusTitle, { color: tone.title }]}>
        {t(`saveDocument.status.${status}.title`)}
      </Text>
      <Text style={[styles.statusBody, { color: tone.body }]}>
        {t(`saveDocument.status.${status}.body`)}
      </Text>
    </View>
  );
}

// ---- Fields ---------------------------------------------------------------------------------

function FieldLabel({
  label,
  optional = false,
}: {
  readonly label: string;
  readonly optional?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Text style={styles.fieldLabel}>
      {label}
      {optional ? <Text style={styles.optional}> {t('saveDocument.optional')}</Text> : null}
    </Text>
  );
}

function FieldError({ message }: { readonly message: string }) {
  return (
    <Text style={styles.fieldError} accessibilityLiveRegion="polite">
      {message}
    </Text>
  );
}

function NameField({
  value,
  invalid,
  onChange,
}: {
  readonly value: string;
  readonly invalid: boolean;
  readonly onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.field, focused && styles.fieldFocused, invalid && styles.fieldInvalid]}>
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={t('saveDocument.name.placeholder')}
        placeholderTextColor={palette.placeholder}
        accessibilityLabel={t('saveDocument.name.label')}
        maxLength={MAX_TITLE_LENGTH}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        style={styles.input}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('saveDocument.name.clear')}
          hitSlop={10}
          onPress={() => onChange('')}
          style={styles.clearButton}
        >
          <X color={palette.onClearButton} size={14} strokeWidth={3} />
        </Pressable>
      ) : null}
    </View>
  );
}

function SelectField({
  icon: Icon,
  iconBadge = false,
  value,
  placeholder,
  accessibilityLabel,
  invalid = false,
  onPress,
}: {
  readonly icon: LucideIcon;
  readonly iconBadge?: boolean;
  readonly value: string | null;
  readonly placeholder: string;
  readonly accessibilityLabel: string;
  readonly invalid?: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel}: ${value ?? placeholder}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.field,
        invalid && styles.fieldInvalid,
        pressed && styles.pressed,
      ]}
    >
      {iconBadge ? (
        <View style={styles.typeBadge}>
          <Icon color={palette.onTypeBadge} size={22} strokeWidth={2} />
        </View>
      ) : (
        <Icon color={palette.textSecondary} size={26} strokeWidth={1.8} />
      )}
      <Text
        style={[styles.selectValue, value === null && styles.selectPlaceholder]}
        numberOfLines={1}
      >
        {value ?? placeholder}
      </Text>
      <ChevronDown color={palette.textPrimary} size={22} strokeWidth={2} />
    </Pressable>
  );
}

// ---- Tags -----------------------------------------------------------------------------------

function TagEditor({
  tags,
  onChange,
}: {
  readonly tags: readonly string[];
  readonly onChange: (tags: readonly string[]) => void;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<TagNotice>(null);
  /** Submit and blur both commit; the input unmounting blurs it once more. Only one counts. */
  const inputOpen = useRef(false);

  const open = () => {
    inputOpen.current = true;
    setAdding(true);
  };

  const commit = () => {
    if (!inputOpen.current) return;
    const result = addTag(tags, draft);
    if (result.kind === 'added') {
      onChange(result.tags);
      setNotice(null);
    } else if (result.kind !== 'empty') {
      setNotice(result.kind);
      return;
    }
    inputOpen.current = false;
    setDraft('');
    setAdding(false);
  };

  /** Leaving the field with a tag that cannot be added drops it rather than trapping focus. */
  const blur = () => {
    if (!inputOpen.current) return;
    const result = addTag(tags, draft);
    if (result.kind === 'added') onChange(result.tags);
    inputOpen.current = false;
    setDraft('');
    setAdding(false);
  };

  return (
    <View>
      <View style={styles.tags}>
        {tags.map((tag) => (
          <View key={tag} style={styles.tag}>
            <Text style={styles.tagText} numberOfLines={1}>
              {tag}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('saveDocument.tags.remove', { tag })}
              hitSlop={10}
              onPress={() => {
                onChange(removeTag(tags, tag));
                setNotice(null);
              }}
            >
              <X color={palette.tagText} size={18} strokeWidth={2.2} />
            </Pressable>
          </View>
        ))}

        {adding ? (
          <View style={[styles.tag, styles.tagInputWrap]}>
            <TextInput
              autoFocus
              value={draft}
              onChangeText={(next) => {
                setDraft(next);
                setNotice(null);
              }}
              onSubmitEditing={commit}
              onBlur={blur}
              placeholder={t('saveDocument.tags.placeholder')}
              placeholderTextColor={palette.placeholder}
              accessibilityLabel={t('saveDocument.tags.inputLabel')}
              maxLength={MAX_TAG_LENGTH + 1}
              autoCorrect={false}
              returnKeyType="done"
              blurOnSubmit={false}
              style={styles.tagInput}
            />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('saveDocument.tags.add')}
            onPress={open}
            style={({ pressed }) => [styles.addTag, pressed && styles.pressed]}
          >
            <Plus color={palette.textPrimary} size={18} strokeWidth={2.2} />
            <Text style={styles.addTagText}>{t('saveDocument.tags.add')}</Text>
          </Pressable>
        )}
      </View>
      {notice ? <FieldError message={t(`saveDocument.tags.${notice}`, { max: MAX_TAGS })} /> : null}
    </View>
  );
}

// ---- Styles ---------------------------------------------------------------------------------

const RADIUS = 14;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: palette.heading,
  },
  subtitle: {
    fontSize: 14,
    color: palette.textSecondary,
  },
  pageBadge: {
    minWidth: 56,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.badge,
  },
  pageBadgeText: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.badgeText,
  },

  content: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },

  scanRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  preview: {
    flex: 1.65,
    aspectRatio: 1.2,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: palette.previewBorder,
    backgroundColor: palette.previewFrame,
    overflow: 'hidden',
  },
  previewPage: {
    height: '100%',
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  editPill: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.editPill,
  },
  editPillLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.onEditPill,
  },

  statusCard: {
    flex: 1,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 18,
    borderRadius: RADIUS,
    alignItems: 'center',
    gap: 6,
  },
  statusBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  statusBody: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },

  fieldLabel: {
    marginTop: 20,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: '700',
    color: palette.heading,
  },
  optional: {
    fontWeight: '400',
    color: palette.textMuted,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: palette.fieldBorder,
    backgroundColor: palette.field,
  },
  fieldFocused: {
    borderColor: palette.fieldBorderFocused,
  },
  fieldInvalid: {
    borderColor: palette.errorBorder,
  },
  fieldError: {
    marginTop: 6,
    fontSize: 13,
    color: palette.error,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 17,
    color: palette.textPrimary,
  },
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.clearButton,
  },
  typeBadge: {
    width: 40,
    height: 32,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.typeBadge,
  },
  selectValue: {
    flex: 1,
    fontSize: 17,
    color: palette.textPrimary,
  },
  selectPlaceholder: {
    color: palette.placeholder,
  },

  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    maxWidth: '100%',
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: palette.tag,
  },
  tagText: {
    flexShrink: 1,
    fontSize: 16,
    color: palette.tagText,
  },
  tagInputWrap: {
    minWidth: 140,
    paddingHorizontal: 14,
  },
  tagInput: {
    minWidth: 110,
    paddingVertical: 0,
    fontSize: 16,
    color: palette.tagText,
  },
  addTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    borderWidth: 1.2,
    borderStyle: 'dashed',
    borderColor: palette.addTagBorder,
  },
  addTagText: {
    fontSize: 16,
    color: palette.textPrimary,
  },

  secureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 24,
    padding: 18,
    borderRadius: 18,
    backgroundColor: palette.secureSurface,
  },
  secureBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.secureBadge,
  },
  cardCopy: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.heading,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.textSecondary,
  },

  reminderCard: {
    marginTop: 14,
    padding: 18,
    borderRadius: 18,
    backgroundColor: palette.reminderSurface,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  reminderBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.reminderBadge,
  },
  reminderFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
    paddingLeft: 68,
  },
  reminderHint: {
    flex: 1,
    fontSize: 13,
    color: palette.textMuted,
  },
  link: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.brandBlue,
  },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: palette.background,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: 58,
    borderRadius: 29,
    backgroundColor: palette.brandBlue,
    shadowColor: palette.brandBlue,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  saveButtonPressed: {
    backgroundColor: palette.brandBluePressed,
  },
  saveButtonDisabled: {
    backgroundColor: palette.brandBlueDisabled,
  },
  saveLabel: {
    fontSize: 19,
    fontWeight: '700',
    color: palette.onBrand,
  },
});
