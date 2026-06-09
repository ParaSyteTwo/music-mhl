import { describe, expect, it } from 'vitest';
import {
  detectLatinLyricLanguage,
  processLyrics,
  romanizeLines,
  shouldTranslateLyrics,
} from './lyricsProcessor';

describe('lyrics language decisions', () => {
  it('detects common Spanish lyric text', () => {
    expect(detectLatinLyricLanguage('Yo quiero que tu amor este en mi corazon y en mi vida')).toBe('es');
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
    const result = await processLyrics('[00:01.00]Yo quiero tu amor', '', {
      lyricOriginal: true,
      lyricRomanization: false,
      lyricTranslation: true,
      deviceLang: 'es',
    });

    expect(result.synced).toBe('[00:01.00]Yo quiero tu amor');
  });

  it('romanizes Korean without Node-only modules', async () => {
    const result = await romanizeLines(['사랑해'], 'korean');
    expect(result[0]).not.toBe('사랑해');
  });
});
