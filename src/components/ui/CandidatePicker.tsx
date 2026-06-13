import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Clock, CheckCircle2, ShieldCheck, AlertTriangle, Sparkles } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { getDownloadCandidates, type DownloadCandidate } from '@/lib/api/musicApi';
import { getCandidateMatchPresentation, type CandidateMatchTone } from '@/lib/candidateMatch';
import type { Track } from '@/types/music';
import { useI18n } from '@/lib/useI18n';

const toneStyles: Record<CandidateMatchTone, {
  card: string;
  rank: string;
  percent: string;
  badge: string;
  detail: string;
}> = {
  exact: {
    card: 'bg-[linear-gradient(110deg,rgba(200,240,75,0.12),rgba(200,240,75,0.035))] border-[rgba(200,240,75,0.38)] hover:border-[rgba(200,240,75,0.6)]',
    rank: 'bg-[#C8F04B] text-[#111]',
    percent: 'bg-[rgba(200,240,75,0.16)] text-[#C8F04B]',
    badge: 'bg-[rgba(200,240,75,0.12)] text-[#D8FF61]',
    detail: 'text-[#B7D957]',
  },
  high: {
    card: 'bg-[linear-gradient(110deg,rgba(56,189,248,0.11),rgba(56,189,248,0.025))] border-[rgba(56,189,248,0.28)] hover:border-[rgba(56,189,248,0.5)]',
    rank: 'bg-[#38BDF8] text-[#07151C]',
    percent: 'bg-[rgba(56,189,248,0.14)] text-[#7DD3FC]',
    badge: 'bg-[rgba(56,189,248,0.11)] text-[#7DD3FC]',
    detail: 'text-[#68BCE2]',
  },
  review: {
    card: 'bg-[linear-gradient(110deg,rgba(245,158,11,0.08),rgba(255,255,255,0.025))] border-[rgba(245,158,11,0.18)] hover:border-[rgba(245,158,11,0.36)]',
    rank: 'bg-[rgba(245,158,11,0.2)] text-[#FBBF24]',
    percent: 'bg-[rgba(245,158,11,0.12)] text-[#FBBF24]',
    badge: 'bg-[rgba(245,158,11,0.1)] text-[#F3C65C]',
    detail: 'text-[#B89149]',
  },
  alternate: {
    card: 'bg-[linear-gradient(110deg,rgba(244,63,94,0.075),rgba(255,255,255,0.02))] border-[rgba(244,63,94,0.16)] hover:border-[rgba(244,63,94,0.32)]',
    rank: 'bg-[rgba(244,63,94,0.16)] text-[#FB7185]',
    percent: 'bg-[rgba(244,63,94,0.12)] text-[#FB7185]',
    badge: 'bg-[rgba(244,63,94,0.1)] text-[#FDA4AF]',
    detail: 'text-[#C27480]',
  },
};

export function CandidatePicker({
  track,
  animeSearchEnabled,
  onClose,
  onSelect,
}: {
  track: Track;
  animeSearchEnabled: boolean;
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
        const cands = await getDownloadCandidates(track, animeSearchEnabled);
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
  }, [animeSearchEnabled, track, t]);

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
            <p className="text-xs font-semibold text-[#F5F5F0] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#C8F04B]" />
              {t('candidateResultsTitle')}
            </p>
            <p className="text-[11px] text-[#666]">{t('candidateResultsHint')}</p>
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
                const match = getCandidateMatchPresentation(track, c);
                const styles = toneStyles[match.tone];
                const StatusIcon = match.tone === 'exact'
                  ? CheckCircle2
                  : match.tone === 'high'
                    ? ShieldCheck
                    : AlertTriangle;

                return (
                  <motion.button
                    key={c.videoId}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: reduceMotion ? 0 : i * 0.025 }}
                    onClick={() => onSelect(c.videoId)}
                    className={`w-full px-3 py-3 rounded-xl text-left flex items-start gap-3 group transition-all border ${styles.card}`}
                  >
                    <span className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${styles.rank}`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#F5F5F0] leading-tight line-clamp-2">{c.title}</p>
                      <p className="text-[11px] text-[#777] truncate mt-1">{c.channel}</p>
                      <div className="flex flex-wrap items-center gap-1 mt-2">
                        {match.badgeKeys.map((key) => (
                          <span key={key} className={`text-[9px] leading-4 px-1.5 rounded-md font-medium ${styles.badge}`}>
                            {t(key)}
                          </span>
                        ))}
                        {c.duration > 0 && (
                          <span className="flex items-center gap-1 text-[9px] leading-4 tabular-nums px-1.5 rounded-md bg-[rgba(255,255,255,0.055)] text-[#777]">
                            <Clock className="w-2.5 h-2.5" />
                            {fmt(c.duration)}
                          </span>
                        )}
                      </div>
                      <p className={`text-[9px] mt-1.5 flex items-center gap-1 ${styles.detail}`}>
                        <StatusIcon className="w-2.5 h-2.5" />
                        {t(match.detailKey)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className={`text-[11px] font-bold tabular-nums px-2 py-1 rounded-lg ${styles.percent}`}>
                        {match.percent}%
                      </span>
                      <span className={`text-[8px] font-semibold uppercase tracking-[0.08em] ${styles.detail}`}>
                        {t(match.statusKey)}
                      </span>
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
