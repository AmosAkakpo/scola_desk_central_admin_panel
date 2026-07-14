-- ─────────────────────────────────────────────
-- DB ENCRYPTION KEY ESCROW (owner-set 2026-07-16)
-- One SQLCipher key per school, generated lazily by the activate route
-- (node:crypto) the first time the school activates, then stable for the
-- school's lifetime -- renewals and key reissues never change it.
-- Escrowed here so ScolaDesk support can recover a school whose local
-- safeStorage copy is lost (Windows profile corruption etc.); the local
-- app never stores it in plaintext.
-- On schools (not licenses): the key is per-school, one row forever,
-- while licenses get a new row every renewal/reissue.
-- ─────────────────────────────────────────────

ALTER TABLE schools ADD COLUMN IF NOT EXISTS db_encryption_key TEXT;
