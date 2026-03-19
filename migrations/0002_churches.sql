CREATE TABLE IF NOT EXISTS churches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pastor TEXT,
  denomination TEXT,
  mission TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  service_times TEXT,
  vibe TEXT,
  connect_card_url TEXT,
  groups_url TEXT,
  next_steps TEXT,
  bible_translation TEXT DEFAULT "NIV",
  connect_card_contact TEXT,
  active INTEGER DEFAULT 1,
  stripe_subscription_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS visitors (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  name TEXT,
  email TEXT,
  phone TEXT,
  interest TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (church_id) REFERENCES churches(id)
);

CREATE TABLE IF NOT EXISTS pastoral_alerts (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  session_id TEXT,
  alert_type TEXT,
  summary TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (church_id) REFERENCES churches(id)
);

CREATE TABLE IF NOT EXISTS sermons (
  id TEXT PRIMARY KEY,
  church_id TEXT NOT NULL,
  title TEXT,
  pastor TEXT,
  date TEXT,
  series TEXT,
  scripture TEXT,
  summary TEXT,
  key_points TEXT,
  discussion_questions TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (church_id) REFERENCES churches(id)
);
