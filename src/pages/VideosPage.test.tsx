import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import VideosPage from './VideosPage';
import { useMusicStore } from '@/store/musicStore';
import * as videoApi from '@/lib/video/videoApi';

vi.mock('@/lib/video/videoApi', () => ({
  searchVideos: vi.fn(),
  downloadVideoItem: vi.fn(),
}));

describe('VideosPage (2-column experimental videoclips)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMusicStore.setState({
      uiLanguageMode: 'es',
      videoQuality: '1080p',
      videoCodec: 'av1',
      videoDownloads: [],
      videoDownloadQueue: [],
      activeVideoDownloads: 0,
      downloads: [],
      downloadQueue: [],
      activeDownloads: 0,
    });
  });

  it('renders rectangular 16:9 cards in a 2-column grid with classification badges and audio shortcut', async () => {
    vi.mocked(videoApi.searchVideos).mockResolvedValue([
      {
        videoId: 'abc123DEF45',
        title: 'Daft Punk - Instant Crush (Official Video)',
        channel: 'DaftPunkVEVO',
        duration: 337,
        thumbnail: 'https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg',
        kind: 'official',
        isShort: false,
      },
      {
        videoId: 'xyz789UVW01',
        title: 'Rare Underground Cut (Official Audio)',
        channel: 'Indie - Topic',
        duration: 210,
        thumbnail: 'https://i.ytimg.com/vi/xyz789UVW01/hqdefault.jpg',
        kind: 'static_cover',
        isShort: false,
      },
    ]);

    render(
      <MemoryRouter>
        <VideosPage />
      </MemoryRouter>,
    );

    const input = screen.getByPlaceholderText(/Buscar videoclip/i);
    fireEvent.change(input, { target: { value: 'Daft Punk' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const grid = await screen.findByTestId('videoclips-grid');
    expect(grid.className).toContain('grid-cols-2');
    expect(screen.getByText('Oficial')).toBeInTheDocument();
    expect(screen.getByText('Portada fija')).toBeInTheDocument();
    expect(screen.getByText('Solo audio (M4A)')).toBeInTheDocument();
  });

  it('updates quality and codec preferences and starts MP4 download', async () => {
    vi.mocked(videoApi.searchVideos).mockResolvedValue([
      {
        videoId: 'abc123DEF45',
        title: 'Official Clip',
        channel: 'Artist',
        duration: 240,
        thumbnail: 'https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg',
        kind: 'official',
        isShort: false,
      },
    ]);
    vi.mocked(videoApi.downloadVideoItem).mockResolvedValue({
      fileName: 'Artist - Official Clip [720p].mp4',
      filePath: 'C:/Videos/MHL Music/Artist - Official Clip [720p].mp4',
      size: 123456,
    });

    render(
      <MemoryRouter>
        <VideosPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '720p' }));
    fireEvent.click(screen.getByRole('button', { name: 'H.264 · compatible' }));
    expect(useMusicStore.getState().videoQuality).toBe('720p');
    expect(useMusicStore.getState().videoCodec).toBe('h264');

    const input = screen.getByPlaceholderText(/Buscar videoclip/i);
    fireEvent.change(input, { target: { value: 'https://www.youtube.com/watch?v=abc123DEF45' } });

    const downloadBtn = await screen.findByRole('button', { name: /Descargar MP4/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(videoApi.downloadVideoItem).toHaveBeenCalledWith(
        expect.objectContaining({ videoId: 'abc123DEF45' }),
        '720p',
        'h264',
        'vid-abc123DEF45',
      );
    });
  });
});
