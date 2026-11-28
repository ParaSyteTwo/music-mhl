import { StateCreator } from 'zustand';
import { addDownloadProgressListener } from '@/lib/ytdlpBridge';
import { downloadVideoItem } from '@/lib/video/videoApi';
import type {
  VideoCodecPreference,
  VideoDownloadItem,
  VideoQuality,
  VideoSearchResult,
} from '@/types/video';
import type { MusicStore, VideoSlice } from './types';

let processingVideoQueue = false;

export const createVideoSlice: StateCreator<
  MusicStore,
  [],
  [],
  VideoSlice
> = (set, get) => ({
  videoQuality: '1080p',
  videoCodec: 'av1',
  videoDownloads: [],
  videoDownloadQueue: [],
  activeVideoDownloads: 0,

  setVideoQuality: (quality: VideoQuality) => set({ videoQuality: quality }),
  setVideoCodec: (codec: VideoCodecPreference) => set({ videoCodec: codec }),

  startVideoDownload: (video: VideoSearchResult) => {
    const id = `vid-${video.videoId}`;
    const existing = get().videoDownloads.find((item) => item.id === id);
    if (existing && (existing.status === 'downloading' || existing.status === 'queued')) {
      return;
    }

    const { videoQuality, videoCodec } = get();
    const newItem: VideoDownloadItem = {
      id,
      video,
      quality: videoQuality,
      codec: videoCodec,
      status: 'queued',
      progress: 0,
      createdAt: Date.now(),
    };

    set((state) => ({
      videoDownloads: [newItem, ...state.videoDownloads.filter((item) => item.id !== id)],
      videoDownloadQueue: [...state.videoDownloadQueue.filter((qId) => qId !== id), id],
    }));

    void get().processVideoDownloadQueue();
  },

  removeVideoDownload: (id: string) => {
    set((state) => ({
      videoDownloads: state.videoDownloads.filter((item) => item.id !== id),
      videoDownloadQueue: state.videoDownloadQueue.filter((qId) => qId !== id),
    }));
  },

  clearCompletedVideoDownloads: () => {
    set((state) => ({
      videoDownloads: state.videoDownloads.filter((item) => item.status !== 'completed'),
    }));
  },

  processVideoDownloadQueue: async () => {
    if (processingVideoQueue) return;
    processingVideoQueue = true;
    try {
      while (true) {
        const state = get();
        if (state.activeVideoDownloads >= 1) break;
        const nextId = state.videoDownloadQueue[0];
        if (!nextId) break;

        const targetItem = state.videoDownloads.find((item) => item.id === nextId);
        const runToken = targetItem?.createdAt;
        set((curr) => ({
          videoDownloadQueue: curr.videoDownloadQueue.slice(1),
          activeVideoDownloads: targetItem ? curr.activeVideoDownloads + 1 : curr.activeVideoDownloads,
          videoDownloads: targetItem
            ? curr.videoDownloads.map((item) =>
                item.id === nextId && item.createdAt === runToken
                  ? { ...item, status: 'downloading', progress: 5, error: undefined }
                  : item,
              )
            : curr.videoDownloads,
        }));

        if (!targetItem) continue;

        let progressListener: { remove: () => Promise<void> } | null = null;
        try {
          progressListener = await addDownloadProgressListener((event) => {
            if (event.downloadId !== nextId) return;
            set((curr) => ({
              videoDownloads: curr.videoDownloads.map((item) =>
                item.id === nextId && item.createdAt === runToken && item.status === 'downloading'
                  ? {
                      ...item,
                      progress: Math.max(item.progress, Math.min(98, event.progress)),
                      speed: event.speed || item.speed,
                      eta: event.eta ?? item.eta,
                    }
                  : item,
              ),
            }));
          });

          const saved = await downloadVideoItem(
            targetItem.video,
            targetItem.quality,
            targetItem.codec,
            nextId,
          );

          set((curr) => ({
            videoDownloads: curr.videoDownloads.map((item) =>
              item.id === nextId && item.createdAt === runToken
                ? {
                    ...item,
                    status: 'completed',
                    progress: 100,
                    fileName: saved.fileName,
                    filePath: saved.filePath,
                    mediaUri: saved.mediaUri,
                    size: saved.size,
                    speed: undefined,
                    eta: undefined,
                  }
                : item,
            ),
          }));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          set((curr) => ({
            videoDownloads: curr.videoDownloads.map((item) =>
              item.id === nextId && item.createdAt === runToken
                ? {
                    ...item,
                    status: 'error',
                    error: message || 'Video download failed',
                    speed: undefined,
                    eta: undefined,
                  }
                : item,
            ),
          }));
        } finally {
          if (progressListener) {
            try {
              await progressListener.remove();
            } catch {
              // ignore cleanup errors
            }
          }
          set((curr) => ({
            activeVideoDownloads: Math.max(0, curr.activeVideoDownloads - 1),
          }));
        }
      }
    } finally {
      processingVideoQueue = false;
    }
  },
});
