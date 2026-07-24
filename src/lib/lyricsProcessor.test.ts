import { describe, expect, it, vi } from 'vitest';
import {
  buildLRC,
  detectLatinLyricLanguage,
  processLyrics,
  romanizeLines,
  shouldTranslateLyrics,
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
});
