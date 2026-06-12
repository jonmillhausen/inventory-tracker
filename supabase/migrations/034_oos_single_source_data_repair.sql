-- 034: P0-7 — OOS single source of truth: data repair + trigger hardening
-- Audit ref: docs/superpowers/audit-2026-06.md §3 P0-7
--
-- equipment_oos is the single OOS system. The legacy out_of_service_items
-- table is write-orphaned (its last writer, the moved_to_oos double-write in
-- /api/issue-flags/[id], is removed in this commit). Counter columns
-- (equipment.out_of_service, equipment_sub_items.out_of_service) are retired:
-- the app no longer reads them; they remain only because
-- marketing_api.equipment_catalog references equipment.out_of_service as
-- oos_count_legacy (that view also computes the correct active_oos_count).
-- issue_flag_items and the issue_flag counters are LIVE and untouched
-- (per owner decision 2026-06-11).
--
-- No rows are deleted — history is preserved by closing with returned_at.

-- A. Close the 9 orphaned out_of_service_items rows (write-only legacy table).
--    The existing trigger recomputes the counters to 0 as a side effect.
UPDATE out_of_service_items
SET returned_at = now()
WHERE returned_at IS NULL;

-- B. Close the 11 stale 2026-04-03 "Incoming order" sub-item placeholder rows
--    (goal_set ×3, small_black_air_pump ×6, tripod ×2) — confirmed stale by
--    owner; expected return dates were 2026-04-10/17.
UPDATE equipment_oos
SET returned_at = now()
WHERE sub_item_id IS NOT NULL
  AND returned_at IS NULL
  AND created_at::date = '2026-04-03';

-- C. Zero any remaining OOS counter residue (retired columns).
UPDATE equipment SET out_of_service = 0 WHERE out_of_service <> 0;
UPDATE equipment_sub_items SET out_of_service = 0 WHERE out_of_service <> 0;

-- D. Harden both counter trigger functions: they previously ran with invoker
--    rights, so a sales/staff-initiated issue_flag_items insert could silently
--    update zero equipment rows (admin-only UPDATE RLS) — classic counter
--    drift. SECURITY DEFINER + pinned search_path also clears two security
--    advisor warnings.
ALTER FUNCTION public.update_issue_flag_count() SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION public.update_out_of_service_count() SECURITY DEFINER SET search_path = public, pg_temp;
