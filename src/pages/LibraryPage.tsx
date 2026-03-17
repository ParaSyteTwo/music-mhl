import { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMusicStore } from '@/store/musicStore';
import {
  deriveAlbums,
  deriveArtists,
  deriveGenres,
  deriveTopPlayed,
} from '@/lib/localLibrarySelectors';
import {
  Library,
  Music,
  Upload,
  Disc,
  Play,
  Trash2,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { toast } from 'sonner';
import type { LocalTrack } from '@/types/music';

type Tab = 'albums' | 'artists' | 'genres' | 'topPlayed' | 'tracks';

export default function LibraryPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>('albums');

  const {
    localLibrary,
    isImporting,
    importLocalFiles,
    playLocalTrack,
    removeLocalTrack,
  } = useMusicStore();

  const albums = useMemo(() => deriveAlbums(localLibrary), [localLibrary]);
  const artists = useMemo(() => deriveArtists(localLibrary), [localLibrary]);
  const genres = useMemo(() => deriveGenres(localLibrary), [localLibrary]);
  const topPlayed = useMemo(() => deriveTopPlayed(localLibrary), [localLibrary]);

  const handleImport = async () => {
    if (Capacitor.isNativePlatform()) {
      // Android: scan MHL Music/ directory
      try {
        // Request permission to read files
        const permResult = await Filesystem.requestPermissions();
        if (permResult.publicStorage !== 'granted') {
          toast.error('Permiso denegado. Ve a Configuración > Permisos > Almacenamiento');
          return;
        }

        const result = await Filesystem.readdir({
          path: 'MHL Music',
          directory: Directory.Documents,
        });

        const mp3Files = result.files
          .filter((f) => f.name && f.name.endsWith('.mp3'))
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        if (mp3Files.length === 0) {
          toast.info('No hay archivos MP3 en Documents/MHL Music/. Copia música ahí primero.');
          return;
        }

        toast.loading(`Escaneando ${mp3Files.length} archivo${mp3Files.length > 1 ? 's' : ''}...`);

        const fileObjects: File[] = await Promise.all(
          mp3Files.map(async (f) => {
            const data = await Filesystem.readFile({
              path: `MHL Music/${f.name}`,
              directory: Directory.Documents,
            });
            const binaryStr = atob(data.data as string);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            return new File([bytes], f.name!, { type: 'audio/mpeg' });
          })
        );

        await importLocalFiles(fileObjects);
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error('Android import error:', errorMsg);

        if (errorMsg.includes('ENOENT') || errorMsg.includes('not found')) {
          toast.error('Carpeta no encontrada. Crea Documents/MHL Music/ y copia MP3s ahí');
        } else if (errorMsg.includes('Permission')) {
          toast.error('Permiso denegado. Verifica permisos en Configuración');
        } else {
          toast.error(`Error: ${errorMsg}`);
        }
      }
    } else {
      // Web: trigger file input
      fileInputRef.current?.click();
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    await importLocalFiles(e.target.files);
    // Reset input
    e.target.value = '';
  };

  const empty = localLibrary.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="px-4 sm:px-8 py-4 sm:py-10 max-w-4xl mx-auto w-full"
    >
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Library className="w-6 h-6 text-[#C8F04B]" />
          <h1 className="text-2xl sm:text-3xl font-bold text-[#F5F5F0]">Biblioteca</h1>
        </div>
        {!empty && (
          <p className="text-sm text-[#666660]">
            {localLibrary.length} pista{localLibrary.length > 1 ? 's' : ''} •{' '}
            {albums.length} álbum{albums.length > 1 ? 'es' : ''}
          </p>
        )}
      </div>

      {/* Import Button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleImport}
        disabled={isImporting}
        className="mb-8 px-6 py-3 rounded-xl bg-[#C8F04B] text-[#080808] text-sm font-semibold hover:bg-[#d4f55a] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
      >
        {isImporting ? (
          <>
            <div className="animate-spin">
              <Music className="w-4 h-4" />
            </div>
            Importando...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Importar música
          </>
        )}
      </motion.button>

      {/* Hidden file input - supports multiple audio formats */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/mpeg,.mp3,audio/mp4,.m4a,audio/aac,.aac,audio/x-flac,.flac,audio/ogg,.ogg,audio/webm,.webm,audio/*"
        onChange={handleFileInput}
        className="hidden"
      />

      {/* Empty State */}
      {empty ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20 space-y-4"
        >
          <div className="w-20 h-20 rounded-2xl bg-[rgba(200,240,75,0.08)] flex items-center justify-center mx-auto">
            <Library className="w-10 h-10 text-[#C8F04B]/40" />
          </div>
          <div>
            <p className="text-sm text-[#F5F5F0] font-medium">Tu biblioteca está vacía</p>
            <p className="text-xs text-[#555] mt-1">Importa tus MP3 para empezar</p>
          </div>
        </motion.div>
      ) : (
        <>
          {/* Tab Bar */}
          <div className="flex gap-1 mb-6 border-b border-[rgba(255,255,255,0.06)] overflow-x-auto pb-3">
            {(['albums', 'artists', 'genres', 'topPlayed', 'tracks'] as const).map((tab) => {
              const labels = {
                albums: 'Álbumes',
                artists: 'Artistas',
                genres: 'Géneros',
                topPlayed: 'Más tocadas',
                tracks: 'Pistas',
              };
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-2 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors relative ${
                    isActive
                      ? 'text-[#C8F04B]'
                      : 'text-[#666660] hover:text-[#888880]'
                  }`}
                >
                  {labels[tab]}
                  {isActive && (
                    <motion.div
                      layoutId="tabUnderline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C8F04B]"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            {activeTab === 'albums' && (
              <motion.div
                key="albums"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <AlbumsGrid albums={albums} onPlay={playLocalTrack} onRemove={removeLocalTrack} />
              </motion.div>
            )}

            {activeTab === 'artists' && (
              <motion.div
                key="artists"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <ArtistsGrid artists={artists} onPlay={playLocalTrack} onRemove={removeLocalTrack} />
              </motion.div>
            )}

            {activeTab === 'genres' && (
              <motion.div
                key="genres"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <GenresList genres={genres} onPlay={playLocalTrack} onRemove={removeLocalTrack} />
              </motion.div>
            )}

            {activeTab === 'topPlayed' && (
              <motion.div
                key="topPlayed"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <TopPlayedList
                  tracks={topPlayed}
                  onPlay={playLocalTrack}
                  onRemove={removeLocalTrack}
                />
              </motion.div>
            )}

            {activeTab === 'tracks' && (
              <motion.div
                key="tracks"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <TracksList
                  tracks={[...localLibrary].sort((a, b) => a.title.localeCompare(b.title))}
                  onPlay={playLocalTrack}
                  onRemove={removeLocalTrack}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}

function AlbumsGrid({
  albums,
  onPlay,
  onRemove,
}: {
  albums: ReturnType<typeof deriveAlbums>;
  onPlay: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [expandedAlbum, setExpandedAlbum] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {albums.map((album, i) => (
          <motion.div
            key={album.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.03 }}
            className="group"
          >
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="w-full cursor-pointer"
              onClick={() => setExpandedAlbum(expandedAlbum === album.id ? null : album.id)}
            >
              <div className="aspect-square rounded-xl overflow-hidden bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] group-hover:border-[rgba(255,255,255,0.12)] transition-all relative">
                {album.cover ? (
                  <img src={album.cover} alt={album.name} className="w-full h-full object-cover" />
                ) : (
                  <div className={`w-full h-full bg-gradient-to-br ${album.colorGradient} flex items-center justify-center`}>
                    <Disc className="w-8 h-8 text-[#555]" />
                  </div>
                )}

                {/* Overlay con botones */}
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      album.tracks.forEach((t) => onRemove(t.id));
                      toast.success(`Álbum "${album.name}" eliminado`);
                    }}
                    className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center shadow-lg hover:bg-red-600"
                  >
                    <Trash2 className="w-5 h-5 text-white" />
                  </motion.button>
                </div>
              </div>
            </motion.div>

            <p className="text-[13px] font-medium truncate mt-2.5 text-[#F5F5F0]">{album.name}</p>
            <p className="text-[11px] text-[#666660] truncate">{album.artist}</p>
            <p className="text-[10px] text-[#444] mt-0.5">{album.trackCount} pista{album.trackCount > 1 ? 's' : ''}</p>
          </motion.div>
        ))}
      </div>

      {/* Expanded album view */}
      <AnimatePresence>
        {expandedAlbum && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-6 p-4 rounded-xl bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)]"
          >
            {(() => {
              const album = albums.find((a) => a.id === expandedAlbum);
              return album ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-[#C8F04B] mb-3">{album.name}</h3>
                  {album.tracks.map((track, i) => (
                    <motion.button
                      key={track.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => {
                        onPlay(track.id);
                        toast.success(`Reproduciendo: ${track.title}`);
                      }}
                      className="w-full p-3 rounded-lg bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(200,240,75,0.1)] transition-colors text-left flex items-center gap-3 group"
                    >
                      <Play className="w-4 h-4 text-[#C8F04B] group-hover:scale-110 transition-transform" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#F5F5F0] truncate">{track.title}</p>
                        <p className="text-xs text-[#666660] truncate">{track.artist}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              ) : null;
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Artists Grid ───
function ArtistsGrid({
  artists,
  onPlay,
  onRemove,
}: {
  artists: ReturnType<typeof deriveArtists>;
  onPlay: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {artists.map((artist, i) => (
        <motion.div
          key={artist.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.03 }}
          className="group"
        >
          <div
            className="aspect-square rounded-xl overflow-hidden bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] group-hover:border-[rgba(255,255,255,0.12)] transition-all relative cursor-pointer"
            onClick={() => onPlay(artist.tracks[0].id)}
          >
            {artist.cover ? (
              <img src={artist.cover} alt={artist.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#C8F04B]/10 to-[#8BC34A]/05 flex items-center justify-center">
                <Music className="w-8 h-8 text-[#333]" />
              </div>
            )}

            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-12 h-12 rounded-full bg-[#C8F04B] flex items-center justify-center shadow-lg">
                <Play className="w-5 h-5 text-[#080808] fill-current ml-0.5" />
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation();
                artist.tracks.forEach((t) => onRemove(t.id));
                toast.success(`Artista "${artist.name}" eliminado`);
              }}
              className="absolute top-2 right-2 p-2 rounded-lg bg-red-500/80 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 sm:opacity-0 transition-opacity"
            >
              <Trash2 className="w-4 h-4" />
            </motion.button>
          </div>

          <p className="text-[13px] font-medium truncate mt-2.5 text-[#F5F5F0]">{artist.name}</p>
          <p className="text-[10px] text-[#666660] mt-0.5">
            {artist.trackCount} pista{artist.trackCount > 1 ? 's' : ''} • {artist.albumCount} álbum{artist.albumCount > 1 ? 'es' : ''}
          </p>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Genres List ───
function GenresList({
  genres,
  onPlay,
  onRemove,
}: {
  genres: ReturnType<typeof deriveGenres>;
  onPlay: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {genres.map((genre) => (
        <motion.div
          key={genre.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          className="px-4 py-3 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-[#F5F5F0]">{genre.name}</h3>
            <span className="text-xs text-[#666660]">{genre.trackCount} pista{genre.trackCount > 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-1">
            {genre.tracks.slice(0, 3).map((track) => (
              <div key={track.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[rgba(255,255,255,0.04)] transition-colors cursor-pointer" onClick={() => onPlay(track.id)}>
                <Play className="w-3 h-3 text-[#C8F04B] ml-0.5 flex-shrink-0" />
                <span className="text-[11px] text-[#888880] flex-1 truncate">{track.title}</span>
                <button onClick={(e) => {e.stopPropagation(); onRemove(track.id);}} className="p-1 hover:bg-red-500/20 rounded transition-colors">
                  <Trash2 className="w-3 h-3 text-red-500" />
                </button>
              </div>
            ))}
            {genre.trackCount > 3 && (
              <p className="text-[10px] text-[#555] px-2 py-1">+{genre.trackCount - 3} más</p>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Top Played List ───
function TopPlayedList({
  tracks,
  onPlay,
  onRemove,
}: {
  tracks: LocalTrack[];
  onPlay: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {tracks.map((track, i) => (
        <motion.div
          key={track.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.02 }}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors cursor-pointer group"
          onClick={() => onPlay(track.id)}
        >
          {/* Rank */}
          <span className="text-[10px] text-[#555] tabular-nums font-semibold w-5 text-center">
            {i + 1}
          </span>

          {/* Cover */}
          <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)]">
            {track.cover ? (
              <img src={track.cover} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music className="w-5 h-5 text-[#333]" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium truncate text-[#F5F5F0]">{track.title}</p>
            <p className="text-[11px] text-[#666660] truncate">{track.artist}</p>
          </div>

          {/* Play count badge */}
          <span className="text-[10px] tabular-nums px-2.5 py-1 rounded-full bg-[rgba(200,240,75,0.12)] text-[#C8F04B] font-semibold flex-shrink-0">
            {track.playCount}×
          </span>

          {/* Delete button */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(track.id);
            }}
            className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </motion.button>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Tracks List ───
function TracksList({
  tracks,
  onPlay,
  onRemove,
}: {
  tracks: LocalTrack[];
  onPlay: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {tracks.map((track, i) => (
        <motion.div
          key={track.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.02 }}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors cursor-pointer group"
          onClick={() => onPlay(track.id)}
        >
          {/* Play icon */}
          <Play className="w-4 h-4 text-[#C8F04B] group-hover:scale-110 transition-transform flex-shrink-0" />

          {/* Cover */}
          <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)]">
            {track.cover ? (
              <img src={track.cover} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music className="w-5 h-5 text-[#333]" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium truncate text-[#F5F5F0]">{track.title}</p>
            <p className="text-[11px] text-[#666660] truncate">{track.artist}</p>
          </div>

          {/* Delete button */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(track.id);
            }}
            className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </motion.button>
        </motion.div>
      ))}
    </div>
  );
}
