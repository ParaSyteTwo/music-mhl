import { describe, expect, it } from 'vitest';
import type { VideoSearchResult } from '@/types/video';
import { classifyVideoCandidate, sortVideoCandidates } from './videoClassifier';

describe('videoClassifier', () => {
  it('classifies official music videos and VEVO channels as official', () => {
    expect(
      classifyVideoCandidate('The Weeknd - Blinding Lights (Official Video)', 'The Weeknd', 263),
    ).toEqual({ kind: 'official', isShort: false });

    expect(
      classifyVideoCandidate('Song Title', 'ArtistVEVO', 210),
    ).toEqual({ kind: 'official', isShort: false });
  });

  it('classifies Topic channels and Official Audio uploads as static_cover', () => {
    expect(
      classifyVideoCandidate('Midnight Track', 'Indie Artist - Topic', 195),
    ).toEqual({ kind: 'static_cover', isShort: false });

    expect(
      classifyVideoCandidate('Deep Cut (Official Audio)', 'Indie Label', 215),
    ).toEqual({ kind: 'static_cover', isShort: false });
  });

  it('classifies lyric videos, visualizers, live sessions, and generic videos', () => {
    expect(
      classifyVideoCandidate('Track (Lyric Video)', 'Artist', 200),
    ).toEqual({ kind: 'lyric', isShort: false });

    expect(
      classifyVideoCandidate('Track (Official Visualizer)', 'Artist', 200),
    ).toEqual({ kind: 'visualizer', isShort: false });

    expect(
      classifyVideoCandidate('Artist - Track | A COLORS SHOW', 'COLORS', 230),
    ).toEqual({ kind: 'live', isShort: false });

    expect(
      classifyVideoCandidate('Band Documentary Clip', 'Channel', 240),
    ).toEqual({ kind: 'video', isShort: false });
  });

  it('flags Shorts (< 60s) and ignores non-positive durations', () => {
    expect(
      classifyVideoCandidate('Preview clip', 'Artist', 42),
    ).toEqual({ kind: 'video', isShort: true });

    expect(
      classifyVideoCandidate('Unknown duration', 'Artist', 0),
    ).toEqual({ kind: 'video', isShort: false });
  });

  it('sorts non-Shorts ahead of Shorts and orders by visual kind priority', () => {
    const mk = (
      videoId: string,
      kind: VideoSearchResult['kind'],
      isShort = false,
    ): VideoSearchResult => ({
      videoId,
      title: videoId,
      channel: 'Channel',
      duration: isShort ? 30 : 200,
      thumbnail: '',
      kind,
      isShort,
    });

    const sorted = sortVideoCandidates([
      mk('short_official', 'official', true),
      mk('topic', 'static_cover', false),
      mk('live', 'live', false),
      mk('generic', 'video', false),
      mk('lyric', 'lyric', false),
      mk('viz', 'visualizer', false),
      mk('official_1', 'official', false),
      mk('official_2', 'official', false),
    ]);

    expect(sorted.map((s) => s.videoId)).toEqual([
      'official_1',
      'official_2',
      'viz',
      'lyric',
      'generic',
      'live',
      'topic',
      'short_official',
    ]);
  });
});
