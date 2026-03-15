import { Play, Music, Pause } from 'lucide-react';
import { useMusicStore } from '../store/musicStore';
import { useHomeData } from '../hooks/useHomeData';
import { Skeleton } from '../components/ui/skeleton';
import type { HomeTrack } from '../hooks/useHomeData';

const genreColors: Record<string, { bg: string; text: string; border: string }> = {
  Pop: { bg: 'rgba(200, 240, 75, 0.1)', text: '#C8F04B', border: 'rgba(200, 240, 75, 0.3)' },
  Rap: { bg: 'rgba(160, 160, 160, 0.1)', text: '#A0A0A0', border: 'rgba(160, 160, 160, 0.3)' },
  Rock: { bg: 'rgba(245, 245, 240, 0.1)', text: '#F5F5F0', border: 'rgba(245, 245, 240, 0.3)' },
  Electronic: { bg: 'rgba(110, 231, 183, 0.1)', text: '#6EE7B7', border: 'rgba(110, 231, 183, 0.3)' },
  'R&B': { bg: 'rgba(252, 165, 165, 0.05)', text: '#FCA5A5', border: 'rgba(252, 165, 165, 0.2)' },
  Latin: { bg: 'rgba(252, 211, 77, 0.08)', text: '#FCD34D', border: 'rgba(252, 211, 77, 0.2)' },
};

function HeroSection({ track }: { track: HomeTrack | null }) {
  const { playTrack, currentTrack, isPlaying } = useMusicStore();

  if (!track) return null;

  const isPlayingThis = currentTrack?.id === track.id;

  return (
    <div
      className="relative h-72 rounded-2xl overflow-hidden mb-12 group cursor-pointer"
      style={{
        backgroundImage: `url(${track.cover})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-lg group-hover:bg-black/50 transition-all duration-300" />
      <div className="relative h-full flex flex-col justify-end p-8 space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-[#A0A0A0]">Top Track Global #1</p>
          <h2 className="font-syne text-4xl font-bold text-[#F5F5F0] line-clamp-2">{track.title}</h2>
          <p className="text-[#999999]">{track.artist}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => playTrack(track)}
            className="px-6 py-2 bg-[#C8F04B] text-black font-syne font-semibold rounded-lg  hover:scale-105 transition-transform flex items-center gap-2"
          >
            {isPlayingThis && isPlaying ? (
              <>
                <Pause size={16} />
                Pausar
              </>
            ) : (
              <>
                <Play size={16} className="ml-0.5" />
                Reproducir ahora
              </>
            )}
          </button>
          <button className="px-6 py-2 border border-[rgba(255,255,255,0.2)] text-[#F5F5F0] font-dm-sans rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors">
            Añadir a biblioteca
          </button>
        </div>
      </div>
    </div>
  );
}

function ContinueListening() {
  const { history, playTrack } = useMusicStore();

  if (history.length === 0) return null;

  const recentTracks = history.slice(0, 6);

  return (
    <section className="mb-12">
      <h2 className="font-syne text-2xl font-bold text-[#F5F5F0] mb-6">Continuar escuchando</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {recentTracks.map((track) => (
          <button
            key={track.id}
            onClick={() => playTrack(track)}
            className="glass-panel p-3 space-y-3 hover:scale-105 transition-transform group"
          >
            {track.cover ? (
              <div
                className="w-full aspect-square rounded-lg overflow-hidden"
                style={{
                  backgroundImage: `url(${track.cover})`,
                  backgroundSize: 'cover',
                }}
              />
            ) : (
              <div className="w-full aspect-square rounded-lg bg-gradient-to-br from-[#C8F04B] to-[#8BC34A] flex items-center justify-center">
                <Music size={24} className="text-black opacity-50" />
              </div>
            )}
            <div className="space-y-1 min-w-0">
              <p className="text-xs font-syne font-semibold text-[#F5F5F0] truncate">{track.title}</p>
              <p className="text-xs text-[#666660] truncate">{track.artist}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function TopGlobalSection({ tracks }: { tracks: HomeTrack[] }) {
  const { playTrack, currentTrack } = useMusicStore();

  if (!tracks || tracks.length === 0) return null;

  return (
    <section className="mb-12">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="font-syne text-2xl font-bold text-[#F5F5F0]">Top Global Ahora</h2>
        <div className="px-2 py-1 bg-[#C8F04B] text-black text-xs font-syne font-bold rounded animate-pulse">LIVE</div>
      </div>
      <div className="space-y-2">
        {tracks.slice(0, 20).map((track, idx) => {
          const isActive = currentTrack?.id === track.id;
          const top3 = idx < 3;

          return (
            <button
              key={track.id}
              onClick={() => playTrack(track)}
              className={`w-full glass-panel px-4 py-3 flex items-center gap-4 group hover:bg-[rgba(255,255,255,0.05)] transition-colors ${
                isActive ? 'border-[#C8F04B] border-l-2' : ''
              }`}
            >
              {top3 ? (
                <div className="font-syne text-2xl font-bold text-[#C8F04B] w-8 text-center">{idx + 1}</div>
              ) : (
                <div className="text-[#333330] w-8 text-center text-sm font-mono">{idx + 1}</div>
              )}
              <div
                className="w-10 h-10 rounded flex-shrink-0"
                style={{
                  backgroundImage: `url(${track.coverSmall})`,
                  backgroundSize: 'cover',
                }}
              />
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-dm-sans font-medium text-[#F5F5F0] truncate">{track.title}</p>
                <p className="text-xs text-[#666660] truncate">{track.artist}</p>
              </div>
              <span className="text-xs text-[#333330] font-mono flex-shrink-0">
                {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  playTrack(track);
                }}
                className="hidden group-hover:flex items-center justify-center w-8 h-8 rounded-full bg-[#C8F04B] text-black flex-shrink-0"
              >
                <Play size={14} className="ml-0.5" />
              </button>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TrendingArtistsSection({ artists }: any) {
  if (!artists || artists.length === 0) return null;

  const formatFans = (fans: number) => {
    if (fans > 1000000) return `${(fans / 1000000).toFixed(1)}M`;
    if (fans > 1000) return `${(fans / 1000).toFixed(1)}K`;
    return fans.toString();
  };

  return (
    <section className="mb-12">
      <h2 className="font-syne text-2xl font-bold text-[#F5F5F0] mb-6">Artistas del momento</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {artists.slice(0, 12).map((artist: any) => (
          <button key={artist.id} className="glass-panel p-4 text-center space-y-3 hover:scale-105 transition-transform group">
            {artist.picture ? (
              <div
                className="w-full aspect-square rounded-full overflow-hidden mx-auto"
                style={{
                  backgroundImage: `url(${artist.picture})`,
                  backgroundSize: 'cover',
                  maxWidth: '120px',
                }}
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#C8F04B] to-[#8BC34A] flex items-center justify-center mx-auto">
                <Music size={32} className="text-black opacity-50" />
              </div>
            )}
            <div className="space-y-1">
              <p className="text-xs font-syne font-semibold text-[#F5F5F0] truncate">{artist.name}</p>
              <p className="text-xs text-[#333330]">{formatFans(artist.fans)} fans</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function GenreSection({ name, tracks }: { name: string; tracks: HomeTrack[] }) {
  const { playTrack } = useMusicStore();
  const colors = genreColors[name] || genreColors.Pop;

  if (!tracks || tracks.length === 0) return null;

  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-syne text-xl font-bold" style={{ color: colors.text }}>
          Top {name}
        </h3>
        <button className="text-xs px-3 py-1 rounded border transition-colors" style={{ borderColor: colors.border, color: colors.text }}>
          Ver todo
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 overflow-x-auto pb-2">
        {tracks.slice(0, 10).map((track) => (
          <button
            key={track.id}
            onClick={() => playTrack(track)}
            className="glass-panel p-3 space-y-3 hover:scale-105 transition-transform flex-shrink-0 w-40"
          >
            {track.cover ? (
              <div
                className="w-full aspect-square rounded-lg overflow-hidden"
                style={{
                  backgroundImage: `url(${track.coverSmall})`,
                  backgroundSize: 'cover',
                }}
              />
            ) : (
              <div className="w-full aspect-square rounded-lg bg-gradient-to-br from-[#C8F04B] to-[#8BC34A] flex items-center justify-center">
                <Music size={24} className="text-black opacity-50" />
              </div>
            )}
            <div className="space-y-1">
              <p className="text-xs font-syne font-semibold text-[#F5F5F0] line-clamp-2">{track.title}</p>
              <p className="text-xs text-[#666660] truncate">{track.artist}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function NewAlbumsSection({ albums }: any) {
  if (!albums || albums.length === 0) return null;

  return (
    <section className="mb-12">
      <h2 className="font-syne text-2xl font-bold text-[#F5F5F0] mb-6">Novedades</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {albums.slice(0, 12).map((album: any) => (
          <button key={album.id} className="glass-panel p-3 space-y-3 hover:scale-105 transition-transform">
            {album.cover ? (
              <div
                className="w-full aspect-square rounded-lg overflow-hidden"
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
            <div className="space-y-1">
              <p className="text-xs font-syne font-semibold text-[#F5F5F0] line-clamp-2">{album.title}</p>
              <p className="text-xs text-[#666660] truncate">{album.artist}</p>
              <p className="text-xs text-[#333330]">{album.releaseDate.split('-')[0]}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

export function HomePage() {
  const { data, loading, error } = useHomeData();

  return (
    <div className="min-h-screen bg-[#080808] pt-6 pb-32">
      <div className="max-w-7xl mx-auto px-6 space-y-8">
        {!loading && (
          <div className="space-y-2">
            <h1 className="font-syne text-4xl font-bold text-[#F5F5F0]">Welcome back</h1>
            <p className="text-[#666660]">Your music journey continues</p>
          </div>
        )}

        {error && !loading && (
          <div className="p-4 bg-[rgba(255,77,109,0.08)] border border-[rgba(255,77,109,0.2)] rounded-lg">
            <p className="text-sm text-[#FF6B7F]">No se pudo cargar el contenido. Intenta recargar la página.</p>
          </div>
        )}

        {loading && (
          <div className="space-y-8">
            <Skeleton className="h-72 rounded-2xl" />
            <div className="space-y-4">
              <Skeleton className="h-8 w-32" />
              <div className="grid grid-cols-6 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-lg" />
                ))}
              </div>
            </div>
          </div>
        )}

        {data && !loading && (
          <>
            <HeroSection track={data.topTracks[0]} />
            <ContinueListening />
            <TopGlobalSection tracks={data.topTracks} />
            <TrendingArtistsSection artists={data.trendingArtists} />
            {Object.entries(data.byGenre).map(([genreName, genreData]) => (
              <GenreSection key={genreName} name={genreName} tracks={genreData.tracks} />
            ))}
            <NewAlbumsSection albums={data.newAlbums} />
          </>
        )}
      </div>
    </div>
  );
}

export default HomePage;
