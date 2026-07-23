CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT,
  location TEXT,
  year TEXT,
  folder TEXT NOT NULL,
  image TEXT NOT NULL,
  description TEXT,
  gallery_images TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects (created_at DESC);
