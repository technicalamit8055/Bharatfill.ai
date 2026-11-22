'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Link2, Search, SearchX, X } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/client';
import {
  CHANGELOG_AREAS,
  CHANGELOG_TAGS,
  countItems,
  facetCounts,
  filterChangelog,
  highlightParts,
  isFilterActive,
  serializeChangelogFilter,
  type ChangelogArea,
  type ChangelogFilter,
  type ChangelogReleaseView,
  type ChangelogTag,
} from '@/lib/landing/changelog';

const PREFIX = 'landing.changelog';

/** Releases open on first load; the rest start folded so the page scans quickly. */
const INITIALLY_OPEN = 3;

/** The URL follows typing, but not every keystroke (browsers throttle history writes). */
const URL_DEBOUNCE_MS = 300;

const TAG_STYLE: Record<ChangelogTag, string> = {
  new: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  improved: 'bg-blue-50 text-[#0055EE] ring-blue-200',
  fixed: 'bg-amber-50 text-amber-800 ring-amber-200',
};

const TAG_DOT: Record<ChangelogTag, string> = {
  new: 'bg-emerald-500',
  improved: 'bg-[#0066FF]',
  fixed: 'bg-amber-500',
};

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066FF] focus-visible:ring-offset-2';

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((part, index) =>
        part.match ? (
          <mark key={index} className="rounded-sm bg-amber-100 px-0.5 text-inherit">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

function Chip({
  pressed,
  count,
  onClick,
  children,
}: {
  pressed: boolean;
  count?: number;
  onClick: () => void;
  children: ReactNode;
}) {
  // A chip that would empty the list is dimmed, but stays clickable once picked so it can be undone.
  const inert = !pressed && count === 0;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={inert}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors ${FOCUS_RING} ${
        pressed
          ? 'bg-slate-900 text-white ring-slate-900'
          : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 hover:ring-slate-300'
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
      {count !== undefined && (
        <span className={`tabular-nums text-xs ${pressed ? 'text-slate-300' : 'text-slate-400'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * The interactive release list: search with highlighting, area and type chips with live
 * counts, foldable releases, copy-a-link per release, and a URL that mirrors the filters so a
 * filtered view can be shared. All copy arrives resolved from the server (`buildChangelogView`).
 */
export function ChangelogExplorer({
  releases,
  initialFilter,
}: {
  releases: readonly ChangelogReleaseView[];
  initialFilter: ChangelogFilter;
}) {
  const t = useTranslations();
  const [query, setQuery] = useState(initialFilter.query);
  const [areas, setAreas] = useState<ChangelogArea[]>([...initialFilter.areas]);
  const [tags, setTags] = useState<ChangelogTag[]>([...initialFilter.tags]);
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(releases.slice(0, INITIALLY_OPEN).map(({ key }) => key)),
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const copiedTimer = useRef<number | undefined>(undefined);

  const filter = useMemo<ChangelogFilter>(() => ({ query, areas, tags }), [query, areas, tags]);
  const active = isFilterActive(filter);
  const visible = useMemo(() => filterChangelog(releases, filter), [releases, filter]);
  const counts = useMemo(() => facetCounts(releases, filter), [releases, filter]);
  const total = useMemo(() => countItems(releases), [releases]);
  const shown = countItems(visible);
  const allOpen = releases.every(({ key }) => open.has(key));

  // Mirror the filters into the URL, keeping any #release anchor.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const search = serializeChangelogFilter(filter);
      const { pathname, hash } = window.location;
      const next = `${pathname}${search ? `?${search}` : ''}${hash}`;
      if (next !== `${pathname}${window.location.search}${hash}`) {
        window.history.replaceState(window.history.state, '', next);
      }
    }, URL_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [filter]);

  // A #release link unfolds that release, on load and whenever the hash changes.
  useEffect(() => {
    const reveal = () => {
      const key = decodeURIComponent(window.location.hash.slice(1));
      if (!releases.some((release) => release.key === key)) return;
      setOpen((previous) => (previous.has(key) ? previous : new Set(previous).add(key)));
      window.requestAnimationFrame(() =>
        document.getElementById(key)?.scrollIntoView({ block: 'start' }),
      );
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [releases]);

  // "/" jumps to search from anywhere that is not already a text field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select'))
      ) {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  function toggleRelease(key: string) {
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function clearFilters() {
    setQuery('');
    setAreas([]);
    setTags([]);
  }

  async function copyLink(key: string) {
    const url = `${window.location.origin}${window.location.pathname}#${key}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // No clipboard (insecure context, denied): leave the link in the address bar instead.
      window.history.replaceState(window.history.state, '', `#${key}`);
      return;
    }
    setCopiedKey(key);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopiedKey(null), 2000);
  }

  const itemCount = (count: number) =>
    count === 1 ? t(`${PREFIX}.ui.itemCount.one`) : t(`${PREFIX}.ui.itemCount.other`, { count });

  return (
    <div className="mt-10 sm:mt-12">
      {/* ── Controls ─────────────────────────────────────────────── */}
      <section
        aria-label={t(`${PREFIX}.ui.filtersLabel`)}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <label htmlFor="changelog-search" className="sr-only">
          {t(`${PREFIX}.ui.searchLabel`)}
        </label>
        <div className="relative">
          <Search
            aria-hidden
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            ref={searchRef}
            id="changelog-search"
            type="search"
            value={query}
            maxLength={80}
            autoComplete="off"
            spellCheck={false}
            placeholder={t(`${PREFIX}.ui.searchPlaceholder`)}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              if (query) setQuery('');
              else event.currentTarget.blur();
            }}
            aria-describedby="changelog-search-hint"
            className="peer h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-12 text-[15px] text-slate-900 placeholder:text-slate-400 transition-colors focus:border-[#0066FF] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                searchRef.current?.focus();
              }}
              aria-label={t(`${PREFIX}.ui.clearSearch`)}
              className={`absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 ${FOCUS_RING}`}
            >
              <X aria-hidden size={16} />
            </button>
          ) : (
            <kbd
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs text-slate-500 peer-focus:hidden sm:block"
            >
              /
            </kbd>
          )}
          <span id="changelog-search-hint" className="sr-only">
            {t(`${PREFIX}.ui.searchHint`)}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t(`${PREFIX}.ui.areaLabel`)}
            </span>
            {/* One scrolling row on phones, wrapping from sm. */}
            <div className="-my-1 flex min-w-0 flex-1 gap-2 overflow-x-auto py-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
              <Chip pressed={areas.length === 0} onClick={() => setAreas([])}>
                {t(`${PREFIX}.ui.all`)}
              </Chip>
              {CHANGELOG_AREAS.map((area) => (
                <Chip
                  key={area}
                  pressed={areas.includes(area)}
                  count={counts.areas[area]}
                  onClick={() => setAreas((list) => toggle(list, area))}
                >
                  {t(`${PREFIX}.areas.${area}`)}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t(`${PREFIX}.ui.tagLabel`)}
            </span>
            <div className="-my-1 flex min-w-0 flex-1 gap-2 overflow-x-auto py-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
              <Chip pressed={tags.length === 0} onClick={() => setTags([])}>
                {t(`${PREFIX}.ui.all`)}
              </Chip>
              {CHANGELOG_TAGS.map((tag) => (
                <Chip
                  key={tag}
                  pressed={tags.includes(tag)}
                  count={counts.tags[tag]}
                  onClick={() => setTags((list) => toggle(list, tag))}
                >
                  <span aria-hidden className={`h-2 w-2 rounded-full ${TAG_DOT[tag]}`} />
                  {t(`${PREFIX}.tags.${tag}`)}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-sm">
          <p aria-live="polite" className="font-medium tabular-nums text-slate-600">
            {t(`${PREFIX}.ui.results`, { changes: shown, total })}
          </p>
          <div className="flex items-center gap-1">
            {active && (
              <button
                type="button"
                onClick={clearFilters}
                className={`rounded-lg px-2.5 py-1 font-semibold text-[#0055EE] hover:bg-blue-50 ${FOCUS_RING}`}
              >
                {t(`${PREFIX}.ui.clearFilters`)}
              </button>
            )}
            {/* While filtering every match is already open, so folding controls would do nothing. */}
            {!active && (
              <button
                type="button"
                onClick={() =>
                  setOpen(allOpen ? new Set() : new Set(releases.map(({ key }) => key)))
                }
                className={`rounded-lg px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${FOCUS_RING}`}
              >
                {t(`${PREFIX}.ui.${allOpen ? 'collapseAll' : 'expandAll'}`)}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Releases ─────────────────────────────────────────────── */}
      {visible.length === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <SearchX aria-hidden size={22} className="text-slate-500" />
          </span>
          <p className="mt-4 text-base font-semibold text-slate-900">
            {t(`${PREFIX}.ui.emptyTitle`)}
          </p>
          <p className="mt-1 max-w-sm text-sm leading-6 text-slate-600">
            {t(`${PREFIX}.ui.emptyBody`)}
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className={`mt-5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 ${FOCUS_RING}`}
          >
            {t(`${PREFIX}.ui.clearFilters`)}
          </button>
        </div>
      ) : (
        <ol className="mt-10 space-y-6 sm:mt-12 sm:space-y-8">
          {visible.map((release, index) => {
            const isOpen = active || open.has(release.key);
            const panelId = `${release.key}-changes`;
            const releaseTags = CHANGELOG_TAGS.filter((tag) =>
              release.items.some((item) => item.tag === tag),
            );
            const copied = copiedKey === release.key;
            const last = index === visible.length - 1;

            return (
              <li
                key={release.key}
                id={release.key}
                className="scroll-mt-32 sm:grid sm:grid-cols-[9rem_1fr] sm:gap-4"
              >
                <div className="sm:pt-6">
                  <time
                    dateTime={release.date}
                    className="block text-sm font-medium tabular-nums text-slate-500 sm:sticky sm:top-32"
                  >
                    {release.dateLabel}
                  </time>
                </div>

                <div className="relative mt-2 sm:mt-0 sm:pl-8">
                  {/* Timeline rail and node, from sm. */}
                  {!last && (
                    <span
                      aria-hidden
                      className="absolute -bottom-8 left-[5px] top-8 hidden w-px bg-slate-200 sm:block"
                    />
                  )}
                  <span
                    aria-hidden
                    className={`absolute left-0 top-[1.85rem] hidden h-[11px] w-[11px] rounded-full ring-4 ring-slate-50 transition-colors sm:block ${
                      isOpen ? 'bg-[#0066FF]' : 'bg-slate-300'
                    }`}
                  />

                  <article
                    className={`rounded-2xl border bg-white shadow-sm transition-[border-color,box-shadow] duration-200 hover:shadow-md ${
                      isOpen ? 'border-slate-200' : 'border-slate-200/80 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start gap-2 p-4 sm:p-5">
                      <div className="min-w-0 flex-1">
                        {/* Accordion pattern: the heading wraps the toggle, never the other way. */}
                        <h2 className="text-lg font-semibold tracking-[-0.01em] text-slate-950 sm:text-xl">
                          <button
                            type="button"
                            onClick={() => toggleRelease(release.key)}
                            aria-expanded={isOpen}
                            aria-controls={panelId}
                            disabled={active}
                            className={`group flex w-full items-start gap-3 rounded-lg p-1 text-left disabled:cursor-default ${FOCUS_RING}`}
                          >
                            <ChevronDown
                              aria-hidden
                              size={20}
                              className={`mt-1 shrink-0 text-slate-400 transition-transform duration-300 group-hover:text-slate-700 motion-reduce:transition-none ${
                                isOpen ? 'rotate-0' : '-rotate-90'
                              } ${active ? 'invisible' : ''}`}
                            />
                            <span className="min-w-0 group-enabled:group-hover:text-[#0055EE]">
                              <Highlight text={release.title} query={query} />
                            </span>
                          </button>
                        </h2>
                        <div className="pl-9 pr-1">
                          <p className="mt-0.5 text-[15px] leading-7 text-slate-600">
                            <Highlight text={release.summary} query={query} />
                          </p>
                          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500">
                            <span>{itemCount(release.items.length)}</span>
                            {releaseTags.map((tag) => (
                              <span key={tag} className="inline-flex items-center gap-1.5">
                                <span
                                  aria-hidden
                                  className={`h-1.5 w-1.5 rounded-full ${TAG_DOT[tag]}`}
                                />
                                {t(`${PREFIX}.tags.${tag}`)}
                              </span>
                            ))}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void copyLink(release.key)}
                        aria-label={copied ? t(`${PREFIX}.ui.copied`) : t(`${PREFIX}.ui.copyLink`)}
                        title={copied ? t(`${PREFIX}.ui.copied`) : t(`${PREFIX}.ui.copyLink`)}
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${FOCUS_RING} ${
                          copied
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                        }`}
                      >
                        {copied ? <Check aria-hidden size={17} /> : <Link2 aria-hidden size={17} />}
                      </button>
                    </div>

                    {/* Height animates via grid rows; `inert` keeps folded links out of tab order. */}
                    <div
                      id={panelId}
                      inert={!isOpen}
                      className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                        isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <ul className="mx-4 space-y-4 border-t border-slate-100 pb-5 pt-4 sm:mx-5 sm:pl-9">
                          {release.items.map((item) => (
                            <li key={item.key} className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                              <div className="flex shrink-0 items-center gap-2 sm:w-36 sm:flex-col sm:items-start sm:gap-1.5">
                                {/* Badges double as filters: one click narrows to that type or area. */}
                                <button
                                  type="button"
                                  aria-pressed={tags.includes(item.tag)}
                                  onClick={() => setTags((list) => toggle(list, item.tag))}
                                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset transition hover:brightness-95 ${FOCUS_RING} ${TAG_STYLE[item.tag]}`}
                                >
                                  {t(`${PREFIX}.tags.${item.tag}`)}
                                </button>
                                <button
                                  type="button"
                                  aria-pressed={areas.includes(item.area)}
                                  onClick={() => setAreas((list) => toggle(list, item.area))}
                                  className={`rounded text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline ${FOCUS_RING}`}
                                >
                                  {t(`${PREFIX}.areas.${item.area}`)}
                                </button>
                              </div>
                              <p className="text-[15px] leading-7 text-slate-700">
                                <Highlight text={item.text} query={query} />
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </article>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
