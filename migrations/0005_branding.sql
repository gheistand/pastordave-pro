-- Phase 6A: Church branding fields + users.church_id
ALTER TABLE users ADD COLUMN church_id TEXT;
ALTER TABLE churches ADD COLUMN logo_url TEXT;
ALTER TABLE churches ADD COLUMN accent_color TEXT DEFAULT '#7c4f2a';
ALTER TABLE churches ADD COLUMN display_name TEXT;

-- Manual step after migration:
-- UPDATE users SET church_id = 'new-horizon-champaign' WHERE tier = 'church';
