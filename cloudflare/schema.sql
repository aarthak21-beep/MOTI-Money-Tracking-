CREATE TABLE IF NOT EXISTS moti_scanner_data (
  scanner TEXT PRIMARY KEY NOT NULL,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_moti_scanner_data_updated_at
  ON moti_scanner_data(updated_at);

CREATE TABLE IF NOT EXISTS nifty_options_history (
  snapshot_date TEXT PRIMARY KEY NOT NULL,
  spot REAL NOT NULL,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nifty_options_history_date
  ON nifty_options_history(snapshot_date);
