import { describe, expect, it, vi } from 'vitest';
import {
  buildLRC,
  detectLatinLyricLanguage,
  processLyrics,
  romanizeLines,
  shouldTranslateLyrics,
  translateLines,
} from './lyricsProcessor';

describe('lyrics language decisions', () => {
  it('detects common Spanish lyric text', () => {
    expect(detectLatinLyricLanguage('Yo quiero que tu amor este en mi corazon y en mi vida')).toBe('es');
    expect(detectLatinLyricLanguage('Baila conmigo toda la noche, sigo mirando tus ojos')).toBe('es');
  });

  it('detects common English lyric text', () => {
    expect(detectLatinLyricLanguage('I want your love in my heart and in my life tonight')).toBe('en');
  });

  it('does not translate when source and target match', () => {
    expect(shouldTranslateLyrics('es', 'es', true)).toBe(false);
    expect(shouldTranslateLyrics('en', 'en', true)).toBe(false);
    expect(shouldTranslateLyrics('ja', 'ja', true)).toBe(false);
  });

  it('skips MyMemory translation when Japanese song already targets Japanese', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const result = await processLyrics('[00:01.00]君のことが好きだよ', '', {
      lyricOriginal: true,
      lyricRomanization: false,
      lyricTranslation: true,
      deviceLang: 'ja',
    });

    expect(result.synced).toBe('[00:01.00]君のことが好きだよ');
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('translates when source and target differ', () => {
    expect(shouldTranslateLyrics('es', 'en', true)).toBe(true);
    expect(shouldTranslateLyrics('en', 'es', true)).toBe(true);
  });

  it('only translates unknown source when the toggle is enabled', () => {
    expect(shouldTranslateLyrics('unknown', 'es', true)).toBe(true);
    expect(shouldTranslateLyrics('unknown', 'es', false)).toBe(false);
  });

  it('does not duplicate Spanish lyrics when target is Spanish', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const result = await processLyrics('[00:01.00]Yo quiero tu amor', '', {
      lyricOriginal: true,
      lyricRomanization: false,
      lyricTranslation: true,
      deviceLang: 'es',
    });

    expect(result.synced).toBe('[00:01.00]Yo quiero tu amor');
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('deduplicates equal original, romanization, and translation layers per timestamp', () => {
    expect(buildLRC(
      '[00:01.00]Cómo te quiero',
      ['Como te quiero'],
      ['¿Cómo te quiero!'],
      { original: true, romanization: true, translation: true },
    )).toEqual({
      synced: '[00:01.00]Cómo te quiero',
      plain: 'Cómo te quiero',
    });
  });

  it('romanizes Korean without Node-only modules', async () => {
    const result = await romanizeLines(['사랑해'], 'korean');
    expect(result[0]).not.toBe('사랑해');
  });

  it('romanizes Japanese and Korean independently in mixed lyrics', async () => {
    const result = await romanizeLines(['かな', '사랑해', 'Magic'], 'japanese');
    expect(result[0]).not.toBe('かな');
    expect(result[1]).not.toBe('사랑해');
    expect(result[2]).toBe('Magic');
  });

  it('writes one physical LRC entry per timestamp when several layers are enabled', () => {
    const result = buildLRC(
      '[00:01.00]愛してる',
      ['aishiteru'],
      ['Te quiero'],
      { original: true, romanization: true, translation: true },
    );
    expect(result.synced?.split('\n')).toHaveLength(1);
    expect(result.synced).toBe('[00:01.00]愛してる  •  aishiteru  •  Te quiero');
  });

  it('uses romanization as the primary line when latin-only lyrics are enabled', async () => {
    const result = await processLyrics('[00:01.00]사랑해', '', {
      lyricOriginal: true,
      lyricRomanization: false,
      lyricTranslation: false,
      lyricLatinOnly: true,
      deviceLang: 'es',
    });

    expect(result.synced).not.toContain('사랑해');
    expect(result.synced).toMatch(/^\[00:01\.00\][a-z]+/i);
  });

  it('keeps Latin-script lyrics when latin-only lyrics are enabled', async () => {
    const result = await processLyrics('[00:01.00]Yo quiero tu amor', '', {
      lyricOriginal: false,
      lyricRomanization: false,
      lyricTranslation: false,
      lyricLatinOnly: true,
      deviceLang: 'es',
    });

    expect(result.synced).toBe('[00:01.00]Yo quiero tu amor');
  });

  it('translates multiple chunks in parallel (up to 3) while preserving exact line order', async () => {
    // 5 chunks of 300 chars each (> MAX_CHARS=450 when combined)
    const lines = Array.from({ length: 5 }, (_, idx) => `LINE_${idx}_${'x'.repeat(290)}`);
    let inFlight = 0;
    let peakInFlight = 0;

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      const url = new URL(String(input));
      const q = url.searchParams.get('q') ?? '';
      const match = /LINE_(\d+)_/.exec(q);
      const chunkIdx = match ? Number(match[1]) : 0;
      // Later chunks resolve faster to ensure output order is preserved by index, not completion order
      const delayMs = (5 - chunkIdx) * 8;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      inFlight -= 1;

      const translatedText = q
        .split('\n')
        .map((line) => `TR:${line}`)
        .join('\n');
      return new Response(
        JSON.stringify({ responseStatus: 200, responseData: { translatedText } }),
        { status: 200 },
      );
    });

    try {
      const translated = await translateLines(lines, 'es');
      expect(fetchMock).toHaveBeenCalledTimes(5);
      expect(peakInFlight).toBeGreaterThan(1);
      expect(peakInFlight).toBeLessThanOrEqual(3);
      expect(translated).toEqual(lines.map((line) => `TR:${line}`));
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('returns null from translateLines if any parallel chunk fails', async () => {
    const lines = Array.from({ length: 4 }, (_, idx) => `FAIL_${idx}_${'y'.repeat(290)}`);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      const q = url.searchParams.get('q') ?? '';
      if (q.includes('FAIL_1_')) {
        return new Response('rate limit', { status: 429 });
      }
      return new Response(
        JSON.stringify({ responseStatus: 200, responseData: { translatedText: `TR:${q}` } }),
        { status: 200 },
      );
    });

    try {
      const translated = await translateLines(lines, 'es');
      expect(translated).toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('shares a single Kuroshiro instance across concurrent callers and retries after init failure', async () => {
    vi.resetModules();

    let buildCount = 0;
    let shouldFailFirst = true;
    const convertSpy = vi.fn(async (text: string) => `rom:${text}`);

    vi.doMock('kuroshiro', () => ({
      default: class FakeKuroshiro {
        private analyzer: { init: () => Promise<void> } | null = null;
        async init(analyzer: { init: () => Promise<void> }) {
          this.analyzer = analyzer;
          await this.analyzer.init();
        }
        async convert(text: string) {
          return convertSpy(text);
        }
      },
    }));

    vi.doMock('kuromoji/build/kuromoji.js', () => ({
      default: {
        builder: () => ({
          build: (cb: (err: Error | null, tokenizer: { tokenize: (text: string) => unknown[] }) => void) => {
            buildCount += 1;
            setTimeout(() => {
              if (shouldFailFirst) {
                cb(new Error('transient dict load error'), null as never);
                return;
              }
              cb(null, { tokenize: () => [] });
            }, 10);
          },
        }),
      },
    }));

    try {
      const mod = await import('./lyricsProcessor');
      mod.__testing.resetKuroshiro();

      // 1. Concurrent failure must resolve to null (not undefined) and reset state so retry works
      const [failA, failB] = await Promise.all([
        mod.__testing.getKuroshiro(),
        mod.__testing.getKuroshiro(),
      ]);
      expect(failA).toBeNull();
      expect(failB).toBeNull();
      expect(buildCount).toBe(1);

      // 2. Subsequent concurrent calls must retry once, return the real Kuroshiro instance (never undefined)
      shouldFailFirst = false;
      const [ksA, ksB, ksC] = await Promise.all([
        mod.__testing.getKuroshiro(),
        mod.__testing.getKuroshiro(),
        mod.__testing.getKuroshiro(),
      ]);
      expect(ksA).not.toBeNull();
      expect(ksA).toBeDefined();
      expect(ksB).toBe(ksA);
      expect(ksC).toBe(ksA);
      expect(buildCount).toBe(2);

      // 3. Concurrent Japanese romanizeLines calls must both use Kuroshiro cleanly without failing
      const [romA, romB] = await Promise.all([
        mod.romanizeLines(['愛してる'], 'japanese'),
        mod.romanizeLines(['無敵の笑顔'], 'japanese'),
      ]);
      expect(romA).toEqual(['rom:愛してる']);
      expect(romB).toEqual(['rom:無敵の笑顔']);
    } finally {
      vi.doUnmock('kuroshiro');
      vi.doUnmock('kuromoji/build/kuromoji.js');
      vi.resetModules();
    }
  });
});
