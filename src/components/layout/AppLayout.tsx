import { Outlet, NavLink } from 'react-router-dom';
import { BottomPlayer } from './BottomPlayer';
import { Search, Download } from 'lucide-react';
import { useMusicStore } from '@/store/musicStore';

export function AppLayout() {
  const downloadCount = useMusicStore((s) => s.downloads.filter((d) => d.status === 'downloading').length);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop top nav */}
      <nav className="hidden sm:flex sticky top-0 z-30 items-center gap-6 px-8 py-3 bg-[rgba(8,8,8,0.9)] border-b border-[rgba(255,255,255,0.06)]" style={{ backdropFilter: 'blur(12px)' }}>
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex items-center gap-1.5 text-sm font-medium transition-colors ${isActive ? 'text-[#C8F04B]' : 'text-[#999] hover:text-[#F5F5F0]'}`
          }
        >
          <Search className="w-4 h-4" />
          Buscar
        </NavLink>
        <NavLink
          to="/downloads"
          className={({ isActive }) =>
            `flex items-center gap-1.5 text-sm font-medium transition-colors ${isActive ? 'text-[#C8F04B]' : 'text-[#999] hover:text-[#F5F5F0]'}`
          }
        >
          <Download className="w-4 h-4" />
          Descargas
        </NavLink>
      </nav>

      {/* Content area — bottom padding accounts for player + mobile nav */}
      <main className="pb-[calc(var(--player-height)+var(--nav-height))]">
        <Outlet />
      </main>

      <BottomPlayer />

      {/* Mobile bottom tab bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 h-[var(--nav-height)] bg-[rgba(8,8,8,0.97)] border-t border-[rgba(255,255,255,0.06)] flex" style={{ backdropFilter: 'blur(12px)' }}>
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${isActive ? 'text-[#C8F04B]' : 'text-[#666]'}`
          }
        >
          <Search className="w-5 h-5" />
          <span className="text-[10px] font-medium">Buscar</span>
        </NavLink>
        <NavLink
          to="/downloads"
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative ${isActive ? 'text-[#C8F04B]' : 'text-[#666]'}`
          }
        >
          <Download className="w-5 h-5" />
          <span className="text-[10px] font-medium">Descargas</span>
          {downloadCount > 0 && (
            <span className="absolute top-1.5 right-[calc(50%-2px)] translate-x-3 w-4 h-4 rounded-full bg-[#C8F04B] text-[#080808] text-[9px] font-bold flex items-center justify-center">
              {downloadCount}
            </span>
          )}
        </NavLink>
      </nav>
    </div>
  );
}
