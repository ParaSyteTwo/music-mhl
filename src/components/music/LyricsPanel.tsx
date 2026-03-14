import { useMusicStore } from '@/store/musicStore';
import { X, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { SyncedLine } from '@/types/music';

function parseSyncedLyrics(synced: string): SyncedLine[] {
  const lines: SyncedLine[] = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;
  let match;
  while ((match = regex.exec(synced)) !== null) {
    const minutes = parseInt(match[1]);
    const seconds = parseInt(match[2]);
    const ms = parseInt(match[3]);
    const time = minutes * 60 + seconds + ms / (match[3].length === 3 ? 1000 : 100);
    lines.push({ time, text: match[4].trim() });
  }
  return lines;
}

export function LyricsPanel() {
  const { player, toggleLyrics } = useMusicStore();
  const track = player.currentTrack;
  const currentTime = player.progress;

  const syncedLines = useMemo(() => {
    if (track?.syncedLyrics) {
      return parseSyncedLyrics(track.syncedLyrics);
    }
    return null;
  }, [track?.syncedLyrics]);

  // Find active line index
  const activeLineIndex = useMemo(() => {
    if (!syncedLines) return -1;
    let idx = -1;
    for (let i = 0; i < syncedLines.length; i++) {
      if (syncedLines[i].time <= currentTime) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [syncedLines, currentTime]);

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
          <>
            {/* Synced lyrics */}
            {syncedLines ? (
              <div className="space-y-3">
                <p className="text-[10px] font-mono text-primary uppercase tracking-widest mb-4">● Sincronizado</p>
                {syncedLines.map((line, i) => (
                  <p
                    key={i}
                    className={`text-sm leading-relaxed transition-all duration-300 ${
                      i === activeLineIndex
                        ? 'text-primary font-medium scale-[1.02] origin-left'
                        : i < activeLineIndex
                        ? 'text-foreground/40'
                        : 'text-foreground/70'
                    }`}
                  >
                    {line.text || '\u00A0'}
                  </p>
                ))}
              </div>
            ) : track.lyrics ? (
              /* Plain lyrics */
              <div className="space-y-2">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-4">Letra</p>
                {track.lyrics.split('\n').map((line, i) => (
                  <p key={i} className="text-sm text-foreground/80 leading-relaxed">
                    {line || '\u00A0'}
                  </p>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-10 gap-3">
                <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                <p className="text-sm text-muted-foreground">Buscando letras...</p>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Selecciona una canción para ver la letra</p>
        )}
      </div>
    </motion.div>
  );
}
