-- 029: Comprehensive bundle / package service_mappings audit-driven fixes.
--      Identified by scanning every selected_options entry across 8000+
--      webhook_logs against the current service_mappings table.
--
--      Generator audit was clean after migration 028 — every distinct
--      generator option ID seen in webhook_logs is already mapped, so this
--      migration adds no further generator rows.
--
--      Bundle/package services with incomplete coverage:
--        - Big Bash Bundle    (1771773473143x477742156759559900)
--        - Party Pack Bundle  (1771765253169x998239150834291000)
--        - 2-Game Party Bundle (1771172713172x484717009863034240)
--        - 3-Game Party Bundle (1771390362580x452699813533756540)
--        - Backyard Classic   (1771193436147x922879636265914600)
--      Each option ID below was observed in real webhook payloads.

-- ── Big Bash Bundle ────────────────────────────────────────────────────────
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES
  (uuid_generate_v4(),
   '1771773473143x477742156759559900', 'Big Bash Bundle',
   '1771773473933x886477920496028000', 'Cornhole',
   'cornhole', 1, false, false, 'bundle lawn game'),
  (uuid_generate_v4(),
   '1771773473143x477742156759559900', 'Big Bash Bundle',
   '1771773474233x588538129838712700', 'Giant Connect 4',
   'connect_4', 1, false, false, 'bundle lawn game'),
  (uuid_generate_v4(),
   '1771773473143x477742156759559900', 'Big Bash Bundle',
   '1771773474539x840789329770526000', 'Giant Jenga (stacks 5 ft)',
   'mega_jenga', 1, false, false, 'bundle lawn game — 5ft = mega'),
  (uuid_generate_v4(),
   '1771773473143x477742156759559900', 'Big Bash Bundle',
   '1771773889076x612095083973705700', 'Yard Pong',
   'yard_pong', 1, false, false, 'bundle lawn game'),
  (uuid_generate_v4(),
   '1771773473143x477742156759559900', 'Big Bash Bundle',
   '1771773474830x296520631484850750', 'Giant Checkers',
   'mega_checkers', 1, false, false, 'bundle lawn game'),
  (uuid_generate_v4(),
   '1771773473143x477742156759559900', 'Big Bash Bundle',
   '1771773760965x943188468049117200', 'Deluxe Wood Cornhole',
   'deluxe_cornhole', 1, false, false, 'bundle lawn game'),
  (uuid_generate_v4(),
   '1771773473143x477742156759559900', 'Big Bash Bundle',
   '1771773475167x792060764673586000', 'Gaga Ball Pit',
   'gaga_pit', 1, false, false, 'bundle lawn game'),
  (uuid_generate_v4(),
   '1771773473143x477742156759559900', 'Big Bash Bundle',
   '1771773475445x785606820892414100', 'Standard Delivery',
   NULL, 0, false, true, 'logistics — no equipment'),
  (uuid_generate_v4(),
   '1771773473143x477742156759559900', 'Big Bash Bundle',
   '1771773475816x265681934301573730', 'Full Lawn Game Setup',
   NULL, 0, false, true, 'logistics — no equipment')
ON CONFLICT DO NOTHING;

-- ── Party Pack Bundle ──────────────────────────────────────────────────────
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES
  (uuid_generate_v4(),
   '1771765253169x998239150834291000', 'Party Pack Bundle',
   '1771765255587x267259863078787000', 'Battleputt Golf',
   'battleputt', 1, false, false, 'bundle lawn game'),
  (uuid_generate_v4(),
   '1771765253169x998239150834291000', 'Party Pack Bundle',
   '1771765256246x228049464726936670', 'Cornhole',
   'cornhole', 1, false, false, 'bundle lawn game'),
  (uuid_generate_v4(),
   '1771765253169x998239150834291000', 'Party Pack Bundle',
   '1771766584749x143068554803019780', 'Giant Chess',
   'mega_chess', 1, false, false, 'bundle lawn game'),
  (uuid_generate_v4(),
   '1771765253169x998239150834291000', 'Party Pack Bundle',
   '1771765254956x714935030128610600', 'Gaga Ball Pit',
   'gaga_pit', 1, false, false, 'bundle lawn game')
ON CONFLICT DO NOTHING;

-- ── 2-Game Party Bundle ────────────────────────────────────────────────────
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES
  (uuid_generate_v4(),
   '1771172713172x484717009863034240', '2-Game Party Bundle',
   '1771191016403x668171731243892700', '60 Minutes Per Game',
   NULL, 0, false, true, 'meta-option (per-game duration) — no equipment')
ON CONFLICT DO NOTHING;

-- ── 3-Game Party Bundle ────────────────────────────────────────────────────
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES
  (uuid_generate_v4(),
   '1771390362580x452699813533756540', '3-Game Party Bundle',
   '1771390364511x383849199952319040', 'Get a Custom Quote',
   NULL, 0, false, true, 'meta-option (booking method) — no equipment'),
  (uuid_generate_v4(),
   '1771390362580x452699813533756540', '3-Game Party Bundle',
   '1771390363787x431185785167733000', '60 Minutes Per Game',
   NULL, 0, false, true, 'meta-option (per-game duration) — no equipment')
ON CONFLICT DO NOTHING;

-- ── Backyard Classic ───────────────────────────────────────────────────────
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES
  (uuid_generate_v4(),
   '1771193436147x922879636265914600', 'Backyard Classic',
   '1771696908852x482839198842748900', 'Get a Custom Quote',
   NULL, 0, false, true, 'meta-option (booking method) — no equipment')
ON CONFLICT DO NOTHING;
