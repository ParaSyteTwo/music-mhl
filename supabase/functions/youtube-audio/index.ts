// YouTube Audio Edge Function v2 - Updated instances
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Updated working instances
const PIPED_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
];

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.jing.rocks',
];

async function pipedSearch(query: string): Promise<any[]> {
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${instance}/search?q=${encodeURIComponent(query)}&filter=music_songs`, {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        return (data.items || []).filter((i: any) => i.type === 'stream').slice(0, 10).map((item: any) => ({
          videoId: item.url?.replace('/watch?v=', '') || '',
          title: item.title || '',
          artist: item.uploaderName?.replace(' - Topic', '') || item.uploaderName || '',
          duration: item.duration || 0,
          thumbnail: item.thumbnail || '',
        }));
      }
      await res.text(); // consume body
    } catch (e) {
      console.log(`Piped ${instance} failed: ${e}`);
    }
  }
  return [];
}

async function invidiousSearch(query: string): Promise<any[]> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort_by=relevance`, {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        return (data || []).slice(0, 10).map((item: any) => ({
          videoId: item.videoId || '',
          title: item.title || '',
          artist: item.author?.replace(' - Topic', '') || item.author || '',
          duration: item.lengthSeconds || 0,
          thumbnail: item.videoThumbnails?.[0]?.url || '',
        }));
      }
      await res.text();
    } catch (e) {
      console.log(`Invidious ${instance} search failed: ${e}`);
    }
  }
  return [];
}

async function getStreamUrl(videoId: string): Promise<{ url: string; mimeType: string; bitrate: number; quality: string } | null> {
  // Try Piped first
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${instance}/streams/${videoId}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        const audioStreams = (data.audioStreams || [])
          .filter((s: any) => s.mimeType?.startsWith('audio/'))
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        if (audioStreams.length > 0) {
          const best = audioStreams[0];
          return { url: best.url, mimeType: best.mimeType, bitrate: best.bitrate, quality: best.quality };
        }
      } else {
        await res.text();
      }
    } catch (e) {
      console.log(`Piped stream ${instance} failed: ${e}`);
    }
  }

  // Fallback: Invidious
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${instance}/api/v1/videos/${videoId}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        const audioStreams = (data.adaptiveFormats || [])
          .filter((s: any) => s.type?.startsWith('audio/'))
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        if (audioStreams.length > 0) {
          const best = audioStreams[0];
          return { url: best.url, mimeType: best.type?.split(';')[0], bitrate: best.bitrate, quality: `${best.bitrate}bps` };
        }
      } else {
        await res.text();
      }
    } catch (e) {
      console.log(`Invidious stream ${instance} failed: ${e}`);
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, query, videoId } = await req.json();

    if (action === 'search') {
      if (!query) {
        return new Response(
          JSON.stringify({ error: 'Query is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const sanitizedQuery = query.trim().slice(0, 200);

      // Try Piped, fallback to Invidious
      let results = await pipedSearch(sanitizedQuery);
      if (results.length === 0) {
        console.log('Piped search failed, trying Invidious...');
        results = await invidiousSearch(sanitizedQuery);
      }

      if (results.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'No results found from any instance' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'stream') {
      if (!videoId) {
        return new Response(
          JSON.stringify({ error: 'videoId is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const sanitizedId = videoId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
      const stream = await getStreamUrl(sanitizedId);

      if (!stream) {
        return new Response(
          JSON.stringify({ success: false, error: 'No audio stream found from any instance' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, stream }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use "search" or "stream".' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('YouTube audio error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
