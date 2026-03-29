import { useMusicStore } from '@/store/musicStore';
import { CheckCircle, Loader2, XCircle, Music, Trash2, Clock, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { openDownloadedFile } from '@/lib/openFileBridge';

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getProgressLabel(progress: number): string {
  if (progress >= 100) return '✓ Completado';
  if (progress >= 90) return 'Guardando archivo...';
  if (progress >= 70) return 'Escribiendo metadatos...';
  if (progress >= 30) return 'Obteniendo audio...';
  return 'Buscando en YouTube...';
}

export default function DownloadsPage() {
  const { downloads, startDownload, removeDownload } = useMusicStore();
  const isNative = Capacitor.isNativePlatform();

  const completed = downloads.filter((d) => d.status === 'completed');
  const active = downloads.filter((d) => d.status === 'downloading');
  const queued = downloads.filter((d) => d.status === 'queued');
  const failed = downloads.filter((d) => d.status === 'error');

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="px-4 sm:px-8 py-4 sm:py-10 max-w-3xl mx-auto"
    >
      <h1 className="text-lg sm:text-2xl font-semibold tracking-tighter mb-1 sm:mb-2">Descargas</h1>
      <p className="text-xs sm:text-sm text-[#666660] mb-6 sm:mb-8">
        <span className="tabular-nums">{downloads.length}</span> total · <span className="tabular-nums">{active.length}</span> activas · <span className="tabular-nums">{queued.length}</span> en cola
      </p>

      {isNative && (
        <div className="mb-6 p-3 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)]">
          <p className="text-sm text-[#F5F5F0]">
            MHL se centra en buscar y descargar. Usa "Abrir" para mandar cada archivo a tu reproductor externo favorito.
          </p>
        </div>
      )}

      {/* Active */}
      {active.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">En progreso</h2>
          <div className="space-y-2">
            {active.map((dl, i) => (
              <motion.div
                key={dl.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]"
              >
                <Loader2 className="w-4 h-4 text-[#C8F04B] animate-spin shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-[#F5F5F0]">{dl.track.title}</p>
                  <p className="text-xs text-[#666660]">{dl.track.artist}</p>
                  <p className="text-[10px] text-[#555] mt-1">
                    {dl.error || getProgressLabel(dl.progress)}
                  </p>
                  <div className="mt-2 h-1 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-[#C8F04B] rounded-full"
                      animate={{ width: `${dl.progress}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>
                <span className="text-xs tabular-nums text-[#666660]">{dl.progress}%</span>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Queued */}
      {queued.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">En cola</h2>
          <div className="space-y-1">
            {queued.map((dl, i) => (
              <motion.div
                key={dl.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)]"
              >
                <Clock className="w-4 h-4 text-zinc-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-[#F5F5F0]">{dl.track.title}</p>
                  <p className="text-xs text-[#666660]">{dl.track.artist}</p>
                </div>
                <span className="text-xs text-zinc-500">En cola...</span>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Failed */}
      {failed.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">Fallidas</h2>
          <div className="space-y-1">
            {failed.map((dl) => (
              <div
                key={dl.id}
                className="flex items-center gap-2.5 sm:gap-3 px-2 sm:px-3 py-2 sm:py-2.5 rounded-lg hover:bg-[rgba(255,255,255,0.03)] active:bg-[rgba(255,255,255,0.04)] transition-colors"
              >
                <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] sm:text-sm font-medium truncate text-[#F5F5F0]">{dl.track.title}</p>
                  <p className="text-[11px] sm:text-xs text-red-400/70">{dl.error || 'Error desconocido'}</p>
                </div>
                <button
                  onClick={() => startDownload(dl.track)}
                  className="text-xs text-[#C8F04B] hover:underline px-2 py-1 min-h-[44px] flex items-center"
                >
                  Reintentar
                </button>
                <button
                  onClick={() => removeDownload(dl.id)}
                  className="p-2 -mr-1 text-[#666660] hover:text-red-400 active:text-red-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">Completadas</h2>
          <div className="space-y-1">
            {completed.map((dl) => (
              <div
                key={dl.id}
                className="flex items-center gap-2.5 sm:gap-3 px-2 sm:px-3 py-2 sm:py-2.5 rounded-lg hover:bg-[rgba(255,255,255,0.03)] active:bg-[rgba(255,255,255,0.04)] transition-colors group"
              >
                <CheckCircle className="w-4 h-4 text-[#C8F04B] shrink-0" />
                <div className="w-9 h-9 sm:w-8 sm:h-8 rounded overflow-hidden shrink-0">
                  {dl.track.cover ? (
                    <img src={dl.track.cover} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[rgba(200,240,75,0.1)] flex items-center justify-center">
                      <Music className="w-3 h-3 text-[#666660]" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] sm:text-sm font-medium truncate text-[#F5F5F0]">{dl.track.title}</p>
                  <p className="text-[11px] sm:text-xs text-[#666660]">{dl.track.artist} · {dl.track.album}</p>
                </div>
                <span className="text-xs tabular-nums text-[#444] hidden sm:block">{formatDuration(dl.track.duration)}</span>
                {isNative && dl.fileName && (
                  <button
                    onClick={() => void openDownloadedFile(dl.fileName)}
                    className="px-2.5 py-2 text-[#C8F04B] hover:text-[#e6ff8a] transition-colors min-h-[44px] flex items-center gap-1.5"
                    title="Abrir en reproductor"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span className="hidden sm:inline text-xs">Abrir</span>
                  </button>
                )}
                <button
                  onClick={() => removeDownload(dl.id)}
                  className="p-2 -mr-1 text-[#666660] hover:text-red-400 active:text-red-400 transition-colors sm:opacity-0 sm:group-hover:opacity-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {downloads.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: [1, 1.08, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
          className="text-center py-12 sm:py-16 space-y-3"
        >
          <Music className="w-20 h-20 text-[#C8F04B]/60 mx-auto" />
          <p className="text-sm text-[#B0B0B0]">No hay descargas aún</p>
        </motion.div>
      )}
    </motion.div>
  );
}
