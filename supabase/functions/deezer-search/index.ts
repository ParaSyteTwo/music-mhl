const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface DeezerTrack {
  id: string;
  title: string;
  title_short: string;
  duration: number;
  preview: string;
  rank: number;
  artist: {
    id: number;
    name: string;
  };
  album: {
    id: number;
    title: string;
    cover_small: string;
    cover_medium: string;
    cover_big: string;
    cover_xl: string;
  };
}

interface DeezerArtist {
  id: number;
  name: string;
  picture_small: string;
  picture_medium: string;
  picture_big: string;
  picture_xl: string;
  nb_fan: number;
}

interface DeezerAlbum {
  id: number;
  title: string;
  cover_small: string;
  cover_medium: string;
  cover_big: string;
  cover_xl: string;
  release_date: string;
  artist: {
    id: number;
    name: string;
  };
}

interface DeezerGenre {
  id: number;
  name: string;
  picture_small: string;
  picture_medium: string;
  picture_big: string;
  picture_xl: string;
}

// Transform Deezer track to our format
function transformTrack(item: DeezerTrack) {
  return {
    id: `dz-${item.id}`,
    deezerId: item.id,
    title: item.title || item.title_short,
    artist: item.artist?.name || 'Unknown',
    album: item.album?.title || 'Unknown',
    duration: item.duration || 0,
    cover: item.album?.cover_xl || item.album?.cover_big || item.album?.cover_medium || '',
    coverSmall: item.album?.cover_small || '',
    preview: item.preview || '',
    artistId: item.artist?.id,
    albumId: item.album?.id,
    rank: item.rank,
  };
}

// Transform Deezer artist to our format
function transformArtist(item: DeezerArtist) {
  return {
    id: `dz-artist-${item.id}`,
    deezerId: item.id,
    name: item.name,
    picture: item.picture_xl || item.picture_big || item.picture_medium || '',
    pictureSmall: item.picture_small || '',
    fans: item.nb_fan,
  };
}

// Transform Deezer album to our format
function transformAlbum(item: DeezerAlbum) {
  return {
    id: `dz-album-${item.id}`,
    deezerId: item.id,
    title: item.title,
    artist: item.artist?.name || 'Unknown',
    artistId: item.artist?.id,
    cover: item.cover_xl || item.cover_big || item.cover_medium || '',
    coverSmall: item.cover_small || '',
    releaseDate: item.release_date,
  };
}

async function searchTracks(query: string, limit: number = 25) {
  const sanitizedQuery = query.trim().slice(0, 200);
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(sanitizedQuery)}&limit=${Math.min(limit, 50)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Deezer API error: ${response.status}`);
  }

  const data = await response.json();
  const tracks = (data.data || []).map(transformTrack);

  return { success: true, tracks, total: data.total || 0 };
}

async function searchAll(query: string) {
  const sanitizedQuery = query.trim().slice(0, 200);
  const encoded = encodeURIComponent(sanitizedQuery);

  try {
    const [tracksRes, artistsRes, albumsRes] = await Promise.all([
      fetch(`https://api.deezer.com/search?q=${encoded}&limit=10`),
      fetch(`https://api.deezer.com/search/artist?q=${encoded}&limit=5`),
      fetch(`https://api.deezer.com/search/album?q=${encoded}&limit=5`),
    ]);

    if (!tracksRes.ok || !artistsRes.ok || !albumsRes.ok) {
      throw new Error('One or more searches failed');
    }

    const [tracksData, artistsData, albumsData] = await Promise.all([
      tracksRes.json(),
      artistsRes.json(),
      albumsRes.json(),
    ]);

    return {
      success: true,
      tracks: (tracksData.data || []).map(transformTrack),
      artists: (artistsData.data || []).map(transformArtist),
      albums: (albumsData.data || []).map(transformAlbum),
    };
  } catch (error) {
    throw error;
  }
}

async function getArtistData(artistId: number) {
  try {
    const [infoRes, topRes, albumsRes, relatedRes] = await Promise.all([
      fetch(`https://api.deezer.com/artist/${artistId}`),
      fetch(`https://api.deezer.com/artist/${artistId}/top?limit=10`),
      fetch(`https://api.deezer.com/artist/${artistId}/albums?limit=10`),
      fetch(`https://api.deezer.com/artist/${artistId}/related?limit=8`),
    ]);

    if (!infoRes.ok || !topRes.ok || !albumsRes.ok || !relatedRes.ok) {
      throw new Error('Failed to fetch artist data');
    }

    const [infoData, topData, albumsData, relatedData] = await Promise.all([
      infoRes.json(),
      topRes.json(),
      albumsRes.json(),
      relatedRes.json(),
    ]);

    return {
      success: true,
      info: {
        id: infoData.id,
        name: infoData.name,
        picture: infoData.picture_xl || infoData.picture_big || infoData.picture_medium || '',
        fans: infoData.nb_fan,
      },
      topTracks: (topData.data || []).map(transformTrack),
      albums: (albumsData.data || []).map(transformAlbum),
      related: (relatedData.data || []).map(transformArtist),
    };
  } catch (error) {
    throw error;
  }
}

async function getAlbumData(albumId: number) {
  try {
    const albumRes = await fetch(`https://api.deezer.com/album/${albumId}`);
    if (!albumRes.ok) {
      throw new Error('Failed to fetch album');
    }

    const albumData = await albumRes.json();

    // Get artist's other albums
    const artistId = albumData.artist.id;
    const artistAlbumsRes = await fetch(`https://api.deezer.com/artist/${artistId}/albums?limit=20`);
    const artistAlbumsData = await artistAlbumsRes.json();

    return {
      success: true,
      album: {
        id: albumData.id,
        title: albumData.title,
        cover: albumData.cover_xl || albumData.cover_big || albumData.cover_medium || '',
        artist: {
          id: albumData.artist.id,
          name: albumData.artist.name,
        },
        releaseDate: albumData.release_date,
        trackCount: albumData.nb_tracks || 0,
        tracks: (albumData.tracks?.data || []).map(transformTrack),
      },
      moreByArtist: (artistAlbumsData.data || [])
        .filter((a: any) => a.id !== albumId)
        .slice(0, 4)
        .map(transformAlbum),
    };
  } catch (error) {
    throw error;
  }
}

async function getHomeData() {
  try {
    // Genre IDs: Pop=132, Rap=116, Rock=152, Electronic=106, R&B=165, Latin=197
    const genreIds = [132, 116, 152, 106, 165, 197];
    const genreNames: Record<number, string> = {
      132: 'Pop',
      116: 'Rap',
      152: 'Rock',
      106: 'Electronic',
      165: 'R&B',
      197: 'Latin',
    };

    // Fetch all data in parallel
    const [topTracksRes, genresRes, artistsRes, albumsRes, ...genreTracksRes] =
      await Promise.all([
        fetch('https://api.deezer.com/chart/0/tracks?limit=20'),
        fetch('https://api.deezer.com/genre'),
        fetch('https://api.deezer.com/chart/0/artists?limit=12'),
        fetch('https://api.deezer.com/chart/0/albums?limit=12'),
        ...genreIds.map((id) =>
          fetch(`https://api.deezer.com/chart/${id}/tracks?limit=10`)
        ),
      ]);

    if (
      !topTracksRes.ok ||
      !genresRes.ok ||
      !artistsRes.ok ||
      !albumsRes.ok ||
      !genreTracksRes.every((r) => r.ok)
    ) {
      throw new Error('One or more Deezer API calls failed');
    }

    const [topTracksData, genresData, artistsData, albumsData, ...genreTracksData] =
      await Promise.all([
        topTracksRes.json(),
        genresRes.json(),
        artistsRes.json(),
        albumsRes.json(),
        ...genreTracksRes.map((r) => r.json()),
      ]);

    // Transform top tracks
    const topTracks = (topTracksData.data || []).map(transformTrack);

    // Get available genres (all genres from Deezer)
    const genres = (genresData.data || [])
      .slice(0, 50)
      .map((genre: DeezerGenre) => ({
        id: genre.id,
        name: genre.name,
        picture: genre.picture_xl || genre.picture_big || genre.picture_medium || '',
      }));

    // Transform tracks by genre
    const byGenre: Record<
      string,
      {
        genreId: number;
        tracks: ReturnType<typeof transformTrack>[];
      }
    > = {};
    genreIds.forEach((genreId, idx) => {
      byGenre[genreNames[genreId]] = {
        genreId,
        tracks: (genreTracksData[idx].data || []).map(transformTrack),
      };
    });

    // Transform trending artists
    const trendingArtists = (artistsData.data || []).map(transformArtist);

    // Transform new albums
    const newAlbums = (albumsData.data || []).map(transformAlbum);

    return {
      success: true,
      topTracks,
      genres,
      byGenre,
      trendingArtists,
      newAlbums,
    };
  } catch (error) {
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, query, artistId, limit = 25 } = body;

    // Home action
    if (action === 'home') {
      const homeData = await getHomeData();
      return new Response(JSON.stringify(homeData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Genre action
    if (action === 'genre') {
      const genreId = body.genreId;
      if (!genreId) {
        return new Response(
          JSON.stringify({ error: 'genreId is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      try {
        const genreRes = await fetch(`https://api.deezer.com/chart/${genreId}/tracks?limit=25`);
        if (!genreRes.ok) {
          throw new Error('Failed to fetch genre tracks');
        }
        const genreData = await genreRes.json();
        const tracks = (genreData.data || []).map(transformTrack);
        return new Response(
          JSON.stringify({
            success: true,
            tracks,
            total: genreData.total || tracks.length,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('Genre action error:', error);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Failed to fetch genre data',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }
    }

    // Artist action
    if (action === 'artist') {
      if (!artistId) {
        return new Response(
          JSON.stringify({ error: 'artistId is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const artistData = await getArtistData(artistId);
      return new Response(JSON.stringify(artistData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Album action
    if (action === 'album') {
      const albumId = body.albumId;
      if (!albumId) {
        return new Response(
          JSON.stringify({ error: 'albumId is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const albumData = await getAlbumData(albumId);
      return new Response(JSON.stringify(albumData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Search all
    if (action === 'searchAll') {
      if (!query || typeof query !== 'string') {
        return new Response(
          JSON.stringify({ error: 'Query is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const result = await searchAll(query);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Search tracks (default)
    if (action === 'search' || !action) {
      if (!query || typeof query !== 'string') {
        return new Response(
          JSON.stringify({ error: 'Query is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const result = await searchTracks(query, limit);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ error: 'Unknown action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Deezer API error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Request failed',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
