-- Add chain_loading_overrides and chain_loading_notes for chain loading display overrides and item notes.

CREATE TABLE chain_loading_overrides (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  chain_id text NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  sub_item_id text NOT NULL REFERENCES equipment_sub_items(id) ON DELETE CASCADE,
  qty_override int NOT NULL CHECK (qty_override >= 0),
  created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, event_date, sub_item_id)
);

CREATE TABLE chain_loading_notes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  chain_id text NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  item_id text NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('equipment', 'sub_item', 'chain')),
  note text NOT NULL,
  created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, event_date, item_id, item_type)
);

ALTER TABLE chain_loading_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE chain_loading_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY chain_loading_overrides_select ON chain_loading_overrides FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY chain_loading_overrides_insert ON chain_loading_overrides FOR INSERT
  WITH CHECK (get_my_role() IN ('admin', 'sales'));

CREATE POLICY chain_loading_overrides_update ON chain_loading_overrides FOR UPDATE
  USING (get_my_role() IN ('admin', 'sales'));

CREATE POLICY chain_loading_overrides_delete ON chain_loading_overrides FOR DELETE
  USING (get_my_role() IN ('admin', 'sales'));

CREATE POLICY chain_loading_notes_select ON chain_loading_notes FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY chain_loading_notes_insert ON chain_loading_notes FOR INSERT
  WITH CHECK (get_my_role() IN ('admin', 'sales'));

CREATE POLICY chain_loading_notes_update ON chain_loading_notes FOR UPDATE
  USING (get_my_role() IN ('admin', 'sales'));

CREATE POLICY chain_loading_notes_delete ON chain_loading_notes FOR DELETE
  USING (get_my_role() IN ('admin', 'sales'));
