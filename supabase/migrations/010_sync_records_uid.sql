-- ═══════════════════════════════════════════════════════════════
-- ScolaDesk CAP — Migration 010: sync_uid on sync_records
-- Links a success row to its chunk set in sync_chunks so the restore
-- endpoint can find the most recent COMPLETE backup (chunk contiguity
-- alone cannot prove completeness). Legacy rows stay NULL.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE sync_records ADD COLUMN sync_uid TEXT;

CREATE INDEX idx_sync_records_uid ON sync_records(school_id, sync_uid);

-- ═══════════════════════════════════════════════════════════════
-- END OF MIGRATION 010
-- ═══════════════════════════════════════════════════════════════
