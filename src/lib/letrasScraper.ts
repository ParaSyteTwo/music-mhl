/**
 * Scraper para letras.com y Genius
 * Proporciona original + romaji + traducción ES para canciones.
 *
 * Funciona en Android (Capacitor) y Desktop Python sin CORS.
 */

const LETRAS_BASE = 'https://www.letras.com'
const LETRAS_CACHE_TTL_MS = 10 * 60 * 1000
const LETRAS_CACHE_MAX_ENTRIES = 50

interface PyWebViewLetrasApi {
  letras_fetch?: (url: string) => Promise<{ success?: boolean; html?: string }>
}

interface PyWebViewWindow extends Window {
  pywebview?: {
    api?: PyWebViewLetrasApi
  }
}

const letrasCache = new Map<string, { value: LetrasSongResult; expiresAt: number }>()

// ─── Fetch con retry y timeout ───────────────────────────────────────────────

async function letrasFetch(path: string, attempt = 0): Promise<string | null> {
  const url = path.startsWith('http') ? path : `${LETRAS_BASE}${path}`
  try {
    const pyapi = typeof window === 'undefined'
      ? undefined
      : (window as PyWebViewWindow).pywebview?.api
    if (pyapi?.letras_fetch) {
      const result = await pyapi.letras_fetch(url)
      return result?.success && result.html ? result.html : null
    }

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

function slugify(text: string, stripFeat = true): string {
  let t = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (stripFeat) {
    t = t.replace(/\b(feat|ft|featuring)\b.*$/i, '')
    t = t.replace(/\([^)]*\)|\[[^\]]*\]/g, '')
  } else {
    t = t.replace(/[()[\]]/g, ' ')
  }
  return t
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
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

function cleanText(text: string | null | undefined): string {
  return cleanHtml(text ?? '').replace(/\s+/g, ' ').trim()
}

function getCachedLyrics(key: string): LetrasSongResult | null {
  const cached = letrasCache.get(key)
  if (!cached) return null
  if (Date.now() > cached.expiresAt) {
    letrasCache.delete(key)
    return null
  }
  return cached.value
}

function setCachedLyrics(key: string, value: LetrasSongResult) {
  if (!value.sourceUrl || value.original.length === 0) return
  if (letrasCache.size >= LETRAS_CACHE_MAX_ENTRIES) {
    const oldest = letrasCache.keys().next().value as string | undefined
    if (oldest) letrasCache.delete(oldest)
  }
  letrasCache.set(key, {
    value,
    expiresAt: Date.now() + LETRAS_CACHE_TTL_MS,
  })
}

// ─── Parsear página de letras.com ──────────────────────────────────────────

interface LetrasSongResult {
  original: string[]     // líneas en idioma original (kanji/hangul/etc)
  romaji: string[]       // líneas en romaji/transliteration
  translated: string[]   // líneas en español
  sourceUrl: string
}

function parseLetrasSongPage(html: string): { original: string[]; romaji: string[] } | null {
  const originalLines: string[] = []
  const romajiLines: string[] = []

  if (typeof DOMParser === 'undefined') return null

  const doc = new DOMParser().parseFromString(html, 'text/html')
  // 1. Selector robusto: canciones con .verse y .romanization (Ado, Anime, K-Pop, dual-script)
  const verses = [...doc.querySelectorAll('.lyric-original .verse, .cnt-letra .verse, #js-lyric-content .verse, .verse')]
  if (verses.length > 0) {
    for (const verse of verses) {
      const romanization = verse.querySelector('.romanization')
      const clone = verse.cloneNode(true) as Element
      clone.querySelectorAll('.romanization').forEach((node) => node.remove())
      clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))

      const original = cleanText(clone.textContent)
      const romaji = cleanText(romanization?.textContent)

      if (original) {
        originalLines.push(original)
        romajiLines.push(romaji || '')
      }
    }
  } else {
    // 2. Selector fallback: canciones estándar en formato de párrafos <p>
    const container = doc.querySelector('.lyric-original, .cnt-letra, #js-lyric-content, .lyric-content')
    if (container) {
      const paragraphs = [...container.querySelectorAll('p')]
      if (paragraphs.length > 0) {
        for (const p of paragraphs) {
          const clone = p.cloneNode(true) as Element
          const romanization = clone.querySelector('.romanization')
          clone.querySelectorAll('.romanization').forEach((node) => node.remove())
          clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
          const text = clone.textContent ?? ''
          for (const rawLine of text.split('\n')) {
            const clean = cleanText(rawLine)
            if (clean) {
              originalLines.push(clean)
              romajiLines.push(cleanText(romanization?.textContent) || '')
            }
          }
        }
      } else {
        const clone = container.cloneNode(true) as Element
        clone.querySelectorAll('.romanization').forEach((node) => node.remove())
        clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
        const text = clone.textContent ?? ''
        for (const rawLine of text.split('\n')) {
          const clean = cleanText(rawLine)
          if (clean) {
            originalLines.push(clean)
            romajiLines.push('')
          }
        }
      }
    }
  }

  return originalLines.length > 0
    ? { original: originalLines, romaji: romajiLines }
    : null
}

function parseLetrasTranslationPage(html: string): string[] | null {
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const rightColumn = doc.querySelector(
      '.lyric-translation-right, .lyric-stackedTranslation, #js-lyric-content .lyric-translation-right, .lyric-content .lyric-translation-right'
    )
    if (rightColumn) {
      const verses = [...rightColumn.querySelectorAll('.verse, p > span')]
      if (verses.length > 0) {
        const translated = verses.map((node) => {
          const clone = node.cloneNode(true) as Element
          clone.querySelectorAll('.romanization').forEach((child) => child.remove())
          clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
          return cleanText(clone.textContent)
        }).filter(Boolean)
        if (translated.length > 0) return translated
      }

      const paragraphs = [...rightColumn.querySelectorAll('p')]
      const lines: string[] = []
      for (const p of paragraphs) {
        const clone = p.cloneNode(true) as Element
        clone.querySelectorAll('.romanization').forEach((node) => node.remove())
        clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
        for (const rawLine of (clone.textContent ?? '').split('\n')) {
          const clean = cleanText(rawLine)
          if (clean) lines.push(clean)
        }
      }
      if (lines.length > 0) return lines
    }
  }

  const lines: string[] = []
  const transMatch = html.match(/class="[^"]*lyric-translation-right[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    || html.match(/class="[^"]*lyric-translation[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
  if (transMatch) {
    const block = transMatch[1]
    const pMatches = [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    for (const m of pMatches) {
      const withoutRom = m[1].replace(/<span[^>]*class="[^"]*romanization[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '')
      const withNewlines = withoutRom.replace(/<br\s*\/?>/gi, '\n')
      for (const line of withNewlines.split('\n')) {
        const text = cleanHtml(line)
        if (text) lines.push(text)
      }
    }
  }
  return lines.length > 0 ? lines : null
}

// ─── Buscar canción en letras.com ────────────────────────────────────────────

interface LetrasSongPage {
  url: string
  html?: string
}

async function searchLetrasSong(title: string, artist: string): Promise<LetrasSongPage | null> {
  const titleSlug = slugify(title)
  const artistSlug = slugify(artist)
  if (titleSlug && artistSlug) {
    const directUrl = `${LETRAS_BASE}/${artistSlug}/${titleSlug}/`
    const directHtml = await letrasFetch(directUrl)
    if (directHtml && parseLetrasSongPage(directHtml)) {
      const canonicalMatch = directHtml.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)
      const canonicalUrl = canonicalMatch ? canonicalMatch[1] : directUrl
      return { url: canonicalUrl, html: directHtml }
    }
  }

  const titleWithFeatSlug = slugify(title, false)
  if (titleWithFeatSlug && titleWithFeatSlug !== titleSlug && artistSlug) {
    const directUrl = `${LETRAS_BASE}/${artistSlug}/${titleWithFeatSlug}/`
    const directHtml = await letrasFetch(directUrl)
    if (directHtml && parseLetrasSongPage(directHtml)) {
      const canonicalMatch = directHtml.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)
      const canonicalUrl = canonicalMatch ? canonicalMatch[1] : directUrl
      return { url: canonicalUrl, html: directHtml }
    }
  }

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
    if (urlSong.includes(titleWithFeatSlug) || titleWithFeatSlug.includes(urlSong)) score += 15
    if (urlArtist === artistSlug && (urlSong === titleSlug || urlSong === titleWithFeatSlug)) score += 30

    if (score > bestScore) {
      bestScore = score
      best = url
    }
  }

  return bestScore > 0 && best ? { url: best } : null
}

// ─── Scraper de Genius (Fallback secundario) ────────────────────────────────

function parseGeniusPage(html: string): string[] {
  if (typeof DOMParser === 'undefined') {
    const containers = [...html.matchAll(/<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi)]
    const raw = containers.map((c) => c[1]).join('\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
    return raw.split('\n')
      .map((l) => cleanHtml(l))
      .filter((l) => l && !l.includes('ContributorsTranslations') && !(l.startsWith('[') && l.endsWith(']')))
  }

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const containers = [...doc.querySelectorAll('[data-lyrics-container="true"]')]
  const lines: string[] = []
  for (const c of containers) {
    const clone = c.cloneNode(true) as Element
    clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
    const text = clone.textContent ?? ''
    for (const rawLine of text.split('\n')) {
      const clean = cleanText(rawLine)
      if (clean && !clean.includes('ContributorsTranslations') && !(clean.startsWith('[') && clean.endsWith(']'))) {
        lines.push(clean)
      }
    }
  }
  return lines
}

async function fetchGeniusLyrics(title: string, artist: string): Promise<LetrasSongResult | null> {
  const artistSlug = slugify(artist, false)
  const titleSlug = slugify(title, false)
  if (!artistSlug || !titleSlug) return null

  const capitalizedArtist = artistSlug.charAt(0).toUpperCase() + artistSlug.slice(1)
  const url = `https://genius.com/${capitalizedArtist}-${titleSlug}-lyrics`
  const html = await letrasFetch(url)
  if (!html) return null

  const origLines = parseGeniusPage(html)
  if (origLines.length === 0) return null

  let romLines: string[] = []
  const romMatch = html.match(/href="([^"]*romaniz[^"]*lyrics)"/i)
  if (romMatch?.[1]) {
    const romHtml = await letrasFetch(romMatch[1])
    if (romHtml) {
      romLines = parseGeniusPage(romHtml)
    }
  }

  return {
    original: origLines,
    romaji: romLines,
    translated: [],
    sourceUrl: url,
  }
}

// ─── Fetch unificado (letras.com con fallback a Genius) ──────────────────────

export async function fetchLetrasLyrics(
  title: string,
  artist: string,
): Promise<LetrasSongResult> {
  const cacheKey = `${slugify(artist)}|${slugify(title)}`
  const cached = getCachedLyrics(cacheKey)
  if (cached) return cached

  // 1. Buscar URL de la canción en letras.com
  const songPageResult = await searchLetrasSong(title, artist)
  if (!songPageResult) {
    const genius = await fetchGeniusLyrics(title, artist)
    if (genius && genius.original.length > 0) {
      setCachedLyrics(cacheKey, genius)
      return genius
    }
    return { original: [], romaji: [], translated: [], sourceUrl: '' }
  }

  // 2. Fetch página original y de traducción en paralelo
  const cleanBaseUrl = songPageResult.url.replace(/\/$/, '')
  const [songPage, transPage] = await Promise.all([
    songPageResult.html ?? letrasFetch(songPageResult.url),
    letrasFetch(`${cleanBaseUrl}/traduccion.html`),
  ])

  // 3. Parsear
  const parsed = songPage ? parseLetrasSongPage(songPage) : null
  const translated = transPage ? parseLetrasTranslationPage(transPage) : null

  let romaji = parsed?.romaji ?? []
  if (parsed?.original && parsed.original.length > 0 && romaji.every((r) => !r)) {
    // Si Letras.com no contenía romaji, intentar complementar con Genius
    const genius = await fetchGeniusLyrics(title, artist)
    if (genius && genius.romaji.length === parsed.original.length) {
      romaji = genius.romaji
    }
  }

  const result = {
    original: parsed?.original ?? [],
    romaji,
    translated: translated ?? [],
    sourceUrl: songPageResult.url,
  }
  setCachedLyrics(cacheKey, result)
  return result
}

export const __testing = {
  parseLetrasSongPage,
  parseLetrasTranslationPage,
  parseGeniusPage,
  fetchGeniusLyrics,
  slugify,
  clearCache: () => letrasCache.clear(),
}
