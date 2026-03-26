-- ── New equipment items ──────────────────────────────────────────────────────
INSERT INTO equipment (id, name, total_qty, is_active) VALUES
  ('water_tag',  'Water Tag',   20, true),
  ('water_guns', 'Water Guns',  20, true)
ON CONFLICT (id) DO NOTHING;

-- ── Water Tag service mapping ────────────────────────────────────────────────
-- parseV1Job emits service_id='v1:water_tag' with synthetic option id='v1_water_tag'
-- carrying the quantity extracted from the service name prefix
-- (e.g. "20 Water Tag sets" → qty 20, "10 Water Tag sets" → qty 10).
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES (
  uuid_generate_v4(),
  'v1:water_tag', 'Water Tag',
  'v1_water_tag', 'Water Tag',
  'water_tag', 20, true, false,
  'v1 synthetic: qty from service name prefix ("20 Water Tag sets")'
)
ON CONFLICT DO NOTHING;

-- ── Water Guns service mapping ───────────────────────────────────────────────
-- parseV1Job emits service_id='v1:water_guns' with synthetic option id='v1_water_guns'
-- carrying the quantity extracted from the service name prefix
-- (e.g. "10 Water Guns" → qty 10, "20 Water Guns" → qty 20).
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES (
  uuid_generate_v4(),
  'v1:water_guns', 'Water Guns',
  'v1_water_guns', 'Water Guns',
  'water_guns', 20, true, false,
  'v1 synthetic: qty from service name prefix ("10 Water Guns")'
)
ON CONFLICT DO NOTHING;

-- ── Arena Laser Tag Rental service mapping ───────────────────────────────────
-- parseV1Job emits service_id='v1:arena_laser_tag' with synthetic option id='v1_arena_lt'
-- carrying the quantity extracted from the service name suffix
-- (e.g. "Arena Laser Tag Rental - 10 sets" → qty 10).
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES (
  uuid_generate_v4(),
  'v1:arena_laser_tag', 'Arena Laser Tag Rental',
  'v1_arena_lt', 'Arena Laser Tag Rental',
  'elite_laser_tag', 1, true, false,
  'v1 synthetic: qty from service name suffix "- N sets"'
)
ON CONFLICT DO NOTHING;
