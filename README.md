# Tapedeck

A full-stack music player: search YouTube for music, play it through the
official **YouTube IFrame Player API**, and organize tracks into "reels"
(playlists) backed by a real Express + SQLite server.

Playback happens entirely inside YouTube's own embedded player — audio is
streamed from YouTube, not downloaded or converted. This is the sanctioned
way to build a YouTube-powered player: it doesn't touch YouTube's Terms of
Service, since no video/audio file ever leaves YouTube's servers or gets
re-encoded.

## How it works

- **Backend** (`server/`) — Express API that:
  - Proxies search requests to the YouTube Data API v3 (keeps your API key
    off the client).
  - Stores playlists and playlist tracks in a local SQLite database
    (`better-sqlite3`), with routes to create/delete playlists, add/remove
    tracks, and persist track order.
  - Serves the frontend as static files.
- **Frontend** (`server/public/`) — vanilla HTML/CSS/JS:
  - Loads the YouTube IFrame Player API and drives it (play, pause, seek,
    volume, next/prev, shuffle, repeat) from a visually hidden player
    instance — the UI you see is entirely custom.
  - Search view, sidebar playlist ("reel") manager, and a persistent
    now-playing bar with a segmented tape-style seek bar.

## Setup

### 1. Get a YouTube Data API key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (or pick an existing one).
3. **APIs & Services → Library** → enable **YouTube Data API v3**.
4. **APIs & Services → Credentials** → **Create Credentials → API key**.
5. (Recommended) Restrict the key to the YouTube Data API v3.

The API's free quota (10,000 units/day by default) is plenty for personal
use — each search costs ~100 units.

### 2. Configure and install

```bash
cd server
cp .env.example .env
# edit .env and paste your key into YOUTUBE_API_KEY=

npm install
```

### 3. Run it

```bash
npm start
# or, for auto-restart on file changes:
npm run dev
```

Open **http://localhost:3001**.

## Project layout

```
music-player-app/
├── README.md
└── server/
    ├── package.json
    ├── .env.example
    ├── data.sqlite3        (created on first run)
    └── src/
        ├── server.js        Express app entry point
        ├── db.js            SQLite schema + connection
        └── routes/
            ├── search.js     GET /api/search?q=...
            └── playlists.js  CRUD for /api/playlists
    └── public/
        ├── index.html
        ├── styles.css
        └── app.js            Player state machine + YT IFrame API glue
```

## API reference

| Method | Path                                  | Description                         |
|--------|----------------------------------------|--------------------------------------|
| GET    | `/api/search?q=...`                    | Search YouTube music videos          |
| GET    | `/api/playlists`                       | List playlists with track counts     |
| POST   | `/api/playlists`                       | Create a playlist `{ name }`         |
| DELETE | `/api/playlists/:id`                   | Delete a playlist                    |
| GET    | `/api/playlists/:id/items`             | List a playlist's tracks             |
| POST   | `/api/playlists/:id/items`             | Add a track to a playlist            |
| DELETE | `/api/playlists/:id/items/:itemId`     | Remove a track from a playlist       |
| PUT    | `/api/playlists/:id/items/reorder`     | Reorder tracks `{ orderedItemIds }`  |

## Notes & limitations

- Some videos may block embedded playback (`onPlayerError`); the app skips
  automatically to the next track when that happens.
- There's no user-account system — playlists are shared across anyone who
  hits this server instance. Add auth if you deploy it for multiple people.
- Keep your API key on the server side (as configured) — never expose it in
  frontend code, or it can be scraped and abused against your quota.
