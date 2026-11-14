CREATE TABLE IF NOT EXISTS nifty_options_history (
  snapshot_date TEXT PRIMARY KEY NOT NULL,
  spot REAL NOT NULL,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nifty_options_history_date
  ON nifty_options_history(snapshot_date);
