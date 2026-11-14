-- Full MOTI app snapshot storage. Existing moti_scanner_data is preserved.
CREATE TABLE IF NOT EXISTS moti_app_backup (
  id TEXT PRIMARY KEY,
  backup_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
