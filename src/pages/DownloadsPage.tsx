import { useMusicStore } from '@/store/musicStore';
import { Download as DownloadIcon, CheckCircle, Loader2, XCircle, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function DownloadsPage() {
  const { downloads } = useMusicStore();

  const completed = downloads.filter(d => d.status === 'completed');
  const active = downloads.filter(d => d.status === 'downloading');
  const failed = downloads.filter(d => d.status === 'error');

  return (
    <div className="px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tighter mb-2">Downloads</h1>
      <p className="text-sm text-muted-foreground mb-8">
        <span className="timer-font">{downloads.length}</span> total · <span className="timer-font">{active.length}</span> activas
      </p>

      {/* Active */}
      {active.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">En progreso</h2>
          <div className="space-y-2">
            {active.map((dl, i) => (
              <motion.div
                key={dl.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-4 p-4 glass-panel rounded-lg"
              >
                <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{dl.track.title}</p>
                  <p className="text-xs text-muted-foreground">{dl.track.artist}</p>
                  <div className="mt-2 h-1 bg-muted/30 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary rounded-full"
                      animate={{ width: `${dl.progress}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="timer-font text-xs text-muted-foreground">{dl.progress}%</p>
                  <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{dl.format}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">Completadas</h2>
          <div className="space-y-1">
            {completed.map((dl, i) => (
              <motion.div
                key={dl.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-white/5 transition-colors group"
              >
                <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                <div className="w-8 h-8 rounded bg-secondary shrink-0">
                  <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/10 rounded" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{dl.track.title}</p>
                  <p className="text-xs text-muted-foreground">{dl.track.artist}</p>
                </div>
                <span className="timer-font text-xs text-muted-foreground">{formatDuration(dl.track.duration)}</span>
                <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50">{dl.format}</span>
                {dl.track.bitrate && (
                  <span className="timer-font text-xs text-muted-foreground hidden md:inline">{dl.track.bitrate}</span>
                )}
                {dl.track.fileSize && (
                  <span className="timer-font text-xs text-muted-foreground hidden lg:inline">{dl.track.fileSize}</span>
                )}
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {downloads.length === 0 && (
        <div className="text-center py-20">
          <DownloadIcon className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No hay descargas</p>
        </div>
      )}
    </div>
  );
}
