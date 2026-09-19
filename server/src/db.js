const path = require("path");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "..", "data.sqlite3");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS playlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    channel_title TEXT,
    thumbnail TEXT,
    duration_seconds INTEGER,
    position INTEGER NOT NULL,
    added_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist
    ON playlist_items(playlist_id, position);
`);

// Seed a default playlist on first run so the UI isn't empty.
const playlistCount = db.prepare("SELECT COUNT(*) AS n FROM playlists").get().n;
if (playlistCount === 0) {
  db.prepare("INSERT INTO playlists (name) VALUES (?)").run("My Mix");
}

module.exports = db;
