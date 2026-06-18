-- ═══════════════════════════════════════════════════════════════
-- ScolaDesk CAP — Migration 002: Pricing Plans Table
-- Stores configurable pricing per country + tier + size.
-- Schools snapshot the price at registration time into licenses.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE pricing_plans (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country     TEXT NOT NULL DEFAULT 'Bénin',
  tier        TEXT NOT NULL CHECK (tier IN ('STANDARD', 'PRO')),
  size        TEXT NOT NULL CHECK (size IN ('S', 'M', 'L')),
  setup_fee   INTEGER NOT NULL DEFAULT 0,
  annual_fee  INTEGER NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'XOF',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(country, tier, size)
);

-- Seed Benin pricing from CONTEXT.MD
INSERT INTO pricing_plans (country, tier, size, setup_fee, annual_fee) VALUES
  ('Bénin', 'STANDARD', 'S', 25000, 45000),
  ('Bénin', 'STANDARD', 'M', 40000, 70000),
  ('Bénin', 'STANDARD', 'L', 60000, 100000),
  ('Bénin', 'PRO',      'S', 25000, 70000),
  ('Bénin', 'PRO',      'M', 40000, 110000),
  ('Bénin', 'PRO',      'L', 60000, 150000);

-- Auto-update trigger
CREATE TRIGGER trg_pricing_plans_updated_at
  BEFORE UPDATE ON pricing_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE pricing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON pricing_plans
  FOR ALL USING (auth.role() = 'authenticated');

-- Add country field to schools table for pricing linkage
ALTER TABLE schools ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Bénin';

-- ═══════════════════════════════════════════════════════════════
-- END OF MIGRATION 002
-- ═══════════════════════════════════════════════════════════════
