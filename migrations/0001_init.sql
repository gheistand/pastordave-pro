CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                    -- Clerk user ID (e.g. user_abc123)
  email TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free',      -- 'free' | 'pro' | 'church'
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  free_conversations_today INTEGER DEFAULT 0,
  free_conversations_date TEXT,           -- YYYY-MM-DD, reset daily
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
