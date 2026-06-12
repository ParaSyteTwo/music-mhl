import { motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { useI18n } from '@/lib/useI18n';

export interface AnimeModeBadgeProps {
  active: boolean;
  onToggle: () => void;
}

export function AnimeModeBadge({ active, onToggle }: AnimeModeBadgeProps) {
  const { t } = useI18n();
  const label = active ? t('animeModeActive') : t('animeModeSongs');

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
        active
          ? 'bg-[rgba(200,240,75,0.12)] border-[rgba(200,240,75,0.4)] text-[#C8F04B]'
          : 'bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.1)] text-[#999] hover:text-[#C8F04B] hover:border-[rgba(200,240,75,0.3)]'
      }`}
      title={active ? t('animeModeSongs') : t('animeModeActive')}
    >
      {active ? <X className="w-3 h-3" /> : <Search className="w-3 h-3" />}
      <span>{label}</span>
    </motion.button>
  );
}
