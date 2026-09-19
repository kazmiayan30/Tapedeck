const express = require("express");
const router = express.Router();

const YT_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const YT_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

// "PT3M42S" -> 222
function isoDurationToSeconds(iso) {
  if (!iso) return null;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const [, h, m, s] = match;
  return (parseInt(h || 0, 10) * 3600) + (parseInt(m || 0, 10) * 60) + parseInt(s || 0, 10);
}

router.get("/", async (req, res) => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const q = (req.query.q || "").trim();

  if (!apiKey) {
    return res.status(500).json({
      error: "Server is missing YOUTUBE_API_KEY. Add it to server/.env and restart.",
    });
  }
  if (!q) {
    return res.status(400).json({ error: "Query parameter 'q' is required." });
  }

  try {
    const searchParams = new URLSearchParams({
      key: apiKey,
      q,
      part: "snippet",
      type: "video",
      videoCategoryId: "10", // Music category
      maxResults: "20",
      safeSearch: "none",
    });

    const searchResp = await fetch(`${YT_SEARCH_URL}?${searchParams}`);
    const searchData = await searchResp.json();

    if (!searchResp.ok) {
      const message = searchData?.error?.message || "YouTube search failed.";
      return res.status(searchResp.status).json({ error: message });
    }

    const videoIds = (searchData.items || [])
      .map((item) => item.id?.videoId)
      .filter(Boolean);

    if (videoIds.length === 0) {
      return res.json({ results: [] });
    }

    // Second call to get durations (search.list doesn't return them).
    const videosParams = new URLSearchParams({
      key: apiKey,
      id: videoIds.join(","),
      part: "contentDetails,snippet",
    });
    const videosResp = await fetch(`${YT_VIDEOS_URL}?${videosParams}`);
    const videosData = await videosResp.json();

    const durationById = new Map(
      (videosData.items || []).map((v) => [v.id, isoDurationToSeconds(v.contentDetails?.duration)])
    );

    const results = (searchData.items || [])
      .filter((item) => item.id?.videoId)
      .map((item) => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
        publishedAt: item.snippet.publishedAt,
        durationSeconds: durationById.get(item.id.videoId) ?? null,
      }));

    res.json({ results });
  } catch (err) {
    console.error("Search error:", err);
    res.status(502).json({ error: "Could not reach YouTube. Please try again." });
  }
});

module.exports = router;
