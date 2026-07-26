-- 001_init.sql
-- Initial schema for StarrBot v2

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
  created_at INTEGER NOT NULL
);

CREATE TABLE bots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token TEXT NOT NULL,
  client_id TEXT NOT NULL,
  avatar_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE bot_functions (
  bot_id TEXT NOT NULL,
  function_name TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bot_id, function_name),
  FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
);

CREATE TABLE global_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE TABLE posted_urls (
  bot_id TEXT NOT NULL,
  url_hash TEXT NOT NULL,
  url TEXT NOT NULL,
  posted_at INTEGER NOT NULL,
  PRIMARY KEY (bot_id, url_hash)
);
CREATE INDEX idx_posted_urls_bot ON posted_urls(bot_id);

CREATE TABLE refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- Insert default global settings
INSERT OR IGNORE INTO global_settings (key, value_json) VALUES ('settings', '{"commandPrefix":"!","theme":"dark"}');