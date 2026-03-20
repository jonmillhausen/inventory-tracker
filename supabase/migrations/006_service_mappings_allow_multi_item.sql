-- Allow multiple equipment items per (service_id, modifier_id) combination.
-- This supports cases like "Full Obstacle Course" which maps to both
-- warped_wall AND obstacles_only from a single modifier option.
ALTER TABLE service_mappings DROP CONSTRAINT IF EXISTS service_mappings_unique;
