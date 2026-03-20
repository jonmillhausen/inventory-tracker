-- ── Party Pack Bundle service mappings ───────────────────────────────────────
-- Service: Party Pack Bundle (zenbooker_service_id: 1771765253169x998239150834291000)
-- Event type: dropoff (already handled by DELIVERY_SERVICES in route.ts)
--
-- The bundle picker fields each have unique option IDs separate from standalone
-- Lawn Games. Only options seen in real bookings are listed here — new option IDs
-- will be discovered as bookings arrive and should be added to this migration's
-- successor. Unknown options (e.g. Hoverball, Gaga Ball Pit) will appear as
-- name-fallback or silent-skip entries in webhook_logs.result_detail.

INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES

  -- ── Lawn Game 1 of 3 (field: 1771765253360x886967315941466100) ─────────────
  (uuid_generate_v4(), '1771765253169x998239150834291000', 'Party Pack Bundle',
   '1771765255587x368451212595702660', 'Yard Pong',
   'yard_pong', 1, false, false, 'Lawn Game 1 of 3'),

  -- ── Lawn Game 2 of 3 (field: 1771765253360x323076900682234050) ─────────────
  (uuid_generate_v4(), '1771765253169x998239150834291000', 'Party Pack Bundle',
   '1771765255919x606960127491709100', 'Giant Jenga (stacks 5 ft)',
   'mega_jenga', 1, false, false, 'Lawn Game 2 of 3'),

  -- ── Lawn Game 3 of 3 (field: 1771765253360x739564067191466800) ─────────────
  (uuid_generate_v4(), '1771765253169x998239150834291000', 'Party Pack Bundle',
   '1771765256246x313487048691224700', 'Giant Connect 4',
   'connect_4', 1, false, false, 'Lawn Game 3 of 3'),

  -- ── Choose Your Deluxe Lawn Game (field: 1771766517099x394611275074109400) ──
  (uuid_generate_v4(), '1771765253169x998239150834291000', 'Party Pack Bundle',
   '1771766517099x332642742131752960', 'Deluxe Wood Cornhole',
   'deluxe_cornhole', 1, false, false, 'Deluxe Lawn Game'),

  -- ── Choose Your Specialty Game (field: 1771765253360x784783149550787600) ────
  -- Only Dart Board seen so far. Hoverball and Gaga Ball Pit IDs unknown —
  -- they will appear in webhook_logs.result_detail as name-fallback entries
  -- once a booking with those options comes in.
  (uuid_generate_v4(), '1771765253169x998239150834291000', 'Party Pack Bundle',
   '1771765254956x927894578126875000', 'Giant Velcro Dartboard',
   'dart_board', 1, false, false, 'Specialty Game'),

  -- ── Delivery / Pick-up Preference (field: 1771766946843x725949985310638100) ─
  -- Logistics options — not equipment. Skip so they do not reach name-fallback.
  (uuid_generate_v4(), '1771765253169x998239150834291000', 'Party Pack Bundle',
   '1771766991775x202344261911838700', 'Detailed Delivery (1-Hour Window)',
   NULL, 0, false, true, 'logistics'),

  -- ── Optional Add-Ons (field: 1771765253360x484608838302137200) ───────────────
  (uuid_generate_v4(), '1771765253169x998239150834291000', 'Party Pack Bundle',
   '1771767050977x491065804582289400', 'Full Lawn Game Setup',
   NULL, 0, false, true, 'service add-on, not a physical item'),

  -- ── How would you like to book? ───────────────────────────────────────────────
  (uuid_generate_v4(), '1771765253169x998239150834291000', 'Party Pack Bundle',
   '1771765253744x262579773120799940', 'Get a Custom Quote',
   NULL, 0, false, true, 'booking method metadata')

ON CONFLICT DO NOTHING;
