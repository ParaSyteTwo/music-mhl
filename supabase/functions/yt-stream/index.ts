const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Invidious instances (with fallbacks) ───
const INVIDIOUS_INSTANCES = [
  "https://invidious.snopyta.org",
  "https://vid.puffyan.us",
  "https://invidious.kavin.rocks",
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
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

// ─── Try Invidious with fallback instances ───
async function tryInvidious(path: string): Promise<any | null> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const url = `${instance}${path}`;
      console.log(`[yt-stream] Trying ${instance}...`);
      const res = await fetchWithTimeout(url, {}, 8000);
      
      if (!res.ok) {
        console.warn(`[yt-stream] ${instance} returned ${res.status}`);
        continue;
      }
      
      const data = await res.json();
      console.log(`[yt-stream] Success with ${instance}`);
      return data;
    } catch (err) {
      console.warn(`[yt-stream] ${instance} failed:`, err instanceof Error ? err.message : String(err));
      continue;
    }
  }
  return null;
}

// ─── Invidious search ───
async function invidiousSearch(query: string) {
  const path = `/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance`;
  const data = await tryInvidious(path);
  
  if (!data) return null;
  
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
}

// ─── Invidious stream (audio only) ───
async function invidiousStream(videoId: string): Promise<{ url: string; quality: string } | null> {
  const path = `/api/v1/videos/${videoId}`;
  const data = await tryInvidious(path);
  
  if (!data) return null;

  // Find best audio format
  const audioFormats = (data.adaptiveFormats || []).filter((f: any) => {
    const type = (f.type || "").toLowerCase();
    return type.includes("audio") && (type.includes("mp4") || type.includes("webm"));
  });

  if (audioFormats.length > 0) {
    // Sort by bitrate descending
    audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
    const best = audioFormats[0];
    
    if (best.url) {
      console.log(`[yt-stream] Found audio format: ${best.bitrate}bps`);
      return { url: best.url, quality: `${best.bitrate}bps` };
    }
  }

  // Fallback: use formatStreams (video+audio combined, less ideal but works)
  const fallback = (data.formatStreams || [])[0];
  if (fallback?.url) {
    console.log(`[yt-stream] Using fallback format (video+audio)`);
    return { url: fallback.url, quality: "auto" };
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

      const results = await invidiousSearch(query);

      if (!results) {
        return respond({ success: false, error: "All search providers failed" }, 502);
      }

      console.log("[yt-stream] found:", results.length, "results");
      return respond({ success: true, results });
    }

    if (action === "stream") {
      const videoId = (body.videoId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20);
      if (!videoId) return respond({ error: "videoId required" }, 400);

      console.log("[yt-stream] fetching stream via Invidious:", videoId);

      const stream = await invidiousStream(videoId);

      if (!stream) {
        return respond({ success: false, error: "No se pudo obtener el stream de audio" }, 502);
      }

      console.log("[yt-stream] stream obtained successfully");
      return respond({
        success: true,
        stream: {
          url: stream.url,
          mimeType: "audio/mpeg",
          quality: stream.quality,
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
