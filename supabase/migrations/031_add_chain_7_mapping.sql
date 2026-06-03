-- 031: Fix "Chain #7 not appearing on the Schedule page".
--
-- DIAGNOSIS (from live DB + webhook_logs, not assumptions):
--   * The chains table ALREADY contains chain_7 ('Chain #7', #ff66c4, is_active=true)
--     and chain_8 — so NO chains row needs to be inserted. The Schedule page loads
--     chains dynamically (is_active=true) and there is no hardcoded "stops at Chain #6"
--     list anywhere in the codebase.
--   * Chain assignment is fully data-driven: webhookProcessor resolves a booking's
--     chain by matching each Zenbooker assigned_provider id against chain_mappings
--     (lib/utils/webhookProcessor.ts). chain_mappings only had rows for chain_1..6.
--   * Chain 7's Zenbooker provider (staff_id 1757606218056x328556906557734900,
--     name "Chain 7") appears in 66 webhook payloads but had NO chain_mappings row,
--     so every Chain 7 booking resolved to chain = NULL and fell into "Unassigned".
--   * The Schedule hides chain columns with zero bookings
--     (ScheduleClient: chainCols.filter(c => c.bookings.length > 0)), so with no
--     bookings carrying chain_7, the Chain #7 column never rendered.
--
-- FIX:
--   1. Add the missing chain_mappings row so all FUTURE Chain 7 webhooks resolve
--      correctly (the webhook route re-resolves chain on every job.* update).
--   2. Backfill existing unassigned bookings whose LATEST webhook payload assigned
--      them to the Chain 7 provider (10 bookings; 8 upcoming as of 2026-06-02),
--      so Chain #7 appears on the Schedule immediately.

-- ── 1. Add Chain 7's staff -> chain mapping (idempotent) ───────────────────
-- chain_mappings has a uuid PK and no unique constraint on staff_id, so guard
-- with NOT EXISTS to keep this migration safe to re-run.
INSERT INTO chain_mappings (zenbooker_staff_id, zenbooker_staff_name, chain_id)
SELECT '1757606218056x328556906557734900', 'Chain 7', 'chain_7'
WHERE NOT EXISTS (
  SELECT 1 FROM chain_mappings
  WHERE zenbooker_staff_id = '1757606218056x328556906557734900'
);

-- ── 2. Backfill already-ingested Chain 7 bookings ──────────────────────────
-- Only touch bookings that are currently unassigned (chain IS NULL) AND whose
-- MOST RECENT webhook payload lists the Chain 7 provider. Using the latest
-- payload (DISTINCT ON ... ORDER BY received_at DESC) mirrors the webhook
-- processor, so a booking later reassigned away from Chain 7 is not affected.
UPDATE bookings b
SET chain = 'chain_7'
FROM (
  SELECT DISTINCT ON (zenbooker_job_id) zenbooker_job_id, raw_payload
  FROM webhook_logs
  ORDER BY zenbooker_job_id, received_at DESC
) latest
WHERE b.zenbooker_job_id = latest.zenbooker_job_id
  AND b.chain IS NULL
  AND latest.raw_payload->'data'->'assigned_providers'
        @> '[{"id":"1757606218056x328556906557734900"}]'::jsonb;
