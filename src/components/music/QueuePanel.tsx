import { useMusicStore } from '@/store/musicStore';
import { X, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface QueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QueuePanel({ isOpen, onClose }: QueuePanelProps) {
  const { player, playTrack } = useMusicStore();
  const { queue, queueIndex } = player;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-[var(--player-height)] left-0 right-0 max-h-[60vh] bg-background border-t border-border rounded-t-lg z-40 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold">Cola de reproducción</h2>
                <p className="text-xs text-muted-foreground">{queue.length} canciones</p>
              </div>
              <button
                onClick={onClose}
                className="h-8 w-8 rounded hover:bg-muted inline-flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Queue List */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-2 space-y-1">
                {queue.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">Cola vacía</p>
                  </div>
                ) : (
                  queue.map((track, index) => (
                    <motion.div
                      key={`${track.id}-${index}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer group transition-colors ${
                        index === queueIndex
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-secondary/50'
                      }`}
                      onClick={() => playTrack(track)}
                    >
                      {/* Number or Play Icon */}
                      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-xs font-medium">
                        {index === queueIndex ? (
                          <Play className="w-4 h-4 fill-current" />
                        ) : (
                          <span className="text-muted-foreground group-hover:text-foreground">
                            {index + 1}
                          </span>
                        )}
                      </div>

                      {/* Track Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{track.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {track.artist}
                        </p>
                      </div>

                      {/* Duration */}
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {Math.floor(track.duration / 60)}:
                        {(track.duration % 60).toString().padStart(2, '0')}
                      </span>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
