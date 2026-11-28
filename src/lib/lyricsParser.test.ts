import { describe, expect, it } from 'vitest';
import { findActiveLyricIndex, parseSyncedLyrics } from './lyricsParser';

describe('lyricsParser', () => {
  it('parses synced LRC timestamps and groups multi-layer lyrics sharing a timestamp', () => {
    const raw = [
      '[ti:Test Song]',
      '[00:12.50]永遠の夜',
      '[00:12.50]eien no yoru',
      '[00:12.50]Noche eterna',
      '[00:16.20]光が差す',
    ].join('\n');

    const parsed = parseSyncedLyrics(raw);
    expect(parsed.synced).toBe(true);
    expect(parsed.lines).toEqual([
      { time: 12.5, texts: ['永遠の夜', 'eien no yoru', 'Noche eterna'] },
      { time: 16.2, texts: ['光が差す'] },
    ]);
  });

  it('handles unsynced plain lyrics gracefully', () => {
    const parsed = parseSyncedLyrics('First line\nSecond line\n');
    expect(parsed.synced).toBe(false);
    expect(parsed.lines).toEqual([
      { time: -1, texts: ['First line'] },
      { time: -1, texts: ['Second line'] },
    ]);
  });

  it('finds the active lyric line index for playback time', () => {
    const parsed = parseSyncedLyrics('[00:05.00]One\n[00:10.00]Two\n[00:20.00]Three');
    expect(findActiveLyricIndex(parsed.lines, 2)).toBe(-1);
    expect(findActiveLyricIndex(parsed.lines, 5.1)).toBe(0);
    expect(findActiveLyricIndex(parsed.lines, 14)).toBe(1);
    expect(findActiveLyricIndex(parsed.lines, 25)).toBe(2);
  });
});
