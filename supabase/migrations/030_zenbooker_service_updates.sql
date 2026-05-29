-- 030: Zenbooker service updates — Spring 2026.
--
-- Covers four Zenbooker changes:
--   1. "Youth Laser Tag" — new text variant that maps to laser_tag_lite.
--      Adds a modifier_name row so the v3 pricing-summary name-substring
--      path matches. The v1 import parser is updated separately to emit
--      synthetic id='v1_lt_lite' for this text, which resolves via the
--      pre-existing v1_lt_lite mapping.
--   2. New standalone Gaga Ball Pit service:
--      1779135222412x556660967984274000 → gaga_pit equipment.
--   3. New standalone Gel Blaster service:
--      1779144002752x492273329001131600 → geltag equipment.
--      Customer picks qty at booking time, so BASE uses use_customer_qty=true.
--   4. 2-Game / 3-Game / Backyard Classic bundles switched their Laser Tag,
--      Bubble Ball, Arrow Tag, and Foam Party options from fixed qty to a
--      customer-selected qty (min 10). Flip use_customer_qty=true on those rows.
--      default_qty stays as the fallback when no customer qty is present.
--
-- "Elite Laser Tag (10+)" needs no schema change: normalizeForMatch strips the
-- "(10+)" suffix to "elite laser tag", which substring-matches the existing
-- modifier_name 'Elite Laser Tag' row; the v1 parser's tl.includes(
-- 'elite laser tag') check matches the lowercased variant.
--
-- Existing booking_items are NOT affected — these mappings only apply when the
-- webhook / v1 import processes a new payload.

-- ── 1. Youth Laser Tag → Laser Tag Lite ────────────────────────────────────
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES
  (uuid_generate_v4(),
   '1747883952074x309158420488483400', 'Laser Tag',
   'v1_lt_youth', 'Youth Laser Tag',
   'laser_tag_lite', 1, true, false,
   'Youth Laser Tag → Laser Tag Lite. Synthetic modifier_id covers v3 pricing-summary name-substring path; v1 parser emits id=v1_lt_lite for the same text.')
ON CONFLICT DO NOTHING;

-- ── 2. New Gaga Ball Pit service (canonical real service_id) ───────────────
-- The historical v1:gaga_pit synthetic row stays in place as a safety net for
-- bulk-import payloads that arrive with the service name but no service_id.
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES
  (uuid_generate_v4(),
   '1779135222412x556660967984274000', 'Gaga Ball Pit',
   NULL, NULL,
   'gaga_pit', 1, false, false,
   'BASE: standalone Gaga Ball Pit service (real Zenbooker service_id).')
ON CONFLICT DO NOTHING;

-- ── 3. New Gel Blaster service → Geltag ────────────────────────────────────
-- Quantity is customer-input at booking time. BASE mapping uses
-- use_customer_qty=true so resolveWebhookItems picks up the qty from
-- whichever option carries it (service_fields numeric input or
-- pricing_summary). default_qty=1 is the safety-net fallback.
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES
  (uuid_generate_v4(),
   '1779144002752x492273329001131600', 'Gel Blaster',
   NULL, NULL,
   'geltag', 1, true, false,
   'BASE: standalone Gel Blaster service; customer picks qty at booking.')
ON CONFLICT DO NOTHING;

-- ── 4. Bundle services: customer-selected qty for Laser Tag, Bubble Ball,
--      Arrow Tag, and Foam Party. default_qty (10 for LT/BB/AT, 1 for foam)
--      stays as the fallback when no customer qty arrives on the option.
--      Idempotent via the use_customer_qty=false predicate.
UPDATE service_mappings
   SET use_customer_qty = true
 WHERE zenbooker_service_id IN (
         '1771172713172x484717009863034240', -- 2-Game Party Bundle
         '1771390362580x452699813533756540', -- 3-Game Party Bundle
         '1771193436147x922879636265914600'  -- Backyard Classic
       )
   AND item_id IN ('elite_laser_tag', 'bubbleball', 'arrow_tag', 'foam_machine')
   AND use_customer_qty = false;
