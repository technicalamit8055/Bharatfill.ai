'use client';

import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Field, Select, TextField, Textarea } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';
import { buildEditDecisions, type EditableFieldMeta } from '@/lib/customers/edit-decisions';
import {
  AddressSectionIcon,
  BankingSectionIcon,
  CertificatesSectionIcon,
  ContactSectionIcon,
  EditIcon,
  EducationSectionIcon,
  FamilySectionIcon,
  IdentitySectionIcon,
  PermanentAddressSectionIcon,
  PersonalSectionIcon,
  PlusIcon,
} from '../icons';
import { CustomerProfileField } from './customer-profile-field';
import {
  DetailCard,
  OUTLINE_BUTTON,
  PROFILE_ANCHOR,
  PROFILE_EDIT_PARAM,
  type DetailTone,
} from './detail-card';

const SECTION_LOOK: Record<
  string,
  { icon: ComponentType<{ className?: string }>; tone: DetailTone }
> = {
  personal: { icon: PersonalSectionIcon, tone: 'brand' },
  family: { icon: FamilySectionIcon, tone: 'violet' },
  contact: { icon: ContactSectionIcon, tone: 'sky' },
  address: { icon: AddressSectionIcon, tone: 'emerald' },
  permanent_address: { icon: PermanentAddressSectionIcon, tone: 'emerald' },
  identity: { icon: IdentitySectionIcon, tone: 'rose' },
  education: { icon: EducationSectionIcon, tone: 'violet' },
  certificates: { icon: CertificatesSectionIcon, tone: 'amber' },
  banking: { icon: BankingSectionIcon, tone: 'slate' },
};

const DEFAULT_LOOK = { icon: PersonalSectionIcon, tone: 'slate' as const };

/** Values an operator types into another form verbatim, so they get a copy button. */
const COPYABLE_KEYS = new Set(['customer.full_name']);

/** `focusSection` marker for "scroll to the top of the form" rather than one section. */
const PROFILE_FORM_TOP = '__top__';

function sectionAnchor(section: string): string {
  return `profile-${section.replace(/_/g, '-')}`;
}

export type ProfileFieldOption = { value: string; label: string };

export type ProfileField = {
  key: string;
  label: string;
  dataType:
    | 'name'
    | 'text'
    | 'longtext'
    | 'date'
    | 'year'
    | 'mobile'
    | 'email'
    | 'pincode'
    | 'number'
    | 'enum'
    | 'boolean';
  value: string | null;
  sensitive: boolean;
  encrypted: boolean;
  hasEncryptedValue: boolean;
  maxLength: number | null;
  options: ProfileFieldOption[] | null;
};

export type ProfileSection = {
  section: string;
  title: string;
  fields: ProfileField[];
};

/**
 * Renders the profile field sections shown on a customer's page (§11), and owns the toggle
 * between that read-only view and a form that edits every field in place.
 *
 * Saving reuses `POST /api/customers/:id/values` — the same write path the paste-text review
 * flow already uses — rather than a second, hand-rolled mapping from field key to storage
 * location. That path already knows how to merge into a JSON column without clobbering
 * sibling fields, encrypt the fields that must never be plaintext, and keep a full Aadhaar
 * number from surviving under any key (docs/AI_PIPELINE.md §9).
 */
export function CustomerProfileSections({
  customerId,
  customerCode,
  sections,
  canUpdate,
  canReveal,
}: {
  customerId: string;
  /** Shown read-only in the personal card; it is an identifier, not a profile field. */
  customerCode: string;
  sections: ProfileSection[];
  canUpdate: boolean;
  canReveal: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // `?edit=1` opens the form at the top; `?edit=<section>` opens it scrolled to that section
  // (the next-steps checklist links straight to the section that is missing).
  const editParam = canUpdate ? searchParams.get(PROFILE_EDIT_PARAM) : null;
  const [mode, setMode] = useState<'view' | 'edit'>(editParam ? 'edit' : 'view');
  const [focusSection, setFocusSection] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The header's "Edit customer" button lands on this same page, so this instance survives the
  // navigation — follow the flag rather than relying on the initial state alone.
  useEffect(() => {
    if (!editParam) return;
    setMode('edit');
    setFocusSection(editParam === '1' ? PROFILE_FORM_TOP : editParam);
  }, [editParam]);

  // Scroll the section whose "Edit details" was pressed back into view once its form renders:
  // the form is taller than the read-only card, so the operator would otherwise lose their place.
  useEffect(() => {
    if (mode !== 'edit' || !focusSection) return;
    const id = focusSection === PROFILE_FORM_TOP ? PROFILE_ANCHOR : sectionAnchor(focusSection);
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    setFocusSection(null);
  }, [mode, focusSection]);

  function startEdit(section: string) {
    setFocusSection(section);
    setMode('edit');
  }

  function leaveEdit() {
    setMode('view');
    setError(null);
    if (searchParams.has(PROFILE_EDIT_PARAM)) {
      // Drop only the edit flag: the operator stays on the Profile tab they were working in.
      const params = new URLSearchParams(searchParams.toString());
      params.delete(PROFILE_EDIT_PARAM);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }
  }

  const viewSections = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          fields: section.fields.filter((field) => field.value !== null || field.hasEncryptedValue),
        }))
        .filter((section) => section.fields.length > 0),
    [sections],
  );

  // Sections with nothing in them yet. Hiding them silently left operators unsure whether a
  // detail was missing or just somewhere else on the page, so they are listed as one-tap adds.
  const emptySections = useMemo(
    () =>
      sections.filter(
        (section) =>
          !section.fields.some((field) => field.value !== null || field.hasEncryptedValue),
      ),
    [sections],
  );

  const allFields = useMemo<EditableFieldMeta[]>(
    () =>
      sections.flatMap((section) =>
        section.fields.map((field) => ({
          key: field.key,
          value: field.value,
          encrypted: field.encrypted,
        })),
      ),
    [sections],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formValues = new Map<string, string>();
    for (const [key, value] of new FormData(event.currentTarget).entries()) {
      if (typeof value === 'string') formValues.set(key, value);
    }

    const decisions = buildEditDecisions(allFields, formValues);
    if (decisions.length === 0) {
      leaveEdit();
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/customers/${customerId}/values`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decisions }),
      });

      const json = (await response.json()) as
        { data: { acceptedCount: number } } | { error: { messageKey: string } };

      if (!response.ok || 'error' in json) {
        setError('error' in json ? json.error.messageKey : 'errors.internal');
        return;
      }

      leaveEdit();
      router.refresh();
    } catch {
      setError('errors.internal');
    } finally {
      setPending(false);
    }
  }

  if (viewSections.length === 0 && !canUpdate) return null;

  const editButton = (section: string) =>
    canUpdate ? (
      <button type="button" onClick={() => startEdit(section)} className={OUTLINE_BUTTON}>
        <EditIcon className="h-3.5 w-3.5" />
        {t('customers.editDetails')}
      </button>
    ) : undefined;

  return (
    <div id={PROFILE_ANCHOR} className="scroll-mt-6 space-y-4">
      {mode === 'view' && canUpdate && emptySections.length > 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              {t('customers.profile.missingTitle', { count: emptySections.length })}
            </h2>
            <p className="text-xs text-slate-500">{t('customers.profile.missingHelp')}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {emptySections.map((section) => {
              const look = SECTION_LOOK[section.section] ?? DEFAULT_LOOK;
              const Icon = look.icon;
              return (
                <button
                  key={section.section}
                  type="button"
                  onClick={() => startEdit(section.section)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {section.title}
                  <PlusIcon className="h-3 w-3" />
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {mode === 'view' ? (
        viewSections.map((section) => {
          const look = SECTION_LOOK[section.section] ?? DEFAULT_LOOK;
          return (
            <DetailCard
              key={section.section}
              id={sectionAnchor(section.section)}
              icon={look.icon}
              tone={look.tone}
              title={section.title}
              actions={editButton(section.section)}
            >
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                {section.fields.flatMap((field) => {
                  const entry = (
                    <CustomerProfileField
                      key={field.key}
                      customerId={customerId}
                      fieldKey={field.key}
                      label={field.label}
                      value={field.value}
                      hasEncryptedValue={field.hasEncryptedValue}
                      sensitive={field.sensitive}
                      canReveal={canReveal}
                      copyable={COPYABLE_KEYS.has(field.key)}
                      className={field.dataType === 'longtext' ? 'sm:col-span-2' : undefined}
                    />
                  );
                  // The customer code reads as part of who this person is, so it sits right
                  // after their name rather than in a card of its own.
                  return field.key === 'customer.full_name'
                    ? [
                        entry,
                        <CustomerProfileField
                          key="customer-code"
                          customerId={customerId}
                          fieldKey={null}
                          label={t('customers.profile.customerCode')}
                          value={customerCode}
                          hasEncryptedValue={false}
                          sensitive={false}
                          canReveal={false}
                          copyable
                        />,
                      ]
                    : [entry];
                })}
              </dl>
            </DetailCard>
          );
        })
      ) : (
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          <Alert tone="info">{t('customers.editHelp')}</Alert>
          {error ? <Alert tone="danger">{t(error)}</Alert> : null}

          {sections.map((section) => {
            const look = SECTION_LOOK[section.section] ?? DEFAULT_LOOK;
            return (
              <DetailCard
                key={section.section}
                id={sectionAnchor(section.section)}
                icon={look.icon}
                tone={look.tone}
                title={section.title}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {section.fields.map((field) => (
                    <ProfileFieldInput key={field.key} field={field} />
                  ))}
                </div>
              </DetailCard>
            );
          })}

          {/* Pinned to the bottom of the viewport: nine sections of inputs is a long
                  scroll, and the save button should not be at the end of it. */}
          <div className="sticky bottom-4 z-10 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 px-5 py-3 shadow-lg backdrop-blur">
            <Button type="submit" loading={pending}>
              {t('common.save')}
            </Button>
            <Button type="button" variant="ghost" onClick={leaveEdit} disabled={pending}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function ProfileFieldInput({ field }: { field: ProfileField }): ReactNode {
  const t = useTranslations();

  const placeholder = field.encrypted
    ? field.hasEncryptedValue
      ? t('customers.editKeepEncrypted')
      : t('customers.editSetEncrypted')
    : undefined;
  const defaultValue = field.encrypted ? '' : (field.value ?? '');
  const sensitiveLabel = t('common.masked');

  if (field.dataType === 'enum') {
    return (
      <Field
        label={field.label}
        htmlFor={field.key}
        sensitive={field.sensitive}
        sensitiveLabel={sensitiveLabel}
      >
        <Select id={field.key} name={field.key} defaultValue={defaultValue}>
          <option value="">{t('common.optional')}</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  if (field.dataType === 'boolean') {
    return (
      <Field
        label={field.label}
        htmlFor={field.key}
        sensitive={field.sensitive}
        sensitiveLabel={sensitiveLabel}
      >
        <Select id={field.key} name={field.key} defaultValue={defaultValue}>
          <option value="">{t('common.optional')}</option>
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </Select>
      </Field>
    );
  }

  if (field.dataType === 'longtext') {
    return (
      <Field
        label={field.label}
        htmlFor={field.key}
        sensitive={field.sensitive}
        sensitiveLabel={sensitiveLabel}
        className="sm:col-span-2 lg:col-span-3"
      >
        <Textarea
          id={field.key}
          name={field.key}
          defaultValue={defaultValue}
          placeholder={placeholder}
        />
      </Field>
    );
  }

  const inputType =
    field.dataType === 'date'
      ? 'date'
      : field.dataType === 'email'
        ? 'email'
        : field.dataType === 'mobile'
          ? 'tel'
          : field.dataType === 'number'
            ? 'number'
            : 'text';

  const maxLength =
    field.dataType === 'pincode'
      ? 6
      : field.dataType === 'year'
        ? 4
        : (field.maxLength ?? undefined);

  return (
    <TextField
      label={field.label}
      name={field.key}
      type={inputType}
      defaultValue={defaultValue}
      placeholder={placeholder}
      maxLength={maxLength}
      sensitive={field.sensitive}
      sensitiveLabel={sensitiveLabel}
    />
  );
}
