import { describe, expect, it } from 'vitest';
import { __testing } from './musicApi';

describe('musicApi lyrics combination', () => {
  it('does not insert letras.com Spanish translation when target language is English and source is English', async () => {
    const result = await __testing.combineLyrics(
      {
        original: ['I want your love in my heart'],
        romaji: [],
        translated: ['Quiero tu amor en mi corazon'],
        sourceUrl: 'https://www.letras.com/example/song/',
      },
      { syncedLrc: '[00:01.00]I want your love in my heart', plainLrc: 'I want your love in my heart' },
      {
        lyricOriginal: true,
        lyricRomanization: false,
        lyricTranslation: true,
        deviceLang: 'en',
      },
    );

    expect(result?.synced).toBe('[00:01.00]I want your love in my heart');
    expect(result?.synced).not.toContain('Quiero tu amor');
  });
});
