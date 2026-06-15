import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __testing, fetchLetrasLyrics } from './letrasScraper'

const songHtml = `
  <div class="lyric-content font --lyricsCompact --size18">
    <div class="lyric-translation --romanization">
      <div class="lyric-translation-left">
        <p>
          <span class = "verse">
            <span>無敵の笑顔</span>
            <span class = "romanization">muteki no egao</span>
          </span><br/>
          <span class="verse">
            <span>知りたい秘密</span>
            <span class="romanization">shiritai himitsu</span>
          </span>
        </p>
      </div>
    </div>
  </div>
`

const translatedHtml = `
  <div class="lyric-content hasTranslation">
    <div class="lyric-translation">
      <div class="lyric-translation-left">
        <p><span class="verse"><span>無敵の笑顔</span><span class="romanization">muteki no egao</span></span></p>
      </div>
      <div class="lyric-translation-right">
        <p>
          <span class="verse">Sonrisa invencible</span>
          <span class="verse">Quiero saber el secreto</span>
        </p>
      </div>
    </div>
  </div>
`

beforeEach(() => {
  vi.restoreAllMocks()
  __testing.clearCache()
})

describe('letras.com scraper', () => {
  it('parses nested romanization spans from the current letras.com markup', () => {
    expect(__testing.parseLetrasSongPage(songHtml)).toEqual({
      original: ['無敵の笑顔', '知りたい秘密'],
      romaji: ['muteki no egao', 'shiritai himitsu'],
    })
  })

  it('parses the right translated column without mixing romanization lines', () => {
    expect(__testing.parseLetrasTranslationPage(translatedHtml)).toEqual([
      'Sonrisa invencible',
      'Quiero saber el secreto',
    ])
  })

  it('tries the direct letras.com slug before falling back to search', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url === 'https://www.letras.com/yoasobi/idol/') {
        return new Response(songHtml, { status: 200 })
      }
      if (url === 'https://www.letras.com/yoasobi/idol/traduccion.html') {
        return new Response(translatedHtml, { status: 200 })
      }
      return new Response('', { status: 404 })
    })

    const result = await fetchLetrasLyrics('Idol', 'YOASOBI')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.letras.com/yoasobi/idol/',
      expect.any(Object),
    )
    expect(result.original).toEqual(['無敵の笑顔', '知りたい秘密'])
    expect(result.romaji).toEqual(['muteki no egao', 'shiritai himitsu'])
    expect(result.translated).toEqual(['Sonrisa invencible', 'Quiero saber el secreto'])
  })

  it('caches successful letras.com results for repeated downloads', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url === 'https://www.letras.com/yoasobi/idol/') {
        return new Response(songHtml, { status: 200 })
      }
      if (url === 'https://www.letras.com/yoasobi/idol/traduccion.html') {
        return new Response(translatedHtml, { status: 200 })
      }
      return new Response('', { status: 404 })
    })

    await fetchLetrasLyrics('Idol', 'YOASOBI')
    await fetchLetrasLyrics('Idol', 'YOASOBI')

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
