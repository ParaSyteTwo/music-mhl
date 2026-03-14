const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Invidious instances for search ───
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

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
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

// ─── RapidAPI YouTube MP3 stream ───
async function rapidApiStream(videoId: string, apiKey: string): Promise<{ url: string; status: string } | null> {
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 1500; // ms

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(
        `https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`,
        {
          method: "GET",
          headers: {
            "X-RapidAPI-Key": apiKey,
            "X-RapidAPI-Host": "youtube-mp36.p.rapidapi.com",
          },
        },
        15000
      );

      if (!res.ok) {
        const text = await res.text();
        console.error(`[yt-stream] RapidAPI error ${res.status}:`, text);
        return null;
      }

      const data = await res.json();
      console.log(`[yt-stream] RapidAPI response (attempt ${attempt + 1}):`, data.status);

      if (data.status === "ok" && data.link) {
        return { url: data.link, status: "ok" };
      }

      if (data.status === "processing") {
        // Wait and retry
        await new Promise((r) => setTimeout(r, RETRY_DELAY));
        continue;
      }

      // fail or unknown status
      console.error("[yt-stream] RapidAPI conversion failed:", data.msg || data.status);
      return null;
    } catch (err) {
      console.error("[yt-stream] RapidAPI fetch error:", err);
      return null;
    }
  }

  console.error("[yt-stream] RapidAPI max retries exceeded");
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

      const RAPIDAPI_KEY = Deno.env.get("RAPIDAPI_KEY");
      if (!RAPIDAPI_KEY) {
        return respond({ success: false, error: "RAPIDAPI_KEY not configured" }, 500);
      }

      console.log("[yt-stream] fetching stream via RapidAPI:", videoId);

      const stream = await rapidApiStream(videoId, RAPIDAPI_KEY);

      if (!stream) {
        return respond({ success: false, error: "No se pudo convertir el audio" }, 502);
      }

      console.log("[yt-stream] MP3 link obtained successfully");
      return respond({
        success: true,
        stream: {
          url: stream.url,
          mimeType: "audio/mpeg",
          quality: "128kbps",
        },
      });
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
