-- 032: Add the "Arena Pickup" chain mapping for a new Zenbooker worker, and
--      retire the unused "Chain #8" column.
--
-- DIAGNOSIS (from live DB, not assumptions):
--   * The chains table ALREADY contains 'arena_pickup' ('Arena Pickup', #000000,
--     is_active=true) and 'chain_8' ('Chain #8', #5ce1e6, is_active=true). So the
--     Arena Pickup chain row does NOT need to be created — only its Zenbooker
--     provider mapping is missing. The idempotent INSERT below is a no-op on the
--     current DB and only matters for a fresh rebuild.
--   * Chain assignment is fully data-driven: the webhook route
--     (app/api/webhooks/zenbooker/route.ts) and webhookProcessor resolve a
--     booking's chain by matching each Zenbooker assigned_provider id against
--     chain_mappings.zenbooker_staff_id. There is NO hardcoded provider→chain map
--     in code, so adding a chain_mappings row IS the "webhook processor" change.
--   * The new Zenbooker worker is provider 1780411998988x788923203686760400, which
--     had no chain_mappings row, so its bookings would resolve to chain = NULL
--     ("Unassigned"). This migration maps it to 'arena_pickup'.
--   * Both the Availability and Schedule pages load chains via useChains, which
--     filters is_active=true. Deactivating chain_8 removes the "C#8" column from
--     every page (no hardcoded column header exists). No bookings currently
--     reference chain_8, so nothing is orphaned.

-- ── 1. Ensure the Arena Pickup chain exists (idempotent) ───────────────────
-- Color #000000 matches the existing Arena Pickup column styling.
INSERT INTO chains (id, name, color, is_active)
VALUES ('arena_pickup', 'Arena Pickup', '#000000', true)
ON CONFLICT (id) DO NOTHING;

-- ── 2. Map the new Zenbooker provider -> arena_pickup chain (idempotent) ────
-- chain_mappings has a uuid PK and no unique constraint on staff_id, so guard
-- with NOT EXISTS to keep this migration safe to re-run. The webhook route
-- re-reads chain_mappings on every job.* event, so all FUTURE bookings assigned
-- to this provider resolve to the Arena Pickup chain.
INSERT INTO chain_mappings (zenbooker_staff_id, zenbooker_staff_name, chain_id)
SELECT '1780411998988x788923203686760400', 'Arena Pickup', 'arena_pickup'
WHERE NOT EXISTS (
  SELECT 1 FROM chain_mappings
  WHERE zenbooker_staff_id = '1780411998988x788923203686760400'
);

-- ── 3. Retire the "Chain #8" (C#8) column ──────────────────────────────────
-- Deactivate so it disappears from Availability / Schedule / 4-Week Audit
-- (all gated on is_active=true), and drop any provider mappings that feed it.
DELETE FROM chain_mappings WHERE chain_id = 'chain_8';
UPDATE chains SET is_active = false WHERE id = 'chain_8';
