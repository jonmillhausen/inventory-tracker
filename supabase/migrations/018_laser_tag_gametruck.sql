-- ── Laser Tag (GameTruck) service mapping ────────────────────────────────────
-- parseV1Job emits service_id='v1:laser_tag_gametruck' for any service name
-- containing 'gametruck' (case-insensitive).  Maps to laser_tag_lite with qty
-- parsed from the pricing_summary numeric prefix; defaults to 20 if not found.
-- Modifier row so resolveWebhookItems fires the modifier path and respects qty.
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES (
  uuid_generate_v4(),
  'v1:laser_tag_gametruck', 'Laser Tag (GameTruck)',
  'v1_lt_gametruck', 'Laser Tag (GameTruck)',
  'laser_tag_lite', 20, true, false,
  'v1 synthetic: any service name containing "gametruck"; qty from pricing_summary or default 20'
)
ON CONFLICT DO NOTHING;
