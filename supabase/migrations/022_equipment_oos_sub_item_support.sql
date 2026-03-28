-- Allow equipment_oos records to track sub-items as well as primary equipment.
-- Pattern: nullable equipment_id OR sub_item_id, enforced by CHECK constraint.

ALTER TABLE equipment_oos ALTER COLUMN equipment_id DROP NOT NULL;

ALTER TABLE equipment_oos
  ADD COLUMN sub_item_id text REFERENCES equipment_sub_items(id) ON DELETE CASCADE;

-- Exactly one of equipment_id / sub_item_id must be set.
ALTER TABLE equipment_oos
  ADD CONSTRAINT oos_item_exactly_one CHECK (
    (equipment_id IS NOT NULL AND sub_item_id IS NULL) OR
    (equipment_id IS NULL AND sub_item_id IS NOT NULL)
  );
