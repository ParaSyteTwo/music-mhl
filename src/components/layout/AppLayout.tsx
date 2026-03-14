import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { BottomPlayer } from './BottomPlayer';
import { LyricsPanel } from '@/components/music/LyricsPanel';
import { useMusicStore } from '@/store/musicStore';

export function AppLayout() {
  const showLyrics = useMusicStore((s) => s.player.showLyrics);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-[var(--sidebar-width)] pb-[var(--player-height)] min-h-screen">
        <div className="flex min-h-screen">
          <div className={`flex-1 transition-all duration-300 ${showLyrics ? 'mr-[400px]' : ''}`}>
            <Outlet />
          </div>
          {showLyrics && <LyricsPanel />}
        </div>
      </main>
      <BottomPlayer />
    </div>
  );
}
