-- ── Lawn Games service_field option ID fixes ─────────────────────────────────
-- These four option IDs appear in service_fields.selected_options for the v1
-- Lawn Games service (LAWN_GAMES_V1_SERVICE_ID = 1751332967401x820543194421858200).
-- Previously, pricing_summary was being processed alongside service_fields,
-- causing double-counted quantities.  The import script now uses service_fields
-- as the authoritative source.  The mappings below must be correct for all four
-- option IDs so the resolver can map them without falling back to pricing_summary.

-- 1. Giant Connect 4 — was is_skip=true (added when pricing_summary handled it);
--    now that service_fields is authoritative, the real option ID must resolve to connect_4.
UPDATE service_mappings
SET
  is_skip                = false,
  zenbooker_modifier_name = 'Giant Connect 4',
  notes                  = 'v1 service_fields option: Giant Connect 4 add-on'
WHERE zenbooker_service_id  = '1751332967401x820543194421858200'
  AND zenbooker_modifier_id = '1751332968147x241783664356850940';

-- 2. Giant Jenga — was mapped to item_id=''jenga'' (standard set).
--    The service_fields option represents the oversized Giant Jenga (mega_jenga).
UPDATE service_mappings
SET
  item_id                = 'mega_jenga',
  zenbooker_modifier_name = 'Giant Jenga',
  notes                  = 'v1 service_fields option: Giant Jenga add-on'
WHERE zenbooker_service_id  = '1751332967401x820543194421858200'
  AND zenbooker_modifier_id = '1751332968147x265575809510310460';

-- 3. Giant Chess Set — was commented-out in migration 007 (service_id not yet confirmed).
--    Now confirmed via Juanita Taylor booking (job #802897).
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES (
  uuid_generate_v4(),
  '1751332967401x820543194421858200', 'Lawn Games',
  '1751332968147x728434016101242000', 'Giant Chess Set',
  'mega_chess', 1, false, false,
  'v1 service_fields option: Giant Chess Set add-on (confirmed job #802897)'
) ON CONFLICT DO NOTHING;

-- 4. Mega Checkers (1771382135590x954904153366724600 → mega_checkers) is already
--    correct from migration 008 — no changes needed.

-- ── Correct Juanita Taylor booking (job #802897) ──────────────────────────────
-- The booking was imported with doubled item quantities due to the double-counting
-- bug.  This corrects the booking_items to the proper set: one of each selected game.
DO $$
DECLARE
  v_booking_id text;
BEGIN
  SELECT id INTO v_booking_id
  FROM bookings
  WHERE customer_name = 'Juanita Taylor'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_booking_id IS NULL THEN
    RAISE NOTICE 'Juanita Taylor booking not found — skipping item correction';
    RETURN;
  END IF;

  DELETE FROM booking_items WHERE booking_id = v_booking_id;

  INSERT INTO booking_items (id, booking_id, item_id, qty, is_sub_item, parent_item_id)
  VALUES
    (gen_random_uuid(), v_booking_id, 'connect_4',    1, false, NULL),
    (gen_random_uuid(), v_booking_id, 'mega_jenga',   1, false, NULL),
    (gen_random_uuid(), v_booking_id, 'mega_chess',   1, false, NULL),
    (gen_random_uuid(), v_booking_id, 'mega_checkers', 1, false, NULL);

  RAISE NOTICE 'Corrected booking_items for Juanita Taylor (booking_id: %)', v_booking_id;
END $$;
