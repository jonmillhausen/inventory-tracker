-- Grant schema usage and table access to Supabase roles.
-- Tables were created via SQL migration (not the Supabase dashboard), so
-- privileges were not applied automatically. Without these, any query from
-- the anon/authenticated roles fails with "permission denied for table …"
-- before RLS policies even run.
--
-- RLS is already enabled on every table, so these grants don't bypass
-- row-level security — they just allow the roles to attempt queries.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES  IN SCHEMA public TO anon, authenticated, service_role;

-- Ensure future tables created in this schema also get the same grants
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON ROUTINES  TO anon, authenticated, service_role;
