-- Add transcript column to sermons table for auto-ingest
ALTER TABLE sermons ADD COLUMN transcript TEXT;
