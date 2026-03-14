const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PIPED_API = "https://api.piped.private.coffee";

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

      const res = await fetch(
        `${PIPED_API}/search?q=${encodeURIComponent(query)}&filter=music_songs`
      );

      if (!res.ok) {
        const errText = await res.text();
        console.error("[yt-stream] Piped search error:", res.status, errText.slice(0, 300));
        return respond({ success: false, error: `Piped API error: ${res.status}` }, 502);
      }

      const data = await res.json();
      const items = (data.items || [])
        .filter((i: Record<string, unknown>) => i.type === "stream")
        .slice(0, 10)
        .map((i: Record<string, unknown>) => ({
          videoId: ((i.url as string) || "").replace("/watch?v=", ""),
          title: i.title || "",
          artist: ((i.uploaderName as string) || "").replace(" - Topic", ""),
          duration: i.duration || 0,
          thumbnail: i.thumbnail || "",
        }));

      console.log("[yt-stream] found:", items.length, "results");
      return respond({ success: true, results: items });
    }

    if (action === "stream") {
      const videoId = (body.videoId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20);
      if (!videoId) return respond({ error: "videoId required" }, 400);

      console.log("[yt-stream] fetching stream:", videoId);

      const res = await fetch(`${PIPED_API}/streams/${videoId}`);

      if (!res.ok) {
        const errText = await res.text();
        console.error("[yt-stream] stream error:", res.status, errText.slice(0, 300));
        return respond({ success: false, error: `Stream error: ${res.status}` }, 502);
      }

      const data = await res.json();
      const audioStreams = (data.audioStreams || [])
        .filter((s: Record<string, unknown>) => ((s.mimeType as string) || "").startsWith("audio/"))
        .sort(
          (a: Record<string, unknown>, b: Record<string, unknown>) =>
            ((b.bitrate as number) || 0) - ((a.bitrate as number) || 0)
        );

      if (audioStreams.length === 0) {
        return respond({ success: false, error: "No audio streams found" }, 404);
      }

      const best = audioStreams[0];
      console.log("[yt-stream] stream found:", best.mimeType, best.bitrate);

      return respond({
        success: true,
        stream: {
          url: best.url,
          mimeType: best.mimeType,
          bitrate: best.bitrate,
          quality: best.quality,
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
