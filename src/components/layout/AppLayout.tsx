import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { BottomPlayer } from './BottomPlayer';
import { LyricsPanel } from '@/components/music/LyricsPanel';
import { useMusicStore } from '@/store/musicStore';
import { useIsMobile } from '@/hooks/use-mobile';

export function AppLayout() {
  const showLyrics = useMusicStore((s) => s.player.showLyrics);
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar - Hidden on mobile */}
      {!isMobile && <AppSidebar />}
      
      <main className={`pb-[var(--player-height)] min-h-screen transition-all duration-300 ${
        !isMobile ? 'ml-[var(--sidebar-width)]' : ''
      }`}>
        <div className="flex min-h-screen">
          <div className={`flex-1 transition-all duration-300 ${showLyrics && !isMobile ? 'mr-[400px]' : ''}`}>
            <Outlet />
          </div>
          {showLyrics && !isMobile && (
            <div className="w-[400px] fixed right-0 top-0 bottom-[var(--player-height)] bg-[rgba(12,12,12,0.95)] border-l border-[rgba(255,255,255,0.06)] overflow-y-auto p-6">
              <LyricsPanel />
            </div>
          )}
        </div>
      </main>
      <BottomPlayer />
    </div>
  );
}
