'use client';

import { useEffect, useState } from 'react';
import { FileText, Grid3x3, IdCard, Languages } from 'lucide-react';
import { Alert, Button, Select, Slider, Switch } from '@assistigo/ui';
import {
  CARD_COPIES_MAX,
  CARD_COPIES_MIN,
  DEFAULT_TOOL_PREFERENCES,
  GRID_COUNT_OPTIONS,
  GRID_DPI_MAX,
  GRID_DPI_MIN,
  GRID_DPI_STEP,
  GRID_PHOTO_SIZE_CODES,
  PRINT_SHEETS,
  type GridPhotoSizeCode,
  type ToolPreferences,
} from '@assistigo/document-tools';
import { SettingsCard } from '@/components/settings/settings-card';
import { LocaleSwitcher } from '@/components/app-shell/locale-switcher';
import { readToolPreferences, writeToolPreferences } from '@/lib/document-tools/preferences';
import { useI18n } from '@/lib/i18n/client';

const PHOTO_SIZE_LABEL_KEYS: Record<GridPhotoSizeCode, string> = {
  passport: 'documentTools.grid.sizePassport',
  stamp: 'documentTools.grid.sizeStamp',
  square: 'documentTools.grid.sizeSquare',
};

/** `<select>` values are strings; "fill" stands for a `null` count. */
const FILL_VALUE = 'fill';

const CARD_COPY_OPTIONS = Array.from(
  { length: CARD_COPIES_MAX - CARD_COPIES_MIN + 1 },
  (_, index) => CARD_COPIES_MIN + index,
);

/**
 * The operator's own preferences. Language is a cookie the locale switcher already owns; the
 * document-tool values are kept in this browser by `lib/document-tools/preferences`, and each
 * tool reads them when it opens.
 */
export function PreferencesForm({ canUseDocumentTools }: { canUseDocumentTools: boolean }) {
  const { t, locale } = useI18n();

  const [preferences, setPreferences] = useState<ToolPreferences>(DEFAULT_TOOL_PREFERENCES);
  const [status, setStatus] = useState<'saved' | 'failed' | null>(null);

  // Read after mount: storage only exists in the browser, and the first paint must match the
  // server's, which can only know the defaults.
  useEffect(() => {
    setPreferences(readToolPreferences());
  }, []);

  function update(next: ToolPreferences) {
    setPreferences(next);
    setStatus(null);
  }

  function updateGrid(patch: Partial<ToolPreferences['grid']>) {
    update({ ...preferences, grid: { ...preferences.grid, ...patch } });
  }

  function save() {
    setStatus(writeToolPreferences(preferences) ? 'saved' : 'failed');
  }

  function reset() {
    update(DEFAULT_TOOL_PREFERENCES);
  }

  const { grid } = preferences;

  return (
    <div className="space-y-6">
      <SettingsCard
        icon={<Languages className="h-5 w-5" aria-hidden />}
        title={t('settings.language')}
      >
        <div className="flex flex-wrap items-center gap-4">
          <LocaleSwitcher />
          <p className="max-w-md text-xs text-slate-500">{t('settings.preferences.languageHint')}</p>
        </div>
      </SettingsCard>

      {canUseDocumentTools ? (
        <>
          <SettingsCard
            icon={<Grid3x3 className="h-5 w-5" aria-hidden />}
            title={t('settings.preferences.gridTitle')}
          >
            <div className="space-y-4">
              <p className="text-sm text-slate-600">{t('settings.preferences.gridHint')}</p>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label htmlFor="pref-grid-sheet" className="text-sm font-medium text-slate-800">
                    {t('documentTools.grid.paper')}
                  </label>
                  <Select
                    id="pref-grid-sheet"
                    value={grid.sheetCode}
                    onChange={(event) => updateGrid({ sheetCode: event.target.value })}
                  >
                    {PRINT_SHEETS.map((sheet) => (
                      <option key={sheet.code} value={sheet.code}>
                        {locale === 'hi' ? (sheet.labelHi ?? sheet.label) : sheet.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="pref-grid-size" className="text-sm font-medium text-slate-800">
                    {t('documentTools.grid.photoSize')}
                  </label>
                  <Select
                    id="pref-grid-size"
                    value={grid.photoSize}
                    onChange={(event) =>
                      updateGrid({ photoSize: event.target.value as GridPhotoSizeCode })
                    }
                  >
                    {GRID_PHOTO_SIZE_CODES.map((code) => (
                      <option key={code} value={code}>
                        {t(PHOTO_SIZE_LABEL_KEYS[code])}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="pref-grid-count" className="text-sm font-medium text-slate-800">
                    {t('documentTools.grid.howMany')}
                  </label>
                  <Select
                    id="pref-grid-count"
                    value={grid.count === null ? FILL_VALUE : String(grid.count)}
                    onChange={(event) =>
                      updateGrid({
                        count:
                          event.target.value === FILL_VALUE ? null : Number(event.target.value),
                      })
                    }
                  >
                    {GRID_COUNT_OPTIONS.map((option) => (
                      <option key={option} value={String(option)}>
                        {option}
                      </option>
                    ))}
                    <option value={FILL_VALUE}>{t('documentTools.grid.fill')}</option>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-slate-500">{t('settings.preferences.gridCountHint')}</p>

              <Slider
                label={t('documentTools.rule.dpi')}
                min={GRID_DPI_MIN}
                max={GRID_DPI_MAX}
                step={GRID_DPI_STEP}
                defaultValue={DEFAULT_TOOL_PREFERENCES.grid.dpi}
                value={grid.dpi}
                valueLabel={`${grid.dpi} dpi`}
                onValueChange={(dpi) => updateGrid({ dpi })}
              />

              <Switch
                label={t('documentTools.grid.cutMarks')}
                hint={t('documentTools.grid.cutMarksHint')}
                checked={grid.cutMarks}
                onCheckedChange={(cutMarks) => updateGrid({ cutMarks })}
              />
            </div>
          </SettingsCard>

          <SettingsCard
            icon={<IdCard className="h-5 w-5" aria-hidden />}
            title={t('settings.preferences.cardTitle')}
          >
            <div className="space-y-1.5 sm:max-w-xs">
              <label htmlFor="pref-card-copies" className="text-sm font-medium text-slate-800">
                {t('documentTools.card.copies')}
              </label>
              <Select
                id="pref-card-copies"
                value={String(preferences.card.copies)}
                onChange={(event) =>
                  update({ ...preferences, card: { copies: Number(event.target.value) } })
                }
              >
                {CARD_COPY_OPTIONS.map((option) => (
                  <option key={option} value={String(option)}>
                    {option}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-slate-500">{t('documentTools.card.copiesHint')}</p>
            </div>
          </SettingsCard>

          <SettingsCard
            icon={<FileText className="h-5 w-5" aria-hidden />}
            title={t('settings.preferences.pdfTitle')}
          >
            <Switch
              label={t('documentTools.pdf.allowRasterise')}
              hint={t('documentTools.pdf.rasteriseOffHint')}
              checked={preferences.pdf.allowRasterise}
              onCheckedChange={(allowRasterise) =>
                update({ ...preferences, pdf: { allowRasterise } })
              }
            />
          </SettingsCard>

          <Alert tone="info">{t('settings.preferences.storageNote')}</Alert>

          {status === 'saved' ? (
            <Alert tone="success">{t('settings.preferences.saved')}</Alert>
          ) : null}
          {status === 'failed' ? (
            <Alert tone="danger">{t('settings.preferences.saveFailed')}</Alert>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button onClick={save}>{t('common.save')}</Button>
            <Button variant="secondary" onClick={reset}>
              {t('settings.preferences.reset')}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
