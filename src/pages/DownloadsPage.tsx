import { useState } from 'react';
import { useMusicStore } from '@/store/musicStore';
import { CheckCircle, Loader2, XCircle, Music, Trash2, Clock, ExternalLink, Zap, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { openDownloadedFile } from '@/lib/openFileBridge';
import type { Download } from '@/types/music';
import { useI18n } from '@/lib/useI18n';

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatEta(seconds: number): string {
  if (seconds <= 0) return '';
  if (seconds < 60) return `~${seconds}s`;
  return `~${Math.ceil(seconds / 60)}m`;
}

interface DownloadPhase {
  label: string;
  icon: string;
}

function getPhase(dl: Download, t: (key: string) => string): DownloadPhase {
  if (dl.progress >= 95) return { label: t('phaseSaving'), icon: '💾' };
  if (dl.progress >= 80) return { label: t('phaseMetadata'), icon: '🏷️' };
  if (dl.progress >= 25) return { label: t('phaseDownloading'), icon: '⬇️' };
  if (dl.progress >= 15) return { label: t('phaseIdentifying'), icon: '🔎' };
  return { label: t('phaseSearchingYoutube'), icon: '🔍' };
}

function ActiveDownloadCard({ dl, t }: { dl: Download; t: (key: string) => string }) {
  const phase = getPhase(dl, t);
  const showSpeedInfo = dl.progress >= 25 && dl.progress < 80 && (dl.speed || dl.eta);

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-xl bg-[rgba(200,240,75,0.04)] border border-[rgba(200,240,75,0.15)] shadow-sm"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="relative flex-shrink-0">
          {dl.track.cover ? (
            <img src={dl.track.cover} alt="" className="w-11 h-11 rounded-lg object-cover" />
          ) : (
            <div className="w-11 h-11 rounded-lg bg-[rgba(200,240,75,0.1)] flex items-center justify-center">
              <Music className="w-5 h-5 text-[#C8F04B]" />
            </div>
          )}
          <span className="absolute -inset-0.5 rounded-lg border border-[#C8F04B]/30 animate-pulse" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#F5F5F0] truncate">{dl.track.title}</p>
          <p className="text-xs text-[#666660] truncate">{dl.track.artist}</p>
          <p className="text-[11px] text-[#888] mt-0.5">
            {dl.error ? (
              <span className="text-amber-400">{dl.error}</span>
            ) : (
              <span>{phase.icon} {phase.label}</span>
            )}
          </p>
        </div>

        <div className="flex-shrink-0 text-right min-w-[64px]">
          {showSpeedInfo && dl.speed ? (
            <>
              <p className="text-xs font-mono text-[#C8F04B] flex items-center justify-end gap-1">
                <Zap className="w-3 h-3" />
                {dl.speed}
              </p>
              {dl.eta ? (
                <p className="text-[10px] text-[#555] mt-0.5">{formatEta(dl.eta)}</p>
              ) : null}
            </>
          ) : (
            <Loader2 className="w-4 h-4 text-[#C8F04B] animate-spin ml-auto" />
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="relative h-2 bg-[rgba(255,255,255,0.07)] rounded-full overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              background: dl.progress >= 80
                ? 'linear-gradient(90deg, #C8F04B, #a8d930)'
                : 'linear-gradient(90deg, #C8F04B, #e8ff7b)',
            }}
            animate={{ width: `${dl.progress}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
          {dl.progress > 0 && dl.progress < 100 && (
            <motion.div
              className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/20 to-transparent"
              animate={{ x: ['-100%', '800%'] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.3 }}
            />
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {[
              { threshold: 15, label: t('phaseSearch') },
              { threshold: 25, label: 'ID' },
              { threshold: 80, label: 'Audio' },
              { threshold: 95, label: 'Tags' },
              { threshold: 100, label: t('phaseSaved') },
            ].map((step) => (
              <span
                key={step.threshold}
                className="w-1.5 h-1.5 rounded-full transition-colors duration-300"
                style={{
                  backgroundColor: dl.progress >= step.threshold
                    ? '#C8F04B'
                    : 'rgba(255,255,255,0.12)',
                }}
                title={step.label}
              />
            ))}
          </div>
          <span className="text-xs font-mono tabular-nums text-[#C8F04B]">{dl.progress}%</span>
        </div>
      </div>
    </motion.div>
  );
}

export default function DownloadsPage() {
  const { t } = useI18n();
  const { downloads, startDownload, removeDownload, preferredPlayerPackage } = useMusicStore();

  const completed = [...downloads].filter((d) => d.status === 'completed').reverse();
  const [showAllCompleted, setShowAllCompleted] = useState(false);
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
      <h1 className="text-lg sm:text-2xl font-semibold tracking-tighter mb-1 sm:mb-2">{t('downloads')}</h1>
      <p className="text-xs sm:text-sm text-[#666660] mb-6 sm:mb-8">
        {t('downloadsSummary', { total: downloads.length, active: active.length, queued: queued.length })}
      </p>

      {active.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">{t('inProgress')}</h2>
          <div className="space-y-3">
            {active.map((dl) => (
              <ActiveDownloadCard key={dl.id} dl={dl} t={t} />
            ))}
          </div>
        </section>
      )}

      {queued.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">{t('queued')}</h2>
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
                <span className="text-xs text-zinc-500">{t('queuedStatus')}</span>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {failed.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">{t('failed')}</h2>
          <div className="space-y-1">
            {failed.map((dl) => (
              <div
                key={dl.id}
                className="flex items-center gap-2.5 sm:gap-3 px-2 sm:px-3 py-2 sm:py-2.5 rounded-lg hover:bg-[rgba(255,255,255,0.03)] active:bg-[rgba(255,255,255,0.04)] transition-colors"
              >
                <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] sm:text-sm font-medium truncate text-[#F5F5F0]">{dl.track.title}</p>
                  <p className="text-[11px] sm:text-xs text-red-400/70">{dl.error || t('unknownError')}</p>
                </div>
                <button
                  onClick={() => startDownload(dl.track)}
                  className="text-xs text-[#C8F04B] hover:underline px-2 py-1 min-h-[44px] flex items-center"
                >
                  {t('retry')}
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

      {completed.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[#666660] mb-3">{t('completed')}</h2>
          <div className="space-y-1">
            {(showAllCompleted ? completed : completed.slice(0, 2)).map((dl) => (
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
                
                <button
                  onClick={() => startDownload(dl.track)}
                  className="p-2 text-[#666660] hover:text-[#C8F04B] active:text-[#C8F04B] transition-colors sm:opacity-0 sm:group-hover:opacity-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  title={t('retry') || 'Redescargar'}
                >
                  <RefreshCw className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                </button>

                {(dl.mediaUri || dl.fileName) && (
                  <button
                    onClick={() => void openDownloadedFile(dl.fileName, dl.mediaUri, preferredPlayerPackage ?? undefined)}
                    className="px-2.5 py-2 text-[#C8F04B] hover:text-[#e6ff8a] transition-colors min-h-[44px] flex items-center gap-1.5"
                    title={t('openInPlayer')}
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span className="hidden sm:inline text-xs">{t('open')}</span>
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
          {completed.length > 2 && (
            <button
              onClick={() => setShowAllCompleted(!showAllCompleted)}
              className="mt-2 text-xs text-[#666660] hover:text-[#F5F5F0] transition-colors px-3 py-2 w-full text-center border border-[rgba(255,255,255,0.05)] rounded-lg hover:bg-[rgba(255,255,255,0.02)]"
            >
              {showAllCompleted ? (t('hide') || 'Ocultar') : `Ver ${completed.length - 2} más...`}
            </button>
          )}
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
          <p className="text-sm text-[#B0B0B0]">{t('noDownloadsYet')}</p>
        </motion.div>
      )}
    </motion.div>
  );
}
