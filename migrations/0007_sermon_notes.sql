CREATE TABLE IF NOT EXISTS sermon_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  sermon_id TEXT NOT NULL,
  notes TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (sermon_id) REFERENCES sermons(id)
);
