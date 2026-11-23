import { useEffect, useRef, useState } from 'react';
import { send } from './send';
import { AlertIcon, CheckIcon, LinkIcon, SearchIcon } from './Brand';
import type { CustomerSummary, RoamingSearchResult } from './messages';

/** A query worth asking the rest of the Assistigo network about (§7.4.3, migration 0024). */
function looksLikeMobile(query: string): boolean {
  return /^\d{10}$/.test(query.trim());
}

/**
 * Customer selector (spec §7.4.3).
 *
 * The operator must always know who they are filling for, so the selected customer's name and
 * the last four digits of their mobile stay visible everywhere this is used (§8.2). Once someone
 * is selected the search collapses — the selected card is the thing that must not be missed.
 */

/** Initials for the avatar. Derived in the UI only; never stored, never sent anywhere. */
function initials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function CustomerPicker({
  selected,
  onSelect,
}: {
  selected: CustomerSummary | null;
  onSelect: (customer: CustomerSummary) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cross-centre roaming lookup (migration 0024) — a separate, explicit step from the local
  // search: nothing is asked of the rest of the network until the operator chooses to.
  const [roamingResults, setRoamingResults] = useState<RoamingSearchResult[] | null>(null);
  const [roamingSearching, setRoamingSearching] = useState(false);
  const [roamingError, setRoamingError] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const showSearch = open || !selected;

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    // A fresh keystroke invalidates any roaming search made against the previous query.
    setRoamingResults(null);
    setRoamingError(null);

    // Debounced: an operator types a name fast, and every keystroke is a database query.
    timer.current = setTimeout(() => {
      void (async () => {
        setSearching(true);
        setError(null);
        const response = await send<{ customers: CustomerSummary[] }>({
          type: 'SEARCH_CUSTOMERS',
          query: query.trim(),
        });
        setSearching(false);
        if (response.ok) setResults(response.data.customers);
        else setError('Could not search right now.');
      })();
    }, 250);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  const choose = (customer: CustomerSummary) => {
    onSelect(customer);
    setQuery('');
    setResults([]);
    setRoamingResults(null);
    setOpen(false);
  };

  const trimmedQuery = query.trim();
  const searchNetwork = async () => {
    setRoamingSearching(true);
    setRoamingError(null);
    const response = await send<{ customers: RoamingSearchResult[] }>({
      type: 'SEARCH_ROAMING_CUSTOMER',
      query: trimmedQuery,
    });
    setRoamingSearching(false);
    if (response.ok) setRoamingResults(response.data.customers);
    else setRoamingError('Could not reach the Assistigo network right now.');
  };

  const linkAndChoose = async (customerId: string) => {
    setLinkingId(customerId);
    const response = await send<{ customer: CustomerSummary }>({
      type: 'LINK_ROAMING_CUSTOMER',
      customerId,
    });
    setLinkingId(null);
    if (response.ok) choose(response.data.customer);
    else setRoamingError('Could not link this customer. Try again.');
  };

  const selectRoamingResult = (result: RoamingSearchResult) => {
    choose({
      id: result.customerId,
      displayName: result.displayName,
      customerCode: null,
      mobileLast4: result.mobileLast4,
      isRoaming: true,
      accessStatus: 'locked',
      grantExpiresAt: null,
    });
  };

  return (
    <div className="stack-sm">
      {selected ? (
        <div className="customer-bar">
          <div className="row">
            <div className="avatar" aria-hidden="true">
              {initials(selected.displayName)}
            </div>
            <div className="grow">
              <div className="strong truncate">
                {selected.displayName}
                {selected.isRoaming ? (
                  <span className="badge badge-brand">
                    {selected.accessStatus === 'granted' ? ' 🟢 Access open' : ' 🔒 Locked'}
                  </span>
                ) : null}
              </div>
              <div className="tiny muted truncate">
                {selected.mobileLast4 ? `••••${selected.mobileLast4}` : 'no mobile on file'}
              </div>
            </div>
            <button
              type="button"
              className="btn-ghost tiny"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
            >
              {open ? 'Cancel' : 'Change'}
            </button>
          </div>
        </div>
      ) : (
        <div className="notice notice-warn">
          <AlertIcon size={13} />
          <span>Select a customer before filling any form.</span>
        </div>
      )}

      {showSearch ? (
        <>
          <div className="search-wrap">
            <SearchIcon size={13} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, mobile or code"
              aria-label="Search customers"
              autoFocus={open}
            />
          </div>

          {searching ? (
            <p className="tiny muted row">
              <span className="spinner spinner-ink" />
              Searching…
            </p>
          ) : null}

          {error ? (
            <p className="tiny" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          ) : null}

          {!searching && query.trim().length >= 2 && results.length === 0 && !error ? (
            <p className="tiny muted">No customer matches that.</p>
          ) : null}

          {results.length > 0 ? (
            <div className="card card-flush result-list">
              {results.map((customer) => {
                const isSelected = customer.id === selected?.id;
                return (
                  <button
                    key={customer.id}
                    type="button"
                    className="result-item"
                    onClick={() => choose(customer)}
                  >
                    <span className="spread">
                      <span className="grow truncate">
                        {/* Operator-entered text, rendered as text — never as markup (§19.6). */}
                        {customer.displayName}
                      </span>
                      {isSelected ? <CheckIcon size={13} className="muted" /> : null}
                    </span>
                    <span className="tiny muted truncate" style={{ display: 'block' }}>
                      {/* Mobile + name identify a customer; the internal code is not shown. */}
                      {customer.mobileLast4 ? `••••${customer.mobileLast4}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {/*
           * Cross-centre roaming (§7.4.3, migration 0024). Offered only for a query that reads
           * as a whole mobile number — a name or partial number is not something the network
           * search accepts, and offering it anyway would just produce a confusing empty result.
           */}
          {!searching &&
          results.length === 0 &&
          !error &&
          looksLikeMobile(trimmedQuery) &&
          !roamingResults ? (
            <button
              type="button"
              className="btn-ghost btn-block tiny"
              disabled={roamingSearching}
              onClick={() => void searchNetwork()}
            >
              {roamingSearching ? (
                <>
                  <span className="spinner spinner-ink" /> Searching the network…
                </>
              ) : (
                <>🌐 Search Assistigo Network for {trimmedQuery}</>
              )}
            </button>
          ) : null}

          {roamingError ? (
            <p className="tiny" style={{ color: 'var(--danger)' }}>
              {roamingError}
            </p>
          ) : null}

          {roamingResults ? (
            roamingResults.length === 0 ? (
              <p className="tiny muted">No customer on the network matches that number.</p>
            ) : (
              <div className="card card-flush result-list">
                {roamingResults.map((customer) => (
                  <div key={customer.customerId} className="result-item">
                    <span className="spread">
                      <span className="grow truncate">
                        {customer.displayName}
                        <span className="badge badge-brand"> 🌐</span>
                      </span>
                    </span>
                    <span className="tiny muted truncate" style={{ display: 'block' }}>
                      {customer.mobileLast4 ? `••••${customer.mobileLast4}` : ''}
                      {customer.state ? ` · ${customer.state}` : ''}
                      {/* Signed up in the app themselves (migration 0041); otherwise identical. */}
                      {customer.fromApp ? ' · 📱 BharatDoc app' : ''}
                    </span>
                    <button
                      type="button"
                      className="btn-ghost tiny"
                      style={{ marginTop: 4 }}
                      disabled={linkingId === customer.customerId}
                      onClick={() =>
                        customer.isLinked
                          ? selectRoamingResult(customer)
                          : void linkAndChoose(customer.customerId)
                      }
                    >
                      <LinkIcon size={12} />
                      {customer.isLinked ? 'Select' : '+ Link to counter'}
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : null}
        </>
      ) : null}
    </div>
  );
}
