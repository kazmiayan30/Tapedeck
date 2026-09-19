const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /api/playlists -> all playlists with item counts
router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.created_at,
              COUNT(pi.id) AS item_count
       FROM playlists p
       LEFT JOIN playlist_items pi ON pi.playlist_id = p.id
       GROUP BY p.id
       ORDER BY p.created_at ASC`
    )
    .all();
  res.json({ playlists: rows });
});

// POST /api/playlists { name } -> create playlist
router.post("/", (req, res) => {
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Playlist name is required." });

  const info = db.prepare("INSERT INTO playlists (name) VALUES (?)").run(name);
  const playlist = db.prepare("SELECT * FROM playlists WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ playlist });
});

// DELETE /api/playlists/:id
router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM playlists WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// GET /api/playlists/:id/items -> ordered tracks
router.get("/:id/items", (req, res) => {
  const items = db
    .prepare(
      `SELECT * FROM playlist_items WHERE playlist_id = ? ORDER BY position ASC`
    )
    .all(req.params.id);
  res.json({ items });
});

// POST /api/playlists/:id/items -> add a track to the end
router.post("/:id/items", (req, res) => {
  const { videoId, title, channelTitle, thumbnail, durationSeconds } = req.body || {};
  if (!videoId || !title) {
    return res.status(400).json({ error: "videoId and title are required." });
  }

  const playlistId = req.params.id;
  const maxPos = db
    .prepare("SELECT COALESCE(MAX(position), -1) AS m FROM playlist_items WHERE playlist_id = ?")
    .get(playlistId).m;

  const info = db
    .prepare(
      `INSERT INTO playlist_items
        (playlist_id, video_id, title, channel_title, thumbnail, duration_seconds, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(playlistId, videoId, title, channelTitle || null, thumbnail || null, durationSeconds || null, maxPos + 1);

  const item = db.prepare("SELECT * FROM playlist_items WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ item });
});

// DELETE /api/playlists/:id/items/:itemId
router.delete("/:id/items/:itemId", (req, res) => {
  db.prepare("DELETE FROM playlist_items WHERE id = ? AND playlist_id = ?").run(
    req.params.itemId,
    req.params.id
  );
  res.status(204).end();
});

// PUT /api/playlists/:id/items/reorder { orderedItemIds: [3,1,2] }
router.put("/:id/items/reorder", (req, res) => {
  const { orderedItemIds } = req.body || {};
  if (!Array.isArray(orderedItemIds)) {
    return res.status(400).json({ error: "orderedItemIds must be an array." });
  }

  const update = db.prepare(
    "UPDATE playlist_items SET position = ? WHERE id = ? AND playlist_id = ?"
  );
  const tx = db.transaction((ids) => {
    ids.forEach((itemId, index) => update.run(index, itemId, req.params.id));
  });
  tx(orderedItemIds);

  res.status(204).end();
});

module.exports = router;
