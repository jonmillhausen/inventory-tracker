-- ── Equipment sub-item links ─────────────────────────────────────────────────
-- Replaces the implicit single-parent relationship in equipment_sub_items.parent_id
-- with an explicit many-to-many junction table that also carries loadout_qty.
--
-- loadout_qty: how many of this sub-item to pack per 1 unit of the parent.
-- e.g. foam_machine → blower_motor with loadout_qty=1 means: pack 1 blower per
-- foam machine booked. A sub-item can now appear under multiple parent items.
--
-- equipment_sub_items.parent_id is kept as a non-null fallback column and will
-- be removed in a future migration once all callers use this table exclusively.

CREATE TABLE equipment_sub_item_links (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sub_item_id text NOT NULL REFERENCES equipment_sub_items(id) ON DELETE CASCADE,
  parent_id   text NOT NULL REFERENCES equipment(id)           ON DELETE CASCADE,
  loadout_qty int  NOT NULL DEFAULT 1 CHECK (loadout_qty > 0),
  UNIQUE (sub_item_id, parent_id)
);

-- Backfill from existing parent_id (loadout_qty defaults to 1)
INSERT INTO equipment_sub_item_links (sub_item_id, parent_id, loadout_qty)
SELECT id, parent_id, 1
FROM equipment_sub_items
ON CONFLICT DO NOTHING;

-- RLS: same policy shape as equipment_sub_items
ALTER TABLE equipment_sub_item_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY sub_item_links_select ON equipment_sub_item_links FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY sub_item_links_insert ON equipment_sub_item_links FOR INSERT
  WITH CHECK (get_my_role() = 'admin');
CREATE POLICY sub_item_links_update ON equipment_sub_item_links FOR UPDATE
  USING (get_my_role() = 'admin');
CREATE POLICY sub_item_links_delete ON equipment_sub_item_links FOR DELETE
  USING (get_my_role() = 'admin');
