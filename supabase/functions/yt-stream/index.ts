const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.r4fo.com",
  "https://api.piped.privacydev.net",
];

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function tryPipedInstances(path: string): Promise<any | null> {
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetchWithTimeout(`${instance}${path}`);
      if (res.ok) return await res.json();
    } catch {}
  }
  return null;
}

// Search YouTube via Piped
async function searchYouTube(query: string) {
  const data = await tryPipedInstances(`/search?q=${encodeURIComponent(query)}&filter=music_songs`);
  if (!data?.items?.length) {
    // Fallback to video filter
    const fallback = await tryPipedInstances(`/search?q=${encodeURIComponent(query)}&filter=videos`);
    if (!fallback?.items?.length) return [];
    return fallback.items.slice(0, 10).map((item: any) => ({
      videoId: item.url?.replace("/watch?v=", ""),
      title: item.title,
      artist: item.uploaderName?.replace(" - Topic", "") || "",
      duration: item.duration || 0,
      thumbnail: item.thumbnail || "",
    }));
  }

  return data.items.slice(0, 10).map((item: any) => ({
    videoId: item.url?.replace("/watch?v=", ""),
    title: item.title,
    artist: item.uploaderName?.replace(" - Topic", "") || "",
    duration: item.duration || 0,
    thumbnail: item.thumbnail || "",
  }));
}

// Get audio stream URL via Piped
async function getStream(videoId: string): Promise<string | null> {
  const data = await tryPipedInstances(`/streams/${videoId}`);
  if (!data) return null;

  // Try audio streams first (best quality)
  if (data.audioStreams?.length) {
    const sorted = data.audioStreams
      .filter((s: any) => s.mimeType?.includes("audio"))
      .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
    if (sorted.length > 0) return sorted[0].url;
  }

  // Fallback to HLS
  if (data.hls) return data.hls;

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const respond = (success: boolean, data: any = null, error: string | null = null, status = 200) =>
    new Response(
      JSON.stringify({ success, ...(data && { ...data }), ...(error && { error }) }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  try {
    const { action, query, videoId } = (await req.json()) as any;

    if (action === "search") {
      if (!query?.trim()) return respond(false, null, "Query required", 400);
      const results = await searchYouTube(query);
      return respond(results.length > 0, results.length > 0 ? { results } : null, results.length > 0 ? null : "No results found");
    }

    if (action === "stream") {
      if (!videoId?.trim()) return respond(false, null, "Video ID required", 400);
      const url = await getStream(videoId);
      return respond(!!url, url ? { stream: { url } } : null, url ? null : "No se pudo convertir el audio");
    }

    return respond(false, null, "Invalid action", 400);
  } catch (err) {
    console.error("Server error:", err);
    return respond(false, null, err instanceof Error ? err.message : "Server error", 500);
  }
});
