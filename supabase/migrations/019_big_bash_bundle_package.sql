-- ── Big Bash Bundle Package - Drop-Off service mapping ───────────────────────
-- parseV1Job emits service_id='v1:big_bash_bundle_package' for any v1 service
-- name containing 'big bash bundle package'.  The base is_skip mapping prevents
-- unmapped_service when no game option modifier IDs are known yet — the booking
-- imports as event_type='dropoff' with no equipment items rather than flagging.
-- Individual game option modifier mappings will be added as bookings arrive.
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES (
  uuid_generate_v4(),
  'v1:big_bash_bundle_package', 'Big Bash Bundle Package - Drop-Off',
  NULL, NULL,
  NULL, 1, false, true,
  'base is_skip: suppresses unmapped_service until game option modifier IDs are mapped'
)
ON CONFLICT DO NOTHING;
