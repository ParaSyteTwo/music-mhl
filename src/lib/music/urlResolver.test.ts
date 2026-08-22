import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isDirectMediaUrl, cleanVideoTitle, resolveTrackFromUrl } from './urlResolver';

vi.mock('@/lib/api/musicApi', () => ({
  searchDeezer: vi.fn(),
}));

import { searchDeezer } from '@/lib/api/musicApi';

describe('urlResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isDirectMediaUrl', () => {
    it('detects YouTube watch and short URLs', () => {
      expect(isDirectMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
      expect(isDirectMediaUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
      expect(isDirectMediaUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
      expect(isDirectMediaUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(true);
    });

    it('detects Spotify track URLs', () => {
      expect(isDirectMediaUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')).toBe(true);
    });

    it('detects SoundCloud URLs', () => {
      expect(isDirectMediaUrl('https://soundcloud.com/artist/song-title')).toBe(true);
    });

    it('rejects regular search terms', () => {
      expect(isDirectMediaUrl('Bad Bunny DtMF')).toBe(false);
      expect(isDirectMediaUrl('Feid Luna')).toBe(false);
      expect(isDirectMediaUrl('Queen Bohemian Rhapsody')).toBe(false);
    });
  });

  describe('cleanVideoTitle', () => {
    it('cleans official video noise and separates Artist and Title', () => {
      const result = cleanVideoTitle('ROSALÍA - DESPECHÁ (Official Video)');
      expect(result.artist).toBe('ROSALÍA');
      expect(result.title).toBe('DESPECHÁ');
    });

    it('cleans audio and 4K tags', () => {
      const result = cleanVideoTitle('Feid, Young Miko - CLASSY 101 [Official Audio] [4K]');
      expect(result.artist).toBe('Feid, Young Miko');
      expect(result.title).toBe('CLASSY 101');
    });

    it('handles titles without hyphens', () => {
      const result = cleanVideoTitle('Despacito (Video Oficial)');
      expect(result.title).toBe('Despacito');
      expect(result.artist).toBeUndefined();
    });
  });

  describe('resolveTrackFromUrl', () => {
    it('resolves YouTube URL and enriches with Deezer studio track when available', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: 'Queen - Bohemian Rhapsody (Official Music Video)',
          author_name: 'Queen Official',
          thumbnail_url: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg',
        }),
      });

      vi.mocked(searchDeezer).mockResolvedValueOnce([
        {
          id: 'dz-12345',
          title: 'Bohemian Rhapsody',
          artist: 'Queen',
          album: 'A Night At The Opera',
          duration: 354,
          cover: 'https://e-cdns-images.dzcdn.net/images/cover/123/500x500.jpg',
        },
      ]);

      const track = await resolveTrackFromUrl('https://www.youtube.com/watch?v=fJ9rUzIMcZQ');
      expect(track).not.toBeNull();
      expect(track?.title).toBe('Bohemian Rhapsody');
      expect(track?.artist).toBe('Queen');
      expect(track?.album).toBe('A Night At The Opera');
      expect(track?.youtubeId).toBe('fJ9rUzIMcZQ');
      expect(track?.sourceUrl).toBe('https://www.youtube.com/watch?v=fJ9rUzIMcZQ');
    });

    it('falls back to YouTube video details if Deezer returns no results', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: 'Unknown Indie Artist - Cool Rare Track',
          author_name: 'IndieChannel - Topic',
          thumbnail_url: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg',
        }),
      });

      vi.mocked(searchDeezer).mockResolvedValueOnce([]);

      const track = await resolveTrackFromUrl('https://youtu.be/abc12345678');
      expect(track).not.toBeNull();
      expect(track?.title).toBe('Cool Rare Track');
      expect(track?.artist).toBe('Unknown Indie Artist');
      expect(track?.cover).toBe('https://i.ytimg.com/vi/abc12345678/hqdefault.jpg');
      expect(track?.youtubeId).toBe('abc12345678');
    });
  });
});
