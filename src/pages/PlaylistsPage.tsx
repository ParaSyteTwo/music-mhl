import { ListMusic } from 'lucide-react';
import { motion } from 'framer-motion';

export default function PlaylistsPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="px-4 sm:px-8 py-4 sm:py-10 max-w-3xl mx-auto"
    >
      <h1 className="text-lg sm:text-2xl font-semibold tracking-tighter mb-1 sm:mb-2">Playlists</h1>
      <p className="text-xs sm:text-sm text-[#B0B0B0] mb-6 sm:mb-8">Tus listas de reproducción</p>

      <div className="text-center py-12 sm:py-16 space-y-3">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: [1, 1.08, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
        >
          <ListMusic className="w-20 h-20 text-[#C8F04B]/60 mx-auto" />
        </motion.div>
        <p className="text-sm text-[#B0B0B0]">Próximamente</p>
        <p className="text-xs text-[#888A99]">Aquí podrás crear y gestionar tus playlists</p>
      </div>
    </motion.div>
  );
}
