-- Add categories array column to equipment table.
-- Run this migration in Supabase before deploying the categories UI.
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}';
