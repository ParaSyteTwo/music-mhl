import { motion } from 'framer-motion';
import { Tv } from 'lucide-react';
import type { Anime } from '@/types/anime';
import { useI18n } from '@/lib/useI18n';

export interface AnimeCardProps {
  anime: Anime;
  onClick: () => void;
}

function getDisplayTitle(anime: Anime): string {
  return anime.titleEnglish || anime.titleRomaji;
}

function getTypeLabelKey(type: Anime['type']): string {
  switch (type) {
    case 'TV': return 'animeDetailTypeTV';
    case 'MOVIE': return 'animeDetailTypeMOVIE';
    case 'OVA': return 'animeDetailTypeOVA';
    case 'SPECIAL': return 'animeDetailTypeSPECIAL';
  }
}

export function AnimeCard({ anime, onClick }: AnimeCardProps) {
  const { t } = useI18n();
  const title = getDisplayTitle(anime);
  const meta: string[] = [];
  if (anime.year != null) meta.push(String(anime.year));
  meta.push(t(getTypeLabelKey(anime.type)));
  if (anime.episodes != null) meta.push(String(anime.episodes));

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="group text-left w-full rounded-xl overflow-hidden bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.05)] transition-all"
    >
      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-[#C8F04B]/15 to-[#8BC34A]/5">
        {anime.cover ? (
          <img
            src={anime.cover}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Tv className="w-10 h-10 text-[#666660]" />
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-sm font-medium truncate text-[#F5F5F0]">{title}</p>
        <p className="text-[11px] text-[#666660] truncate mt-0.5">{meta.join(' · ')}</p>
      </div>
    </motion.button>
  );
}
