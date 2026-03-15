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
      console.log(`[yt-stream] Trying Invidious ${instance}...`);
      const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 8000);
      
      if (!res.ok) {
        console.warn(`[yt-stream] ${instance} returned ${res.status}`);
        continue;
      }
      
      const data = await res.json();
      console.log(`[yt-stream] Invidious success with ${instance}`);
      return data;
    } catch (err) {
      console.warn(`[yt-stream] ${instance} failed:`, err instanceof Error ? err.message : String(err));
      continue;
    }
  }
  return null;
}

// ─── RapidAPI YouTube MP3 Downloader ───
async function tryRapidAPIYouTubeMp3(videoId: string): Promise<{ url: string; title?: string } | null> {
  const rapidApiKey = Deno.env.get('RAPIDAPI_YOUTUBE_MP3_KEY');
  if (!rapidApiKey) {
    console.log('[yt-stream] RapidAPI key not configured, skipping');
    return null;
  }

  try {
    const res = await fetchWithTimeout(
      `https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`,
      {
        headers: {
          'X-RapidAPI-Key': rapidApiKey,
          'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com'
        }
      },
      8000
    );

    if (res.ok) {
      const data = await res.json() as any;
      if (data.link) {
        console.log('[yt-stream] Got MP3 URL from RapidAPI');
        return { url: data.link, title: data.title };
      }
    } else {
      console.warn(`[yt-stream] RapidAPI returned ${res.status}`);
    }
  } catch (err) {
    console.warn('[yt-stream] RapidAPI failed:', err instanceof Error ? err.message : String(err));
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

// ─── Invidious stream (audio only) - with CORS-friendly URL handling ───
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
      // Test if URL is valid by making a HEAD request
      try {
        const testRes = await fetchWithTimeout(best.url, { method: 'HEAD' }, 5000);
        if (testRes.ok || testRes.status === 206) {
          console.log('[yt-stream] Invidious URL is accessible');
          return { url: best.url, quality: `${best.bitrate}bps` };
        } else {
          console.warn(`[yt-stream] Invidious URL returned ${testRes.status}`);
        }
      } catch (err) {
        console.warn('[yt-stream] Invidious URL is not accessible:', err instanceof Error ? err.message : String(err));
      }
    }
  }

  // Fallback: use formatStreams (video+audio combined, less ideal but works)
  const fallback = (data.formatStreams || [])[0];
  if (fallback?.url) {
    console.log(`[yt-stream] Using Invidious fallback format (video+audio)`);
    try {
      const testRes = await fetchWithTimeout(fallback.url, { method: 'HEAD' }, 5000);
      if (testRes.ok || testRes.status === 206) {
        return { url: fallback.url, quality: "auto" };
      }
    } catch (err) {
      console.warn('[yt-stream] Fallback URL is not accessible');
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
