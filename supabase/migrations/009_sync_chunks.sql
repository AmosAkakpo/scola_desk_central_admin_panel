-- ═══════════════════════════════════════════════════════════════
-- ScolaDesk CAP — Migration 009: Sync Chunks
-- Raw JSONB chunk storage for Phase 7 full-snapshot chunked sync.
-- NOT a relational mirror — full relational mirror is V2 (ScolaDesk+).
-- Retention (app-level, not SQL): on 'complete', keep only the 2 most
-- recent sync_uids per school, delete the rest.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE sync_chunks (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  sync_uid     TEXT NOT NULL,
  chunk_index  INTEGER NOT NULL,
  table_name   TEXT NOT NULL,
  page         INTEGER NOT NULL DEFAULT 0,
  row_count    INTEGER NOT NULL DEFAULT 0,
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, sync_uid, chunk_index)
);

CREATE INDEX idx_sync_chunks_school ON sync_chunks(school_id, sync_uid);

ALTER TABLE sync_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON sync_chunks
  FOR ALL USING (auth.role() = 'authenticated');

-- ═══════════════════════════════════════════════════════════════
-- END OF MIGRATION 009 — Sync Chunks
-- ═══════════════════════════════════════════════════════════════
