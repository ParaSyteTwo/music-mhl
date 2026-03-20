const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type JsonRecord = Record<string, unknown>;

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.r4fo.com",
  "https://api.piped.privacydev.net",
];

function parseHostList(raw: string | undefined, fallback: string[]): string[] {
  if (!raw?.trim()) return fallback;
  const parsed = raw
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

function pickString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function pickNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function extractVideoId(entry: JsonRecord): string {
  const directId = pickString(entry.videoId || entry.id || entry.video_id);
  if (directId) return directId;

  const videoObj = (entry.video as JsonRecord | undefined) || null;
  if (videoObj) {
    const nested = pickString(videoObj.videoId || videoObj.id);
    if (nested) return nested;
  }

  const url = pickString(entry.url || entry.link);
  if (url.includes("watch?v=")) {
    return url.split("watch?v=")[1].split("&")[0];
  }

  return "";
}

function extractTitle(entry: JsonRecord): string {
  const directTitle = pickString(entry.title || entry.name);
  if (directTitle) return directTitle;

  const videoObj = (entry.video as JsonRecord | undefined) || null;
  if (videoObj) {
    return pickString(videoObj.title || videoObj.name);
  }

  return "";
}

function extractDuration(entry: JsonRecord): number {
  const directDuration = pickNumber(entry.duration || entry.lengthSeconds || entry.length_seconds);
  if (directDuration) return directDuration;

  const videoObj = (entry.video as JsonRecord | undefined) || null;
  if (videoObj) {
    return pickNumber(videoObj.duration || videoObj.lengthSeconds || videoObj.length_seconds);
  }

  return 0;
}

function extractSearchResults(payload: unknown): Array<{ videoId: string; title: string; duration: number }> {
  const data = payload as JsonRecord | null;
  if (!data) return [];

  const buckets: unknown[] = [
    data.result,
    data.results,
    data.items,
    data.contents,
    data.videos,
    data.data,
    (data.result as JsonRecord | undefined)?.items,
    (data.result as JsonRecord | undefined)?.videos,
    (data.data as JsonRecord | undefined)?.items,
    (data.data as JsonRecord | undefined)?.videos,
  ];

  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) continue;
    const parsed = bucket
      .filter((item) => !!item && typeof item === "object")
      .map((item) => item as JsonRecord)
      .map((entry) => ({
        videoId: extractVideoId(entry),
        title: extractTitle(entry),
        duration: extractDuration(entry),
      }))
      .filter((item) => item.videoId && item.title)
      .slice(0, 10);

    if (parsed.length > 0) return parsed;
  }

  return [];
}

function extractStreamUrl(payload: unknown): string {
  const data = payload as JsonRecord | null;
  if (!data) return "";

  const links = (data.links as JsonRecord | undefined) || undefined;
  const resultObj = (data.result as JsonRecord | undefined) || undefined;
  const dataObj = (data.data as JsonRecord | undefined) || undefined;

  const candidates: unknown[] = [
    data.link,
    data.url,
    data.audio_url,
    data.audioUrl,
    data.download_url,
    data.downloadUrl,
    data.download,
    data.stream,
    data.stream_url,
    data.streamUrl,
    (data.stream as JsonRecord | undefined)?.url,
    resultObj?.url,
    resultObj?.link,
    resultObj?.download_url,
    resultObj?.audioUrl,
    resultObj?.downloadUrl,
    dataObj?.url,
    dataObj?.link,
    dataObj?.download_url,
    dataObj?.audioUrl,
    (data.file as JsonRecord | undefined)?.url,
    (links as JsonRecord | undefined)?.mp3,
    (links as JsonRecord | undefined)?.m4a,
    ((links as JsonRecord | undefined)?.high as JsonRecord | undefined)?.url,
    ((links as JsonRecord | undefined)?.low as JsonRecord | undefined)?.url,
    (resultObj?.stream as JsonRecord | undefined)?.url,
    (resultObj?.download as JsonRecord | undefined)?.url,
    (dataObj?.stream as JsonRecord | undefined)?.url,
    (dataObj?.download as JsonRecord | undefined)?.url,
    data.file,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.startsWith("http")) {
      return candidate;
    }
  }

  return "";
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function searchViaYtDlp(query: string): Promise<any[]> {
  const serviceUrl = Deno.env.get("YTDLP_SERVICE_URL");
  if (!serviceUrl) return [];

  const serviceKey = Deno.env.get("YTDLP_SERVICE_KEY") || "";
  const headers: Record<string, string> = {};
  if (serviceKey) headers["Authorization"] = `Bearer ${serviceKey}`;

  try {
    const res = await fetchWithTimeout(
      `${serviceUrl}/search?q=${encodeURIComponent(query)}`,
      { headers },
      35000,
    );
    if (!res.ok) return [];
    const payload = await res.json() as { results?: any[] };
    return (payload.results || [])
      .map((item: any) => ({
        videoId: item.videoId,
        title: item.title,
        duration: item.duration || 0,
      }))
      .filter((r: any) => r.videoId && r.title)
      .slice(0, 10);
  } catch {
    return [];
  }
}

async function getStreamViaYtDlp(videoId: string): Promise<string | null> {
  const serviceUrl = Deno.env.get("YTDLP_SERVICE_URL");
  if (!serviceUrl) return null;

  const serviceKey = Deno.env.get("YTDLP_SERVICE_KEY") || "";
  const headers: Record<string, string> = {};
  if (serviceKey) headers["Authorization"] = `Bearer ${serviceKey}`;

  try {
    const res = await fetchWithTimeout(
      `${serviceUrl}/stream?id=${encodeURIComponent(videoId)}`,
      { headers },
      50000,
    );
    if (!res.ok) return null;
    const payload = await res.json() as { url?: string; stream?: { url?: string } };
    const url = payload.url || payload.stream?.url || "";
    return url.startsWith("http") ? url : null;
  } catch {
    return null;
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

async function searchViaRapidApi(query: string): Promise<any[]> {
  const rapidApiKey = Deno.env.get("RAPIDAPI_KEY") || "";
  if (!rapidApiKey) return [];

  const hosts = parseHostList(
    Deno.env.get("RAPIDAPI_YTSEARCH_HOSTS"),
    [
      "youtube138.p.rapidapi.com",
      "yt-api.p.rapidapi.com",
      "youtube-data-api.p.rapidapi.com",
    ],
  );

  const endpointBuilders = [
    (q: string) => `/search/?q=${encodeURIComponent(q)}&hl=en&gl=US`,
    (q: string) => `/search?q=${encodeURIComponent(q)}`,
    (q: string) => `/api/search?query=${encodeURIComponent(q)}`,
    (q: string) => `/v1/search?query=${encodeURIComponent(q)}`,
  ];

  for (const host of hosts) {
    for (const buildPath of endpointBuilders) {
      const path = buildPath(query);
      try {
        const res = await fetchWithTimeout(
          `https://${host}${path}`,
          {
            headers: {
              "X-RapidAPI-Key": rapidApiKey,
              "X-RapidAPI-Host": host,
            },
          },
          12000,
        );

        if (!res.ok) continue;

        const payload = await res.json();
        const results = extractSearchResults(payload);
        if (results.length > 0) return results;
      } catch {
        continue;
      }
    }
  }

  return [];
}

async function getStreamViaRapidApi(videoId: string, debug = false): Promise<{ url: string | null; logs: string[] }> {
  const logs: string[] = [];
  const rapidApiKey = Deno.env.get("RAPIDAPI_KEY") || "";
  if (!rapidApiKey) {
    logs.push("[rapid-stream] No RAPIDAPI_KEY");
    return { url: null, logs };
  }

  const hosts = parseHostList(
    Deno.env.get("RAPIDAPI_YTDL_HOSTS"),
    [
      "youtube-mp36.p.rapidapi.com",
      "yt-api.p.rapidapi.com",
      "youtube-info-and-download-api.p.rapidapi.com",
    ],
  );

  for (const host of hosts) {
    const endpoints = [
      `/dl?id=${encodeURIComponent(videoId)}`,
      `/download?id=${encodeURIComponent(videoId)}`,
    ];

    for (const path of endpoints) {
      try {
        const res = await fetchWithTimeout(
          `https://${host}${path}`,
          {
            headers: {
              "X-RapidAPI-Key": rapidApiKey,
              "X-RapidAPI-Host": host,
            },
          },
          30000,
        );

        if (!res.ok) {
          logs.push(`[rapid-stream:${host}] ${path} -> HTTP ${res.status}`);
          continue;
        }

        const payload = await res.json();
        logs.push(`[rapid-stream:${host}] ${path} -> keys: ${Object.keys(payload || {}).join(",")}`);

        // youtube-mp36 canonical response
        if (payload?.status === "ok" && typeof payload?.link === "string" && payload.link.startsWith("http")) {
          logs.push(`[rapid-stream:${host}] ✅ Got link`);
          return { url: payload.link, logs };
        }

        // yt-api style: adaptiveFormats with audio streams
        if (Array.isArray(payload?.adaptiveFormats)) {
          const audioFormats = payload.adaptiveFormats
            .filter((f: any) => typeof f?.mimeType === "string" && f.mimeType.includes("audio") && typeof f?.url === "string" && f.url.startsWith("http"))
            .sort((a: any, b: any) => (Number(b?.bitrate) || 0) - (Number(a?.bitrate) || 0));
          if (audioFormats.length > 0) {
            logs.push(`[rapid-stream:${host}] ✅ Got adaptiveFormat audio (${audioFormats.length} streams)`);
            return { url: audioFormats[0].url, logs };
          }
        }

        const extracted = extractStreamUrl(payload);
        if (extracted) {
          logs.push(`[rapid-stream:${host}] ✅ Extracted URL`);
          return { url: extracted, logs };
        }

        if (payload?.status) {
          logs.push(`[rapid-stream:${host}] status=${payload.status} msg=${payload.msg || payload.message || "-"}`);
        }
      } catch (err) {
        logs.push(`[rapid-stream:${host}] ${path} -> ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
    }
  }

  return { url: null, logs };
}

// Search YouTube via Piped
async function searchYouTube(query: string) {
  const ytdlpResults = await searchViaYtDlp(query);
  if (ytdlpResults.length > 0) return ytdlpResults;

  const rapidResults = await searchViaRapidApi(query);
  if (rapidResults.length > 0) return rapidResults;

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

// Get audio stream URL — multi-provider fallback
async function getStream(videoId: string, debug = false): Promise<{ url: string | null; logs: string[] }> {
  const logs: string[] = [];

  const ytdlpStream = await getStreamViaYtDlp(videoId);
  if (ytdlpStream) {
    logs.push("[provider] yt-dlp ✅");
    return { url: ytdlpStream, logs };
  }
  logs.push("[provider] yt-dlp ❌");

  const rapidResult = await getStreamViaRapidApi(videoId, debug);
  logs.push(...rapidResult.logs);
  if (rapidResult.url) return { url: rapidResult.url, logs };
  logs.push("[provider] rapidapi ❌");

  const data = await tryPipedInstances(`/streams/${videoId}`);
  if (!data) {
    logs.push("[provider] piped ❌ no data");
    return { url: null, logs };
  }

  // Try audio streams first (best quality)
  if (data.audioStreams?.length) {
    const sorted = data.audioStreams
      .filter((s: any) => s.mimeType?.includes("audio"))
      .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
    if (sorted.length > 0) {
      logs.push("[provider] piped ✅");
      return { url: sorted[0].url, logs };
    }
  }

  // Fallback to HLS
  if (data.hls) {
    logs.push("[provider] piped-hls ✅");
    return { url: data.hls, logs };
  }

  logs.push("[provider] piped ❌ no streams");
  return { url: null, logs };
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
      const result = await getStream(videoId);
      if (result.url) {
        return respond(true, { stream: { url: result.url } });
      }
      return respond(false, null, "No se pudo convertir el audio");
    }

    if (action === "debug") {
      if (!videoId?.trim()) return respond(false, null, "Video ID required", 400);
      const result = await getStream(videoId, true);
      return respond(
        !!result.url,
        {
          ...(result.url ? { stream: { url: result.url } } : {}),
          debug: result.logs,
          providers: {
            ytdlpConfigured: !!Deno.env.get("YTDLP_SERVICE_URL"),
            rapidApiConfigured: !!Deno.env.get("RAPIDAPI_KEY"),
            pipedInstances: PIPED_INSTANCES.length,
          },
        },
        result.url ? null : "All providers failed",
      );
    }

    return respond(false, null, "Invalid action", 400);
  } catch (err) {
    console.error("Server error:", err);
    return respond(false, null, err instanceof Error ? err.message : "Server error", 500);
  }
});
