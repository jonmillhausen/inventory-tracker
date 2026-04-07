-- Equipment damage/missing report submissions
CREATE TABLE equipment_reports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  staff_name text NOT NULL,
  equipment_id text NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  sub_item_id text REFERENCES equipment_sub_items(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('damaged', 'missing')),
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  note text,
  flag_created boolean NOT NULL DEFAULT false
);

ALTER TABLE equipment_reports ENABLE ROW LEVEL SECURITY;

-- Public insert (no auth required)
CREATE POLICY equipment_reports_insert ON equipment_reports
  FOR INSERT WITH CHECK (true);

-- Only authenticated users can read
CREATE POLICY equipment_reports_select ON equipment_reports
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Allow authenticated users to update (for setting flag_created)
CREATE POLICY equipment_reports_update ON equipment_reports
  FOR UPDATE USING (auth.uid() IS NOT NULL);
