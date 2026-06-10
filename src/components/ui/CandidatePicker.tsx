import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Clock } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { getDownloadCandidates, type DownloadCandidate } from '@/lib/api/musicApi';
import type { Track } from '@/types/music';
import { useI18n } from '@/lib/useI18n';

export function CandidatePicker({
  track,
  onClose,
  onSelect,
}: {
  track: Track;
  onClose: () => void;
  onSelect: (videoId: string) => void;
}) {
  const { t } = useI18n();
  const [candidates, setCandidates] = useState<DownloadCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isNativeMobile = Capacitor.isNativePlatform();
  const reduceMotion = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency || 4) <= 4;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setCandidates([]);
    const loadCandidates = async () => {
      try {
        const cands = await getDownloadCandidates(track);
        if (!active) return;
        setCandidates(cands);
        if (cands.length === 0) {
          toast.warning(t('noDownloadCandidates'));
          setError(t('noResults'));
        }
      } catch (e) {
        if (!active) return;
        const errorMsg = e instanceof Error ? e.message : t('noDownloadCandidates');
        toast.error(errorMsg);
        setError(errorMsg);
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadCandidates();
    return () => {
      active = false;
    };
  }, [track, t]);

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  const overlay = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`fixed inset-0 z-[80] flex justify-center ${isNativeMobile ? 'items-start p-2 pt-3' : 'items-end sm:items-center p-0 sm:p-4'}`}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 60 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className={`relative z-10 w-full sm:max-w-lg flex flex-col bg-[#111] border border-[rgba(255,255,255,0.08)] overflow-hidden shadow-2xl ${isNativeMobile ? 'max-h-[92vh] min-h-[48vh] rounded-2xl' : 'max-h-[88vh] sm:max-h-[80vh] rounded-t-2xl sm:rounded-2xl'}`}
      >
        <div className="flex items-center gap-3 px-4 pb-3 border-b border-[rgba(255,255,255,0.06)] flex-shrink-0" style={{ paddingTop: 'calc(var(--sat) + 12px)' }}>
          {track.cover && (
            <img src={track.cover} alt="" decoding="async" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#F5F5F0] truncate">{track.title}</p>
            <p className="text-xs text-[#555] truncate">{track.artist}</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.14)] flex items-center justify-center flex-shrink-0 transition-colors"
          >
            <X className="w-4 h-4 text-[#888]" />
          </motion.button>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[rgba(255,255,255,0.06)] flex-shrink-0">
          <div>
            <p className="text-xs font-medium text-[#F5F5F0]">{t('smartResults')}</p>
            <p className="text-[11px] text-[#555]">{t('smartResultsHint')}</p>
          </div>
          <span className="text-[10px] text-[#444] text-right">{t('chooseExactSong')}</span>
        </div>

        <div className="overflow-y-auto flex-1 px-3 pb-4 overscroll-contain">
          {loading ? (
            <div className="space-y-2 mt-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-[rgba(255,255,255,0.04)] animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
              ))}
            </div>
          ) : error ? (
            <p className="text-center text-xs text-red-400 py-8">{error}</p>
          ) : candidates.length === 0 ? (
            <p className="text-center text-xs text-[#555] py-8">{t('noResults')}</p>
          ) : (
            <div className="space-y-1.5 mt-1">
              {candidates.slice(0, 3).map((c, i) => {
                const isBest = i === 0;
                const confidenceClass = c.confidence === 'alta'
                  ? 'bg-[rgba(200,240,75,0.15)] text-[#C8F04B]'
                  : c.confidence === 'media'
                    ? 'bg-[rgba(255,255,255,0.08)] text-[#D5D5CE]'
                    : 'bg-[rgba(255,255,255,0.06)] text-[#777]';

                return (
                  <motion.button
                    key={c.videoId}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: reduceMotion ? 0 : i * 0.025 }}
                    onClick={() => onSelect(c.videoId)}
                    className={`w-full px-3 py-2.5 rounded-xl text-left flex items-center gap-3 group transition-all ${
                      isBest
                        ? 'bg-[rgba(200,240,75,0.07)] border border-[rgba(200,240,75,0.2)] hover:bg-[rgba(200,240,75,0.12)]'
                        : 'bg-[rgba(255,255,255,0.03)] border border-transparent hover:bg-[rgba(255,255,255,0.07)]'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[#F5F5F0] leading-tight line-clamp-2">{c.title}</p>
                      <p className="text-[11px] text-[#555] truncate mt-0.5">{c.channel}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {c.label && c.label !== 'original probable' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.06)] text-[#777] capitalize">{c.label}</span>
                      )}
                      {c.duration > 0 && (
                        <span className="flex items-center gap-1 text-[10px] tabular-nums px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.06)] text-[#555]">
                          <Clock className="w-2.5 h-2.5" />
                          {fmt(c.duration)}
                        </span>
                      )}
                      {isBest && (
                        <span className="text-[9px] text-[#C8F04B] font-medium">{t('bestMatch')}</span>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );

  if (typeof document === 'undefined') {
    return overlay;
  }

  return createPortal(overlay, document.body);
}
