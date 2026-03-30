-- 024: Add missing v1 service mapping rows for Obstacle Course and Foam Party generator options

-- Full Obstacle Course modifier option mappings
-- This maps the actual Full Obstacle Course option ID to both obstacle components.
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES
  (uuid_generate_v4(),
   '1749611522093x499322152628127740', 'Obstacle Course',
   '1749611737475x335609565004431360', 'Full Obstacle Course',
   'warped_wall', 1, false, false, 'v1: Full Obstacle Course option maps to warped_wall'),
  (uuid_generate_v4(),
   '1749611522093x499322152628127740', 'Obstacle Course',
   '1749611737475x335609565004431360', 'Full Obstacle Course',
   'obstacles_only', 1, false, false, 'v1: Full Obstacle Course option maps to obstacles_only')
ON CONFLICT DO NOTHING;

-- Foam Party generator add-on mapping
-- Map the generator option ID to the generator equipment for Foam Party bookings.
INSERT INTO service_mappings (
  id, zenbooker_service_id, zenbooker_service_name,
  zenbooker_modifier_id, zenbooker_modifier_name,
  item_id, default_qty, use_customer_qty, is_skip, notes
) VALUES (
  uuid_generate_v4(),
  '1747519305540x667111821234667500', 'Foam Party Staff Coordinated',
  '1749426899337x749228202801496000', 'Generator',
  'generator', 1, false, false,
  'v1: specific Foam Party generator option mapping'
)
ON CONFLICT DO NOTHING;
