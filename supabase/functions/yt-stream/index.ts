const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Multiple Invidious instances for resilience
const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://invidious.jing.rocks",
  "https://iv.ggtyler.dev",
];

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://api.piped.private.coffee",
];

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

// ─── Invidious search ───
async function invidiousSearch(query: string) {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const url = `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) { await res.text(); continue; }
      const data = await res.json();
      return (data || [])
        .filter((i: any) => i.type === "video")
        .slice(0, 10)
        .map((i: any) => ({
          videoId: i.videoId,
          title: i.title || "",
          artist: (i.author || "").replace(" - Topic", ""),
          duration: i.lengthSeconds || 0,
          thumbnail: i.videoThumbnails?.[0]?.url || "",
        }));
    } catch {
      continue;
    }
  }
  return null;
}

// ─── Piped search (fallback) ───
async function pipedSearch(query: string) {
  for (const base of PIPED_INSTANCES) {
    try {
      const res = await fetchWithTimeout(
        `${base}/search?q=${encodeURIComponent(query)}&filter=music_songs`
      );
      if (!res.ok) { await res.text(); continue; }
      const data = await res.json();
      return (data.items || [])
        .filter((i: any) => i.type === "stream")
        .slice(0, 10)
        .map((i: any) => ({
          videoId: ((i.url as string) || "").replace("/watch?v=", ""),
          title: i.title || "",
          artist: ((i.uploaderName as string) || "").replace(" - Topic", ""),
          duration: i.duration || 0,
          thumbnail: i.thumbnail || "",
        }));
    } catch {
      continue;
    }
  }
  return null;
}

// ─── Invidious stream ───
async function invidiousStream(videoId: string) {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetchWithTimeout(`${base}/api/v1/videos/${videoId}`);
      if (!res.ok) { await res.text(); continue; }
      const data = await res.json();
      const audioStreams = (data.adaptiveFormats || [])
        .filter((s: any) => ((s.type as string) || "").startsWith("audio/"))
        .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

      if (audioStreams.length === 0) continue;

      const best = audioStreams[0];
      return {
        url: best.url,
        mimeType: best.type?.split(";")[0] || "audio/mp4",
        bitrate: best.bitrate,
        quality: best.audioQuality || "unknown",
      };
    } catch {
      continue;
    }
  }
  return null;
}

// ─── Piped stream (fallback) ───
async function pipedStream(videoId: string) {
  for (const base of PIPED_INSTANCES) {
    try {
      const res = await fetchWithTimeout(`${base}/streams/${videoId}`);
      if (!res.ok) { await res.text(); continue; }
      const data = await res.json();
      const audioStreams = (data.audioStreams || [])
        .filter((s: any) => ((s.mimeType as string) || "").startsWith("audio/"))
        .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

      if (audioStreams.length === 0) continue;

      const best = audioStreams[0];
      return {
        url: best.url,
        mimeType: best.mimeType,
        bitrate: best.bitrate,
        quality: best.quality,
      };
    } catch {
      continue;
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "search") {
      const query = (body.query || "").trim().slice(0, 200);
      if (!query) return respond({ error: "query required" }, 400);

      console.log("[yt-stream] searching:", query);

      // Try Invidious first, then Piped
      let results = await invidiousSearch(query);
      if (!results) {
        console.log("[yt-stream] Invidious search failed, trying Piped...");
        results = await pipedSearch(query);
      }

      if (!results) {
        return respond({ success: false, error: "All search providers failed" }, 502);
      }

      console.log("[yt-stream] found:", results.length, "results");
      return respond({ success: true, results });
    }

    if (action === "stream") {
      const videoId = (body.videoId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20);
      if (!videoId) return respond({ error: "videoId required" }, 400);

      console.log("[yt-stream] fetching stream:", videoId);

      // Try Invidious first, then Piped
      let stream = await invidiousStream(videoId);
      if (!stream) {
        console.log("[yt-stream] Invidious stream failed, trying Piped...");
        stream = await pipedStream(videoId);
      }

      if (!stream) {
        return respond({ success: false, error: "No audio stream found from any provider" }, 502);
      }

      console.log("[yt-stream] stream found:", stream.mimeType, stream.bitrate);
      return respond({ success: true, stream });
    }

    return respond({ error: 'Use action: "search" or "stream"' }, 400);
  } catch (err: unknown) {
    console.error("[yt-stream] error:", err);
    return respond(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      500
    );
  }
});
