import { useMemo, useState } from 'react';
import { CUSTOMER_FIELDS, type CustomerFieldSection } from '@assistigo/core';
import { send } from '../shared/send';
import { CheckIcon } from '../shared/Brand';

/**
 * "This box is…" — the operator teaches the engine one box (docs/FORM_ENGINE.md §6c).
 *
 * Saved as the centre's own override, so the page re-maps and fills with it straight away. The
 * share box starts ticked: what is shared is the portal's label and the field it means, never a
 * customer value, and one centre's two-minute fix is how the next centre gets the field filled.
 */

type Locale = 'en' | 'hi';

const COPY = {
  en: {
    title: 'What goes in this box?',
    search: 'Search fields',
    choose: 'Choose a customer field',
    share: 'Share with Bharatfill so other centres get this field too',
    shareHelp: 'Only the portal’s label is shared, never the customer’s details.',
    save: 'Save and map again',
    saving: 'Saving…',
    cancel: 'Cancel',
    failed: 'Could not save this mapping. Try again.',
  },
  hi: {
    title: 'इस बॉक्स में क्या भरना है?',
    search: 'फ़ील्ड खोजें',
    choose: 'ग्राहक की फ़ील्ड चुनें',
    share: 'Bharatfill के साथ साझा करें ताकि दूसरे केंद्रों को भी यह फ़ील्ड मिले',
    shareHelp: 'केवल पोर्टल का लेबल साझा होता है, ग्राहक की जानकारी कभी नहीं।',
    save: 'सहेजें और फिर से मैप करें',
    saving: 'सहेजा जा रहा है…',
    cancel: 'रद्द करें',
    failed: 'यह मैपिंग सहेजी नहीं जा सकी। फिर से कोशिश करें।',
  },
} as const satisfies Record<Locale, Record<string, string>>;

const SECTION_LABEL: Record<CustomerFieldSection, { en: string; hi: string }> = {
  personal: { en: 'Personal', hi: 'व्यक्तिगत' },
  family: { en: 'Family', hi: 'परिवार' },
  contact: { en: 'Contact', hi: 'संपर्क' },
  address: { en: 'Present address', hi: 'वर्तमान पता' },
  permanent_address: { en: 'Permanent address', hi: 'स्थायी पता' },
  identity: { en: 'Identity', hi: 'पहचान' },
  education: { en: 'Education', hi: 'शिक्षा' },
  certificates: { en: 'Certificates', hi: 'प्रमाण पत्र' },
  banking: { en: 'Bank', hi: 'बैंक' },
};

/** UI copy for the panel's other strings about teaching, kept beside the component's own. */
export const TEACH_COPY = {
  en: {
    unrecognised: (count: number) => `Not recognised (${count})`,
    unrecognisedHelp:
      'Bharatfill did not know these boxes. Tell it once and this centre fills them from now on.',
    teach: 'This box is…',
    wrong: 'Wrong field?',
    savedShared: 'Saved for this centre and shared for review.',
    savedLocal: 'Saved for this centre.',
    aiSuggested: 'Suggested by AI from the box’s label. Check it before filling.',
  },
  hi: {
    unrecognised: (count: number) => `पहचाने नहीं गए (${count})`,
    unrecognisedHelp:
      'Bharatfill इन बॉक्स को नहीं जानता था। एक बार बता दें, फिर यह केंद्र इन्हें हमेशा भरेगा।',
    teach: 'यह बॉक्स है…',
    wrong: 'गलत फ़ील्ड?',
    savedShared: 'इस केंद्र के लिए सहेजा गया और समीक्षा के लिए साझा किया गया।',
    savedLocal: 'इस केंद्र के लिए सहेजा गया।',
    aiSuggested: 'बॉक्स के लेबल से AI का सुझाव। भरने से पहले जाँच लें।',
  },
} as const;

export function teachLocale(locale: string | undefined | null): Locale {
  return locale === 'hi' ? 'hi' : 'en';
}

export function TeachFieldCard({
  signature,
  boxLabel,
  current,
  locale,
  onSaved,
  onCancel,
}: {
  signature: string;
  /** Portal text, rendered as text. */
  boxLabel: string;
  /** The field it is mapped to now, if any — preselected so "wrong field?" starts from it. */
  current: string | null;
  locale: Locale;
  onSaved: (shared: boolean) => void | Promise<void>;
  onCancel: () => void;
}) {
  const copy = COPY[locale];
  const [query, setQuery] = useState('');
  const [choice, setChoice] = useState<string>(current ?? '');
  const [share, setShare] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = CUSTOMER_FIELDS.filter(
      (field) =>
        !needle ||
        field.label.en.toLowerCase().includes(needle) ||
        field.label.hi.includes(needle) ||
        field.key.includes(needle),
    );
    const bySection = new Map<CustomerFieldSection, typeof matches>();
    for (const field of matches) {
      const list = bySection.get(field.section) ?? [];
      list.push(field);
      bySection.set(field.section, list);
    }
    return [...bySection.entries()];
  }, [query]);

  const save = async () => {
    if (!choice || saving) return;
    setSaving(true);
    setError(null);
    const response = await send<{ shared: boolean }>({
      type: 'TEACH_FIELD',
      signature,
      customerField: choice,
      share,
    });
    if (!response.ok) {
      setSaving(false);
      setError(copy.failed);
      return;
    }
    await onSaved(response.data.shared);
    setSaving(false);
  };

  return (
    <div className="card stack-sm" style={{ marginTop: 7 }}>
      <p className="small strong">{copy.title}</p>
      <p className="tiny muted truncate">{boxLabel}</p>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={copy.search}
        aria-label={copy.search}
      />
      <select
        value={choice}
        onChange={(event) => setChoice(event.target.value)}
        aria-label={copy.choose}
        size={Math.min(8, Math.max(4, groups.reduce((n, [, list]) => n + list.length + 1, 0)))}
      >
        <option value="" disabled>
          {copy.choose}
        </option>
        {groups.map(([section, fields]) => (
          <optgroup key={section} label={SECTION_LABEL[section][locale]}>
            {fields.map((field) => (
              <option key={field.key} value={field.key}>
                {field.label[locale]}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <label className="row tiny" style={{ gap: 6, alignItems: 'flex-start' }}>
        <input
          type="checkbox"
          checked={share}
          onChange={(event) => setShare(event.target.checked)}
          style={{ marginTop: 2 }}
        />
        <span>
          {copy.share}
          <span className="muted" style={{ display: 'block' }}>
            {copy.shareHelp}
          </span>
        </span>
      </label>

      {error ? (
        <p className="tiny" style={{ color: 'var(--danger)', margin: 0 }}>
          {error}
        </p>
      ) : null}

      <div className="row" style={{ gap: 6 }}>
        <button
          type="button"
          className="btn-primary"
          disabled={!choice || saving}
          onClick={() => void save()}
        >
          {saving ? (
            <>
              <span className="spinner" />
              {copy.saving}
            </>
          ) : (
            <>
              <CheckIcon size={14} />
              {copy.save}
            </>
          )}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={saving}>
          {copy.cancel}
        </button>
      </div>
    </div>
  );
}
