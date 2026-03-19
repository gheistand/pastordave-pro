CREATE TABLE IF NOT EXISTS sermons (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  title TEXT NOT NULL,
  pastor TEXT,
  date TEXT,
  series TEXT,
  scripture TEXT,
  transcript TEXT,
  summary TEXT,
  key_points TEXT,
  discussion_questions TEXT,
  youtube_id TEXT,
  created_at INTEGER NOT NULL
);
