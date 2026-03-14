import { useParams, useNavigate } from 'react-router-dom';
import { useMusicStore } from '@/store/musicStore';
import { Play, Download, Plus, ArrowLeft, Check, ListPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TrackDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { searchResults, library, playTrack, playTrackWithYouTube, addToLibrary, startDownload, playlists, addToPlaylist } = useMusicStore();
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPlaylistPicker(false);
    };
    if (showPlaylistPicker) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPlaylistPicker]);

  const allTracks = [...searchResults, ...library];
  const track = allTracks.find(t => t.id === id);

  if (!track) {
    return (
      <div className="px-8 py-10 text-center">
        <p className="text-muted-foreground">Track no encontrado</p>
        <button onClick={() => navigate(-1)} className="text-primary text-sm mt-2">Volver</button>
      </div>
    );
  }

  const isInLibrary = library.some(t => t.id === track.id);

  return (
    <div className="px-8 py-10">
      {/* Back button */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Volver
      </button>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="flex gap-8 mb-12"
      >
        {/* Cover */}
        <div className="w-56 h-56 rounded-lg bg-secondary shrink-0 overflow-hidden ring-1 ring-inset ring-white/5">
          {track.cover ? (
            <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/30 via-accent/15 to-secondary" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 flex flex-col justify-end">
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest mb-2">Track</p>
          <h1 className="text-4xl font-semibold tracking-tighter mb-1">{track.title}</h1>
          <p className="text-lg text-muted-foreground mb-4">{track.artist}</p>
          <p className="text-sm text-muted-foreground mb-6">{track.album}</p>

          {/* Metadata */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground timer-font mb-6">
            <span>{formatDuration(track.duration)}</span>
            <span>·</span>
            <span>MP3 128kbps</span>
            {track.preview && <><span>·</span><span className="text-primary">Preview disponible</span></>}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => playTrackWithYouTube(track)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Play className="w-4 h-4" />
              Reproducir completo
            </button>

            {track.preview && (
              <button
                onClick={() => playTrack(track)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg ring-1 ring-inset ring-white/10 text-sm font-medium hover:bg-white/5 transition-colors"
              >
                <Play className="w-4 h-4" />
                Preview 30s
              </button>
            )}

            <button
              onClick={() => startDownload(track, 'MP3')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg ring-1 ring-inset ring-white/10 text-sm font-medium hover:bg-white/5 transition-colors"
            >
              <Download className="w-4 h-4" />
              Descargar MP3
            </button>

            {/* Add to library / playlist */}
            <div className="relative" ref={pickerRef}>
              <button
                onClick={() => {
                  if (playlists.length === 0) {
                    addToLibrary(track);
                  } else {
                    setShowPlaylistPicker(!showPlaylistPicker);
                  }
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg ring-1 ring-inset ring-white/10 text-sm font-medium hover:bg-white/5 transition-colors"
              >
                {isInLibrary ? (
                  <><Check className="w-4 h-4 text-primary" /> En biblioteca</>
                ) : playlists.length > 0 ? (
                  <><ListPlus className="w-4 h-4" /> Añadir a...</>
                ) : (
                  <><Plus className="w-4 h-4" /> Añadir a biblioteca</>
                )}
              </button>
              <AnimatePresence>
                {showPlaylistPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="absolute left-0 top-full mt-1 glass-panel rounded-lg py-1 min-w-[180px] z-10"
                  >
                    <button
                      onClick={() => { addToLibrary(track); setShowPlaylistPicker(false); }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-white/5 transition-colors flex items-center gap-2"
                    >
                      <Plus className="w-3 h-3 text-primary" />
                      Biblioteca
                      {isInLibrary && <Check className="w-3 h-3 text-primary ml-auto" />}
                    </button>
                    <div className="h-px bg-border my-1" />
                    {playlists.map((pl) => (
                      <button
                        key={pl.id}
                        onClick={() => { addToPlaylist(pl.id, track); setShowPlaylistPicker(false); }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-white/5 transition-colors truncate"
                      >
                        {pl.name}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Lyrics */}
      {track.lyrics && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-6">Letras</h2>
          <div className="glass-panel rounded-lg p-8 max-w-2xl">
            <div className="space-y-2">
              {track.lyrics.split('\n').map((line, i) => (
                <p key={i} className="text-sm text-foreground/80 leading-relaxed">{line || '\u00A0'}</p>
              ))}
            </div>
          </div>
        </motion.section>
      )}
    </div>
  );
}
