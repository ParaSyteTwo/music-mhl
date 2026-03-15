import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Play, Music } from 'lucide-react';
import { useMusicStore } from '../store/musicStore';
import { Skeleton } from '../components/ui/skeleton';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

type ArtistTab = 'popular' | 'discography' | 'similar';

interface ArtistData {
  info: {
    id: number;
    name: string;
    picture: string;
    fans: number;
  };
  topTracks: any[];
  albums: any[];
  related: any[];
}

export function ArtistPage() {
  const { id } = useParams<{ id: string }>();
  const { playTrack } = useMusicStore();
  const [data, setData] = useState<ArtistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ArtistTab>('popular');

  useEffect(() => {
    if (!id) return;

    const artistId = parseInt(id.replace('dz-artist-', ''), 10);
    if (isNaN(artistId)) return;

    async function fetchArtist() {
      try {
        setLoading(true);
        const response = await fetch(`${SUPABASE_URL}/functions/v1/deezer-search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({ action: 'artist', artistId }),
        });

        if (!response.ok) throw new Error('Failed to fetch artist');
        const artistData: ArtistData = await response.json();
        setData(artistData);
        setError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load artist';
        setError(msg);
      } finally {
        setLoading(false);
      }
    }

    fetchArtist();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080808] pt-6 pb-32">
        <div className="max-w-7xl mx-auto px-6">
          <Skeleton className="h-64 rounded-lg mb-8" />
          <Skeleton className="h-8 w-32 mb-8" />
          <div className="space-y-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#080808] pt-6 pb-32 flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#FF6B7F] mb-4">{error || 'Artist not found'}</p>
          <a href="/search" className="text-[#C8F04B] hover:underline">
            Back to Search
          </a>
        </div>
      </div>
    );
  }

  const formatFans = (fans: number) => {
    if (fans > 1000000) return `${(fans / 1000000).toFixed(1)}M`;
    if (fans > 1000) return `${(fans / 1000).toFixed(1)}K`;
    return fans.toString();
  };

  return (
    <div className="min-h-screen bg-[#080808] pb-32">
      {/* HERO HEADER */}
      <div
        className="h-72 relative flex items-end p-8"
        style={{
          backgroundImage: `url(${data.info.picture})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/80 to-transparent" />
        <div className="relative space-y-4">
          <h1 className="font-syne text-5xl font-bold text-[#F5F5F0]">{data.info.name}</h1>
          <div className="flex items-center gap-2 text-[#999999]">
            <p className="text-lg">{formatFans(data.info.fans)} fans</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (data.topTracks.length > 0) {
                  data.topTracks.forEach((track) => playTrack(track));
                }
              }}
              className="px-6 py-2 bg-[#C8F04B] text-black font-syne font-semibold rounded-lg hover:scale-105 transition-transform flex items-center gap-2"
            >
              <Play size={16} className="ml-0.5" />
              Reproducir todo
            </button>
            <button className="px-6 py-2 border border-[rgba(255,255,255,0.2)] text-[#F5F5F0] rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors">
              Shuffle
            </button>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-7xl mx-auto px-6 pt-8">
        {/* TABS */}
        <div className="flex gap-6 mb-8 border-b border-[rgba(255,255,255,0.06)] pb-4">
          {[
            { id: 'popular', label: 'Popular' },
            { id: 'discography', label: 'Discografía' },
            { id: 'similar', label: 'Similares' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as ArtistTab)}
              className={`font-dm-sans text-sm transition-colors ${
                tab === t.id
                  ? 'text-[#C8F04B] border-b-2 border-[#C8F04B]'
                  : 'text-[#666660] hover:text-[#F5F5F0]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* POPULAR TAB */}
        {tab === 'popular' && (
          <div className="space-y-2">
            {data.topTracks.map((track, idx) => (
              <button
                key={track.id}
                onClick={() => playTrack(track)}
                className="w-full glass-panel px-4 py-3 flex items-center gap-4 group hover:bg-[rgba(255,255,255,0.05)] transition-colors"
              >
                <div className="w-8 text-[#333330] text-sm font-mono text-center">{idx + 1}</div>
                {track.cover && (
                  <div
                    className="w-10 h-10 rounded flex-shrink-0"
                    style={{
                      backgroundImage: `url(${track.cover})`,
                      backgroundSize: 'cover',
                    }}
                  />
                )}
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-dm-sans font-medium text-[#F5F5F0] truncate">
                    {track.title}
                  </p>
                  <p className="text-xs text-[#666660]">{track.album}</p>
                </div>
                <span className="text-xs text-[#333330] font-mono">
                  {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* DISCOGRAPHY TAB */}
        {tab === 'discography' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {data.albums.map((album) => (
              <button
                key={album.id}
                className="glass-panel p-3 space-y-3 hover:scale-105 transition-transform"
              >
                {album.cover ? (
                  <div
                    className="w-full aspect-square rounded-lg"
                    style={{
                      backgroundImage: `url(${album.cover})`,
                      backgroundSize: 'cover',
                    }}
                  />
                ) : (
                  <div className="w-full aspect-square rounded-lg bg-gradient-to-br from-[#C8F04B] to-[#8BC34A] flex items-center justify-center">
                    <Music size={32} className="text-black opacity-50" />
                  </div>
                )}
                <div>
                  <p className="text-xs font-syne font-semibold text-[#F5F5F0] line-clamp-2">
                    {album.title}
                  </p>
                  <p className="text-xs text-[#333330]">{album.releaseDate?.split('-')[0]}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* SIMILAR TAB */}
        {tab === 'similar' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {data.related.map((artist) => (
              <button key={artist.id} className="glass-panel p-4 text-center space-y-3 hover:scale-105 transition-transform">
                {artist.picture ? (
                  <div
                    className="w-20 h-20 rounded-full overflow-hidden mx-auto"
                    style={{
                      backgroundImage: `url(${artist.picture})`,
                      backgroundSize: 'cover',
                    }}
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#C8F04B] to-[#8BC34A] flex items-center justify-center mx-auto">
                    <Music size={24} className="text-black opacity-50" />
                  </div>
                )}
                <div>
                  <p className="text-xs font-syne font-semibold text-[#F5F5F0] truncate">
                    {artist.name}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ArtistPage;
