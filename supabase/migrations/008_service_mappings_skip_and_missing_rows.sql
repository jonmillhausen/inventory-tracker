-- ── Schema: add is_skip + make item_id nullable ──────────────────────────────
-- is_skip = true marks options that should be silently consumed without producing
-- a booking item and without falling through to the name-match fallback.
-- Nullable item_id supports skip rows that have no associated equipment.

ALTER TABLE service_mappings
  ALTER COLUMN item_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS is_skip boolean NOT NULL DEFAULT false;

-- ── Lawn Games option mappings ────────────────────────────────────────────────
-- Service: Lawn Games (zenbooker_service_id: 1751332967401x820543194421858200)

INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES
  (uuid_generate_v4(), '1751332967401x820543194421858200', 'Lawn Games', '1751332968147x123385578811416430', 'Cornhole',         'cornhole',        1, false, false, ''),
  (uuid_generate_v4(), '1751332967401x820543194421858200', 'Lawn Games', '1751332968147x265575809510310460', 'Jenga',            'jenga',           1, false, false, ''),
  (uuid_generate_v4(), '1751332967401x820543194421858200', 'Lawn Games', '1751332968147x241783664356850940', 'Giant Connect 4',  'connect_4',       1, true,  false, ''),
  (uuid_generate_v4(), '1751332967401x820543194421858200', 'Lawn Games', '1751332968147x148525398276801340', 'Yard Pong',        'yard_pong',       1, false, false, ''),
  (uuid_generate_v4(), '1751332967401x820543194421858200', 'Lawn Games', '1751332968147x183097625731959650', 'BattlePutt',       'battleputt',      1, false, false, ''),
  (uuid_generate_v4(), '1751332967401x820543194421858200', 'Lawn Games', '1751332968147x905036311950228700', 'Deluxe Cornhole',  'deluxe_cornhole', 1, false, false, ''),
  (uuid_generate_v4(), '1751332967401x820543194421858200', 'Lawn Games', '1771382135590x954904153366724600', 'Mega Checkers',    'mega_checkers',   1, false, false, '')
ON CONFLICT DO NOTHING;

-- ── Giant Velcro Dartboard add-on option mappings ─────────────────────────────
-- Service: Giant Velcro Dartboard (zenbooker_service_id: 1749613153252x518430772803385500)
-- Base mapping (NULL modifier → dart_board) was added in migration 007.

INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES
  (uuid_generate_v4(), '1749613153252x518430772803385500', 'Giant Velcro Dartboard', '1749613154149x840837067249480100', 'Cornhole',              'cornhole',  1, false, false, ''),
  (uuid_generate_v4(), '1749613153252x518430772803385500', 'Giant Velcro Dartboard', '1749613154149x342578227402214000', 'Giant Connect 4',       'connect_4', 1, false, false, ''),
  (uuid_generate_v4(), '1749613153252x518430772803385500', 'Giant Velcro Dartboard', '1749613154149x958800126867516400', 'Giant Jenga',           'jenga',     1, false, false, ''),
  (uuid_generate_v4(), '1749613153252x518430772803385500', 'Giant Velcro Dartboard', '1749613154149x992711464229800800', 'Yard Pong',             'yard_pong', 1, false, false, ''),
  (uuid_generate_v4(), '1749613153252x518430772803385500', 'Giant Velcro Dartboard', '1771786936065x241707615841157120', 'Giant Chess Set',       'mega_chess',1, false, false, ''),
  -- Explicit skips: non-equipment add-ons that must not fall through to name-match fallback
  (uuid_generate_v4(), '1749613153252x518430772803385500', 'Giant Velcro Dartboard', '1751933816159x677118147425992700', 'Velcro Bow & Arrow',    NULL, 0, false, true, 'non-equipment add-on'),
  (uuid_generate_v4(), '1749613153252x518430772803385500', 'Giant Velcro Dartboard', '1749613154149x706971689222623900', 'Generator',             NULL, 0, false, true, 'logistics'),
  (uuid_generate_v4(), '1749613153252x518430772803385500', 'Giant Velcro Dartboard', '1749613154149x712473639918131100', 'Wireless Sound System', NULL, 0, false, true, 'logistics')
ON CONFLICT DO NOTHING;

-- ── Foam Party Staff Coordinated ──────────────────────────────────────────────
-- Service: Foam Party Staff Coordinated (zenbooker_service_id: 1747519305540x667111821234667500)

INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES
  -- Base mapping: foam_machine is always included for this service
  (uuid_generate_v4(), '1747519305540x667111821234667500', 'Foam Party Staff Coordinated', NULL, NULL, 'foam_machine', 1, false, false, ''),
  -- Explicit skip: Inflatable Foam Pit is a separate rental item, not staff-coordinated
  (uuid_generate_v4(), '1747519305540x667111821234667500', 'Foam Party Staff Coordinated', '1747528930066x160657141784903680', 'Inflatable Foam Pit', NULL, 0, false, true, 'separate rental')
ON CONFLICT DO NOTHING;
