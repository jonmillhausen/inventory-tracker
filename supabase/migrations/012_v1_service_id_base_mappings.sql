-- ── v1 service_id base mappings ───────────────────────────────────────────────
-- The Zenbooker v1 API exposes different service_id values than v3 webhooks
-- for the same services. These base mappings (NULL modifier) ensure the bulk
-- import resolves items correctly for Laser Tag and Bubble Ball.

-- ── Elite Laser Tag (v1 service_id) ──────────────────────────────────────────
-- service_id from v1 API; v3 webhook uses a different ID already mapped.
-- use_customer_qty = true: quantity is read from the service option field.
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES (
  uuid_generate_v4(),
  '1747883952074x309158420488483400',
  'Elite Laser Tag',
  NULL, NULL,
  'elite_laser_tag', 1, true, false,
  'v1 service_id — qty comes from service option quantity field'
) ON CONFLICT DO NOTHING;

-- ── Bubble Ball (v1 service_id) ───────────────────────────────────────────────
-- service_id from v1 API.
-- use_customer_qty = true: quantity is read from the service option field.
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES (
  uuid_generate_v4(),
  '1747439051481x330563883501879300',
  'Bubble Ball',
  NULL, NULL,
  'bubbleball', 1, true, false,
  'v1 service_id — qty comes from service option quantity field'
) ON CONFLICT DO NOTHING;
