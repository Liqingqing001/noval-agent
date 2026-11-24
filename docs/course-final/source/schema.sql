-- 课堂简化版：SQLite 3；独立于原系统数据库，禁止在原系统数据库执行。
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS app_user (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK(length(email) BETWEEN 3 AND 120),
  password_hash TEXT NOT NULL,
  nickname TEXT NOT NULL CHECK(length(trim(nickname)) BETWEEN 1 AND 30),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS novel (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 100),
  genre TEXT NOT NULL DEFAULT '' CHECK(length(genre) <= 30),
  summary TEXT NOT NULL DEFAULT '' CHECK(length(summary) <= 2000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','writing','completed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_novel_user ON novel(user_id);
CREATE TABLE IF NOT EXISTS chapter (
  id INTEGER PRIMARY KEY,
  novel_id INTEGER NOT NULL REFERENCES novel(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 100),
  content TEXT NOT NULL DEFAULT '' CHECK(length(content) <= 50000),
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(novel_id,sequence)
);
CREATE TABLE IF NOT EXISTS story_character (
  id INTEGER PRIMARY KEY,
  novel_id INTEGER NOT NULL REFERENCES novel(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 30),
  role TEXT NOT NULL DEFAULT 'supporting' CHECK(role IN ('protagonist','supporting','minor')),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 2000)
);
CREATE INDEX IF NOT EXISTS idx_character_novel ON story_character(novel_id);
