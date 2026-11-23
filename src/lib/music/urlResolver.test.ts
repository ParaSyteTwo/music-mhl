import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isDirectMediaUrl,
  cleanVideoTitle,
  resolveTrackFromUrl,
  extractYouTubePlaylistId,
  extractDeezerCollection,
  extractSpotifyCollection,
  isSupportedCollectionUrl,
  isUnsupportedCollectionUrl,
} from './urlResolver';

vi.mock('@/lib/api/musicApi', () => ({
  searchDeezer: vi.fn(),
}));

import { searchDeezer } from '@/lib/api/musicApi';

describe('urlResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isDirectMediaUrl', () => {
    it('detects YouTube watch and short URLs with complex parameters', () => {
      expect(isDirectMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
      expect(isDirectMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=45s&si=xyz123')).toBe(true);
      expect(isDirectMediaUrl('https://youtu.be/dQw4w9WgXcQ?si=abcdef12345')).toBe(true);
      expect(isDirectMediaUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
      expect(isDirectMediaUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(true);
    });

    it('detects Spotify track URLs including international regional prefixes', () => {
      expect(isDirectMediaUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')).toBe(true);
      expect(isDirectMediaUrl('https://open.spotify.com/intl-es/track/4cOdK2wGLETKBW3PvgPWqT?si=abc')).toBe(true);
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

    it('detects long audio / podcasts from title and flags isLongAudio and isPodcast', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: 'The Daily Tech Podcast - Episodio 142 (Full Concert & Discussion)',
          author_name: 'TechPod',
          thumbnail_url: 'https://i.ytimg.com/vi/pod12345678/hqdefault.jpg',
        }),
      });

      vi.mocked(searchDeezer).mockResolvedValueOnce([]);

      const track = await resolveTrackFromUrl('https://www.youtube.com/watch?v=pod12345678');
      expect(track).not.toBeNull();
      expect(track?.isLongAudio).toBe(true);
      expect(track?.isPodcast).toBe(true);
    });

    it('rejects channel or user profile URLs', async () => {
      const track = await resolveTrackFromUrl('https://www.youtube.com/@TheBestMusicChannel');
      expect(track).toBeNull();
    });

    it('resolves Spotify URL purely as verifier without attaching Spotify audio stream', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: 'Kanaria - 革命道中 - On The Way by Kanaria',
        }),
      });

      vi.mocked(searchDeezer).mockResolvedValueOnce([
        {
          id: 'dz-kanaria-1',
          title: '革命道中 - On The Way',
          artist: 'Kanaria',
          album: 'Kanaria Album',
          duration: 180,
          cover: 'https://cover.jpg',
        },
      ]);

      const track = await resolveTrackFromUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
      expect(track).not.toBeNull();
      expect(track?.title).toBe('革命道中 - On The Way');
      expect(track?.artist).toBe('Kanaria');
      expect(track?.sourceUrl).toBeUndefined();
    });

    it('resolves Apple Music URL and bridges to Deezer studio track', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: 'Stay',
          author_name: 'The Kid LAROI, Justin Bieber',
        }),
      });

      vi.mocked(searchDeezer).mockResolvedValueOnce([
        {
          id: 'dz-stay',
          title: 'Stay',
          artist: 'The Kid LAROI',
          album: 'F*CK LOVE 3',
          duration: 141,
          cover: 'https://cover-stay.jpg',
        },
      ]);

      const track = await resolveTrackFromUrl('https://music.apple.com/us/album/stay/1574984448?i=1574984450');
      expect(track).not.toBeNull();
      expect(track?.title).toBe('Stay');
      expect(track?.artist).toBe('The Kid LAROI');
    });

    it('returns null for supported collection URLs so collectionResolver handles them', async () => {
      expect(await resolveTrackFromUrl('https://www.deezer.com/album/302127')).toBeNull();
      expect(await resolveTrackFromUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toBeNull();
      expect(await resolveTrackFromUrl('https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj')).toBeNull();
    });

    it('returns null for Apple Music album URLs without track parameter ?i=', async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;
      expect(await resolveTrackFromUrl('https://music.apple.com/us/album/discovery/697194953')).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns null for unresolved deezer.page.link short URLs instead of Audio Directo fallback', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const track = await resolveTrackFromUrl('https://deezer.page.link/abcXYZ123');
      expect(track).toBeNull();
    });
  });

  describe('collection URL extractors & classification', () => {
    it('extracts valid YouTube and YouTube Music playlist IDs and rejects watch URLs or unsafe IDs', () => {
      expect(extractYouTubePlaylistId('https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj')).toBe('PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj');
      expect(extractYouTubePlaylistId('https://music.youtube.com/playlist?list=OLAK5uy_n0xyz123456')).toBe('OLAK5uy_n0xyz123456');
      expect(extractYouTubePlaylistId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj')).toBeNull();
      expect(extractYouTubePlaylistId('https://www.youtube.com/playlist?list=short')).toBeNull();
      expect(extractYouTubePlaylistId('https://www.youtube.com/playlist?list=--exec=calc123')).toBeNull();
      expect(extractYouTubePlaylistId('https://evil.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj')).toBeNull();
    });

    it('extracts Deezer album and playlist collections with optional locale prefix', () => {
      expect(extractDeezerCollection('https://www.deezer.com/album/302127')).toEqual({ type: 'album', id: '302127' });
      expect(extractDeezerCollection('https://www.deezer.com/es/playlist/908622995?utm=share')).toEqual({ type: 'playlist', id: '908622995' });
      expect(extractDeezerCollection('https://www.deezer.com/artist/27')).toBeNull();
      expect(extractDeezerCollection('https://www.deezer.com/track/3135556')).toBeNull();
    });

    it('extracts Spotify album and playlist collections including intl and embed prefixes', () => {
      expect(extractSpotifyCollection('https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy')).toEqual({
        type: 'album',
        id: '4aawyAB9vmqN3uQ7FjRGTy',
      });
      expect(extractSpotifyCollection('https://open.spotify.com/intl-es/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc')).toEqual({
        type: 'playlist',
        id: '37i9dQZF1DXcBWIGoYBM5M',
      });
      expect(extractSpotifyCollection('https://open.spotify.com/embed/album/4aawyAB9vmqN3uQ7FjRGTy')).toEqual({
        type: 'album',
        id: '4aawyAB9vmqN3uQ7FjRGTy',
      });
      expect(extractSpotifyCollection('https://open.spotify.com/artist/0OdUWJ0sBjDrqHygGUXeCF')).toBeNull();
      expect(extractSpotifyCollection('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')).toBeNull();
    });

    it('classifies supported vs unsupported collection URLs accurately', () => {
      // Supported collections -> isSupportedCollectionUrl = true, isUnsupportedCollectionUrl = false
      const supported = [
        'https://www.deezer.com/album/302127',
        'https://www.deezer.com/es/playlist/908622995',
        'https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy',
        'https://open.spotify.com/intl-es/playlist/37i9dQZF1DXcBWIGoYBM5M',
        'https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj',
        'https://music.youtube.com/playlist?list=OLAK5uy_n0xyz123456',
      ];
      for (const url of supported) {
        expect(isSupportedCollectionUrl(url)).toBe(true);
        expect(isUnsupportedCollectionUrl(url)).toBe(false);
      }

      // Unsupported collections / profiles -> isSupportedCollectionUrl = false, isUnsupportedCollectionUrl = true
      const unsupported = [
        'https://open.spotify.com/artist/0OdUWJ0sBjDrqHygGUXeCF',
        'https://open.spotify.com/user/someone123',
        'https://www.deezer.com/artist/27',
        'https://tidal.com/browse/album/123456',
        'https://tidal.com/playlist/abc-123',
        'https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb',
        'https://music.apple.com/us/album/discovery/697194953',
        'https://music.apple.com/album/discovery/697194953',
        'https://soundcloud.com/someartist/sets/my-playlist',
      ];
      for (const url of unsupported) {
        expect(isSupportedCollectionUrl(url)).toBe(false);
        expect(isUnsupportedCollectionUrl(url)).toBe(true);
      }

      // Apple Music album URL with ?i= points to a single song, NOT an unsupported collection
      expect(isUnsupportedCollectionUrl('https://music.apple.com/us/album/stay/1574984448?i=1574984450')).toBe(false);
    });
  });
});
