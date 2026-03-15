import { Play, Download, Plus, ListPlus } from 'lucide-react';
import { Track } from '@/types/music';
import { useMusicStore } from '@/store/musicStore';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';

interface TrackCardProps {
  track: Track;
  index?: number;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TrackCard({ track, index = 0 }: TrackCardProps) {
  const { playTrack, addToLibrary, startDownload, playlists, addToPlaylist, searchResults, playQueue } = useMusicStore();
  const navigate = useNavigate();
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPlaylistPicker(false);
      }
    };
    if (showPlaylistPicker) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPlaylistPicker]);

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Play with queue context from search results
    const trackIndex = searchResults.findIndex(t => t.id === track.id);
    if (trackIndex >= 0 && searchResults.length > 1) {
      playQueue(searchResults, trackIndex);
    } else {
      playTrack(track);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="track-card group p-3 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
      onClick={() => playTrack(track)}
    >
      {/* Cover */}
      <div className="aspect-square rounded-md bg-secondary overflow-hidden relative mb-3">
        {track.cover ? (
          <img src={track.cover} alt={track.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 via-accent/10 to-secondary" />
        )}
        <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
          <button
            onClick={handlePlay}
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:scale-110 transition-transform brand-transition"
          >
            <Play className="w-4 h-4 text-primary-foreground ml-0.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); startDownload(track, 'MP3'); }}
            className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center hover:bg-foreground/20 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-foreground" />
          </button>
          <div className="relative" ref={pickerRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (playlists.length === 0) {
                  addToLibrary(track);
                } else {
                  setShowPlaylistPicker(!showPlaylistPicker);
                }
              }}
              className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center hover:bg-foreground/20 transition-colors"
              title={playlists.length > 0 ? 'Añadir a playlist' : 'Añadir a biblioteca'}
            >
              {playlists.length > 0 ? (
                <ListPlus className="w-3.5 h-3.5 text-foreground" />
              ) : (
                <Plus className="w-3.5 h-3.5 text-foreground" />
              )}
            </button>
            <AnimatePresence>
              {showPlaylistPicker && (
                <motion.div
                  initial={{ opacity: 0, y: -5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.95 }}
                  className="absolute bottom-full mb-2 right-0 glass-panel rounded-lg py-1 min-w-[160px] z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => { addToLibrary(track); setShowPlaylistPicker(false); }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-3 h-3 text-primary" /> Biblioteca
                  </button>
                  <div className="h-px bg-border my-1" />
                  {playlists.map((pl) => (
                    <button
                      key={pl.id}
                      onClick={() => { addToPlaylist(pl.id, track); setShowPlaylistPicker(false); }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors truncate"
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

      {/* Info */}
      <h3 className="text-sm font-medium truncate">{track.title}</h3>
      <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
      <div className="flex items-center gap-2 mt-1.5">
        <span className="timer-font text-xs text-muted-foreground">{formatDuration(track.duration)}</span>
      </div>
    </motion.div>
  );
}
