-- Discipleship Group Tools schema
-- 2026-03-24

ALTER TABLE sermons ADD COLUMN reading_theme TEXT;

CREATE TABLE IF NOT EXISTS group_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  church_id TEXT NOT NULL,
  group_name TEXT NOT NULL,
  group_description TEXT,
  group_type TEXT,
  leader_name TEXT,
  meeting_day TEXT NOT NULL,
  meeting_time TEXT,
  meeting_location TEXT,
  default_meeting_length INTEGER DEFAULT 75,
  bible_translation TEXT DEFAULT 'NLT',
  follow_tyndale INTEGER DEFAULT 1,
  use_hhh_framework INTEGER DEFAULT 1,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS discussion_guides (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  group_profile_id TEXT NOT NULL,
  church_id TEXT NOT NULL,
  meeting_date TEXT,
  week_theme TEXT,
  sermon_id TEXT,
  sermon_title TEXT,
  sermon_scripture TEXT,
  sermon_summary TEXT,
  reading_window_start TEXT,
  reading_window_end TEXT,
  readings_json TEXT,
  meeting_length INTEGER,
  guide_json TEXT,
  guide_markdown TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS meeting_agendas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  group_profile_id TEXT NOT NULL,
  discussion_guide_id TEXT,
  meeting_date TEXT,
  meeting_location TEXT,
  leader_name TEXT,
  opening_prayer_leader TEXT,
  closing_prayer_leader TEXT,
  worship_song TEXT,
  announcements TEXT,
  next_week_preview TEXT,
  agenda_markdown TEXT,
  share_token TEXT UNIQUE,
  created_at INTEGER
);
