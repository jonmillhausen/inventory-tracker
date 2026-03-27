-- ── New equipment items ──────────────────────────────────────────────────────
INSERT INTO equipment (id, name, total_qty, is_active) VALUES
  ('generator',          'Generator',         2, true),
  ('bluetooth_speaker',  'Bluetooth Speaker', 4, true)
ON CONFLICT (id) DO NOTHING;

-- ── Generator service mapping ────────────────────────────────────────────────
-- parseV1Job routes any service name containing 'generator' to 'v1:generator'
-- BEFORE the admin-skip check, so "Generator, Set Up/Break Down" still maps
-- equipment rather than being silently dropped.
-- Base mapping (no modifier): always qty 1.
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES (
  uuid_generate_v4(),
  'v1:generator', 'Generator',
  NULL, NULL,
  'generator', 1, false, false,
  'v1 synthetic: any service name containing "Generator"'
)
ON CONFLICT DO NOTHING;

-- ── Bluetooth Speaker service mapping ────────────────────────────────────────
-- parseV1Job routes any service name containing 'speaker' or 'bluetooth'
-- to 'v1:bluetooth_speaker'. Base mapping, qty 1.
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES (
  uuid_generate_v4(),
  'v1:bluetooth_speaker', 'Bluetooth Speaker',
  NULL, NULL,
  'bluetooth_speaker', 1, false, false,
  'v1 synthetic: any service name containing "speaker" or "bluetooth"'
)
ON CONFLICT DO NOTHING;
