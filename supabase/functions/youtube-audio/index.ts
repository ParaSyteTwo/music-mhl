const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt',
];

async function fetchWithFallback(path: string): Promise<any> {
  for (const instance of PIPED_INSTANCES) {
    try {
      const response = await fetch(`${instance}${path}`, {
        headers: { 'User-Agent': 'MHL/1.0' },
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.log(`Instance ${instance} failed, trying next...`);
    }
  }
  throw new Error('All Piped instances failed');
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
      const data = await fetchWithFallback(`/search?q=${encodeURIComponent(sanitizedQuery)}&filter=music_songs`);

      const results = (data.items || [])
        .filter((item: any) => item.type === 'stream')
        .slice(0, 10)
        .map((item: any) => ({
          videoId: item.url?.replace('/watch?v=', '') || '',
          title: item.title || '',
          artist: item.uploaderName?.replace(' - Topic', '') || item.uploaderName || '',
          duration: item.duration || 0,
          thumbnail: item.thumbnail || '',
        }));

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
      const data = await fetchWithFallback(`/streams/${sanitizedId}`);

      // Find best audio stream
      const audioStreams = (data.audioStreams || [])
        .filter((s: any) => s.mimeType?.startsWith('audio/'))
        .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

      const bestStream = audioStreams[0];

      if (!bestStream) {
        return new Response(
          JSON.stringify({ success: false, error: 'No audio stream found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          stream: {
            url: bestStream.url,
            mimeType: bestStream.mimeType,
            bitrate: bestStream.bitrate,
            quality: bestStream.quality,
            codec: bestStream.codec,
          },
          metadata: {
            title: data.title,
            artist: data.uploader?.replace(' - Topic', '') || data.uploader,
            duration: data.duration,
            thumbnail: data.thumbnailUrl,
          },
        }),
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
