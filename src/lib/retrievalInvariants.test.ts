import { describe, expect, it, vi, beforeEach } from 'vitest';
import { __testing, getLyrics, cleanTitleForLyrics, cleanArtistForLyrics } from '@/lib/api/musicApi';
import { __testing as letrasTesting } from '@/lib/letrasScraper';
import { buildLRC, processLyrics, romanizeLines } from '@/lib/lyricsProcessor';

describe('Data & Content Retrieval Invariant Contract (Gobernanza de Invariantes)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Invariantes de Cabeceras y Red (Network Identification)', () => {
    it('INVARIANTE 1.1: Toda petición externa a LRCLIB debe incluir identificación explícita de cliente', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ syncedLyrics: '[00:01.00] test' }), { status: 200 }),
      );

      await __testing.fetchLrclib('Song', 'Artist', 120);

      expect(fetchSpy).toHaveBeenCalled();
      const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers).toBeDefined();
      expect(headers['Lrclib-Client']).toMatch(/^MHLMusic\/\d+\.\d+\.\d+/);
      expect(headers['X-User-Agent']).toMatch(/^MHLMusic\/\d+\.\d+\.\d+/);
    });

    it('INVARIANTE 1.2: Prohibido colapsar si /api/get devuelve 404 o timeout; debe degradar a búsqueda difusa', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/api/get')) {
          return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
        }
        if (url.includes('/api/search')) {
          return new Response(JSON.stringify([
            {
              id: 99,
              trackName: 'Invariable Track',
              artistName: 'Invariable Artist',
              syncedLyrics: '[00:02.00] Línea recuperada por fallback',
            },
          ]), { status: 200 });
        }
        return new Response('', { status: 500 });
      });

      const res = await __testing.fetchLrclib('Invariable Track (Remastered 2024)', 'Invariable Artist', 200);
      expect(res.syncedLrc).toBe('[00:02.00] Línea recuperada por fallback');
    });
  });

  describe('2. Invariantes de Parseo de Letras (HTML Resilience)', () => {
    it('INVARIANTE 2.1: El parser de Letras.com debe admitir canciones estándar sin clases .verse', () => {
      const htmlNormal = `
        <div class="cnt-letra p402_premium">
          <p>Primera línea de la canción<br/>Segunda línea de la canción</p>
          <p>Tercera línea en otra estrofa</p>
        </div>
      `;
      const parsed = letrasTesting.parseLetrasSongPage(htmlNormal);
      expect(parsed).not.toBeNull();
      expect(parsed?.original).toEqual([
        'Primera línea de la canción',
        'Segunda línea de la canción',
        'Tercera línea en otra estrofa',
      ]);
      expect(parsed?.romaji).toEqual(['', '', '']);
    });

    it('INVARIANTE 2.2: La traducción no debe fusionar versos al limpiar etiquetas <br>', () => {
      const htmlTrans = `
        <div class="lyric-content hasTranslation">
          <div class="lyric-translation">
            <div class="lyric-translation-right">
              <p>Línea traducida 1<br>Línea traducida 2</p>
            </div>
          </div>
        </div>
      `;
      const parsedTrans = letrasTesting.parseLetrasTranslationPage(htmlTrans);
      expect(parsedTrans).not.toBeNull();
      expect(parsedTrans).toEqual(['Línea traducida 1', 'Línea traducida 2']);
    });

    it('INVARIANTE 2.3: El parser de Letras.com extrae limpiamente original y romaji de canciones con .verse y .romanization', () => {
      const htmlDual = `
        <div class="lyric-original">
          <p>
            <span class="verse"><span>Dreamin' 叶えたいの?</span><span class="romanization">Dreamin' kanaetai no?</span></span><br/>
            <span class="verse"><span>Come on and do it</span><span class="romanization">Come on and do it</span></span><br/>
            <span class="verse"><span>俯いてる暇ナイ!</span><span class="romanization">utsuite ru hima nai!</span></span>
          </p>
        </div>
      `;
      const parsed = letrasTesting.parseLetrasSongPage(htmlDual);
      expect(parsed).not.toBeNull();
      expect(parsed?.original).toEqual(["Dreamin' 叶えたいの?", 'Come on and do it', '俯いてる暇ナイ!']);
      expect(parsed?.romaji).toEqual(["Dreamin' kanaetai no?", 'Come on and do it', 'utsuite ru hima nai!']);
    });

    it('INVARIANTE 2.4: El parser de traducción extrae el texto en español descartando .romanization anidado', () => {
      const htmlStacked = `
        <div class="lyric-translation-right">
          <div class="lyric-stackedTranslation">
            <p>
              <span class="verse">¿Soñando? ¿Quieres hacerlo realidad?<br><span class="romanization"><span>Dreamin' 叶えたいの?</span><br><span>Dreamin' kanaetai no?</span></span></span><br>
              <span class="verse">Vamos, hazlo<br><span class="romanization"><span>Come on and do it</span><br><span>Come on and do it</span></span></span>
            </p>
          </div>
        </div>
      `;
      const parsed = letrasTesting.parseLetrasTranslationPage(htmlStacked);
      expect(parsed).not.toBeNull();
      expect(parsed).toEqual(['¿Soñando? ¿Quieres hacerlo realidad?', 'Vamos, hazlo']);
    });
  });

  describe('3. Invariantes de Sincronización en Tiempo Real y Capas (LRC Atoms)', () => {
    it('INVARIANTE 3.1: Cada línea sincronizada debe preservar timestamps en tiempo real [mm:ss.xx]', () => {
      const rawSynced = '[00:15.50]Texto de prueba';
      const processed = buildLRC(rawSynced, null, null, {
        original: true,
        romanization: false,
        translation: false,
      });

      expect(processed.synced).toMatch(/^\[\d{2}:\d{2}\.\d{2}\]/);
      expect(processed.synced).toContain('[00:15.50]Texto de prueba');
    });

    it('INVARIANTE 3.2: Si latinOnly está activo, las figuras (kanji/kana/hanzi/hangul) se ocultan y romaji es principal', () => {
      const rawSynced = '[00:10.00]無敵の笑顔';
      const romanized = ['muteki no egao'];
      const translated = ['Sonrisa invencible'];

      const processed = buildLRC(rawSynced, romanized, translated, {
        original: true,
        romanization: true,
        translation: true,
        latinOnly: true,
      });

      expect(processed.synced).toContain('muteki no egao');
      expect(processed.synced).toContain('Sonrisa invencible');
      expect(processed.synced).not.toContain('無敵の笑顔');
    });

    it('INVARIANTE 3.3: getLyrics nunca debe inventar timestamps si solo existen letras planas', async () => {
      const result = await __testing.combineLyrics(
        {
          original: ['Verso sin tiempo 1', 'Verso sin tiempo 2'],
          romaji: [],
          translated: [],
          sourceUrl: 'https://www.letras.com/test',
        },
        null,
        {
          lyricOriginal: true,
          lyricRomanization: false,
          lyricTranslation: false,
          deviceLang: 'es',
        },
      );

      expect(result?.synced).toBeNull();
      expect(result?.plain).toBe('Verso sin tiempo 1\nVerso sin tiempo 2');
    });

    it('INVARIANTE 3.4: romanizeLines en canciones japonesas debe tratar líneas con kanji puro como japonés (no chino)', async () => {
      // Líneas con kanji puro sin hiragana/katakana no deben ser convertidas a pinyin chino
      const lines = ['限界突破', '上等! 自分勝手', 'Dreamin'];
      const romanized = await romanizeLines(lines, 'japanese');
      // No debe contener pinyin como 'xian jie'
      expect(romanized[0]).not.toContain('xian');
      expect(romanized[1]).not.toContain('shang');
      expect(romanized[2]).toBe('Dreamin');
    });

    it('INVARIANTE 3.5: parseLetrasSongPage no debe duplicar versos cuando existen columnas de traducción simultáneas (Mobile/Stacked views)', () => {
      // Simula estructura de Letras.com con columna izquierda (original+romaji) y derecha (traducción)
      const dualColumnHtml = `
        <div class="lyric-content">
          <div class="lyric-translation-left">
            <p>
              <span class="verse">
                <span>Dreamin' 叶えたいの?</span>
                <span class="romanization">Dreamin' kanaetai no?</span>
              </span>
              <br/>
              <span class="verse">
                <span>Come on and do it</span>
                <span class="romanization">Come on and do it</span>
              </span>
            </p>
          </div>
          <div class="lyric-translation-right">
            <p>
              <span class="verse">
                ¿Soñando? ¿Quieres hacerlo realidad?
                <span class="romanization">Dreamin' 叶えたいの?</span>
              </span>
              <br/>
              <span class="verse">
                Vamos, hazlo
                <span class="romanization">Come on and do it</span>
              </span>
            </p>
          </div>
        </div>
      `;
      const result = letrasTesting.parseLetrasSongPage(dualColumnHtml);
      expect(result).not.toBeNull();
      // Debe contener exactamente 2 versos, no 4
      expect(result?.original).toHaveLength(2);
      expect(result?.original[0]).toBe("Dreamin' 叶えたいの?");
      expect(result?.original[1]).toBe('Come on and do it');
      expect(result?.romaji[0]).toBe("Dreamin' kanaetai no?");
      expect(result?.romaji[1]).toBe('Come on and do it');
      // Si la columna derecha estaba presente, debió extraer también la traducción inline
      expect(result?.translated).toHaveLength(2);
      expect(result?.translated?.[0]).toBe('¿Soñando? ¿Quieres hacerlo realidad?');
      expect(result?.translated?.[1]).toBe('Vamos, hazlo');
    });
  });

  describe('4. Invariantes de Limpieza de Metadatos (Data Sanitization)', () => {
    it('INVARIANTE 4.1: La sanitización de títulos preserva el nombre base y remueve contaminantes', () => {
      expect(cleanTitleForLyrics('Blinding Lights (feat. Rosalía)')).toBe('Blinding Lights');
      expect(cleanTitleForLyrics('Save Your Tears - Remix')).toBe('Save Your Tears');
      expect(cleanTitleForLyrics('Track Name [Official Video]')).toBe('Track Name');
      expect(cleanTitleForLyrics('Song Title (Deluxe Edition)')).toBe('Song Title');
      expect(cleanTitleForLyrics('Clean Pure Name')).toBe('Clean Pure Name');
    });

    it('INVARIANTE 4.2: La sanitización de artistas aísla al artista principal preservando nombres con comas, barras o ampersands', () => {
      expect(cleanArtistForLyrics('AC/DC')).toBe('AC/DC');
      expect(cleanArtistForLyrics('Earth, Wind & Fire')).toBe('Earth, Wind & Fire');
      expect(cleanArtistForLyrics('Simon & Garfunkel')).toBe('Simon & Garfunkel');
      expect(cleanArtistForLyrics('Tyler, The Creator')).toBe('Tyler, The Creator');
      expect(cleanArtistForLyrics('Coldplay feat. BTS')).toBe('Coldplay');
      expect(cleanArtistForLyrics('David Guetta ft. Sia')).toBe('David Guetta');
      expect(cleanArtistForLyrics('Solo Artist')).toBe('Solo Artist');
    });

    it('INVARIANTE 4.3: slugify permite preservar colaboradores para URLs de canciones en Letras.com', () => {
      expect(letrasTesting.slugify('DND (feat. KUROMI)', true)).toBe('dnd');
      expect(letrasTesting.slugify('DND (feat. KUROMI)', false)).toBe('dnd-feat-kuromi');
    });
  });
});
