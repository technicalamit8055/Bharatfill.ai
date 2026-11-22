-- =============================================================================
-- 0040  Vault PIN change
-- docs/VAULT_BRIDGE_DESIGN.md §3.3 (Vault PIN), D17
--
-- A signed-in citizen can change their Vault PIN (POST /api/citizen/account/pin). The new PIN
-- replaces citizen_vault_keys.pin_hmac — no new column, nothing new stored. Each change is an
-- event in the citizen's own access history, so a change they did not make is visible.
-- Wrong current PINs reuse 'restore_refused': same counters, same "someone tried your PIN".
-- =============================================================================

alter table public.vault_access_events
  drop constraint if exists vault_access_events_action_check;
alter table public.vault_access_events
  add constraint vault_access_events_action_check
  check (action in (
    'granted', 'listed', 'viewed', 'attached', 'copied', 'ended',
    'restored', 'restore_refused', 'pin_changed'));
