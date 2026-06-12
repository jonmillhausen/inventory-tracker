-- 033: P0-2 — atomic booking_items replacement + duplicate guard
-- Audit ref: docs/superpowers/audit-2026-06.md §3 P0-2
--
-- 1. Merge any duplicate (booking_id, item_id, is_sub_item) rows (none exist in
--    live data as of 2026-06-11; this keeps the migration safe to re-run).
-- 2. Unique index so interleaved duplicate webhook deliveries can never double
--    booking_items rows.
-- 3. replace_booking_items(): single-transaction delete+insert so a timeout or
--    failed insert can no longer leave a booking item-less (or doubled) while
--    webhook_logs records success.

-- Step 1: merge duplicates (sum qty into the lowest-id row, drop the rest)
UPDATE booking_items bi
SET qty = d.total_qty
FROM (
  SELECT (array_agg(id ORDER BY id))[1] AS keep_id, SUM(qty) AS total_qty
  FROM booking_items
  GROUP BY booking_id, item_id, is_sub_item
  HAVING COUNT(*) > 1
) d
WHERE bi.id = d.keep_id;

DELETE FROM booking_items bi
USING (
  SELECT booking_id, item_id, is_sub_item, (array_agg(id ORDER BY id))[1] AS keep_id
  FROM booking_items
  GROUP BY booking_id, item_id, is_sub_item
  HAVING COUNT(*) > 1
) d
WHERE bi.booking_id = d.booking_id
  AND bi.item_id = d.item_id
  AND bi.is_sub_item = d.is_sub_item
  AND bi.id <> d.keep_id;

-- Step 2: uniqueness backstop
CREATE UNIQUE INDEX IF NOT EXISTS booking_items_booking_item_unique
  ON booking_items (booking_id, item_id, is_sub_item);

-- Step 3: atomic replace RPC (service-role only)
CREATE OR REPLACE FUNCTION public.replace_booking_items(p_booking_id uuid, p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM booking_items WHERE booking_id = p_booking_id;

  INSERT INTO booking_items (booking_id, item_id, qty, is_sub_item, parent_item_id)
  SELECT
    p_booking_id,
    item->>'item_id',
    (item->>'qty')::int,
    COALESCE((item->>'is_sub_item')::boolean, false),
    NULLIF(item->>'parent_item_id', '')
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS item;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.replace_booking_items(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_booking_items(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.replace_booking_items(uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_booking_items(uuid, jsonb) TO service_role;
