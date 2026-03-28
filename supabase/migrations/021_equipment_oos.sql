-- Add equipment_oos table for detailed out-of-service tracking.
-- Replaces the coarse integer out_of_service column on equipment for UI/availability purposes.
-- Active records = rows where returned_at IS NULL.

CREATE TABLE equipment_oos (
  id                   uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id         text        NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  quantity             int         NOT NULL DEFAULT 1 CHECK (quantity > 0),
  issue_description    text,
  expected_return_date date,
  returned_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- RLS: matches the pattern used for out_of_service_items in 001_initial_schema.sql.
-- createClient() (server routes) uses the user JWT + get_my_role(), not the service role key.
ALTER TABLE equipment_oos ENABLE ROW LEVEL SECURITY;

CREATE POLICY oos_equipment_select ON equipment_oos FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY oos_equipment_insert ON equipment_oos FOR INSERT
  WITH CHECK (get_my_role() IN ('admin', 'staff'));

CREATE POLICY oos_equipment_update ON equipment_oos FOR UPDATE
  USING (get_my_role() IN ('admin', 'staff'));
