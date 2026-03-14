import { Home, Search, Library, Download, Settings, Music2, ListMusic } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useMusicStore } from '@/store/musicStore';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/search', icon: Search, label: 'Search' },
  { to: '/library', icon: Library, label: 'Library' },
  { to: '/playlists', icon: ListMusic, label: 'Playlists' },
  { to: '/downloads', icon: Download, label: 'Downloads' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function AppSidebar() {
  const location = useLocation();
  const downloads = useMusicStore((s) => s.downloads);
  const activeDownloads = downloads.filter(d => d.status === 'downloading');

  return (
    <aside className="fixed left-0 top-0 bottom-[var(--player-height)] w-[var(--sidebar-width)] bg-sidebar border-r border-sidebar-border flex flex-col z-30">
      {/* Logo */}
      <div className="px-6 py-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <Music2 className="w-4 h-4 text-primary" />
        </div>
        <span className="text-lg font-semibold tracking-tighter text-foreground">MHL</span>
        <span className="text-xs text-muted-foreground font-mono ml-auto">v1.0</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn('nav-item relative', isActive && 'nav-item-active')}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
              {item.to === '/downloads' && activeDownloads.length > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="ml-auto w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-mono"
                >
                  {activeDownloads.length}
                </motion.span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Active Downloads Preview */}
      {activeDownloads.length > 0 && (
        <div className="px-4 py-4 border-t border-sidebar-border">
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Downloading</p>
          <div className="space-y-2">
            {activeDownloads.slice(0, 3).map((dl) => (
              <div key={dl.id} className="space-y-1">
                <p className="text-xs text-foreground truncate">{dl.track.title}</p>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
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
