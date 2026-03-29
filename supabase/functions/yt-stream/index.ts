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
      const mode = typeof body?.mode === "string" ? body.mode : "original";
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
      const res = await callService("/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, artist, album, duration, mode }),
      });
      const data = await res.json();
      return jsonResponse(data, res.ok ? 200 : 502);
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
