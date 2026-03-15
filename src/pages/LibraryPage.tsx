import { useMusicStore } from '@/store/musicStore';
import { TrackRow } from '@/components/music/TrackRow';
import { Music, User, Disc, Play, Upload, AudioWaveform, Fingerprint } from 'lucide-react';
import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { EmptyState, VinylIcon } from '@/components/ui/empty-state';
import { processLocalFiles } from '@/lib/localMusic';
import { identifyTrackWithShazam, searchDeezer } from '@/lib/api/musicApi';
import type { Track } from '@/types/music';

type LibraryTab = 'songs' | 'artists' | 'albums' | 'local';

export default function LibraryPage() {
  const { library, removeFromLibrary, playQueue, addToLibrary, playTrack } = useMusicStore();
  const [tab, setTab] = useState<LibraryTab>('songs');
  const [artistFilter, setArtistFilter] = useState<string | null>(null);
  const [albumFilter, setAlbumFilter] = useState<string | null>(null);
  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [dragActive, setDragActive] = useState(false);
  const [identifyingId, setIdentifyingId] = useState<string | null>(null);

  const artists = [...new Set(library.map(t => t.artist))];
  const albums = [...new Set(library.map(t => t.album))];

  const filteredTracks = artistFilter
    ? library.filter(t => t.artist === artistFilter)
    : albumFilter
    ? library.filter(t => t.album === albumFilter)
    : library;

  const tabs: { key: LibraryTab; label: string; icon: typeof Music; count: number }[] = [
    { key: 'songs', label: 'Songs', icon: Music, count: library.length },
    { key: 'artists', label: 'Artists', icon: User, count: artists.length },
    { key: 'albums', label: 'Albums', icon: Disc, count: albums.length },
    { key: 'local', label: 'Local', icon: Upload, count: localTracks.length },
  ];

  const clearFilters = () => { setArtistFilter(null); setAlbumFilter(null); };

  const handleLocalFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    setImporting(true);
    setImportProgress({ current: 0, total: fileArray.length });
    try {
      const results = await processLocalFiles(fileArray, (current, total) => {
        setImportProgress({ current, total });
      });
      const newTracks = results.map((r) => r.track);
      setLocalTracks((prev) => {
        const ids = new Set(prev.map((t) => t.title + t.artist));
        return [...prev, ...newTracks.filter((t) => !ids.has(t.title + t.artist))];
      });
    } catch (e) {
      console.error('Local file import error:', e);
    } finally {
      setImporting(false);
    }
  }, []);

  const handleIdentifyLocal = useCallback(async (track: Track) => {
    setIdentifyingId(track.id);
    try {
      // Create a blob from the preview URL for Shazam
      const res = await fetch(track.preview!);
      const blob = await res.blob();
      const file = new File([blob], `${track.title}.mp3`, { type: blob.type || 'audio/mpeg' });
      
      const result = await identifyTrackWithShazam(file);
      if (!result) {
        console.warn('Could not identify track');
        return;
      }

      // Enrich with Deezer data
      let enriched: Partial<Track> = {
        title: result.title,
        artist: result.artist,
        album: result.album || track.album,
      };
      try {
        const deezerResults = await searchDeezer(`${result.title} ${result.artist}`);
        if (deezerResults.length > 0) {
          const dz = deezerResults[0];
          enriched.cover = dz.coverXL || dz.cover || result.cover;
          enriched.duration = dz.duration || track.duration;
          enriched.deezerId = dz.deezerId;
          enriched.album = dz.album || enriched.album;
        }
      } catch {}

      // Update the local track in place
      setLocalTracks((prev) =>
        prev.map((t) => (t.id === track.id ? { ...t, ...enriched } : t)),
      );
    } catch (e) {
      console.error('Identify local track error:', e);
    } finally {
      setIdentifyingId(null);
    }
  }, []);

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0 mb-8 sm:mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight font-[family-name:Syne] text-[#F5F5F0]">Library</h1>
        {library.length > 0 && tab === 'songs' && (
          <button
            onClick={() => playQueue(filteredTracks, 0)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#C8F04B]/10 text-[#C8F04B] hover:bg-[#C8F04B]/20 transition-colors"
          >
            <Play className="w-4 h-4" />
            Reproducir todo
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 sm:mb-8 overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 pb-2 sm:pb-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); clearFilters(); }}
            className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
              tab === t.key 
                ? 'bg-[#C8F04B]/10 text-[#C8F04B]' 
                : 'text-[#666660] hover:text-[#F5F5F0] hover:bg-[rgba(255,255,255,0.04)]'
            }`}
          >
            <t.icon className="w-3 h-3 sm:w-4 sm:h-4" />
            {t.label}
            <span className="timer-font text-[10px] sm:text-xs ml-0.5 sm:ml-1 opacity-60">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Active filter */}
      {(artistFilter || albumFilter) && (
        <div className="flex items-center gap-2 mb-4 sm:mb-6 overflow-x-auto">
          <span className="text-xs text-[#333330]">Filtrando:</span>
          <span className="text-xs font-semibold bg-[#C8F04B]/10 text-[#C8F04B] px-2 py-1 rounded">
            {artistFilter || albumFilter}
          </span>
          <button onClick={clearFilters} className="text-xs text-[#666660] hover:text-[#F5F5F0]">
            × Limpiar
          </button>
        </div>
      )}

      {/* Content */}
      {tab === 'songs' && (
        <div className="space-y-0.5 sm:space-y-1">
          {filteredTracks.length > 0 ? (
            filteredTracks.map((track, i) => (
              <div key={track.id} className="group relative">
                <TrackRow track={track} index={i} contextTracks={filteredTracks} />
              </div>
            ))
          ) : (
            <EmptyState
              icon={<VinylIcon />}
              title="Your Library is Empty"
              description={library.length === 0 ? 'Start exploring and add tracks to your collection.' : 'No tracks found for your filters.'}
              action={{
                label: 'Explore Music',
                onClick: () => window.location.href = '/search',
              }}
            />
          )}
        </div>
      )}

      {tab === 'artists' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4">
          {artists.length > 0 ? artists.map((artist, i) => {
            const artistTracks = library.filter(t => t.artist === artist);
            const cover = artistTracks[0]?.cover;
            return (
              <motion.div
                key={artist}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-panel rounded-lg p-5 text-center cursor-pointer hover:bg-white/5 transition-colors group"
                onClick={() => { setTab('songs'); setArtistFilter(artist); setAlbumFilter(null); }}
              >
                <div className="w-16 h-16 rounded-full mx-auto mb-3 overflow-hidden bg-gradient-to-br from-primary/30 to-accent/20">
                  {cover && <img src={cover} alt={artist} className="w-full h-full object-cover" />}
                </div>
                <p className="text-sm font-medium truncate">{artist}</p>
                <p className="text-xs text-muted-foreground timer-font">{artistTracks.length} tracks</p>
                <button
                  onClick={(e) => { e.stopPropagation(); playQueue(artistTracks, 0); }}
                  className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-primary"
                >
                  ▶ Reproducir
                </button>
              </motion.div>
            );
          }) : (
            <div className="col-span-full text-center py-20">
              <User className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Sin artistas</p>
            </div>
          )}
        </div>
      )}

      {tab === 'albums' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4">
          {albums.length > 0 ? albums.map((album, i) => {
            const albumTracks = library.filter(t => t.album === album);
            const cover = albumTracks[0]?.cover;
            return (
              <motion.div
                key={album}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-panel rounded-lg p-4 cursor-pointer hover:bg-white/5 transition-colors group"
                onClick={() => { setTab('songs'); setAlbumFilter(album); setArtistFilter(null); }}
              >
                <div className="aspect-square rounded-md mb-3 overflow-hidden bg-gradient-to-br from-primary/20 via-accent/10 to-secondary">
                  {cover && <img src={cover} alt={album} className="w-full h-full object-cover" />}
                </div>
                <p className="text-sm font-medium truncate">{album}</p>
                <p className="text-xs text-muted-foreground truncate">{albumTracks[0]?.artist}</p>
                <p className="text-xs text-muted-foreground timer-font mt-1">{albumTracks.length} tracks</p>
                <button
                  onClick={(e) => { e.stopPropagation(); playQueue(albumTracks, 0); }}
                  className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-primary"
                >
                  ▶ Reproducir
                </button>
              </motion.div>
            );
          }) : (
            <div className="col-span-full text-center py-20">
              <Disc className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Sin álbumes</p>
            </div>
          )}
        </div>
      )}
      {tab === 'local' && (
        <div className="space-y-6">
          {/* Drop zone */}
          <div
            className={`relative border-2 border-dashed rounded-[20px] p-8 transition-all duration-200 cursor-pointer ${
              dragActive
                ? 'border-[#C8F04B] bg-[rgba(200,240,75,0.08)]'
                : 'border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.2)]'
            }`}
            onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files.length > 0) handleLocalFiles(e.dataTransfer.files);
            }}
            onClick={() => document.getElementById('local-file-input')?.click()}
          >
            <input
              id="local-file-input"
              type="file"
              accept="audio/*"
              multiple
              onChange={(e) => { if (e.target.files) handleLocalFiles(e.target.files); e.target.value = ''; }}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-3 text-center">
              <AudioWaveform size={40} className={dragActive ? 'text-[#C8F04B]' : 'text-[#333330]'} />
              <div>
                <p className="text-sm font-medium text-[#F5F5F0]">Arrastra archivos de audio aquí</p>
                <p className="text-xs text-[#666660] mt-1">MP3, FLAC, M4A, WAV — o haz clic para seleccionar</p>
              </div>
            </div>
          </div>

          {/* Import progress */}
          {importing && (
            <div className="flex items-center gap-3 p-4 bg-[rgba(200,240,75,0.05)] border border-[#C8F04B]/20 rounded-lg">
              <div className="w-5 h-5 border-2 border-[#C8F04B] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-[#C8F04B]">
                Procesando {importProgress.current}/{importProgress.total} archivos...
              </span>
            </div>
          )}

          {/* Local tracks list */}
          {localTracks.length > 0 && (
            <div className="space-y-1">
              {localTracks.map((track, i) => (
                <div key={track.id} className="flex items-center gap-3">
                  <div className="flex-1">
                    <TrackRow track={track} index={i} contextTracks={localTracks} />
                  </div>
                  <button
                    onClick={() => handleIdentifyLocal(track)}
                    disabled={identifyingId === track.id}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[rgba(200,240,75,0.1)] text-[#C8F04B] hover:bg-[rgba(200,240,75,0.2)] disabled:opacity-50 transition-colors"
                    title="Identify with Shazam"
                  >
                    {identifyingId === track.id ? (
                      <div className="w-3 h-3 border-2 border-[#C8F04B] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Fingerprint size={14} />
                    )}
                    <span className="hidden sm:inline">{identifyingId === track.id ? 'Identificando...' : 'Identificar'}</span>
                  </button>
                  <button
                    onClick={() => { addToLibrary(track); }}
                    className="flex-shrink-0 px-3 py-1.5 text-xs rounded-lg border border-[rgba(255,255,255,0.1)] text-[#666660] hover:text-[#F5F5F0] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                  >
                    + Biblioteca
                  </button>
                </div>
              ))}
            </div>
          )}

          {localTracks.length === 0 && !importing && (
            <div className="text-center py-12">
              <Upload size={32} className="mx-auto text-[#333330] mb-3" />
              <p className="text-sm text-[#666660]">No hay archivos locales importados</p>
              <p className="text-xs text-[#333330] mt-1">Arrastra archivos o usa el botón para añadirlos</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
