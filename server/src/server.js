require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const searchRoute = require("./routes/search");
const playlistsRoute = require("./routes/playlists");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use("/api/search", searchRoute);
app.use("/api/playlists", playlistsRoute);

app.get("/api/health", (req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(process.env.YOUTUBE_API_KEY) });
});

// Serve the frontend
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));
app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Tapedeck server running at http://localhost:${PORT}`);
  if (!process.env.YOUTUBE_API_KEY) {
    console.warn("WARNING: YOUTUBE_API_KEY is not set. Search will fail until you add it to server/.env");
  }
});
