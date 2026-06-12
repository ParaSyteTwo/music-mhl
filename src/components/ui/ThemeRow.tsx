import { motion } from 'framer-motion';
import { Download, Loader2, CheckCircle2 } from 'lucide-react';
import type { AnimeTheme } from '@/types/anime';
import { useI18n } from '@/lib/useI18n';

export interface ThemeRowProps {
  theme: AnimeTheme;
  animeTitle: string;
  onDownload: () => void;
  downloading: boolean;
  downloaded?: boolean;
}

function buildEpisodeRange(
  from: number | null,
  to: number | null,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string | null {
  if (from == null && to == null) return null;
  const f = from ?? 1;
  const toDisplay = to ?? f;
  return t('animeThemesEpisodeRange', { from: f, to: toDisplay });
}

export function ThemeRow({
  theme,
  animeTitle,
  onDownload,
  downloading,
  downloaded = false,
}: ThemeRowProps) {
  const { t } = useI18n();
  const epRange = buildEpisodeRange(theme.episodesFrom, theme.episodesTo, t);
  const badgeLabel = `${theme.type} ${theme.sequence}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
    >
      <span className="inline-flex items-center justify-center min-w-[58px] px-2 py-1 rounded-md bg-[#C8F04B] text-[#080808] text-[11px] font-bold font-mono tracking-wider flex-shrink-0">
        {badgeLabel}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#F5F5F0] font-medium truncate">
          {theme.title || animeTitle}
        </p>
        <p className="text-[11px] text-[#666660] truncate">
          {theme.artist}
          {epRange ? <span className="ml-1.5 text-[#555]">· {epRange}</span> : null}
        </p>
      </div>
      <button
        type="button"
        onClick={onDownload}
        disabled={downloading}
        title={t('animeThemesDownload')}
        aria-label={t('animeThemesDownload')}
        className={`p-2.5 rounded-lg transition-colors flex items-center justify-center min-w-[40px] min-h-[40px] flex-shrink-0 ${
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
    </motion.div>
  );
}
