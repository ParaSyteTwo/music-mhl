// v3 - YouTube audio via Piped/Invidious with fallbacks
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PIPED = [
  "https://api.piped.private.coffee",
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.in.projectsegfau.lt",
];

const INVIDIOUS = [
  "https://invidious.private.coffee",
  "https://yewtu.be",
  "https://vid.puffyan.us",
];

async function tryFetch(url: string, timeoutMs = 8000): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (res.ok) return res;
    await res.text();
    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json();
    const action = body.action as string;
    const query = (body.query as string || "").trim().slice(0, 200);
    const videoId = (body.videoId as string || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20);

    // ─── SEARCH ───
    if (action === "search") {
      if (!query) return json({ error: "query required" }, 400);

      // Try Piped search
      for (const base of PIPED) {
        const res = await tryFetch(
          `${base}/search?q=${encodeURIComponent(query)}&filter=music_songs`
        );
        if (res) {
          const data = await res.json();
          const items = (data.items || [])
            .filter((i: any) => i.type === "stream")
            .slice(0, 10)
            .map((i: any) => ({
              videoId: (i.url || "").replace("/watch?v=", ""),
              title: i.title || "",
              artist: (i.uploaderName || "").replace(" - Topic", ""),
              duration: i.duration || 0,
              thumbnail: i.thumbnail || "",
            }));
          if (items.length > 0) {
            console.log(`Search OK via Piped: ${base}`);
            return json({ success: true, results: items });
          }
        }
        console.log(`Piped search skip: ${base}`);
      }

      // Fallback: Invidious search
      for (const base of INVIDIOUS) {
        const res = await tryFetch(
          `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance`
        );
        if (res) {
          const data = await res.json();
          const items = (data || []).slice(0, 10).map((i: any) => ({
            videoId: i.videoId || "",
            title: i.title || "",
            artist: (i.author || "").replace(" - Topic", ""),
            duration: i.lengthSeconds || 0,
            thumbnail: i.videoThumbnails?.[0]?.url || "",
          }));
          if (items.length > 0) {
            console.log(`Search OK via Invidious: ${base}`);
            return json({ success: true, results: items });
          }
        }
        console.log(`Invidious search skip: ${base}`);
      }

      return json({ success: false, error: "Search failed on all instances" }, 502);
    }

    // ─── STREAM ───
    if (action === "stream") {
      if (!videoId) return json({ error: "videoId required" }, 400);

      // Try Piped streams
      for (const base of PIPED) {
        const res = await tryFetch(`${base}/streams/${videoId}`, 10000);
        if (res) {
          const data = await res.json();
          const audios = (data.audioStreams || [])
            .filter((s: any) => s.mimeType?.startsWith("audio/"))
            .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
          if (audios.length > 0) {
            const best = audios[0];
            console.log(`Stream OK via Piped: ${base}`);
            return json({
              success: true,
              stream: {
                url: best.url,
                mimeType: best.mimeType,
                bitrate: best.bitrate,
                quality: best.quality,
              },
            });
          }
        }
        console.log(`Piped stream skip: ${base}`);
      }

      // Fallback: Invidious
      for (const base of INVIDIOUS) {
        const res = await tryFetch(`${base}/api/v1/videos/${videoId}`, 10000);
        if (res) {
          const data = await res.json();
          const audios = (data.adaptiveFormats || [])
            .filter((s: any) => s.type?.startsWith("audio/"))
            .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
          if (audios.length > 0) {
            const best = audios[0];
            console.log(`Stream OK via Invidious: ${base}`);
            return json({
              success: true,
              stream: {
                url: best.url,
                mimeType: best.type?.split(";")[0],
                bitrate: best.bitrate,
                quality: `${Math.round(best.bitrate / 1000)}kbps`,
              },
            });
          }
        }
        console.log(`Invidious stream skip: ${base}`);
      }

      return json({ success: false, error: "No audio stream found" }, 502);
    }

    return json({ error: 'Use action "search" or "stream"' }, 400);
  } catch (err) {
    console.error("youtube-audio error:", err);
    return json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      500
    );
  }
});
