const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-forwarded-for, cf-connecting-ip, x-real-ip, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type RateState = {
  burstHits: number[];
  dayCount: number;
  dayKey: string;
};

const rateLimitStore = new Map<string, RateState>();

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getEnvNumber(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140) || "download.mp3";
}

function normalizeSearchTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b(feat|ft|featuring)\.?\s+[^-–—,]+/gi, " ")
    .replace(/\b(remaster(?:ed)?|radio edit|radio version|version|ost|soundtrack)\b/gi, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksAnimeLike(title: string, artist: string, album = ""): boolean {
  const source = `${title} ${artist} ${album}`.toLowerCase();
  return /(anime|opening|ending|\bop\b|\bed\b|theme|ost|project|isekai)/.test(source);
}

function buildCandidateQueries(title: string, artist: string, album = ""): string[] {
  const cleanTitle = normalizeSearchTerm(title);
  const cleanArtist = normalizeSearchTerm(artist);
  const cleanAlbum = normalizeSearchTerm(album);
  const queries = [
    `${cleanTitle} ${cleanArtist}`,
    `${cleanTitle} ${cleanArtist} official audio`,
    cleanAlbum ? `${cleanTitle} ${cleanAlbum} ${cleanArtist}` : "",
  ];

  if (looksAnimeLike(title, artist, album)) {
    queries[2] = `${cleanTitle} ${cleanArtist} full version`;
  }

  return [...new Set(queries.map((query) => query.trim()).filter(Boolean))];
}

function scoreCandidate(
  candidate: Record<string, unknown>,
  targetTitle: string,
  targetArtist: string,
  targetAlbum = "",
  targetDuration = 0,
  queryIndex = 0,
): number {
  const title = String(candidate.title || "").toLowerCase();
  const channel = String(candidate.channel || "").toLowerCase();
  const wantedTitle = normalizeSearchTerm(targetTitle);
  const wantedArtist = normalizeSearchTerm(targetArtist);
  const wantedAlbum = normalizeSearchTerm(targetAlbum);

  let score = 100 - queryIndex * 8;

  if (wantedTitle && title.includes(wantedTitle)) score += 30;
  if (wantedArtist && title.includes(wantedArtist)) score += 20;
  if (wantedArtist && channel.includes(wantedArtist)) score += 18;
  if (wantedAlbum && title.includes(wantedAlbum)) score += 8;

  if (targetDuration > 0) {
    const duration = Number(candidate.duration || 0);
    if (duration > 0) {
      const diffPct = Math.abs(duration - targetDuration) / targetDuration;
      if (diffPct <= 0.10) score += 25;
      else if (diffPct <= 0.20) score += 10;
      else if (diffPct >= 0.40) score -= 30;
    }
  }

  if (title.includes("official audio")) score += 25;
  if (title.includes("audio only")) score += 20;
  if (title.includes("radio edit") || title.includes("radio version")) score += 18;
  if (channel.includes("topic")) score += 12;
  if (title.includes("lyrics")) score += 5;
  if (looksAnimeLike(targetTitle, targetArtist, targetAlbum) && /(opening|ending|\bop\b|\bed\b|full version)/.test(title)) {
    score += 15;
  }

  const mvKeywords = [
    "music video",
    "official video",
    "official music video",
    "mv",
    "videoclip",
    "video clip",
    "official clip",
    "video oficial",
  ];
  if (mvKeywords.some((kw) => title.includes(kw))) score -= 25;

  if (title.includes("karaoke")) score -= 30;
  if (title.includes("reaction")) score -= 15;
  if (title.includes("nightcore") || title.includes("sped up") || title.includes("slowed") || title.includes("8d")) score -= 20;
  if (title.includes("cover") && !channel.includes(wantedArtist)) score -= 12;
  if (title.includes("live") || title.includes("en vivo") || title.includes("concert")) score -= 10;
  if (title.includes("remix") && !title.includes("official")) score -= 8;
  if (title.includes("instrumental")) score -= 8;
  if (title.includes("extended") || title.includes("extended mix")) score -= 5;

  const duration = Number(candidate.duration || 0);
  if (duration >= 90 && duration <= 600) score += 10;

  return score;
}

function classifyCandidate(candidate: Record<string, unknown>): string {
  const haystack = `${String(candidate.title || "")} ${String(candidate.channel || "")}`.toLowerCase();
  if (/(opening|ending|\bop\b|\bed\b)/.test(haystack)) return "anime op/ed";
  if (/(cover|fan cover|spanish cover)/.test(haystack)) return "cover";
  if (/(live|concert|en vivo)/.test(haystack)) return "live";
  return "original probable";
}

function confidenceFromScore(score: number): "alta" | "media" | "baja" {
  if (score >= 120) return "alta";
  if (score >= 90) return "media";
  return "baja";
}

function getDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function checkRateLimit(ip: string): { ok: true } | { ok: false; retryAfter: number; message: string } {
  const burstLimit = getEnvNumber("YTDLP_RATE_LIMIT_BURST", 8);
  const burstWindowSeconds = getEnvNumber("YTDLP_RATE_LIMIT_WINDOW_SECONDS", 60);
  const dailyLimit = getEnvNumber("YTDLP_DAILY_LIMIT", 250);

  const now = Date.now();
  const nowDay = getDayKey();
  const state = rateLimitStore.get(ip) || {
    burstHits: [],
    dayCount: 0,
    dayKey: nowDay,
  };

  if (state.dayKey !== nowDay) {
    state.dayKey = nowDay;
    state.dayCount = 0;
    state.burstHits = [];
  }

  const windowMs = burstWindowSeconds * 1000;
  state.burstHits = state.burstHits.filter((ts) => now - ts < windowMs);

  if (state.burstHits.length >= burstLimit) {
    rateLimitStore.set(ip, state);
    return {
      ok: false,
      retryAfter: burstWindowSeconds,
      message: "Too many download requests in a short period",
    };
  }

  if (state.dayCount >= dailyLimit) {
    rateLimitStore.set(ip, state);
    return {
      ok: false,
      retryAfter: 3600,
      message: "Daily download quota reached",
    };
  }

  state.burstHits.push(now);
  state.dayCount += 1;
  rateLimitStore.set(ip, state);
  return { ok: true };
}

function b64urlEncode(input: Uint8Array): string {
  return btoa(String.fromCharCode(...input))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function signDownloadToken(payload: Record<string, unknown>, secret: string): Promise<string> {
  const body = JSON.stringify(payload, Object.keys(payload).sort());
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${b64urlEncode(encoder.encode(body))}.${b64urlEncode(new Uint8Array(signature))}`;
}

async function callService(path: string, init: RequestInit = {}) {
  const serviceUrl = Deno.env.get("YTDLP_SERVICE_URL");
  const serviceKey = Deno.env.get("YTDLP_SERVICE_KEY");
  if (!serviceUrl || !serviceKey) {
    throw new Error("YTDLP service is not configured");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${serviceKey}`);
  return await fetch(`${serviceUrl}${path}`, { ...init, headers });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "health") {
      const res = await callService("/health");
      const payload = await res.json();
      return jsonResponse({ success: res.ok, service: payload }, res.ok ? 200 : 502);
    }

    if (action === "getCandidates") {
      const title = typeof body?.title === "string" ? body.title.trim() : "";
      const artist = typeof body?.artist === "string" ? body.artist.trim() : "";
      const album = typeof body?.album === "string" ? body.album.trim() : "";
      const duration = typeof body?.duration === "number" && body.duration > 0 ? body.duration : 0;
      if (!title || !artist) {
        return jsonResponse({ success: false, error: "title and artist are required" }, 400);
      }
      const ip = getClientIp(req);
      const rateResult = checkRateLimit(ip);
      if (!rateResult.ok) {
        return new Response(JSON.stringify({ success: false, error: rateResult.message }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rateResult.retryAfter) },
        });
      }
      const queries = buildCandidateQueries(title, artist, album);

      try {
        const res = await callService("/candidates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, artist, album, duration }),
        });
        const data = await res.json();
        const serviceCandidates = Array.isArray(data?.candidates) ? data.candidates : [];
        const hasSmartFields = serviceCandidates.some((candidate) =>
          typeof candidate?.label === "string" || typeof candidate?.confidence === "string"
        );
        if (res.ok && data?.success && hasSmartFields) {
          return jsonResponse(data, 200);
        }
        console.warn("yt-stream getCandidates fallback to /search", data);
      } catch (error) {
        console.warn("yt-stream /candidates unavailable, falling back to /search", error);
      }

      const merged = new Map<string, Record<string, unknown>>();
      for (const [queryIndex, query] of queries.entries()) {
        const searchRes = await callService(`/search?q=${encodeURIComponent(query)}`);
        const searchData = await searchRes.json();
        if (!searchRes.ok || !searchData?.success) continue;
        const rawResults = Array.isArray(searchData?.results) ? searchData.results : [];
        for (const candidate of rawResults.slice(0, 6)) {
          const videoId = String(candidate.videoId || "");
          const titleValue = String(candidate.title || "");
          if (!videoId || !titleValue) continue;
          const score = scoreCandidate(candidate, title, artist, album, duration, queryIndex);
          const normalized = {
            videoId,
            title: titleValue,
            channel: String(candidate.channel || ""),
            duration: Number(candidate.duration || 0),
            score,
            label: classifyCandidate(candidate),
            confidence: confidenceFromScore(score),
          };
          const existing = merged.get(videoId);
          if (!existing || Number(normalized.score) > Number(existing.score || 0)) {
            merged.set(videoId, normalized);
          }
        }
        const ranked = [...merged.values()].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
        if (ranked[0]?.confidence === "alta" && ranked.length >= 2) {
          return jsonResponse({ success: true, candidates: ranked.slice(0, 3) }, 200);
        }
      }

      const candidates = [...merged.values()]
        .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
        .slice(0, 3);

      return jsonResponse({ success: true, candidates }, 200);
    }

    if (action !== "webDownloadTicket") {
      return jsonResponse({ success: false, error: "Invalid action" }, 400);
    }

    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const artist = typeof body?.artist === "string" ? body.artist.trim() : "";
    const album = typeof body?.album === "string" ? body.album.trim() : "";
    const format = body?.format === "aac" ? "aac" : "mp3";
    const duration = typeof body?.duration === "number" && body.duration > 0 ? body.duration : 0;
    const videoIdOverride = typeof body?.videoId === "string" && body.videoId.trim() ? body.videoId.trim() : null;

    if (!title || !artist) {
      return jsonResponse({ success: false, error: "title and artist are required" }, 400);
    }

    const ip = getClientIp(req);
    const rateResult = checkRateLimit(ip);
    if (!rateResult.ok) {
      return new Response(
        JSON.stringify({ success: false, error: rateResult.message }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(rateResult.retryAfter),
          },
        },
      );
    }

    // Si el usuario ya eligió un videoId concreto, saltamos el resolve
    let resolvedVideoId: string;
    if (videoIdOverride) {
      resolvedVideoId = videoIdOverride;
    } else {
      const resolveRes = await callService("/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, artist, album, format, duration }),
      });
      const resolvePayload = await resolveRes.json();
      if (!resolveRes.ok || !resolvePayload?.success) {
        return jsonResponse(
          { success: false, error: resolvePayload?.error || "Failed to resolve video" },
          resolveRes.status || 502,
        );
      }
      resolvedVideoId = resolvePayload.videoId;
    }

    const tokenTtlSeconds = getEnvNumber("YTDLP_TOKEN_TTL_SECONDS", 120);
    const signingSecret = Deno.env.get("YTDLP_SIGNING_SECRET");
    if (!signingSecret) {
      throw new Error("YTDLP_SIGNING_SECRET not configured");
    }

    const expiresAtUnix = Math.floor(Date.now() / 1000) + tokenTtlSeconds;
    const fileName = sanitizeFileName(`${title} - ${artist}.${format}`);
    const token = await signDownloadToken(
      {
        videoId: resolvedVideoId,
        fileName,
        format,
        expiresAt: expiresAtUnix,
      },
      signingSecret,
    );

    const serviceUrl = Deno.env.get("YTDLP_SERVICE_URL")!;
    const expiresAt = new Date(expiresAtUnix * 1000).toISOString();
    return jsonResponse({
      success: true,
      fileName,
      expiresAt,
      downloadUrl: `${serviceUrl}/download?token=${encodeURIComponent(token)}`,
    });
  } catch (error) {
    console.error("yt-stream broker error:", error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Server error",
      },
      500,
    );
  }
});
