const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// Search YouTube using RapidAPI youtube-search service
async function searchYouTube(query: string) {
  const apiKey = Deno.env.get("RAPIDAPI_KEY");
  if (!apiKey) {
    console.error("RAPIDAPI_KEY not configured");
    return null;
  }

  try {
    const searchUrl = `https://youtube-search-and-download.p.rapidapi.com/search?query=${encodeURIComponent(query)}&type=v`;

    const res = await fetchWithTimeout(searchUrl, {
      method: "GET",
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": "youtube-search-and-download.p.rapidapi.com",
      },
    });

    if (!res.ok) {
      console.error(`YouTube search failed: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as any;
    const firstResult = data?.contents?.[0];

    if (firstResult?.video?.videoId) {
      return {
        videoId: firstResult.video.videoId,
        title: firstResult.video.title,
        query,
      };
    }
    return null;
  } catch (err) {
    console.error("YouTube search error:", err);
    return null;
  }
}

// Get MP3 stream from YouTube video ID using RapidAPI youtube-mp36
async function getYouTubeStream(videoId: string): Promise<string | null> {
  const apiKey = Deno.env.get("RAPIDAPI_KEY");
  if (!apiKey) {
    console.error("RAPIDAPI_KEY not configured");
    return null;
  }

  try {
    const streamUrl = `https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`;

    const res = await fetchWithTimeout(streamUrl, {
      method: "GET",
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": "youtube-mp36.p.rapidapi.com",
      },
    });

    if (!res.ok) {
      console.error(`YouTube stream fetch failed: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as any;

    // youtube-mp36 returns { link: "https://..." } with direct MP3 URL
    if (data?.link) {
      return data.link;
    }

    console.error("No stream link returned:", data);
    return null;
  } catch (err) {
    console.error("YouTube stream error:", err);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const respond = (
    success: boolean,
    data: any = null,
    error: string | null = null,
    status = 200
  ) =>
    new Response(
      JSON.stringify({
        success,
        ...(data && { ...data }),
        ...(error && { error }),
      }),
      {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  try {
    const { action, query, videoId } = (await req.json()) as any;

    if (action === "search") {
      if (!query?.trim()) {
        return respond(false, null, "Query required", 400);
      }
      const result = await searchYouTube(query);
      return respond(!!result, result ? { results: [result] } : null, result ? null : "No results found");
    }

    if (action === "stream") {
      if (!videoId?.trim()) {
        return respond(false, null, "Video ID required", 400);
      }
      const url = await getYouTubeStream(videoId);
      return respond(!!url, url ? { stream: { url } } : null, url ? null : "Stream not available");
    }

    return respond(false, null, "Invalid action", 400);
  } catch (err) {
    console.error("Server error:", err);
    return respond(
      false,
      null,
      err instanceof Error ? err.message : "Server error",
      500
    );
  }
});
