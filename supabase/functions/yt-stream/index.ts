const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Invidious instances (with fallbacks) ───
const INVIDIOUS_INSTANCES = [
  "https://inv.riverside.rocks",
  "https://invidious.snopyta.org",
  "https://vid.puffyan.us",
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

// ─── Try Invidious API ───
async function tryInvidious(path: string): Promise<any | null> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const url = `${instance}${path}`;
      console.log(`[yt-stream] Trying Invidious instance: ${instance}`);
      
      const res = await fetchWithTimeout(url, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } 
      }, 8000);
      
      if (!res.ok) {
        console.warn(`[yt-stream] ${instance} returned ${res.status}`);
        continue;
      }
      
      const data = await res.json();
      console.log(`[yt-stream] ✓ Success with Invidious: ${instance}`);
      return data;
    } catch (err) {
      console.warn(`[yt-stream] ✗ ${instance} failed:`, err instanceof Error ? err.message : String(err));
      continue;
    }
  }
  console.warn('[yt-stream] All Invidious instances failed');
  return null;
}

// ─── RapidAPI YouTube MP3 (if available) ───
async function tryRapidAPIYouTubeMp3(videoId: string): Promise<{ url: string; title?: string } | null> {
  const rapidApiKey = Deno.env.get('RAPIDAPI_YOUTUBE_MP3_KEY');
  if (!rapidApiKey) {
    return null;
  }

  try {
    console.log('[yt-stream] Attempting RapidAPI for videoId:', videoId);
    const res = await fetchWithTimeout(
      `https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`,
      {
        headers: {
          'X-RapidAPI-Key': rapidApiKey,
          'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com',
          'User-Agent': 'Mozilla/5.0',
        }
      },
      15000
    );

    if (res.ok) {
      const data = await res.json() as any;
      if (data.link) {
        console.log('[yt-stream] ✓ RapidAPI provided MP3 URL');
        return { url: data.link, title: data.title };
      } else {
        console.warn('[yt-stream] RapidAPI returned no link:', data);
      }
    } else {
      console.warn(`[yt-stream] RapidAPI returned ${res.status}`);
    }
  } catch (err) {
    console.warn('[yt-stream] RapidAPI error:', err instanceof Error ? err.message : String(err));
  }

  return null;
}

// ─── Invidious search - straightforward ───
async function invidiousSearch(query: string) {
  const path = `/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance&fields=videoId,title,author,lengthSeconds`;
  const data = await tryInvidious(path);
  
  if (!data || !Array.isArray(data)) {
    console.warn('[yt-stream] Search returned invalid data:', typeof data);
    return null;
  }
  
  const results = data
    .filter((i: any) => i.type === "video")
    .slice(0, 5)
    .map((i: any) => ({
      videoId: i.videoId || "",
      title: i.title || "",
      author: (i.author || "").replace(" - Topic", ""),
      duration: i.lengthSeconds || 0,
    }));
  
  console.log(`[yt-stream] Search found ${results.length} results`);
  return results.length > 0 ? results : null;
}

// ─── Invidious stream - simplified ───
async function invidiousStream(videoId: string): Promise<{ url: string; type: string } | null> {
  const path = `/api/v1/videos/${videoId}?fields=formatStreams,adaptiveFormats`;
  const data = await tryInvidious(path);
  
  if (!data) {
    console.warn('[yt-stream] No video data from Invidious');
    return null;
  }

  // Priority 1: Audio-only formats
  const audioFormats = (data.adaptiveFormats || []).filter((f: any) => {
    const type = (f.type || "").toLowerCase();
    return type.includes("audio");
  });

  if (audioFormats.length > 0) {
    // Sort by bitrate
    audioFormats.sort((a: any, b: any) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));
    const best = audioFormats[0];
    if (best?.url) {
      console.log(`[yt-stream] Using audio format: ${best.bitrate}bps`);
      return { url: best.url, type: 'audio' };
    }
  }

  // Fallback: Video + audio combined
  const videoFormats = (data.formatStreams || []);
  if (videoFormats.length > 0) {
    const best = videoFormats[0];
    if (best?.url) {
      console.log('[yt-stream] Using video+audio fallback');
      return { url: best.url, type: 'video' };
    }
  }

  console.warn('[yt-stream] No playable format found');
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { 
      status: 200,
      headers: corsHeaders 
    });
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

      console.log("[yt-stream] fetching stream for videoId:", videoId);

      // Strategy 1: Try RapidAPI YouTube MP3 first (most reliable)
      let stream = await tryRapidAPIYouTubeMp3(videoId);
      if (stream) {
        console.log("[yt-stream] success: RapidAPI YouTube MP3");
        return respond({ success: true, stream, source: 'rapidapi' });
      }

      // Strategy 2: Fall back to Invidious
      console.log("[yt-stream] Trying Invidious fallback...");
      stream = await invidiousStream(videoId);
      if (stream) {
        console.log("[yt-stream] success: Invidious");
        return respond({ success: true, stream, source: 'invidious' });
      }

      // All strategies failed
      return respond({ 
        success: false, 
        error: "No se pudo obtener el stream de audio. Usa el preview de Deezer como alternativa.",
        helpText: "Configure RAPIDAPI_YOUTUBE_MP3_KEY en las variables de entorno para mejor soporte de YouTube"
      }, 502);
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
