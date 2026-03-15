import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useMusicStore } from '@/store/musicStore';

type MainTab = 'karaoke' | 'letra';
type SubTab = 'original' | 'translated';

interface LyricLine {
  time: number; // in seconds
  text: string;
}

function parseSyncedLyrics(syncedLyrics: string): LyricLine[] {
  if (!syncedLyrics) return [];

  const lines: LyricLine[] = [];
  const pattern = /\[(\d{2}):(\d{2})\.(\d{2})\](.*)/g;
  let match;

  while ((match = pattern.exec(syncedLyrics)) !== null) {
    const minutes = parseInt(match[1]);
    const seconds = parseInt(match[2]);
    const milliseconds = parseInt(match[3]);
    const time = minutes * 60 + seconds + milliseconds / 100;
    const text = match[4].trim();

    if (text) {
      lines.push({ time, text });
    }
  }

  return lines;
}

export function LyricsPanel() {
  const { player } = useMusicStore();
  const [mainTab, setMainTab] = useState<MainTab>('letra');
  const [subTab, setSubTab] = useState<SubTab>('original');
  const [syncedLines, setSyncedLines] = useState<LyricLine[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const karaokeRef = useRef<HTMLDivElement>(null);
  const letraRef = useRef<HTMLDivElement>(null);
  const currentLineRef = useRef<HTMLDivElement>(null);

  const currentTrack = player.currentTrack;
  const progress = player.progress;
  const isTranslating = player.isTranslating;
  const { loadTranslation } = useMusicStore();

  // Parse synced lyrics when they change
  useEffect(() => {
    if (currentTrack?.syncedLyrics) {
      const parsed = parseSyncedLyrics(currentTrack.syncedLyrics);
      setSyncedLines(parsed);
    } else {
      setSyncedLines([]);
    }
  }, [currentTrack?.syncedLyrics]);

  // Update current line index based on progress
  useEffect(() => {
    if (syncedLines.length === 0) return;

    const currentIndex = syncedLines.findIndex((line, idx) => {
      const nextLine = syncedLines[idx + 1];
      return progress >= line.time && (!nextLine || progress < nextLine.time);
    });

    if (currentIndex !== -1) {
      setCurrentLineIndex(currentIndex);
    }
  }, [progress, syncedLines]);

  // Auto-scroll karaoke view
  useEffect(() => {
    if (mainTab === 'karaoke' && currentLineRef.current && karaokeRef.current) {
      currentLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentLineIndex, mainTab]);

  if (!currentTrack || (!currentTrack.lyrics && !currentTrack.syncedLyrics)) {
    return (
      <div className="flex items-center justify-center py-12 text-[#333330]">
        <p className="text-sm">No hay letra disponible para esta canción</p>
      </div>
    );
  }

  const displayLyrics = subTab === 'original'
    ? currentTrack.lyrics
    : currentTrack.translatedLyrics;

  const canTranslate = currentTrack.lyrics && !currentTrack.translatedLyrics && navigator.language.split('-')[0] !== 'en';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-syne text-lg font-bold text-[#F5F5F0]">Letra</h2>
        {canTranslate && (
          <button
            onClick={() => loadTranslation(currentTrack)}
            disabled={isTranslating}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#C8F04B]/10 text-[#C8F04B] hover:bg-[#C8F04B]/20 disabled:opacity-50 transition-colors"
          >
            {isTranslating ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Traduciendo...</span>
              </>
            ) : (
              <span>Traducir ahora</span>
            )}
          </button>
        )}
      </div>

      {/* Main Tabs */}
      <div className="flex gap-2 border-b border-[rgba(255,255,255,0.06)]">
        <button
          onClick={() => setMainTab('letra')}
          className={`px-4 py-2 font-dm-sans text-sm transition-colors ${
            mainTab === 'letra'
              ? 'text-[#C8F04B] border-b-2 border-[#C8F04B]'
              : 'text-[#666660] hover:text-[#F5F5F0]'
          }`}
        >
          Letra
        </button>
        {currentTrack.syncedLyrics && (
          <button
            onClick={() => setMainTab('karaoke')}
            className={`px-4 py-2 font-dm-sans text-sm transition-colors ${
              mainTab === 'karaoke'
                ? 'text-[#C8F04B] border-b-2 border-[#C8F04B]'
                : 'text-[#666660] hover:text-[#F5F5F0]'
            }`}
          >
            Karaoke
          </button>
        )}
      </div>

      {/* Sub Tabs - Show only if translated lyrics available */}
      {currentTrack.translatedLyrics && (
        <div className="flex gap-2 border-b border-[rgba(255,255,255,0.06)]">
          <button
            onClick={() => setSubTab('original')}
            className={`px-3 py-1.5 font-dm-sans text-xs transition-colors ${
              subTab === 'original'
                ? 'text-[#C8F04B]'
                : 'text-[#666660] hover:text-[#F5F5F0]'
            }`}
          >
            Original
          </button>
          <button
            onClick={() => setSubTab('translated')}
            className={`px-3 py-1.5 font-dm-sans text-xs transition-colors ${
              subTab === 'translated'
                ? 'text-[#C8F04B]'
                : 'text-[#666660] hover:text-[#F5F5F0]'
            }`}
          >
            {navigator.language.split('-')[0].toUpperCase()}
          </button>
        </div>
      )}

      {/* Content */}
      <div className="relative h-[400px] rounded-lg bg-[rgba(0,0,0,0.4)] backdrop-blur-sm overflow-hidden">
        {/* LETRA VIEW */}
        {mainTab === 'letra' && (
          <div
            ref={letraRef}
            className="h-full overflow-y-auto px-6 py-4 text-[#F5F5F0] font-dm-sans text-sm"
            style={{
              lineHeight: '1.8',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255,255,255,0.1) transparent',
            }}
          >
            <style>{`
              div::-webkit-scrollbar { width: 4px; }
              div::-webkit-scrollbar-track { background: transparent; }
              div::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
              div::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
            `}</style>
            <pre className="whitespace-pre-wrap break-words font-dm-sans">
              {displayLyrics || 'No hay letra disponible'}
            </pre>
          </div>
        )}

        {/* KARAOKE VIEW */}
        {mainTab === 'karaoke' && (
          <div
            ref={karaokeRef}
            className="h-full overflow-y-auto px-6 py-8 space-y-3"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255,255,255,0.1) transparent',
            }}
          >
            {syncedLines.length > 0 ? (
              syncedLines.map((line, idx) => (
                <div
                  key={idx}
                  ref={idx === currentLineIndex ? currentLineRef : undefined}
                  className={`px-4 py-2 rounded-lg transition-all font-syne font-bold ${
                    idx === currentLineIndex
                      ? 'text-[#C8F04B] bg-[rgba(200,240,75,0.15)] scale-105'
                      : idx < currentLineIndex
                      ? 'text-[#666660]'
                      : 'text-[#999999]'
                  }`}
                  style={{
                    fontSize: idx === currentLineIndex ? '18px' : '16px',
                  }}
                >
                  {line.text}
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center h-full text-[#333330]">
                <p className="text-sm">No hay letra sincronizada disponible</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Time display for karaoke */}
      {mainTab === 'karaoke' && (
        <div className="text-right text-xs text-[#666660]">
          {Math.floor(progress / 60)}:{(progress % 60).toString().padStart(2, '0')} /{' '}
          {Math.floor(currentTrack.duration / 60)}:{(currentTrack.duration % 60).toString().padStart(2, '0')}
        </div>
      )}
    </div>
  );
}

export default LyricsPanel;
