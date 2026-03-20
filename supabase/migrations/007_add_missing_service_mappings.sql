-- ── Giant Velcro Dartboard ─────────────────────────────────────────────────
-- Base mapping (no modifier required) → dart_board qty 1
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, notes
) VALUES (
  uuid_generate_v4(),
  '1749613153252x518430772803385500',
  'Giant Velcro Dartboard',
  NULL,
  NULL,
  'dart_board',
  1,
  false,
  ''
) ON CONFLICT DO NOTHING;

-- ── Lawn Games modifier option mappings ────────────────────────────────────
-- Replace <LAWN_GAMES_SERVICE_ID> with the actual Zenbooker service_id for
-- the Lawn Games service (look it up in Settings → Service Mappings or in
-- a raw webhook_logs payload for a Lawn Games booking).
--
-- INSERT INTO service_mappings (
--   id, zenbooker_service_id, zenbooker_service_name,
--   zenbooker_modifier_id, zenbooker_modifier_name,
--   item_id, default_qty, use_customer_qty, notes
-- ) VALUES
-- (uuid_generate_v4(), '<LAWN_GAMES_SERVICE_ID>', 'Lawn Games', '1751332968147x690528272967336800', 'Horseshoes',       'horseshoes',  1, false, ''),
-- (uuid_generate_v4(), '<LAWN_GAMES_SERVICE_ID>', 'Lawn Games', '1751332968147x113772621024163630', 'Deluxe Jenga',     'mega_jenga',  1, false, ''),
-- (uuid_generate_v4(), '<LAWN_GAMES_SERVICE_ID>', 'Lawn Games', '1751332968147x866227883527524400', 'Bucket Golf',      'bucket_golf', 1, false, ''),
-- (uuid_generate_v4(), '<LAWN_GAMES_SERVICE_ID>', 'Lawn Games', '1751332968147x728434016101242000', 'Giant Chess Set',  'mega_chess',  1, false, '');
