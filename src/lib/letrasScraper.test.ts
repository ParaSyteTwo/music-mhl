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

  it('preserves an empty romanization slot instead of shifting later lines', () => {
    const partialRomanizationHtml = `
      <div class="lyric-content">
        <span class="verse"><span>一行目</span></span>
        <span class="verse"><span>二行目</span><span class="romanization">nigyoume</span></span>
      </div>
    `

    expect(__testing.parseLetrasSongPage(partialRomanizationHtml)).toEqual({
      original: ['一行目', '二行目'],
      romaji: ['', 'nigyoume'],
    })
  })

  it('parses the right translated column without mixing romanization lines', () => {
    expect(__testing.parseLetrasTranslationPage(translatedHtml)).toEqual([
      'Sonrisa invencible',
      'Quiero saber el secreto',
    ])
  })

  it('parses standard songs without .verse using paragraphs and br breaks', () => {
    const standardHtml = `
      <div class="cnt-letra p402_premium">
        <p>I've been on my own for long enough<br/>Maybe you can show me how to love</p>
        <p>I'm going through withdrawals<br>You don't even have to do too much</p>
      </div>
    `
    expect(__testing.parseLetrasSongPage(standardHtml)).toEqual({
      original: [
        "I've been on my own for long enough",
        'Maybe you can show me how to love',
        "I'm going through withdrawals",
        "You don't even have to do too much",
      ],
      romaji: ['', '', '', ''],
    })
  })

  it('parses standard translation page with br breaks inside paragraphs', () => {
    const standardTransHtml = `
      <div class="lyric-content hasTranslation">
        <div class="lyric-translation">
          <div class="lyric-translation-right">
            <p>He estado solo por mucho tiempo<br/>Tal vez puedas enseñarme a amar</p>
          </div>
        </div>
      </div>
    `
    expect(__testing.parseLetrasTranslationPage(standardTransHtml)).toEqual([
      'He estado solo por mucho tiempo',
      'Tal vez puedas enseñarme a amar',
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

  it('parses dual-script song with .verse inside .lyric-original (Ado - DND case)', () => {
    const adoHtml = `
      <div class="lyric-original">
        <p>
          <span class="verse"><span>Dreamin' 叶えたいの?</span><span class="romanization">Dreamin' kanaetai no?</span></span><br/>
          <span class="verse"><span>Come on and do it</span><span class="romanization">Come on and do it</span></span><br/>
          <span class="verse"><span>俯いてる暇ナイ!</span><span class="romanization">utsuite ru hima nai!</span></span>
        </p>
      </div>
    `
    expect(__testing.parseLetrasSongPage(adoHtml)).toEqual({
      original: ["Dreamin' 叶えたいの?", 'Come on and do it', '俯いてる暇ナイ!'],
      romaji: ["Dreamin' kanaetai no?", 'Come on and do it', 'utsuite ru hima nai!'],
    })
  })

  it('parses translation page with .lyric-stackedTranslation (Ado translation case)', () => {
    const adoTransHtml = `
      <div class="lyric-translation-right">
        <div class="lyric-stackedTranslation">
          <p>
            <span class="verse">¿Soñando? ¿Quieres hacerlo realidad?<br><span class="romanization"><span>Dreamin' 叶えたいの?</span><br><span>Dreamin' kanaetai no?</span></span></span><br>
            <span class="verse">Vamos, hazlo<br><span class="romanization"><span>Come on and do it</span><br><span>Come on and do it</span></span></span>
          </p>
        </div>
      </div>
    `
    expect(__testing.parseLetrasTranslationPage(adoTransHtml)).toEqual([
      '¿Soñando? ¿Quieres hacerlo realidad?',
      'Vamos, hazlo',
    ])
  })
})
