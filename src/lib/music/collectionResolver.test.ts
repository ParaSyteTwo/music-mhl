import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getPlaylistItemsNativeMock, capacitorIsNativeMock, capacitorHttpGetMock } = vi.hoisted(() => ({
  getPlaylistItemsNativeMock: vi.fn(),
  capacitorIsNativeMock: vi.fn(),
  capacitorHttpGetMock: vi.fn(),
}));

vi.mock('@/lib/ytdlpBridge', () => ({
  getPlaylistItemsNative: getPlaylistItemsNativeMock,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: capacitorIsNativeMock,
  },
  CapacitorHttp: {
    get: capacitorHttpGetMock,
  },
}));

import {
  MAX_COLLECTION_TRACKS,
  parseSpotifyEmbedHtml,
  resolveCollectionFromUrl,
  resolveDeezerAlbumById,
} from './collectionResolver';

function clearPlatform(): void {
  window.history.replaceState({}, '', '/');
  delete (window as { pywebview?: unknown }).pywebview;
  vi.restoreAllMocks();
  getPlaylistItemsNativeMock.mockReset();
  capacitorIsNativeMock.mockReset();
  capacitorIsNativeMock.mockReturnValue(false);
  capacitorHttpGetMock.mockReset();
}

function setPyWebViewApi(api: Record<string, unknown>): void {
  (window as { pywebview?: unknown }).pywebview = { api };
}

beforeEach(() => {
  clearPlatform();
});

afterEach(() => {
  clearPlatform();
});

describe('collectionResolver', () => {
  it('exports MAX_COLLECTION_TRACKS = 50', () => {
    expect(MAX_COLLECTION_TRACKS).toBe(50);
  });

  describe('Deezer albums and playlists', () => {
    it('resolves Deezer album via Desktop bridge and inherits albumId and cover', async () => {
      const deezerAlbumMock = vi.fn().mockResolvedValue({
        id: 302127,
        title: 'Discovery',
        cover_big: 'https://cdn.deezer.com/discovery-500.jpg',
        artist: { name: 'Daft Punk' },
        nb_tracks: 2,
        tracks: {
          data: [
            {
              id: 3135553,
              title: 'One More Time',
              title_short: 'One More Time',
              duration: 320,
              artist: { name: 'Daft Punk' },
              preview: 'https://cdn.deezer.com/preview1.mp3',
              isrc: 'GBDUW0000053',
              explicit_lyrics: false,
            },
            {
              id: 3135554,
              title: 'Aerodynamic',
              duration: 212,
              artist: { name: 'Daft Punk' },
            },
          ],
        },
      });
      setPyWebViewApi({ deezer_album: deezerAlbumMock });

      const result = await resolveDeezerAlbumById(302127);

      expect(deezerAlbumMock).toHaveBeenCalledWith('302127');
      expect(result).not.toBeNull();
      expect(result).toMatchObject({
        id: 'deezer-album-302127',
        type: 'album',
        source: 'deezer',
        title: 'Discovery',
        subtitle: 'Daft Punk',
        cover: 'https://cdn.deezer.com/discovery-500.jpg',
        totalTracks: 2,
        truncated: false,
      });
      expect(result?.tracks).toHaveLength(2);
      expect(result?.tracks[0]).toMatchObject({
        id: 'dz-3135553',
        deezerId: 3135553,
        albumId: 302127,
        title: 'One More Time',
        artist: 'Daft Punk',
        album: 'Discovery',
        duration: 320,
        cover: 'https://cdn.deezer.com/discovery-500.jpg',
        isrc: 'GBDUW0000053',
        edition: 'clean',
      });
    });

    it('resolves Deezer playlist via Android fetch and caps tracks at 50 with truncated=true', async () => {
      const tracksData = Array.from({ length: 65 }, (_, i) => ({
        id: 1000 + i,
        title: `Track ${i + 1}`,
        duration: 180 + i,
        artist: { name: `Artist ${i + 1}` },
        album: {
          id: 5000 + i,
          title: `Album ${i + 1}`,
          cover_big: `https://cdn.deezer.com/cover-${i + 1}.jpg`,
        },
      }));

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 908622995,
          title: 'Mega Mix',
          picture_big: 'https://cdn.deezer.com/playlist-500.jpg',
          creator: { name: 'Deezer Editorial' },
          nb_tracks: 75,
          tracks: { data: tracksData },
        }), { status: 200 }),
      );

      const result = await resolveCollectionFromUrl('https://www.deezer.com/es/playlist/908622995');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.deezer.com/playlist/908622995',
        expect.any(Object),
      );
      expect(result).not.toBeNull();
      expect(result?.type).toBe('playlist');
      expect(result?.source).toBe('deezer');
      expect(result?.tracks).toHaveLength(50);
      expect(result?.totalTracks).toBe(75);
      expect(result?.truncated).toBe(true);
      expect(result?.tracks[0].albumId).toBe(5000);
    });

    it('rejects non-numeric Deezer album IDs without making requests', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      expect(await resolveDeezerAlbumById('../etc/passwd')).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('YouTube & YouTube Music playlists', () => {
    it('resolves YouTube playlist via Desktop bridge, cleans titles, and sets youtubeId directly', async () => {
      const getPlaylistItemsMock = vi.fn().mockResolvedValue({
        success: true,
        title: 'Anime Openings Classics',
        uploader: 'Paul',
        totalTracks: 3,
        items: [
          {
            videoId: 'abc12345678',
            title: 'LiSA - Gurenge (Official Music Video)',
            channel: 'LiSA Official',
            duration: 237,
          },
          {
            videoId: 'del99999999',
            title: '[Deleted video]',
            channel: '',
            duration: 0,
          },
          {
            videoId: 'xyz98765432',
            title: 'Unravel',
            channel: 'TK from Ling tosiste sigure - Topic',
            duration: 238,
            thumbnail: 'https://i.ytimg.com/vi/xyz98765432/hqdefault.jpg',
          },
        ],
      });
      setPyWebViewApi({ get_playlist_items: getPlaylistItemsMock });

      const result = await resolveCollectionFromUrl(
        'https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj&si=noise',
      );

      expect(getPlaylistItemsMock).toHaveBeenCalledWith(
        'https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj',
        50,
      );
      expect(result).not.toBeNull();
      expect(result?.source).toBe('youtube');
      expect(result?.title).toBe('Anime Openings Classics');
      expect(result?.tracks).toHaveLength(2);
      expect(result?.tracks[0]).toMatchObject({
        id: 'yt_abc12345678',
        youtubeId: 'abc12345678',
        artist: 'LiSA',
        title: 'Gurenge',
        duration: 237,
      });
      expect(result?.tracks[0].sourceUrl).toBeUndefined();
      expect(result?.tracks[1]).toMatchObject({
        id: 'yt_xyz98765432',
        youtubeId: 'xyz98765432',
        artist: 'TK from Ling tosiste sigure',
        title: 'Unravel',
      });
      expect(result?.tracks[1].sourceUrl).toBeUndefined();
    });

    it('resolves YouTube Music playlist on Android via getPlaylistItemsNative', async () => {
      getPlaylistItemsNativeMock.mockResolvedValueOnce({
        success: true,
        title: 'YT Music Mix',
        items: [
          {
            videoId: 'vid00000001',
            title: 'YOASOBI - Idol [Official Audio]',
            channel: 'YOASOBI - Topic',
            duration: 213,
          },
        ],
      });

      const result = await resolveCollectionFromUrl(
        'https://music.youtube.com/playlist?list=OLAK5uy_n0xyz123456',
      );

      expect(getPlaylistItemsNativeMock).toHaveBeenCalledWith(
        'https://music.youtube.com/playlist?list=OLAK5uy_n0xyz123456',
        50,
      );
      expect(result?.tracks[0]).toMatchObject({
        youtubeId: 'vid00000001',
        artist: 'YOASOBI',
        title: 'Idol',
      });
      expect(result?.tracks[0].sourceUrl).toBeUndefined();
    });

    it('rejects malicious YouTube playlist IDs starting with hyphen', async () => {
      const result = await resolveCollectionFromUrl('https://www.youtube.com/playlist?list=--exec=calc123');
      expect(result).toBeNull();
      expect(getPlaylistItemsNativeMock).not.toHaveBeenCalled();
    });
  });

  describe('Spotify albums and playlists', () => {
    const buildEmbedHtml = (trackCount = 2) => {
      const trackList = Array.from({ length: trackCount }, (_, idx) => ({
        uri: `spotify:track:trk${idx + 1}abcdef`,
        title: `Song ${idx + 1}`,
        subtitle: `Artist ${idx + 1}`,
        duration: 205000 + idx * 1000,
        isExplicit: idx === 0,
      }));
      const nextData = {
        props: {
          pageProps: {
            state: {
              data: {
                entity: {
                  name: 'Random Access Memories',
                  subtitle: 'Daft Punk',
                  visualIdentity: {
                    image: [
                      { url: 'https://i.scdn.co/image/small.jpg', maxWidth: 64 },
                      { url: 'https://i.scdn.co/image/large.jpg', maxWidth: 640 },
                    ],
                  },
                  trackList,
                },
              },
            },
          },
        },
      };
      return `<!doctype html><html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`;
    };

    it('resolves Spotify album via Desktop spotify_embed_fetch without attaching Spotify sourceUrl', async () => {
      const spotifyFetchMock = vi.fn().mockResolvedValue({
        success: true,
        html: buildEmbedHtml(2),
      });
      setPyWebViewApi({ spotify_embed_fetch: spotifyFetchMock });

      const result = await resolveCollectionFromUrl(
        'https://open.spotify.com/intl-es/album/4aawyAB9vmqN3uQ7FjRGTy?si=xyz',
      );

      expect(spotifyFetchMock).toHaveBeenCalledWith(
        'https://open.spotify.com/embed/album/4aawyAB9vmqN3uQ7FjRGTy',
      );
      expect(result).not.toBeNull();
      expect(result).toMatchObject({
        id: 'spotify-album-4aawyAB9vmqN3uQ7FjRGTy',
        type: 'album',
        source: 'spotify',
        title: 'Random Access Memories',
        subtitle: 'Daft Punk',
        cover: 'https://i.scdn.co/image/large.jpg',
        totalTracks: 2,
        truncated: false,
      });
      expect(result?.tracks[0]).toMatchObject({
        id: 'sp_trk1abcdef',
        title: 'Song 1',
        artist: 'Artist 1',
        duration: 205,
        edition: 'explicit',
      });
      expect(result?.tracks[0].sourceUrl).toBeUndefined();
    });

    it('resolves Spotify playlist on Android via CapacitorHttp and enforces 50-track cap', async () => {
      capacitorIsNativeMock.mockReturnValue(true);
      capacitorHttpGetMock.mockResolvedValueOnce({
        status: 200,
        data: buildEmbedHtml(60),
      });

      const result = await resolveCollectionFromUrl(
        'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
      );

      expect(capacitorHttpGetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M',
        }),
      );
      expect(result).not.toBeNull();
      expect(result?.type).toBe('playlist');
      expect(result?.tracks).toHaveLength(50);
      expect(result?.totalTracks).toBe(60);
      expect(result?.truncated).toBe(true);
    });

    it('returns null gracefully when Spotify embed HTML has invalid JSON or missing __NEXT_DATA__', () => {
      expect(parseSpotifyEmbedHtml('<html><body>No data</body></html>', 'album', '4aawyAB9vmqN3uQ7FjRGTy')).toBeNull();
      expect(
        parseSpotifyEmbedHtml('<script id="__NEXT_DATA__">{invalid json</script>', 'playlist', '37i9dQZF1DXcBWIGoYBM5M'),
      ).toBeNull();
    });
  });

  it('returns null for unsupported URLs', async () => {
    expect(await resolveCollectionFromUrl('https://open.spotify.com/artist/0OdUWJ0sBjDrqHygGUXeCF')).toBeNull();
    expect(await resolveCollectionFromUrl('not a url')).toBeNull();
  });
});
