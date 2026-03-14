import { useMusicStore } from '@/store/musicStore';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';

export function LyricsPanel() {
  const { player, toggleLyrics } = useMusicStore();
  const track = player.currentTrack;

  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="fixed right-0 top-0 bottom-[var(--player-height)] w-[400px] glass-panel border-l border-border overflow-y-auto z-20"
    >
      <div className="px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">Lyrics</h2>
          <button onClick={toggleLyrics} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {track ? (
          <div className="grid grid-cols-2 gap-6">
            {/* Original */}
            <div>
              <p className="text-[10px] font-mono text-muted-foreground mb-3 uppercase tracking-widest">Original</p>
              <div className="space-y-2">
                {(track.lyrics || '').split('\n').map((line, i) => (
                  <p key={i} className="text-sm text-foreground/80 leading-relaxed">
                    {line || '\u00A0'}
                  </p>
                ))}
              </div>
            </div>
            {/* Translated */}
            <div>
              <p className="text-[10px] font-mono text-muted-foreground mb-3 uppercase tracking-widest">Traducción</p>
              <div className="space-y-2">
                {(track.translatedLyrics || '').split('\n').map((line, i) => (
                  <p key={i} className="text-sm text-foreground/60 leading-relaxed">
                    {line || '\u00A0'}
                  </p>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Selecciona una canción para ver la letra</p>
        )}
      </div>
    </motion.div>
  );
}
