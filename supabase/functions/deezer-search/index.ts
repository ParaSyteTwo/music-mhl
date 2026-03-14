const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, limit = 25 } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sanitizedQuery = query.trim().slice(0, 200);
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(sanitizedQuery)}&limit=${Math.min(limit, 50)}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Deezer API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform to our format
    const tracks = (data.data || []).map((item: any) => ({
      id: `dz-${item.id}`,
      deezerId: item.id,
      title: item.title || item.title_short,
      artist: item.artist?.name || 'Unknown',
      album: item.album?.title || 'Unknown',
      duration: item.duration || 0,
      cover: item.album?.cover_xl || item.album?.cover_big || item.album?.cover_medium || '',
      coverSmall: item.album?.cover_small || '',
      preview: item.preview || '', // 30s preview URL
      artistId: item.artist?.id,
      albumId: item.album?.id,
    }));

    return new Response(
      JSON.stringify({ success: true, tracks, total: data.total || 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Deezer search error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Search failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
