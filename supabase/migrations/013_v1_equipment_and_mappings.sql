-- ── New equipment items ────────────────────────────────────────────────────────
-- Items 4 + Laser Tag Lite (needed for item 2 mapping)
INSERT INTO equipment (id, name, total_qty, is_active) VALUES
  ('laser_tag_lite', 'Laser Tag Lite',  30, true),
  ('gaga_pit',       'Gaga Ball Pit',    1, true),
  ('promo_supplies', 'Promo Supplies',   1, true)
ON CONFLICT (id) DO NOTHING;

-- ── Laser Tag: replace base mapping with variant-conditional mappings ──────────
-- Item 1 + 2.
-- Migration 012 added a base mapping (modifier_id IS NULL) → elite_laser_tag.
-- That mapping produced qty=1 because allOptions was empty and base-mapping path
-- does not read use_customer_qty. Replace it with synthetic modifier-id rows that
-- parseV1Job() emits based on the pricing_summary variant text.
DELETE FROM service_mappings
WHERE zenbooker_service_id = '1747883952074x309158420488483400'
  AND zenbooker_modifier_id IS NULL;

INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES
  -- Elite Laser Tag variant (parseV1Job emits id='v1_lt_elite' when pricing_summary
  -- contains text matching 'elite laser tag')
  (uuid_generate_v4(),
   '1747883952074x309158420488483400', 'Laser Tag',
   'v1_lt_elite', 'Elite Laser Tag',
   'elite_laser_tag', 1, true, false,
   'v1: synthetic modifier — parseV1Job sets id=v1_lt_elite for Elite variant'),

  -- Laser Tag Lite variant (parseV1Job emits id='v1_lt_lite')
  (uuid_generate_v4(),
   '1747883952074x309158420488483400', 'Laser Tag',
   'v1_lt_lite', 'Laser Tag Lite',
   'laser_tag_lite', 1, true, false,
   'v1: synthetic modifier — parseV1Job sets id=v1_lt_lite for Lite variant')

ON CONFLICT DO NOTHING;

-- ── Promo event base mapping ───────────────────────────────────────────────────
-- Item 5.
-- parseV1Job() emits service_id='v1:promo_event' for service names matching
-- known promo patterns (e.g. "Promo Booth", "TailGOAT Promo Event", etc.).
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES
  (uuid_generate_v4(),
   'v1:promo_event', 'Promo Event',
   NULL, NULL,
   'promo_supplies', 1, false, false,
   'v1 synthetic: parseV1Job routes all promo event service names here')

ON CONFLICT DO NOTHING;

-- ── Obstacle Course v1 mappings ────────────────────────────────────────────────
-- Item 10.
-- Service: Obstacle Course (v1 service_id: 1749611522093x499322152628127740)
-- These use synthetic modifier_ids with descriptive names so step 1.5
-- (name-based modifier match in resolveWebhookItems) can match them from the
-- pricing_summary synthetic options (id='').
-- Two rows share modifier_name 'Full Obstacle Course' — both fire for a full-setup
-- booking, correctly producing two booking_items (warped_wall + obstacles_only).
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES
  (uuid_generate_v4(),
   '1749611522093x499322152628127740', 'Obstacle Course',
   'v1_oc_full_warped',    'Full Obstacle Course',
   'warped_wall',    1, false, false, 'v1: full setup — warped wall component'),

  (uuid_generate_v4(),
   '1749611522093x499322152628127740', 'Obstacle Course',
   'v1_oc_full_obstacles', 'Full Obstacle Course',
   'obstacles_only', 1, false, false, 'v1: full setup — obstacles component'),

  (uuid_generate_v4(),
   '1749611522093x499322152628127740', 'Obstacle Course',
   'v1_oc_obstacles_only', 'Obstacles Only',
   'obstacles_only', 1, false, false, 'v1: obstacles-only setup'),

  (uuid_generate_v4(),
   '1749611522093x499322152628127740', 'Obstacle Course',
   'v1_oc_warped_only',    'Warped Wall Only',
   'warped_wall',    1, false, false, 'v1: warped-wall-only setup')

ON CONFLICT DO NOTHING;

-- ── Gaga Ball Pit v1 mapping ───────────────────────────────────────────────────
-- Item 11.
-- TODO: confirm the real v1 service_id by running:
--   SELECT raw_payload->'services'
--   FROM webhook_logs
--   WHERE action = 'job.import' AND result_detail LIKE '%unmapped: Gaga%'
--   LIMIT 1;
-- Then replace 'v1:gaga_pit' with the actual service_id and remove the name-based
-- routing in parseV1Job().  Until confirmed, parseV1Job() emits service_id='v1:gaga_pit'
-- for any service whose name contains 'gaga' (case-insensitive).
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES
  (uuid_generate_v4(),
   'v1:gaga_pit', 'Gaga Ball Pit',
   NULL, NULL,
   'gaga_pit', 1, false, false,
   'v1 synthetic: replace service_id with actual ID once confirmed from webhook_logs')

ON CONFLICT DO NOTHING;
