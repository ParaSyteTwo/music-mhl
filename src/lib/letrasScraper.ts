/**
 * Scraper para letras.com y Genius
 * Proporciona original + romaji + traducción ES para canciones.
 *
 * Funciona en Android (Capacitor) y Desktop Python sin CORS.
 */

const LETRAS_BASE = 'https://www.letras.com'

// ─── Fetch con retry y timeout ───────────────────────────────────────────────

async function letrasFetch(path: string, attempt = 0): Promise<string | null> {
  const url = path.startsWith('http') ? path : `${LETRAS_BASE}${path}`
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Android; Mobile)',
        'Accept': 'text/html,application/xhtml+xml,application/xml',
      },
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    return await res.text()
  } catch {
    if (attempt < 1) return letrasFetch(path, attempt + 1)
    return null
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

function cleanHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\r\n/g, '\n')
    .trim()
}

// ─── Parsear página de letras.com ──────────────────────────────────────────

interface LetrasSongResult {
  original: string[]     // líneas en idioma original (kanji/hangul/etc)
  romaji: string[]       // líneas en romaji/transliteration
  translated: string[]   // líneas en español
  sourceUrl: string
}

function parseLetrasSongPage(html: string): { original: string[]; romaji: string[] } | null {
  // Estructura real en letras.com:
  // <div class="lyric-content ...">
  //   <p><span class="verse">
  //     <span>kanji original</span>
  //     <span class="romanization">romaji</span>
  //   </span></p>
  //   ...
  // </div>

  const originalLines: string[] = []
  const romajiLines: string[] = []

  // Buscar bloque lyric-content
  const contentMatch = html.match(/class="lyric-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
  if (!contentMatch) return null

  const block = contentMatch[1]

  // Extraer todos los .verse
  const verseMatches = [...block.matchAll(/<span class="verse"[^>]*>([\s\S]*?)<\/span>/gi)]
  for (const vm of verseMatches) {
    const verseHtml = vm[1]

    // span:first-child = texto original (kanji/hangul/etc)
    const origMatch = verseHtml.match(/^<span[^>]*>([\s\S]*?)<\/span>/i)
    if (origMatch) {
      const text = cleanHtml(origMatch[1])
      if (text) originalLines.push(text)
    }

    // span.romanization = romaji
    const romaMatch = verseHtml.match(/<span class="romanization"[^>]*>([\s\S]*?)<\/span>/i)
    if (romaMatch) {
      const text = cleanHtml(romaMatch[1])
      if (text) romajiLines.push(text)
    }
  }

  return originalLines.length > 0
    ? { original: originalLines, romaji: romajiLines }
    : null
}

function parseLetrasTranslationPage(html: string): string[] | null {
  const lines: string[] = []
  const transMatch = html.match(/class="lyric-translation"[^>]*>([\s\S]*?)<\/div>/i)
  if (transMatch) {
    const block = transMatch[1]
    const pMatches = [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    for (const m of pMatches) {
      const text = cleanHtml(m[1])
      if (text) lines.push(text)
    }
  }
  return lines.length > 0 ? lines : null
}

// ─── Buscar canción en letras.com ────────────────────────────────────────────

interface SongCandidate {
  artist: string
  title: string
  url: string
  score: number
}

async function searchLetrasSong(title: string, artist: string): Promise<string | null> {
  const query = encodeURIComponent(`${title} ${artist}`)
  const html = await letrasFetch(`/search/?lookup=${query}&from=header`)
  if (!html) return null

  // Buscar todos los enlaces de canciones
  const songLinks = [...html.matchAll(/href="(https:\/\/www\.letras\.com\/[a-z0-9-]+\/[a-z0-9-]+\/?)"/gi)]
    .map((m) => m[1])
    .filter((url) => {
      // Filtrar: solo URLs de canciones (2 segmentos, no estilos/discografia/etc)
      const parts = url.replace('https://www.letras.com/', '').replace(/\/$/, '').split('/')
      return (
        parts.length === 2 &&
        !url.includes('/estilos/') &&
        !url.includes('/discografia/') &&
        !url.includes('/ouvir') &&
        !url.includes('/search')
      )
    })

  if (songLinks.length === 0) return null

  const titleSlug = slugify(title)
  const artistSlug = slugify(artist)

  // Scoring: mejor coincidencia
  let best: string | null = null
  let bestScore = 0

  for (const url of [...new Set(songLinks)]) {
    const parts = url.replace('https://www.letras.com/', '').replace(/\/$/, '').split('/')
    const urlArtist = parts[0]
    const urlSong = parts[1]

    let score = 0
    if (urlArtist.includes(artistSlug) || artistSlug.includes(urlArtist)) score += 10
    if (urlSong.includes(titleSlug) || titleSlug.includes(urlSong)) score += 10
    if (urlArtist === artistSlug && urlSong === titleSlug) score += 30

    if (score > bestScore) {
      bestScore = score
      best = url
    }
  }

  return bestScore > 0 ? best! : null
}

// ─── Fetch desde letras.com ─────────────────────────────────────────────────

export async function fetchLetrasLyrics(
  title: string,
  artist: string,
): Promise<LetrasSongResult> {
  // 1. Buscar URL de la canción
  const songUrl = await searchLetrasSong(title, artist)
  if (!songUrl) {
    return { original: [], romaji: [], translated: [], sourceUrl: '' }
  }

  // 2. Fetch página original y de traducción en paralelo
  const [songPage, transPage] = await Promise.all([
    letrasFetch(songUrl),
    letrasFetch(`${songUrl}traduccion.html`),
  ])

  // 3. Parsear
  const parsed = songPage ? parseLetrasSongPage(songPage) : null
  const translated = transPage ? parseLetrasTranslationPage(transPage) : null

  return {
    original: parsed?.original ?? [],
    romaji: parsed?.romaji ?? [],
    translated: translated ?? [],
    sourceUrl: songUrl,
  }
}
