const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// YouTube search using simple API
async function searchYouTube(query: string) {
  try {
    // Using youtube-sr or similar lightweight search
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`;
    const html = await (await fetchWithTimeout(url)).text();
    
    // Extract first video ID from HTML (basic parser)
    const match = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    if (match?.[1]) {
      return { videoId: match[1], query };
    }
    return null;
  } catch {
    return null;
  }
}

// RapidAPI YouTube MP3 - the only strategy that works
async function getYouTubeStream(videoId: string): Promise<string | null> {
  const key = Deno.env.get('RAPIDAPI_YOUTUBE_MP3_KEY');
  if (!key) return null;

  try {
    const res = await fetchWithTimeout(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com',
      }
    }, 10000);

    const data = await res.json() as any;
    return data?.link || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const respond = (success: boolean, data: any = null, error: string | null = null, status = 200) =>
    new Response(JSON.stringify({ success, ...(data && { ...data }), ...(error && { error }) }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { action, query, videoId } = await req.json() as any;

    if (action === "search") {
      const result = await searchYouTube(query);
      return respond(!!result, result ? { results: [result] } : null, result ? null : "Not found");
    }

    if (action === "stream") {
      const url = await getYouTubeStream(videoId);
      return respond(!!url, url ? { stream: { url } } : null, url ? null : "Stream not available");
    }

    return respond(false, null, "Invalid action", 400);
  } catch (err) {
    return respond(false, null, err instanceof Error ? err.message : "Server error", 500);
  }
});
