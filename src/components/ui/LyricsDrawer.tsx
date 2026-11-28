import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Music, FileText } from 'lucide-react';
import { useMusicStore } from '@/store/musicStore';
import { findActiveLyricIndex } from '@/lib/lyricsParser';
import { useI18n } from '@/lib/useI18n';

interface LyricsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function LyricsDrawer({ open, onClose }: LyricsDrawerProps) {
  const { t } = useI18n();
  const currentTrack = useMusicStore((s) => s.currentTrack);
  const currentLyrics = useMusicStore((s) => s.currentLyrics);
  const progress = useMusicStore((s) => s.progress);
  const seekTo = useMusicStore((s) => s.seekTo);

  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLButtonElement>(null);

  const lines = currentLyrics?.lines ?? [];
  const isSynced = Boolean(currentLyrics?.synced);
  const activeIndex = isSynced ? findActiveLyricIndex(lines, progress) : -1;

  useEffect(() => {
    if (!open || activeIndex < 0 || !activeLineRef.current) return;
    activeLineRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [open, activeIndex]);

  return (
    <AnimatePresence>
      {open && currentTrack && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-0 sm:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[82vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
            style={{ backgroundColor: 'var(--bg-surface)' }}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.07]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/5 border border-white/10 flex-shrink-0 flex items-center justify-center">
                  {currentTrack.cover ? (
                    <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Music className="w-4 h-4 text-[var(--accent-primary)]" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--accent-primary)] flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {t('lyricsDrawerTitle')}
                  </p>
                  <p className="text-sm font-semibold text-[#F5F5F0] truncate">{currentTrack.title}</p>
                  <p className="text-xs text-[#8E8E88] truncate">{currentTrack.artist}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('hide')}
                className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-[#A0A098] hover:text-white transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              ref={containerRef}
              className="flex-1 overflow-y-auto px-5 py-6 space-y-4"
              style={{ paddingBottom: 'calc(var(--sab, 0px) + 24px)' }}
            >
              {lines.length === 0 ? (
                <p className="text-center text-sm text-[#8E8E88] py-12">{t('noEmbeddedLyrics')}</p>
              ) : (
                lines.map((line, idx) => {
                  const isActive = idx === activeIndex;
                  const canSeek = isSynced && line.time >= 0;
                  return (
                    <button
                      key={`${line.time}-${idx}`}
                      ref={isActive ? activeLineRef : undefined}
                      type="button"
                      disabled={!canSeek}
                      onClick={() => {
                        if (canSeek) seekTo(line.time);
                      }}
                      className={`w-full text-left rounded-xl px-3 py-2 transition-all duration-200 ${
                        canSeek ? 'cursor-pointer hover:bg-white/[0.04]' : 'cursor-default'
                      } ${
                        isActive
                          ? 'bg-[var(--accent-primary)]/10 scale-[1.01]'
                          : isSynced && idx < activeIndex
                            ? 'opacity-45'
                            : isSynced
                              ? 'opacity-70'
                              : 'opacity-90'
                      }`}
                    >
                      {line.texts.map((textLine, layerIdx) => (
                        <p
                          key={layerIdx}
                          className={`leading-snug ${
                            layerIdx === 0
                              ? isActive
                                ? 'text-base sm:text-lg font-bold text-[var(--accent-primary)]'
                                : 'text-sm sm:text-base font-medium text-[#F5F5F0]'
                              : layerIdx === 1
                                ? isActive
                                  ? 'text-xs sm:text-sm text-[#D4D4CE] mt-0.5'
                                  : 'text-xs text-[#9E9E98] mt-0.5'
                                : 'text-xs text-[#7E7E78] mt-0.5 italic'
                          }`}
                        >
                          {textLine}
                        </p>
                      ))}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
