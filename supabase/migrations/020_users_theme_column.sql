-- Add theme preference column to users table.
-- Stores the user's preferred UI color scheme, persisted per account.
-- Default 'light' so existing users see no change before they toggle.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS theme text DEFAULT 'light'
  CONSTRAINT users_theme_check CHECK (theme IN ('light', 'dark'));
