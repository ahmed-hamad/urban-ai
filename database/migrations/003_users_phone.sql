-- 003_users_phone.sql
-- Adds phone column to users table for contact information.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
