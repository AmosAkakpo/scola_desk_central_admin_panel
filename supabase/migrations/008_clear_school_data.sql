-- ═══════════════════════════════════════════════════════════════
-- ScolaDesk CAP — Clear School Data (one-time cleanup, not a schema change)
-- Wipes all registered schools and their licenses/payments/sync history
-- so testing can start fresh after the local app's schema rework.
-- Does NOT touch pricing_plans (rate config).
-- ═══════════════════════════════════════════════════════════════

-- Children first (FK ON DELETE RESTRICT means parents can't be
-- deleted while children exist)
DELETE FROM license_payments;
DELETE FROM license_discounts;
DELETE FROM sync_records;
DELETE FROM cap_audit_logs;

-- Then licenses (child of schools)
DELETE FROM licenses;

-- Then schools
DELETE FROM schools;

-- pricing_plans is untouched
