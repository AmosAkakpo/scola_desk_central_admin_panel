-- ─────────────────────────────────────────────
-- LICENSE PERIOD: Aug 1 -> Jul 31 (owner-set 2026-07-13, matches the
-- local app's school-year convention: an academic year always runs
-- Aug 1 -> Jul 31, computed from the year label). Replaces the old
-- Sept 1 cutoff / Aug 30 expiry rule.
--
-- Also adds period_start, which never existed before -- only expiry_date
-- was tracked, with created_at used informally as a stand-in for the
-- period's start in the UI history table. Staff can override both dates
-- in the UI; these functions only provide the default.
-- ─────────────────────────────────────────────

ALTER TABLE licenses ADD COLUMN IF NOT EXISTS period_start DATE;

CREATE OR REPLACE FUNCTION compute_expiry_date()
RETURNS DATE AS $$
BEGIN
  IF EXTRACT(MONTH FROM now()) >= 8 THEN
    RETURN (EXTRACT(YEAR FROM now()) + 1)::TEXT || '-07-31';
  ELSE
    RETURN EXTRACT(YEAR FROM now())::TEXT || '-07-31';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION compute_period_start()
RETURNS DATE AS $$
BEGIN
  IF EXTRACT(MONTH FROM now()) >= 8 THEN
    RETURN EXTRACT(YEAR FROM now())::TEXT || '-08-01';
  ELSE
    RETURN (EXTRACT(YEAR FROM now()) - 1)::TEXT || '-08-01';
  END IF;
END;
$$ LANGUAGE plpgsql;
