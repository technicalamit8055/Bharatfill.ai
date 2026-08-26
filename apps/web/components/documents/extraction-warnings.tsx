'use client';

import { getCustomerField } from '@assistigo/core';
import { Alert } from '@assistigo/ui';
import { localised } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/client';

export type ExtractionWarningLike = {
  code: string;
  messageKey: string;
  fieldKey?: string | null;
};

/**
 * Groups warnings by message + code so a document that trips the same warning many times (e.g.
 * a marksheet whose AI-proposed keys mostly miss the registry) shows one line with a count and
 * the actual field names, instead of one identical bullet per field.
 */
function groupWarnings(warnings: readonly ExtractionWarningLike[]) {
  const groups = new Map<string, { messageKey: string; code: string; fieldKeys: string[] }>();

  for (const warning of warnings) {
    const groupKey = `${warning.code}:${warning.messageKey}`;
    const group = groups.get(groupKey);
    if (group) {
      if (warning.fieldKey) group.fieldKeys.push(warning.fieldKey);
    } else {
      groups.set(groupKey, {
        messageKey: warning.messageKey,
        code: warning.code,
        fieldKeys: warning.fieldKey ? [warning.fieldKey] : [],
      });
    }
  }

  return Array.from(groups.values());
}

export function ExtractionWarningsList({ warnings }: { warnings: readonly ExtractionWarningLike[] }) {
  const { t, locale } = useI18n();

  const fieldDisplayName = (fieldKey: string): string => {
    const definition = getCustomerField(fieldKey);
    return definition ? localised(definition.label, locale) : fieldKey;
  };

  return (
    <ul className="list-inside list-disc space-y-1">
      {groupWarnings(warnings).map((group) => {
        const uniqueNames = Array.from(new Set(group.fieldKeys.map(fieldDisplayName)));
        return (
          <li key={group.code + group.messageKey}>
            {t(group.messageKey)}
            {group.fieldKeys.length > 1
              ? ` (${group.fieldKeys.length} fields: ${uniqueNames.join(', ')})`
              : uniqueNames.length === 1
                ? ` (${uniqueNames[0]})`
                : null}
          </li>
        );
      })}
    </ul>
  );
}

export function ExtractionWarningsAlert({
  warnings,
  title,
}: {
  warnings: readonly ExtractionWarningLike[];
  title: string;
}) {
  if (warnings.length === 0) return null;
  return (
    <Alert tone="warning" title={title}>
      <ExtractionWarningsList warnings={warnings} />
    </Alert>
  );
}
