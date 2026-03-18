-- ===========================
-- EXTENSIONS
-- ===========================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================
-- ENUMS
-- ===========================

CREATE TYPE user_role AS ENUM ('admin', 'sales', 'staff', 'readonly');
CREATE TYPE booking_status AS ENUM ('confirmed', 'canceled', 'completed', 'needs_review');
CREATE TYPE event_type AS ENUM ('coordinated', 'dropoff', 'pickup', 'willcall');
CREATE TYPE booking_source AS ENUM ('webhook', 'manual');
CREATE TYPE item_type AS ENUM ('equipment', 'sub_item');
CREATE TYPE resolved_action AS ENUM ('cleared', 'moved_to_oos');
CREATE TYPE webhook_result AS ENUM ('success', 'error', 'unmapped_service', 'skipped');

-- ===========================
-- TABLES
-- ===========================

-- Users (extends Supabase auth.users)
CREATE TABLE users (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  text        NOT NULL,
  role       user_role   NOT NULL DEFAULT 'readonly',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Equipment items
CREATE TABLE equipment (
  id                 text        PRIMARY KEY,
  name               text        NOT NULL,
  total_qty          int         NOT NULL DEFAULT 0,
  out_of_service     int         NOT NULL DEFAULT 0,  -- maintained by trigger
  issue_flag         int         NOT NULL DEFAULT 0,  -- maintained by trigger
  is_active          bool        NOT NULL DEFAULT true,
  custom_setup_min   int,
  custom_cleanup_min int,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Equipment sub-items (e.g. "Foam Machine Supplies" under "Foam Machine")
CREATE TABLE equipment_sub_items (
  id             text  PRIMARY KEY,
  parent_id      text  NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  name           text  NOT NULL,
  total_qty      int   NOT NULL DEFAULT 0,
  out_of_service int   NOT NULL DEFAULT 0,  -- maintained by trigger
  issue_flag     int   NOT NULL DEFAULT 0,  -- maintained by trigger
  is_active      bool  NOT NULL DEFAULT true
);

-- Issue flags (damaged / needs attention)
CREATE TABLE issue_flag_items (
  id              uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id         text          NOT NULL,
  item_type       item_type     NOT NULL,
  qty             int           NOT NULL DEFAULT 1,
  note            text          NOT NULL DEFAULT '',
  reported_at     timestamptz   NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolved_action resolved_action
);

-- Out-of-service tracking
CREATE TABLE out_of_service_items (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id     text        NOT NULL,
  item_type   item_type   NOT NULL,
  qty         int         NOT NULL DEFAULT 1,
  note        text        NOT NULL DEFAULT '',
  return_date date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz
);

-- Delivery chains (e.g. "Chain #1", "Chain #2")
CREATE TABLE chains (
  id        text  PRIMARY KEY,
  name      text  NOT NULL,
  color     text  NOT NULL DEFAULT '#6366f1',
  is_active bool  NOT NULL DEFAULT true
);

-- Bookings
CREATE TABLE bookings (
  id                uuid           PRIMARY KEY DEFAULT uuid_generate_v4(),
  zenbooker_job_id  text           NOT NULL,
  customer_name     text           NOT NULL DEFAULT '',
  event_date        date           NOT NULL,
  end_date          date,
  start_time        time           NOT NULL,
  end_time          time           NOT NULL,
  chain             text           REFERENCES chains(id) ON DELETE SET NULL,
  status            booking_status NOT NULL DEFAULT 'confirmed',
  event_type        event_type     NOT NULL DEFAULT 'coordinated',
  source            booking_source NOT NULL DEFAULT 'manual',
  address           text           NOT NULL DEFAULT '',
  notes             text           NOT NULL DEFAULT '',
  created_at        timestamptz    NOT NULL DEFAULT now(),
  updated_at        timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT bookings_zenbooker_job_id_unique UNIQUE (zenbooker_job_id)
);

-- Line items per booking
CREATE TABLE booking_items (
  id             uuid  PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id     uuid  NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  item_id        text  NOT NULL,
  qty            int   NOT NULL DEFAULT 1,
  is_sub_item    bool  NOT NULL DEFAULT false,
  parent_item_id text
);

-- Maps Zenbooker staff members to delivery chains
CREATE TABLE chain_mappings (
  id                    uuid  PRIMARY KEY DEFAULT uuid_generate_v4(),
  zenbooker_staff_id    text  NOT NULL,
  zenbooker_staff_name  text  NOT NULL DEFAULT '',
  chain_id              text  NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
  notes                 text  NOT NULL DEFAULT ''
);

-- Maps Zenbooker services/modifiers to inventory items
CREATE TABLE service_mappings (
  id                      uuid  PRIMARY KEY DEFAULT uuid_generate_v4(),
  zenbooker_service_id    text  NOT NULL,
  zenbooker_service_name  text  NOT NULL DEFAULT '',
  zenbooker_modifier_id   text,
  zenbooker_modifier_name text,
  item_id                 text  NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  default_qty             int   NOT NULL DEFAULT 1,
  use_customer_qty        bool  NOT NULL DEFAULT false,
  notes                   text  NOT NULL DEFAULT '',
  -- Prevent duplicate standalone service rows (modifier_id IS NULL)
  -- Prevent duplicate bundle modifier rows (modifier_id IS NOT NULL)
  CONSTRAINT service_mappings_unique
    UNIQUE NULLS NOT DISTINCT (zenbooker_service_id, zenbooker_modifier_id)
);

-- Audit log of every incoming Zenbooker webhook call
CREATE TABLE webhook_logs (
  id               uuid           PRIMARY KEY DEFAULT uuid_generate_v4(),
  received_at      timestamptz    NOT NULL DEFAULT now(),
  zenbooker_job_id text           NOT NULL DEFAULT '',
  action           text           NOT NULL DEFAULT '',
  raw_payload      jsonb          NOT NULL DEFAULT '{}',
  result           webhook_result,
  result_detail    text,
  booking_id       uuid           REFERENCES bookings(id) ON DELETE SET NULL
);

-- ===========================
-- UPDATED_AT TRIGGERS
-- ===========================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER equipment_updated_at
  BEFORE UPDATE ON equipment
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================
-- ISSUE FLAG COUNT TRIGGER
-- Recalculates equipment.issue_flag or equipment_sub_items.issue_flag
-- after any INSERT/UPDATE/DELETE on issue_flag_items.
-- ===========================

CREATE OR REPLACE FUNCTION update_issue_flag_count()
RETURNS TRIGGER AS $$
DECLARE
  v_item_id   text;
  v_item_type item_type;
  v_count     int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_item_id   := OLD.item_id;
    v_item_type := OLD.item_type;
  ELSE
    v_item_id   := NEW.item_id;
    v_item_type := NEW.item_type;
  END IF;

  SELECT COALESCE(SUM(qty), 0) INTO v_count
  FROM issue_flag_items
  WHERE item_id = v_item_id
    AND item_type = v_item_type
    AND resolved_at IS NULL;

  IF v_item_type = 'equipment' THEN
    UPDATE equipment SET issue_flag = v_count WHERE id = v_item_id;
  ELSE
    UPDATE equipment_sub_items SET issue_flag = v_count WHERE id = v_item_id;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER issue_flag_items_count
  AFTER INSERT OR UPDATE OR DELETE ON issue_flag_items
  FOR EACH ROW EXECUTE FUNCTION update_issue_flag_count();

-- ===========================
-- OUT-OF-SERVICE COUNT TRIGGER
-- ===========================

CREATE OR REPLACE FUNCTION update_out_of_service_count()
RETURNS TRIGGER AS $$
DECLARE
  v_item_id   text;
  v_item_type item_type;
  v_count     int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_item_id   := OLD.item_id;
    v_item_type := OLD.item_type;
  ELSE
    v_item_id   := NEW.item_id;
    v_item_type := NEW.item_type;
  END IF;

  SELECT COALESCE(SUM(qty), 0) INTO v_count
  FROM out_of_service_items
  WHERE item_id = v_item_id
    AND item_type = v_item_type
    AND returned_at IS NULL;

  IF v_item_type = 'equipment' THEN
    UPDATE equipment SET out_of_service = v_count WHERE id = v_item_id;
  ELSE
    UPDATE equipment_sub_items SET out_of_service = v_count WHERE id = v_item_id;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER out_of_service_items_count
  AFTER INSERT OR UPDATE OR DELETE ON out_of_service_items
  FOR EACH ROW EXECUTE FUNCTION update_out_of_service_count();

-- ===========================
-- ROW LEVEL SECURITY
-- ===========================

-- Helper: fetch the authenticated user's role (cached per statement)
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Enable RLS on all tables
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment           ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_sub_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_flag_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE out_of_service_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE chains              ENABLE ROW LEVEL SECURITY;
ALTER TABLE chain_mappings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_mappings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs        ENABLE ROW LEVEL SECURITY;

-- users: own row always; admin reads all
CREATE POLICY users_select ON users FOR SELECT
  USING (id = auth.uid() OR get_my_role() = 'admin');
CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK (get_my_role() = 'admin');
CREATE POLICY users_update ON users FOR UPDATE
  USING (get_my_role() = 'admin');
CREATE POLICY users_delete ON users FOR DELETE
  USING (get_my_role() = 'admin');

-- equipment: all authenticated can read; admin writes
CREATE POLICY equipment_select ON equipment FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY equipment_insert ON equipment FOR INSERT
  WITH CHECK (get_my_role() = 'admin');
CREATE POLICY equipment_update ON equipment FOR UPDATE
  USING (get_my_role() = 'admin');
CREATE POLICY equipment_delete ON equipment FOR DELETE
  USING (get_my_role() = 'admin');

-- equipment_sub_items: same as equipment
CREATE POLICY sub_items_select ON equipment_sub_items FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY sub_items_insert ON equipment_sub_items FOR INSERT
  WITH CHECK (get_my_role() = 'admin');
CREATE POLICY sub_items_update ON equipment_sub_items FOR UPDATE
  USING (get_my_role() = 'admin');
CREATE POLICY sub_items_delete ON equipment_sub_items FOR DELETE
  USING (get_my_role() = 'admin');

-- issue_flag_items: all authenticated can read (required for Realtime cross-session)
--   admin/sales/staff can create; admin/sales can update; admin can delete
CREATE POLICY issue_flags_select ON issue_flag_items FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY issue_flags_insert ON issue_flag_items FOR INSERT
  WITH CHECK (get_my_role() IN ('admin', 'sales', 'staff'));
CREATE POLICY issue_flags_update ON issue_flag_items FOR UPDATE
  USING (get_my_role() IN ('admin', 'sales'));
CREATE POLICY issue_flags_delete ON issue_flag_items FOR DELETE
  USING (get_my_role() = 'admin');

-- out_of_service_items: all authenticated read; admin writes
CREATE POLICY oos_select ON out_of_service_items FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY oos_insert ON out_of_service_items FOR INSERT
  WITH CHECK (get_my_role() = 'admin');
CREATE POLICY oos_update ON out_of_service_items FOR UPDATE
  USING (get_my_role() = 'admin');
CREATE POLICY oos_delete ON out_of_service_items FOR DELETE
  USING (get_my_role() = 'admin');

-- bookings: all authenticated read; admin/sales write
CREATE POLICY bookings_select ON bookings FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY bookings_insert ON bookings FOR INSERT
  WITH CHECK (get_my_role() IN ('admin', 'sales'));
CREATE POLICY bookings_update ON bookings FOR UPDATE
  USING (get_my_role() IN ('admin', 'sales'));
CREATE POLICY bookings_delete ON bookings FOR DELETE
  USING (get_my_role() IN ('admin', 'sales'));

-- booking_items: same as bookings
CREATE POLICY booking_items_select ON booking_items FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY booking_items_insert ON booking_items FOR INSERT
  WITH CHECK (get_my_role() IN ('admin', 'sales'));
CREATE POLICY booking_items_update ON booking_items FOR UPDATE
  USING (get_my_role() IN ('admin', 'sales'));
CREATE POLICY booking_items_delete ON booking_items FOR DELETE
  USING (get_my_role() IN ('admin', 'sales'));

-- chains: all authenticated read; admin writes
CREATE POLICY chains_select ON chains FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY chains_insert ON chains FOR INSERT
  WITH CHECK (get_my_role() = 'admin');
CREATE POLICY chains_update ON chains FOR UPDATE
  USING (get_my_role() = 'admin');
CREATE POLICY chains_delete ON chains FOR DELETE
  USING (get_my_role() = 'admin');

-- chain_mappings: all authenticated read; admin writes
CREATE POLICY chain_mappings_select ON chain_mappings FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY chain_mappings_insert ON chain_mappings FOR INSERT
  WITH CHECK (get_my_role() = 'admin');
CREATE POLICY chain_mappings_update ON chain_mappings FOR UPDATE
  USING (get_my_role() = 'admin');
CREATE POLICY chain_mappings_delete ON chain_mappings FOR DELETE
  USING (get_my_role() = 'admin');

-- service_mappings: all authenticated read; admin writes
CREATE POLICY service_mappings_select ON service_mappings FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY service_mappings_insert ON service_mappings FOR INSERT
  WITH CHECK (get_my_role() = 'admin');
CREATE POLICY service_mappings_update ON service_mappings FOR UPDATE
  USING (get_my_role() = 'admin');
CREATE POLICY service_mappings_delete ON service_mappings FOR DELETE
  USING (get_my_role() = 'admin');

-- webhook_logs: admin reads; service role writes (API routes use service role key)
CREATE POLICY webhook_logs_select ON webhook_logs FOR SELECT
  USING (get_my_role() = 'admin');
-- INSERT/UPDATE handled by service role (bypasses RLS) in API routes

-- ===========================
-- REALTIME PUBLICATIONS
-- ===========================

ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE equipment;
ALTER PUBLICATION supabase_realtime ADD TABLE equipment_sub_items;
ALTER PUBLICATION supabase_realtime ADD TABLE service_mappings;
ALTER PUBLICATION supabase_realtime ADD TABLE issue_flag_items;
ALTER PUBLICATION supabase_realtime ADD TABLE out_of_service_items;
