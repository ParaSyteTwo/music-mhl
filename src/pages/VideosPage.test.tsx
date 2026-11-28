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

  it('renders unified SearchPage hero aesthetic and rectangular 16:9 cards in a 2-column grid', async () => {
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

    const { container } = render(
      <MemoryRouter>
        <VideosPage />
      </MemoryRouter>,
    );

    expect(container.querySelector('.home-hero')).not.toBeNull();
    expect(container.querySelectorAll('.home-hero-orb').length).toBe(2);
    expect(screen.queryByRole('button', { name: '720p' })).toBeNull();
    expect(screen.queryByRole('button', { name: /H\.264/i })).toBeNull();

    const input = screen.getByPlaceholderText(/Buscar videoclip/i);
    fireEvent.change(input, { target: { value: 'Daft Punk' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const grid = await screen.findByTestId('videoclips-grid');
    expect(grid.className).toContain('grid-cols-2');
    expect(videoApi.searchVideos).toHaveBeenCalledWith('Daft Punk', 12, 'es');
    expect(screen.getByText('Oficial')).toBeInTheDocument();
    expect(screen.getByText('Portada fija')).toBeInTheDocument();
    expect(screen.getByText('Solo audio (M4A)')).toBeInTheDocument();
  });

  it('passes effective UI language to searchVideos and uses stored video settings on MP4 download', async () => {
    useMusicStore.setState({
      uiLanguageMode: 'en',
      videoQuality: '720p',
      videoCodec: 'h264',
    });

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

    const input = screen.getByPlaceholderText(/Search music video/i);
    fireEvent.change(input, { target: { value: 'https://www.youtube.com/watch?v=abc123DEF45' } });

    await waitFor(() => {
      expect(videoApi.searchVideos).toHaveBeenCalledWith(
        'https://www.youtube.com/watch?v=abc123DEF45',
        12,
        'en',
      );
    });

    const downloadBtn = await screen.findByRole('button', { name: /Download MP4/i });
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

  it('renders videoDownloads queue rows using dl.video.thumbnail and dl.video.title', () => {
    useMusicStore.setState({
      videoDownloads: [
        {
          id: 'vid-abc123DEF45',
          video: {
            videoId: 'abc123DEF45',
            title: 'Nested Clip Title',
            channel: 'Artist',
            duration: 180,
            thumbnail: 'https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg',
            kind: 'official',
            isShort: false,
          },
          quality: '1080p',
          codec: 'av1',
          status: 'completed',
          progress: 100,
          fileName: 'Artist - Nested Clip Title [1080p].mp4',
          createdAt: 1700000000000,
        },
      ],
    });

    render(
      <MemoryRouter>
        <VideosPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Nested Clip Title')).toBeInTheDocument();
    const thumb = screen.getByAltText('Nested Clip Title') as HTMLImageElement;
    expect(thumb.src).toContain('https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg');
  });
});
