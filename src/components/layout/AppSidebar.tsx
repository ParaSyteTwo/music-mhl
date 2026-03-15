import { Home, Search, Library, Download, Settings, Music2, ListMusic, Mic2 } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useMusicStore } from '@/store/musicStore';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/search', icon: Search, label: 'Search' },
  { to: '/identify', icon: Mic2, label: 'Identify' },
  { to: '/library', icon: Library, label: 'Library' },
  { to: '/playlists', icon: ListMusic, label: 'Playlists' },
  { to: '/downloads', icon: Download, label: 'Downloads' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function AppSidebar() {
  const location = useLocation();
  const { player, downloads } = useMusicStore();
  const activeDownloads = downloads.filter(d => d.status === 'downloading');
  const currentTrack = player.currentTrack;

  return (
    <aside className="fixed left-0 top-0 bottom-[var(--player-height)] w-[var(--sidebar-width)] bg-[#080808] border-r border-[rgba(255,255,255,0.06)] flex flex-col z-30">
      {/* Logo Section */}
      <div className="px-6 py-8 flex items-center gap-3 border-b border-[rgba(255,255,255,0.06)]">
        {/* Logo Symbol */}
        <div className="w-6 h-6 bg-[#C8F04B] rounded-md flex-shrink-0" />
        {/* Logo Text */}
        <div className="flex-1">
          <div className="font-[family-name:Syne] text-lg font-bold text-[#F5F5F0] leading-none">MHL</div>
          <div className="text-[10px] text-[#333330] font-normal mt-1">v1.0</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                'relative flex items-center gap-3 px-4 py-2.5 rounded-[10px] transition-all duration-150',
                isActive
                  ? 'bg-[rgba(200,240,75,0.08)] text-[#C8F04B] border-l-2 border-[#C8F04B]'
                  : 'text-[#666660] hover:text-[#F5F5F0] hover:bg-[rgba(255,255,255,0.04)]'
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm font-medium">{item.label}</span>
              {item.to === '/downloads' && activeDownloads.length > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="ml-auto w-5 h-5 rounded-full bg-[#C8F04B] text-[#080808] text-xs flex items-center justify-center font-semibold"
                >
                  {activeDownloads.length}
                </motion.span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Current Track Preview */}
      {currentTrack && (
        <div className="px-4 py-6 border-t border-[rgba(255,255,255,0.06)] space-y-3">
          <p className="text-xs font-semibold text-[#333330] uppercase tracking-wider">Now Playing</p>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
            {/* Cover */}
            <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[#C8F04B]/30 to-[rgba(200,240,75,0.1)] flex-shrink-0 overflow-hidden">
              {currentTrack.cover && (
                <img src={currentTrack.cover} alt={currentTrack.title} className="w-full h-full object-cover" />
              )}
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#F5F5F0] truncate">{currentTrack.title}</p>
              <p className="text-[10px] text-[#333330] truncate">{currentTrack.artist}</p>
            </div>
          </div>
        </div>
      )}

      {/* Active Downloads Preview */}
      {activeDownloads.length > 0 && (
        <div className="px-4 py-6 border-t border-[rgba(255,255,255,0.06)]">
          <p className="text-xs font-semibold text-[#333330] uppercase tracking-wider mb-3">Downloading</p>
          <div className="space-y-3">
            {activeDownloads.slice(0, 2).map((dl) => (
              <div key={dl.id} className="space-y-1.5">
                <p className="text-xs text-[#F5F5F0] truncate font-medium">{dl.track.title}</p>
                <div className="h-1 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                  <motion.div
                    className="h-full bg-[#C8F04B]"
                    initial={{ width: 0 }}
                    animate={{ width: `${dl.progress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
