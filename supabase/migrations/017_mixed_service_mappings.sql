-- ── New equipment items ──────────────────────────────────────────────────────
-- hoverball: referenced in migration 009 comments (PPB unknown options) but
-- never inserted. total_qty=1 — Jon can update once confirmed.
INSERT INTO equipment (id, name, total_qty, is_active) VALUES
  ('hoverball', 'Hoverball', 1, true)
ON CONFLICT (id) DO NOTHING;

-- ── Giant Jenga + Connect 4 combined service mapping ────────────────────────
-- parseV1Job emits service_id='v1:multi_lawn_game' for service names containing
-- both 'Giant Jenga' and 'Giant Connect 4' (e.g. "Giant Jenga, Giant Connect 4,
-- Table plus table cover").  Two base rows so both items are pushed.
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES
  (uuid_generate_v4(),
   'v1:multi_lawn_game', 'Giant Jenga + Connect 4 (combined)',
   NULL, NULL, 'mega_jenga', 1, false, false,
   'v1 synthetic: from "Giant Jenga, Giant Connect 4, Table plus table cover"'),
  (uuid_generate_v4(),
   'v1:multi_lawn_game', 'Giant Jenga + Connect 4 (combined)',
   NULL, NULL, 'connect_4', 1, false, false,
   'v1 synthetic: from "Giant Jenga, Giant Connect 4, Table plus table cover"')
ON CONFLICT DO NOTHING;

-- ── Bubble Ball bulk service mapping ─────────────────────────────────────────
-- parseV1Job emits service_id='v1:bubble_ball_bulk' with synthetic modifier
-- option id='v1_bubble_bulk' carrying the qty extracted from the service name
-- prefix (e.g. "8 BubbleBalls for 2 hours, Additional staff set up time" → qty 8).
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES (
  uuid_generate_v4(),
  'v1:bubble_ball_bulk', 'Bubble Balls (with staff note)',
  'v1_bubble_bulk', 'Bubble Balls',
  'bubble_ball', 8, true, false,
  'v1 synthetic: qty from service name prefix ("8 BubbleBalls for 2 hours...")'
)
ON CONFLICT DO NOTHING;

-- ── Hoverball Archery Range service mapping ───────────────────────────────────
-- parseV1Job emits service_id='v1:hoverball' for any service name containing
-- 'hoverball' (case-insensitive).
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES (
  uuid_generate_v4(),
  'v1:hoverball', 'Hoverball Archery Range',
  NULL, NULL, 'hoverball', 1, false, false,
  'v1 synthetic: any service name containing "hoverball"'
)
ON CONFLICT DO NOTHING;

-- ── Velcro Dart (internal) service mapping ────────────────────────────────────
-- parseV1Job emits service_id='v1:dart_board_internal' for service names
-- containing 'velcro dart' or 'dart board' that were not already caught by
-- the combined LT+dart check.  E.g. "Giant Velcro Dartboard in use at Arbutus".
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES (
  uuid_generate_v4(),
  'v1:dart_board_internal', 'Giant Velcro Dartboard (Internal)',
  NULL, NULL, 'dart_board', 1, false, false,
  'v1 synthetic: "Giant Velcro Dartboard in use at Arbutus" and similar'
)
ON CONFLICT DO NOTHING;

-- ── Laser Tag + Dart Board combined service mapping ───────────────────────────
-- parseV1Job emits service_id='v1:lt_and_dart' for service names containing
-- both 'laser tag' and 'dart board'.
-- E.g. "Laser Tag and Giant Velcro Dart Board for Lindsay Frankel".
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES
  (uuid_generate_v4(),
   'v1:lt_and_dart', 'Laser Tag + Dart Board (combined)',
   NULL, NULL, 'elite_laser_tag', 1, false, false,
   'v1 synthetic: from "Laser Tag and Giant Velcro Dart Board for [name]"'),
  (uuid_generate_v4(),
   'v1:lt_and_dart', 'Laser Tag + Dart Board (combined)',
   NULL, NULL, 'dart_board', 1, false, false,
   'v1 synthetic: from "Laser Tag and Giant Velcro Dart Board for [name]"')
ON CONFLICT DO NOTHING;

-- ── Laser Tag internal arena booking service mapping ─────────────────────────
-- parseV1Job emits service_id='v1:laser_tag_internal' for service names
-- containing 'laser tag' that were not caught by earlier checks (standard
-- service_id, rental, or combined-with-dart).
-- E.g. "Laser Tag for Andrea Hawkins", "Laser Tag - Leslie Ogu".
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES (
  uuid_generate_v4(),
  'v1:laser_tag_internal', 'Laser Tag (Internal Arena)',
  NULL, NULL, 'elite_laser_tag', 1, false, false,
  'v1 synthetic: "Laser Tag for [name]", "Laser Tag - [name]", etc.'
)
ON CONFLICT DO NOTHING;
