"use strict";

/* ---------------------------------------------------------------------- */
/* State                                                                   */
/* ---------------------------------------------------------------------- */

const state = {
  playlists: [],
  searchResults: [],
  queue: [],              // array of track objects currently being cycled through
  queueIndex: -1,
  queueSource: { type: "search", name: "Up next", playlistId: null },
  shuffleOrder: null,     // array of indices (into state.queue) when shuffle is on
  shufflePos: -1,
  shuffleOn: false,
  repeatMode: 0,          // 0 = off, 1 = repeat all, 2 = repeat one
  playerReady: false,
  isPlaying: false,
  volume: 70,
};

/* ---------------------------------------------------------------------- */
/* Small API helper                                                       */
/* ---------------------------------------------------------------------- */

const api = {
  async get(path) {
    const r = await fetch(path);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `GET ${path} failed`);
    return data;
  },
  async post(path, body) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `POST ${path} failed`);
    return data;
  },
  async put(path, body) {
    const r = await fetch(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) throw new Error(`PUT ${path} failed`);
  },
  async del(path) {
    const r = await fetch(path, { method: "DELETE" });
    if (!r.ok && r.status !== 204) throw new Error(`DELETE ${path} failed`);
  },
};

/* ---------------------------------------------------------------------- */
/* DOM refs                                                                */
/* ---------------------------------------------------------------------- */

const el = {
  searchForm: document.getElementById("search-form"),
  searchInput: document.getElementById("search-input"),
  searchStatus: document.getElementById("search-status"),
  searchResults: document.getElementById("search-results"),

  navSearch: document.querySelector('.side-nav__item[data-view="search"]'),
  navQueue: document.querySelector('.side-nav__item[data-view="queue"]'),
  viewSearch: document.getElementById("view-search"),
  viewQueue: document.getElementById("view-queue"),
  queueTitle: document.getElementById("queue-title"),
  queueCount: document.getElementById("queue-count"),
  queueList: document.getElementById("queue-list"),

  newPlaylistForm: document.getElementById("new-playlist-form"),
  newPlaylistName: document.getElementById("new-playlist-name"),
  playlistList: document.getElementById("playlist-list"),
  addToPlaylistSelect: document.getElementById("add-to-playlist-select"),
  btnAddCurrent: document.getElementById("btn-add-current"),

  npThumb: document.getElementById("np-thumb"),
  npTitle: document.getElementById("np-title"),
  npChannel: document.getElementById("np-channel"),
  btnPlay: document.getElementById("btn-play"),
  btnPrev: document.getElementById("btn-prev"),
  btnNext: document.getElementById("btn-next"),
  btnShuffle: document.getElementById("btn-shuffle"),
  btnRepeat: document.getElementById("btn-repeat"),
  seekTrack: document.getElementById("np-seek-track"),
  seekFill: document.getElementById("np-seek-fill"),
  seekHandle: document.getElementById("np-seek-handle"),
  currentTimeEl: document.getElementById("np-current-time"),
  durationEl: document.getElementById("np-duration"),
  volumeRange: document.getElementById("np-volume-range"),
};

/* ---------------------------------------------------------------------- */
/* Utilities                                                               */
/* ---------------------------------------------------------------------- */

function secondsToClock(totalSeconds) {
  if (totalSeconds == null || Number.isNaN(totalSeconds)) return "--:--";
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function switchView(view) {
  const isSearch = view === "search";
  el.viewSearch.hidden = !isSearch;
  el.viewQueue.hidden = isSearch;
  el.navSearch.classList.toggle("is-active", isSearch);
  el.navQueue.classList.toggle("is-active", !isSearch);
}

/* ---------------------------------------------------------------------- */
/* Rendering                                                               */
/* ---------------------------------------------------------------------- */

function trackRowHTML(track, index, { showRemove } = {}) {
  const dur = secondsToClock(track.durationSeconds ?? track.duration_seconds);
  const isCurrent = state.queue[state.queueIndex] && trackKey(state.queue[state.queueIndex]) === trackKey(track);
  return `
    <li class="track-row${isCurrent ? " is-current" : ""}" data-index="${index}">
      <img class="track-row__thumb" src="${escapeHtml(track.thumbnail)}" alt="" loading="lazy" />
      <div class="track-row__meta">
        <div class="track-title">${escapeHtml(track.title)}</div>
        <div class="track-channel">${escapeHtml(track.channelTitle ?? track.channel_title ?? "")}</div>
      </div>
      <div class="track-duration">${dur}</div>
      <div class="track-actions">
        <button class="btn-play-row" title="Play">▶</button>
        <button class="btn-add-row" title="Add to selected reel">+</button>
        ${showRemove ? `<button class="btn-remove-row" title="Remove from reel">✕</button>` : ""}
      </div>
    </li>`;
}

function trackKey(t) {
  return t.videoId ?? t.video_id;
}

function renderSearchResults() {
  if (!state.searchResults.length) {
    el.searchResults.innerHTML = "";
    return;
  }
  el.searchResults.innerHTML = state.searchResults
    .map((t, i) => trackRowHTML(t, i, { showRemove: false }))
    .join("");
}

function renderQueueView() {
  el.queueTitle.textContent = state.queueSource.name;
  el.queueCount.textContent = state.queue.length
    ? `${state.queue.length} track${state.queue.length === 1 ? "" : "s"}`
    : "";
  if (!state.queue.length) {
    el.queueList.innerHTML = `<div class="status-line">Nothing here yet. Search for tracks and add them to a reel, or press play on a search result to start a queue.</div>`;
    return;
  }
  const showRemove = state.queueSource.type === "playlist";
  el.queueList.innerHTML = state.queue
    .map((t, i) => trackRowHTML(t, i, { showRemove }))
    .join("");
}

function renderPlaylists() {
  el.playlistList.innerHTML = state.playlists
    .map(
      (p) => `
      <li class="playlist-list__row" data-id="${p.id}">
        <button class="playlist-list__name" data-id="${p.id}">${escapeHtml(p.name)}</button>
        <span class="playlist-list__count">${p.item_count}</span>
        <button class="playlist-list__delete" data-id="${p.id}" title="Delete reel">✕</button>
      </li>`
    )
    .join("");

  el.addToPlaylistSelect.innerHTML = state.playlists
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join("");
}

function updateNowPlayingMeta(track) {
  if (!track) {
    el.npThumb.removeAttribute("src");
    el.npTitle.textContent = "Nothing loaded";
    el.npChannel.textContent = "Search and press play to start the reel";
    return;
  }
  el.npThumb.src = track.thumbnail || "";
  el.npTitle.textContent = track.title;
  el.npChannel.textContent = track.channelTitle ?? track.channel_title ?? "";
}

function updatePlayButton() {
  el.btnPlay.textContent = state.isPlaying ? "⏸" : "▶";
  el.btnPlay.title = state.isPlaying ? "Pause" : "Play";
}

/* ---------------------------------------------------------------------- */
/* Data loading                                                            */
/* ---------------------------------------------------------------------- */

async function loadPlaylists() {
  const { playlists } = await api.get("/api/playlists");
  state.playlists = playlists;
  renderPlaylists();
}

async function runSearch(query) {
  el.searchStatus.textContent = "Searching…";
  el.searchResults.innerHTML = "";
  try {
    const { results, error } = await api.get(`/api/search?q=${encodeURIComponent(query)}`);
    if (error) throw new Error(error);
    state.searchResults = results || [];
    el.searchStatus.textContent = state.searchResults.length
      ? `${state.searchResults.length} results for "${query}"`
      : `No results for "${query}"`;
    renderSearchResults();
  } catch (err) {
    el.searchStatus.textContent = err.message;
  }
}

async function loadPlaylistIntoQueue(playlistId) {
  const playlist = state.playlists.find((p) => p.id === Number(playlistId));
  const { items } = await api.get(`/api/playlists/${playlistId}/items`);
  state.queue = items;
  state.queueIndex = -1;
  state.queueSource = { type: "playlist", playlistId: Number(playlistId), name: playlist ? playlist.name : "Reel" };
  resetShuffleOrder();
  renderQueueView();
  switchView("queue");
}

/* ---------------------------------------------------------------------- */
/* Playlist mutations                                                      */
/* ---------------------------------------------------------------------- */

async function createPlaylist(name) {
  await api.post("/api/playlists", { name });
  await loadPlaylists();
}

async function deletePlaylist(id) {
  await api.del(`/api/playlists/${id}`);
  if (state.queueSource.type === "playlist" && state.queueSource.playlistId === Number(id)) {
    state.queue = [];
    state.queueIndex = -1;
    state.queueSource = { type: "search", name: "Up next", playlistId: null };
    renderQueueView();
  }
  await loadPlaylists();
}

async function addTrackToPlaylist(track, playlistId) {
  if (!playlistId) return;
  await api.post(`/api/playlists/${playlistId}/items`, {
    videoId: track.videoId ?? track.video_id,
    title: track.title,
    channelTitle: track.channelTitle ?? track.channel_title,
    thumbnail: track.thumbnail,
    durationSeconds: track.durationSeconds ?? track.duration_seconds,
  });
  await loadPlaylists();
  if (state.queueSource.type === "playlist" && state.queueSource.playlistId === Number(playlistId)) {
    await loadPlaylistIntoQueue(playlistId);
  }
}

async function removeItemFromPlaylist(playlistId, itemId) {
  await api.del(`/api/playlists/${playlistId}/items/${itemId}`);
  await loadPlaylists();
  await loadPlaylistIntoQueue(playlistId);
}

/* ---------------------------------------------------------------------- */
/* YouTube IFrame Player                                                   */
/* ---------------------------------------------------------------------- */

let ytPlayer = null;
let progressTimer = null;

// Called automatically by the YouTube IFrame API script tag once it loads.
window.onYouTubeIframeAPIReady = function onYouTubeIframeAPIReady() {
  ytPlayer = new YT.Player("yt-player", {
    height: "0",
    width: "0",
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
      onError: onPlayerError,
    },
  });
};

function onPlayerReady() {
  state.playerReady = true;
  ytPlayer.setVolume(state.volume);
}

function onPlayerStateChange(event) {
  const YTS = window.YT.PlayerState;
  if (event.data === YTS.PLAYING) {
    state.isPlaying = true;
    startProgressTimer();
  } else if (event.data === YTS.PAUSED) {
    state.isPlaying = false;
  } else if (event.data === YTS.ENDED) {
    state.isPlaying = false;
    handleTrackEnded();
  } else if (event.data === YTS.CUED) {
    updateDurationDisplay();
  }
  updatePlayButton();
}

function onPlayerError() {
  el.npChannel.textContent = "Couldn't play this track (it may be blocked or unavailable). Skipping…";
  setTimeout(() => playNext(), 1200);
}

function startProgressTimer() {
  stopProgressTimer();
  progressTimer = setInterval(() => {
    if (!ytPlayer || !state.playerReady || typeof ytPlayer.getCurrentTime !== "function") return;
    const current = ytPlayer.getCurrentTime() || 0;
    const duration = ytPlayer.getDuration() || 0;
    updateSeekUI(current, duration);
  }, 400);
}

function stopProgressTimer() {
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = null;
}

function updateSeekUI(current, duration) {
  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  el.seekFill.style.width = `${pct}%`;
  el.seekHandle.style.left = `${pct}%`;
  el.currentTimeEl.textContent = secondsToClock(current);
  el.durationEl.textContent = secondsToClock(duration);
}

function updateDurationDisplay() {
  if (!ytPlayer || typeof ytPlayer.getDuration !== "function") return;
  el.durationEl.textContent = secondsToClock(ytPlayer.getDuration());
}

function handleTrackEnded() {
  if (state.repeatMode === 2) {
    playIndexInQueue(state.queueIndex);
    return;
  }
  playNext();
}

/* ---------------------------------------------------------------------- */
/* Queue / transport logic                                                 */
/* ---------------------------------------------------------------------- */

function resetShuffleOrder() {
  if (!state.shuffleOn || !state.queue.length) {
    state.shuffleOrder = null;
    state.shufflePos = -1;
    return;
  }
  const order = state.queue.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  state.shuffleOrder = order;
  state.shufflePos = order.indexOf(state.queueIndex);
}

// Play a track from search results: makes the full result set the active queue.
function playFromSearch(index) {
  state.queue = state.searchResults.slice();
  state.queueSource = { type: "search", name: "Up next", playlistId: null };
  resetShuffleOrder();
  playIndexInQueue(index);
  renderSearchResults();
}

// Play a track from whatever list is currently rendered in the Queue view.
function playFromQueueView(index) {
  playIndexInQueue(index);
}

function playIndexInQueue(index) {
  const track = state.queue[index];
  if (!track || !ytPlayer || !state.playerReady) return;
  state.queueIndex = index;
  if (state.shuffleOn) {
    state.shufflePos = (state.shuffleOrder || []).indexOf(index);
  }
  ytPlayer.loadVideoById(trackKey(track));
  ytPlayer.setVolume(state.volume);
  updateNowPlayingMeta(track);
  updatePlayButton();
  renderSearchResults();
  renderQueueView();
}

function playNext() {
  if (!state.queue.length) return;
  let nextIndex;
  if (state.shuffleOn && state.shuffleOrder) {
    let pos = state.shufflePos + 1;
    if (pos >= state.shuffleOrder.length) {
      if (state.repeatMode === 1) pos = 0;
      else return stopPlayback();
    }
    state.shufflePos = pos;
    nextIndex = state.shuffleOrder[pos];
  } else {
    nextIndex = state.queueIndex + 1;
    if (nextIndex >= state.queue.length) {
      if (state.repeatMode === 1) nextIndex = 0;
      else return stopPlayback();
    }
  }
  playIndexInQueue(nextIndex);
}

function playPrev() {
  if (!state.queue.length) return;
  // Restart current track if we're more than 3s in (common player convention).
  if (ytPlayer && ytPlayer.getCurrentTime && ytPlayer.getCurrentTime() > 3) {
    ytPlayer.seekTo(0, true);
    return;
  }
  let prevIndex;
  if (state.shuffleOn && state.shuffleOrder) {
    let pos = state.shufflePos - 1;
    if (pos < 0) pos = state.shuffleOrder.length - 1;
    state.shufflePos = pos;
    prevIndex = state.shuffleOrder[pos];
  } else {
    prevIndex = state.queueIndex - 1;
    if (prevIndex < 0) prevIndex = state.queue.length - 1;
  }
  playIndexInQueue(prevIndex);
}

function stopPlayback() {
  if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
  state.isPlaying = false;
  updatePlayButton();
}

function togglePlayPause() {
  if (!ytPlayer || !state.playerReady) return;
  if (state.queueIndex === -1) {
    if (state.queue.length) playIndexInQueue(0);
    return;
  }
  if (state.isPlaying) ytPlayer.pauseVideo();
  else ytPlayer.playVideo();
}

/* ---------------------------------------------------------------------- */
/* Event wiring                                                            */
/* ---------------------------------------------------------------------- */

el.searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = el.searchInput.value.trim();
  if (q) runSearch(q);
});

el.navSearch.addEventListener("click", () => switchView("search"));
el.navQueue.addEventListener("click", () => switchView("queue"));

el.newPlaylistForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = el.newPlaylistName.value.trim();
  if (!name) return;
  el.newPlaylistName.value = "";
  await createPlaylist(name);
});

el.playlistList.addEventListener("click", async (e) => {
  const nameBtn = e.target.closest(".playlist-list__name");
  const delBtn = e.target.closest(".playlist-list__delete");
  if (delBtn) {
    if (confirm("Delete this reel? This can't be undone.")) {
      await deletePlaylist(delBtn.dataset.id);
    }
    return;
  }
  if (nameBtn) {
    document.querySelectorAll(".playlist-list__row").forEach((row) =>
      row.classList.toggle("is-active", row.dataset.id === nameBtn.dataset.id)
    );
    await loadPlaylistIntoQueue(nameBtn.dataset.id);
  }
});

el.searchResults.addEventListener("click", (e) => {
  const row = e.target.closest(".track-row");
  if (!row) return;
  const index = Number(row.dataset.index);
  const track = state.searchResults[index];
  if (e.target.closest(".btn-play-row")) {
    playFromSearch(index);
  } else if (e.target.closest(".btn-add-row")) {
    flashAdded(e.target.closest(".btn-add-row"));
    addTrackToPlaylist(track, el.addToPlaylistSelect.value);
  }
});

el.queueList.addEventListener("click", (e) => {
  const row = e.target.closest(".track-row");
  if (!row) return;
  const index = Number(row.dataset.index);
  const track = state.queue[index];
  if (e.target.closest(".btn-play-row")) {
    playFromQueueView(index);
  } else if (e.target.closest(".btn-add-row")) {
    flashAdded(e.target.closest(".btn-add-row"));
    addTrackToPlaylist(track, el.addToPlaylistSelect.value);
  } else if (e.target.closest(".btn-remove-row")) {
    if (state.queueSource.type === "playlist") {
      removeItemFromPlaylist(state.queueSource.playlistId, track.id);
    }
  }
});

function flashAdded(button) {
  const original = button.textContent;
  button.textContent = "✓";
  setTimeout(() => { button.textContent = original; }, 900);
}

el.btnAddCurrent.addEventListener("click", () => {
  const track = state.queue[state.queueIndex];
  if (!track) return;
  addTrackToPlaylist(track, el.addToPlaylistSelect.value);
  flashAdded(el.btnAddCurrent);
});

el.btnPlay.addEventListener("click", togglePlayPause);
el.btnNext.addEventListener("click", playNext);
el.btnPrev.addEventListener("click", playPrev);

el.btnShuffle.addEventListener("click", () => {
  state.shuffleOn = !state.shuffleOn;
  el.btnShuffle.setAttribute("aria-pressed", String(state.shuffleOn));
  resetShuffleOrder();
});

el.btnRepeat.addEventListener("click", () => {
  state.repeatMode = (state.repeatMode + 1) % 3;
  const labels = ["Repeat off", "Repeat all", "Repeat one"];
  el.btnRepeat.title = labels[state.repeatMode];
  el.btnRepeat.textContent = state.repeatMode === 2 ? "⟲¹" : "⟲";
  el.btnRepeat.setAttribute("aria-pressed", String(state.repeatMode !== 0));
});

el.volumeRange.addEventListener("input", () => {
  state.volume = Number(el.volumeRange.value);
  if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(state.volume);
});

// Seek bar: click-to-seek and drag-to-seek.
let isSeeking = false;

function seekFractionFromEvent(e) {
  const rect = el.seekTrack.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const fraction = (clientX - rect.left) / rect.width;
  return Math.min(1, Math.max(0, fraction));
}

el.seekTrack.addEventListener("pointerdown", (e) => {
  if (!ytPlayer || !ytPlayer.getDuration) return;
  isSeeking = true;
  const fraction = seekFractionFromEvent(e);
  const duration = ytPlayer.getDuration() || 0;
  updateSeekUI(fraction * duration, duration);
});

window.addEventListener("pointermove", (e) => {
  if (!isSeeking || !ytPlayer || !ytPlayer.getDuration) return;
  const fraction = seekFractionFromEvent(e);
  const duration = ytPlayer.getDuration() || 0;
  updateSeekUI(fraction * duration, duration);
});

window.addEventListener("pointerup", (e) => {
  if (!isSeeking) return;
  isSeeking = false;
  if (!ytPlayer || !ytPlayer.getDuration) return;
  const fraction = seekFractionFromEvent(e);
  const duration = ytPlayer.getDuration() || 0;
  ytPlayer.seekTo(fraction * duration, true);
});

document.addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
  if (e.code === "Space") {
    e.preventDefault();
    togglePlayPause();
  } else if (e.code === "ArrowRight" && e.shiftKey) {
    playNext();
  } else if (e.code === "ArrowLeft" && e.shiftKey) {
    playPrev();
  }
});

/* ---------------------------------------------------------------------- */
/* Init                                                                     */
/* ---------------------------------------------------------------------- */

(async function init() {
  updateNowPlayingMeta(null);
  renderQueueView();
  try {
    await loadPlaylists();
  } catch (err) {
    console.error(err);
  }

  try {
    const health = await api.get("/api/health");
    if (!health.hasApiKey) {
      el.searchStatus.textContent =
        "Server has no YOUTUBE_API_KEY configured yet — add one to server/.env, then restart the server.";
    }
  } catch {
    /* server not reachable yet; ignore */
  }
})();
