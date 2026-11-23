import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, Disc3, Download, ListMusic, Loader2 } from 'lucide-react';
import type { ResolvedCollection, Track } from '@/types/music';
import { useI18n } from '@/lib/useI18n';

export interface CollectionPanelProps {
  collection: ResolvedCollection;
  onBack: () => void;
  onDownloadAll: (tracks: Track[]) => void;
  onDownloadTrack: (track: Track) => void;
  isTrackDownloaded: (trackId: string) => boolean;
  isTrackDownloading: (trackId: string) => boolean;
}

const SOURCE_LABELS: Record<ResolvedCollection['source'], string> = {
  deezer: 'Deezer',
  youtube: 'YouTube',
  spotify: 'Spotify',
};

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function CollectionPanel({
  collection,
  onBack,
  onDownloadAll,
  onDownloadTrack,
  isTrackDownloaded,
  isTrackDownloading,
}: CollectionPanelProps) {
  const { t } = useI18n();
  const typeLabel = collection.type === 'album'
    ? t('collectionTypeAlbum')
    : t('collectionTypePlaylist');
  const sourceLabel = SOURCE_LABELS[collection.source] ?? collection.source;
  const trackCountLabel = t('collectionResolved', {
    title: '',
    count: collection.totalTracks,
  })
    .replace(/^\s*\(/, '')
    .replace(/\)\s*$/, '')
    .trim();

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="mb-4 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] p-4 sm:p-5"
    >
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[11px] text-[#999] hover:text-[#C8F04B] transition-colors mb-3"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t('search')}
      </button>

      <div className="flex flex-col sm:flex-row gap-4 items-start">
        {collection.cover ? (
          <img
            src={collection.cover}
            alt=""
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl object-cover flex-shrink-0 border border-[rgba(255,255,255,0.06)]"
          />
        ) : (
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl bg-gradient-to-br from-[#C8F04B]/15 to-white/[0.04] border border-[rgba(255,255,255,0.06)] flex items-center justify-center flex-shrink-0">
            {collection.type === 'album' ? (
              <Disc3 className="w-9 h-9 text-[#666660]" />
            ) : (
              <ListMusic className="w-9 h-9 text-[#666660]" />
            )}
          </div>
        )}

        <div className="flex-1 min-w-0 w-full">
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#C8F04B]/15 text-[#C8F04B] text-[10px] font-semibold uppercase tracking-wider">
              {typeLabel}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/[0.05] border border-[rgba(255,255,255,0.06)] text-[#A0A098] text-[10px] font-medium">
              {sourceLabel}
            </span>
          </div>

          <h2 className="text-base sm:text-xl font-bold text-[#F5F5F0] font-[family-name:Syne] leading-snug break-words">
            {collection.title}
          </h2>

          <p className="text-xs text-[#666660] mt-1 truncate">
            {[collection.subtitle || null, trackCountLabel || null].filter(Boolean).join(' · ')}
          </p>

          {collection.truncated && (
            <p className="text-[11px] text-[#A0A098] mt-1.5">
              {t('collectionTruncatedNotice', {
                shown: collection.tracks.length,
                total: collection.totalTracks,
              })}
            </p>
          )}

          <div className="mt-3">
            <button
              type="button"
              onClick={() => onDownloadAll(collection.tracks)}
              disabled={collection.tracks.length === 0}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#C8F04B] text-[#080808] hover:bg-[#d4f56a] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm font-semibold transition-all shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>{t('collectionDownloadAll', { n: collection.tracks.length })}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-1.5">
        {collection.tracks.map((track, idx) => {
          const downloading = isTrackDownloading(track.id);
          const downloaded = isTrackDownloaded(track.id);
          return (
            <div
              key={`${track.id}-${idx}`}
              className="flex items-center gap-2.5 sm:gap-3 px-2.5 sm:px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
            >
              <span className="w-6 text-right font-mono text-[11px] text-[#666660] tabular-nums flex-shrink-0">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm text-[#F5F5F0] font-medium truncate">
                  {track.title}
                </p>
                <p className="text-[11px] text-[#666660] truncate">
                  {track.artist}
                </p>
              </div>
              {track.duration > 0 && (
                <span className="text-[11px] text-[#666660] tabular-nums flex-shrink-0">
                  {formatDuration(track.duration)}
                </span>
              )}
              <button
                type="button"
                onClick={() => onDownloadTrack(track)}
                disabled={downloading}
                title={t('animeThemesDownload')}
                aria-label={`${t('animeThemesDownload')} ${track.title}`}
                className={`p-2 rounded-lg transition-colors flex items-center justify-center min-w-[38px] min-h-[38px] flex-shrink-0 ${
                  downloading
                    ? 'text-[#C8F04B] cursor-wait'
                    : downloaded
                      ? 'text-[#C8F04B]'
                      : 'text-[#888] hover:text-[#C8F04B] hover:bg-[rgba(200,240,75,0.1)]'
                }`}
              >
                {downloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : downloaded ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
