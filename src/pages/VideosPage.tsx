import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Clipboard,
  Download,
  ExternalLink,
  Film,
  Loader2,
  Music,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/useI18n';
import { openDownloadedFile } from '@/lib/openFileBridge';
import { searchVideos } from '@/lib/video/videoApi';
import { extractYouTubeVideoId } from '@/lib/music/urlResolver';
import { useMusicStore } from '@/store/musicStore';
import type {
  VideoKind,
  VideoSearchResult,
} from '@/types/video';
import type { Track } from '@/types/music';

const LONG_VIDEO_THRESHOLD_SECONDS = 1200; // 20 min

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getKindBadge(
  kind: VideoKind,
  t: (key: string) => string,
): { label: string; className: string } | null {
  switch (kind) {
    case 'official':
      return {
        label: t('videoBadgeOfficial'),
        className: 'bg-[var(--accent-primary)] text-[#080808] font-semibold',
      };
    case 'visualizer':
      return {
        label: t('videoBadgeVisualizer'),
        className: 'bg-sky-400/90 text-[#080808] font-semibold',
      };
    case 'lyric':
      return {
        label: t('videoBadgeLyric'),
        className: 'bg-purple-400/90 text-[#080808] font-semibold',
      };
    case 'live':
      return {
        label: t('videoBadgeLive'),
        className: 'bg-amber-400/90 text-[#080808] font-semibold',
      };
    case 'static_cover':
      return {
        label: t('videoBadgeStaticCover'),
        className: 'bg-black/80 text-[#D4D4CE] border border-white/15',
      };
    default:
      return null;
  }
}

export default function VideosPage() {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VideoSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pendingConfirmId, setPendingConfirmId] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const videoDownloads = useMusicStore((s) => s.videoDownloads);
  const startVideoDownload = useMusicStore((s) => s.startVideoDownload);
  const removeVideoDownload = useMusicStore((s) => s.removeVideoDownload);
  const clearCompletedVideoDownloads = useMusicStore((s) => s.clearCompletedVideoDownloads);
  const startDownloadWithVideoId = useMusicStore((s) => s.startDownloadWithVideoId);

  const runSearch = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    const mySeq = ++requestSeq.current;
    if (!trimmed) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const items = await searchVideos(trimmed, 12, lang);
      if (mySeq !== requestSeq.current) return;
      setResults(items);
    } catch (err) {
      if (mySeq !== requestSeq.current) return;
      toast.error(err instanceof Error ? err.message : t('error'));
    } finally {
      if (mySeq === requestSeq.current) {
        setIsSearching(false);
      }
    }
  }, [lang, t]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      requestSeq.current += 1;
      setResults([]);
      setIsSearching(false);
      return;
    }
    if (extractYouTubeVideoId(trimmed)) {
      void runSearch(trimmed);
      return;
    }
    const timer = window.setTimeout(() => {
      void runSearch(trimmed);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query, runSearch]);

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text?.trim()) {
        setQuery(text.trim());
      }
    } catch {
      // Clipboard API unavailable
    }
  };

  const handleDownloadClick = (video: VideoSearchResult) => {
    if (video.duration > LONG_VIDEO_THRESHOLD_SECONDS && pendingConfirmId !== video.videoId) {
      setPendingConfirmId(video.videoId);
      return;
    }
    setPendingConfirmId(null);
    startVideoDownload(video);
  };

  const handleAudioOnlyShortcut = (video: VideoSearchResult) => {
    const pseudoTrack: Track = {
      id: `yt_${video.videoId}`,
      youtubeId: video.videoId,
      title: video.title,
      canonicalTitle: video.title,
      artist: video.channel.replace(/\s*-\s*Topic$/i, '').trim() || 'YouTube',
      album: 'YouTube',
      canonicalAlbum: 'YouTube',
      duration: video.duration,
      cover: video.thumbnail,
      preview: '',
      isrc: '',
      edition: 'unknown',
    };
    startDownloadWithVideoId(pseudoTrack, video.videoId);
    toast.success(`${pseudoTrack.artist} - ${pseudoTrack.title}`);
  };

  const completedCount = videoDownloads.filter((d) => d.status === 'completed').length;
  const showEmpty = !query.trim() && results.length === 0 && !isSearching && videoDownloads.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`px-3 sm:px-8 max-w-5xl mx-auto flex flex-col ${
        showEmpty
          ? 'pt-1 sm:pt-3 justify-center'
          : 'pt-2 sm:pt-4 pb-3 sm:pb-6'
      }`}
    >
      <section className={`home-hero ${showEmpty ? 'home-hero-expanded' : ''} px-3.5 py-2.5 sm:p-5 mb-2 sm:mb-4`}>
        <div className="home-hero-orb home-hero-orb-one" aria-hidden="true" />
        <div className="home-hero-orb home-hero-orb-two" aria-hidden="true" />
        <div className="relative z-10 text-center">
          <span className="inline-block mb-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-semibold uppercase tracking-wider bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30">
            {t('videoExperimentalBadge')}
          </span>
          <h1 className="text-base sm:text-2xl md:text-3xl font-bold tracking-tight text-[#F5F5F0]">
            {t('videosHeroTitle')}
          </h1>
          <p className="mx-auto mt-0.5 max-w-md text-[11px] sm:text-sm text-[#A0A09A]">
            {t('videosHeroSubtitle')}
          </p>
        </div>

        <div className="home-search-shell relative z-10 mt-2 sm:mt-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#85857E]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim()) {
                void runSearch(query);
              }
            }}
            placeholder={t('videosSearchPlaceholder')}
            className="w-full pl-10 pr-10 py-2 sm:py-3.5 rounded-2xl bg-transparent text-xs sm:text-sm text-[#F5F5F0] placeholder:text-[#6E6E68] focus:outline-none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
          />
          {isSearching ? (
            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--accent-primary)] animate-spin" />
          ) : query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setResults([]);
              }}
              aria-label={t('clearSearch')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.14] flex items-center justify-center transition-colors"
            >
              <X className="w-3 h-3 text-[#A0A09A]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { void handlePasteFromClipboard(); }}
              title={t('pasteFromClipboard')}
              aria-label={t('pasteLink')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[#6E6E68] hover:text-[var(--accent-primary)] hover:bg-white/[0.06] transition-colors"
            >
              <Clipboard className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </section>

      {videoDownloads.length > 0 && (
        <section className="mb-4 rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <h2 className="text-xs sm:text-sm font-semibold text-[#F5F5F0] flex items-center gap-1.5">
              <Film className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              {t('videoDownloadsTitle')}
            </h2>
            {completedCount > 0 && (
              <button
                type="button"
                onClick={clearCompletedVideoDownloads}
                className="text-[11px] text-[#8E8E88] hover:text-[var(--accent-primary)] transition-colors"
              >
                {t('videoClearCompleted')}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {videoDownloads.map((dl) => (
              <div
                key={dl.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] border border-white/[0.05] px-2.5 py-2"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <img
                    src={dl.video.thumbnail}
                    alt={dl.video.title}
                    className="w-14 h-8 rounded object-cover flex-shrink-0 bg-black/50"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-[#F5F5F0] truncate">{dl.video.title}</p>
                    <p className="text-[10px] text-[#8E8E88] truncate">
                      {dl.quality} · {dl.codec.toUpperCase()}
                      {dl.status === 'downloading' && dl.speed ? ` · ${dl.speed}` : ''}
                      {dl.status === 'error' && dl.error ? ` · ${dl.error}` : ''}
                    </p>
                    {(dl.status === 'queued' || dl.status === 'downloading') && (
                      <div className="mt-1 h-1 w-full rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-[var(--accent-primary)] transition-all duration-200"
                          style={{ width: `${Math.max(4, dl.progress || 0)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {dl.status === 'completed' ? (
                    <button
                      type="button"
                      onClick={() => { void openDownloadedFile(dl.filePath || dl.fileName, dl.mediaUri); }}
                      title={t('videoOpenFile')}
                      aria-label={t('videoOpenFile')}
                      className="p-2 rounded-lg text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/15 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  ) : dl.status === 'error' ? (
                    <XCircle className="w-4 h-4 text-red-400 mx-1" />
                  ) : (
                    <Loader2 className="w-4 h-4 text-[var(--accent-primary)] animate-spin mx-1" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeVideoDownload(dl.id)}
                    aria-label={t('remove')}
                    className="p-2 rounded-lg text-[#666660] hover:text-red-400 hover:bg-white/[0.06] transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {results.length === 0 && !isSearching ? (
        <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-8 text-center text-xs sm:text-sm text-[#8E8E88]">
          <Film className="w-8 h-8 mx-auto mb-2 text-[#555550]" />
          <p>{t('videoEmptyState')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4" data-testid="videoclips-grid">
          {results.map((video) => {
            const badge = getKindBadge(video.kind, t);
            const dl = videoDownloads.find((d) => d.id === `vid-${video.videoId}`);
            const isBusy = dl?.status === 'queued' || dl?.status === 'downloading';
            const isDone = dl?.status === 'completed';
            const needsLongConfirm = video.duration > LONG_VIDEO_THRESHOLD_SECONDS && pendingConfirmId === video.videoId;

            return (
              <article
                key={video.videoId}
                className="flex flex-col rounded-2xl overflow-hidden bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] hover:border-[var(--accent-primary)]/35 transition-colors shadow-sm"
              >
                <div className="relative aspect-video w-full bg-black/50 overflow-hidden">
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                  {badge && (
                    <span
                      className={`absolute top-2 left-2 px-1.5 py-0.5 rounded-md text-[9px] sm:text-[10px] tracking-wide uppercase ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  )}
                  {video.duration > 0 && (
                    <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/80 text-[10px] font-mono text-white tabular-nums">
                      {formatDuration(video.duration)}
                    </span>
                  )}
                </div>

                <div className="flex-1 flex flex-col justify-between p-2.5 sm:p-3 gap-2">
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-semibold text-[#F5F5F0] line-clamp-2 leading-snug">
                      {video.title}
                    </h3>
                    <p className="text-[11px] text-[#8E8E88] truncate mt-0.5">
                      {video.channel}
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5 pt-1">
                    {isDone ? (
                      <button
                        type="button"
                        onClick={() => { void openDownloadedFile(dl.filePath || dl.fileName, dl.mediaUri); }}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/25 text-xs font-semibold transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span className="truncate">{t('videoOpenFile')}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDownloadClick(video)}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-[var(--accent-primary)] text-[#080808] hover:opacity-90 disabled:opacity-60 text-xs font-semibold transition-all"
                      >
                        {isBusy ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>{dl?.progress ? `${dl.progress}%` : '...'}</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" />
                            <span className="truncate">
                              {needsLongConfirm ? t('videoLongConfirm') : t('videoDownloadMp4')}
                            </span>
                          </>
                        )}
                      </button>
                    )}

                    {video.kind === 'static_cover' && (
                      <button
                        type="button"
                        onClick={() => handleAudioOnlyShortcut(video)}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-[#D4D4CE] text-[11px] font-medium transition-colors"
                      >
                        <Music className="w-3 h-3 text-[var(--accent-primary)]" />
                        <span className="truncate">{t('videoDownloadAudioOnly')}</span>
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
