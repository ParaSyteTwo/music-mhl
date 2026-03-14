const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action;
    const query = (body.query || "").trim().slice(0, 200);
    const videoId = (body.videoId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20);

    const PIPED_API = "https://api.piped.private.coffee";

    if (action === "search") {
      if (!query) {
        return new Response(JSON.stringify({ error: "query required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("v4 searching:", query);

      const response = await fetch(
        `${PIPED_API}/search?q=${encodeURIComponent(query)}&filter=music_songs`
      );

      if (!response.ok) {
        const text = await response.text();
        console.error("Piped search failed:", response.status, text);

        // Fallback: try without filter
        const response2 = await fetch(
          `${PIPED_API}/search?q=${encodeURIComponent(query)}&filter=videos`
        );
        if (!response2.ok) {
          const t2 = await response2.text();
          return new Response(
            JSON.stringify({ success: false, error: `Piped failed: ${response2.status} ${t2.slice(0, 200)}` }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const data2 = await response2.json();
        const items2 = (data2.items || [])
          .filter((i: Record<string, unknown>) => i.type === "stream")
          .slice(0, 10)
          .map((i: Record<string, unknown>) => ({
            videoId: ((i.url as string) || "").replace("/watch?v=", ""),
            title: i.title || "",
            artist: ((i.uploaderName as string) || "").replace(" - Topic", ""),
            duration: i.duration || 0,
            thumbnail: i.thumbnail || "",
          }));
        return new Response(
          JSON.stringify({ success: true, results: items2 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();
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

      console.log("v4 search found:", items.length, "items");

      return new Response(
        JSON.stringify({ success: true, results: items }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "stream") {
      if (!videoId) {
        return new Response(JSON.stringify({ error: "videoId required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("v4 getting stream for:", videoId);

      const response = await fetch(`${PIPED_API}/streams/${videoId}`);

      if (!response.ok) {
        const text = await response.text();
        return new Response(
          JSON.stringify({ success: false, error: `Stream fetch failed: ${response.status} ${text.slice(0, 200)}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();
      const audioStreams = (data.audioStreams || [])
        .filter((s: Record<string, unknown>) => ((s.mimeType as string) || "").startsWith("audio/"))
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          ((b.bitrate as number) || 0) - ((a.bitrate as number) || 0)
        );

      if (audioStreams.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "No audio streams available" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const best = audioStreams[0];
      console.log("v4 stream found:", best.mimeType, best.bitrate);

      return new Response(
        JSON.stringify({
          success: true,
          stream: {
            url: best.url,
            mimeType: best.mimeType,
            bitrate: best.bitrate,
            quality: best.quality,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Use action "search" or "stream"' }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("v4 youtube-audio error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
