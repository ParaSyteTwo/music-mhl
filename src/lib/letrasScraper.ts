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

    if (typeof window !== 'undefined') {
      try {
        const { Capacitor, CapacitorHttp } = await import('@capacitor/core')
        if (Capacitor.isNativePlatform()) {
          const resp = await CapacitorHttp.get({
            url,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'es-ES,es;q=0.9,ja;q=0.8,en;q=0.7',
            },
          })
          if (resp.status >= 200 && resp.status < 300 && resp.data) {
            return typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
          }
        }
      } catch {
        // Fallback a fetch de navegador si CapacitorHttp no está disponible
      }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    let res: Response
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml',
        },
      })
    } catch (signalErr: any) {
      if (signalErr?.message?.includes('AbortSignal')) {
        res = await fetch(url, {
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml',
          },
        })
      } else {
        throw signalErr
      }
    }
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
    .replace(/&#x27;/gi, "'")
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

function parseLetrasSongPage(html: string): { original: string[]; romaji: string[]; translated?: string[] } | null {
  const originalLines: string[] = []
  const romajiLines: string[] = []
  let inlineTranslations: string[] = []

  if (typeof DOMParser === 'undefined') return null

  const doc = new DOMParser().parseFromString(html, 'text/html')

  // 1. Selector de contenedor exclusivo: previene seleccionar columnas duplicadas (traducción lateral / móvil)
  const container =
    doc.querySelector('.lyric-translation-left') ||
    doc.querySelector('.lyric-original') ||
    doc.querySelector('.cnt-letra') ||
    doc.querySelector('#js-lyric-content') ||
    doc.querySelector('.lyric-content')

  if (!container) return null

  // 1.1 Si la página ya contiene la columna derecha de traducción, extraerla de inmediato
  const rightColumn = doc.querySelector(
    '.lyric-translation-right, .lyric-stackedTranslation, #js-lyric-content .lyric-translation-right, .lyric-content .lyric-translation-right'
  )
  if (rightColumn) {
    const rightVerses = [...rightColumn.querySelectorAll('.verse')]
    if (rightVerses.length > 0) {
      inlineTranslations = rightVerses.map((v) => {
        const clone = v.cloneNode(true) as Element
        clone.querySelectorAll('.romanization').forEach((n) => n.remove())
        clone.querySelectorAll('br').forEach((n) => n.replaceWith('\n'))
        const lines = (clone.textContent ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
        return cleanText(lines[0] || '')
      }).filter(Boolean)
    }
  }

  // 1.2 Extraer versos originales y romaji dentro del contenedor principal
  const verses = [...container.querySelectorAll('.verse')]
  if (verses.length > 0) {
    for (const verse of verses) {
      const romanization = verse.querySelector('.romanization')
      const clone = verse.cloneNode(true) as Element
      clone.querySelectorAll('.romanization').forEach((node) => node.remove())
      clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))

      const origText = (clone.textContent ?? '').split('\n').map((l) => cleanText(l)).filter(Boolean)
      const romText = romanization
        ? (romanization.textContent ?? '').split('\n').map((l) => cleanText(l)).filter(Boolean)
        : []

      if (origText.length > 0) {
        for (let i = 0; i < origText.length; i++) {
          originalLines.push(origText[i])
          romajiLines.push(romText[i] || (romText.length === 1 ? romText[0] : ''))
        }
      }
    }
  } else {
    // 2. Selector fallback: canciones estándar en formato de párrafos <p>
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

  return originalLines.length > 0
    ? {
        original: originalLines,
        romaji: romajiLines,
        ...(inlineTranslations.length > 0 ? { translated: inlineTranslations } : {}),
      }
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
        const translated: string[] = []
        for (const node of verses) {
          const clone = node.cloneNode(true) as Element
          clone.querySelectorAll('.romanization').forEach((child) => child.remove())
          clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
          const lines = (clone.textContent ?? '').split('\n').map((l) => cleanText(l)).filter(Boolean)
          translated.push(...lines)
        }
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

  const isExplicitEnglishRequest = /\b(english|ingles|versao em ingles|version en ingles)\b/i.test(title)

  // Buscar todos los enlaces de canciones (relativos y absolutos)
  const songLinks = [...html.matchAll(/href="((?:https:\/\/www\.letras\.com)?\/[a-z0-9-]+\/[a-z0-9-]+\/?)"/gi)]
    .map((m) => (m[1].startsWith('http') ? m[1] : `${LETRAS_BASE}${m[1]}`))
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
  let bestScore = -Infinity

  for (const url of [...new Set(songLinks)]) {
    const parts = url.replace('https://www.letras.com/', '').replace(/\/$/, '').split('/')
    const urlArtist = parts[0]
    const urlSong = parts[1]

    let score = 0
    if (urlArtist.includes(artistSlug) || artistSlug.includes(urlArtist)) score += 10
    if (urlArtist === artistSlug) score += 10
    if (urlSong === titleSlug || urlSong === titleWithFeatSlug) score += 40
    else if (urlSong.includes(titleSlug) || titleSlug.includes(urlSong)) score += 10

    // Penalizar fuertemente versiones en inglés / traducciones si el título no pedía explícitamente versión en inglés
    if (!isExplicitEnglishRequest && /-(english|ingles|traducao|traduccion|translation|versao|version-inglesa)/i.test(urlSong)) {
      score -= 50
    }

    if (score > bestScore && score > 0) {
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

interface GeniusSearchHit {
  type: string
  result: {
    id: number
    title: string
    path: string
    url?: string
    primary_artist?: {
      name: string
    }
  }
}

async function searchGeniusApi(query: string): Promise<GeniusSearchHit[]> {
  try {
    const jsonStr = await letrasFetch(`https://genius.com/api/search/multi?q=${encodeURIComponent(query)}`)
    if (!jsonStr) return []
    const parsed = JSON.parse(jsonStr)
    const sections = parsed?.response?.sections
    if (!Array.isArray(sections)) return []
    const hits: GeniusSearchHit[] = []
    for (const sec of sections) {
      if (Array.isArray(sec.hits)) {
        for (const hit of sec.hits) {
          if (hit?.type === 'song' && hit.result?.path) {
            hits.push(hit)
          }
        }
      }
    }
    return hits
  } catch {
    return []
  }
}

async function fetchGeniusLyrics(title: string, artist: string): Promise<LetrasSongResult | null> {
  const cleanTitle = title.replace(/\b(feat|ft|featuring)\b.*$/i, '').trim()
  const cleanArtist = artist.replace(/\b(feat|ft|featuring)\b.*$/i, '').trim()
  const query = `${cleanTitle || title} ${cleanArtist || artist}`.trim()
  if (!query) return null

  // 1. Buscar en la API de Genius
  let hits = await searchGeniusApi(query)
  if (hits.length === 0 && (cleanTitle !== title || cleanArtist !== artist)) {
    hits = await searchGeniusApi(`${title} ${artist}`.trim())
  }
  if (hits.length === 0) {
    // Fallback con URL directa predecible
    const artistSlug = slugify(artist, false)
    const titleSlug = slugify(title, false)
    if (artistSlug && titleSlug) {
      const capitalizedArtist = artistSlug.charAt(0).toUpperCase() + artistSlug.slice(1)
      hits = [{
        type: 'song',
        result: {
          id: 0,
          title,
          path: `/${capitalizedArtist}-${titleSlug}-lyrics`,
        },
      }]
    }
  }

  if (hits.length === 0) return null

  // Identificar el hit de la canción original y el hit de la versión romanizada
  let primaryHit: GeniusSearchHit | null = null
  let romajiHit: GeniusSearchHit | null = null
  let translationHit: GeniusSearchHit | null = null

  for (const h of hits) {
    const t = h.result.title.toLowerCase()
    const art = (h.result.primary_artist?.name || '').toLowerCase()
    if (t.includes('romaniz') || art.includes('romaniz')) {
      if (!romajiHit) romajiHit = h
    } else if (t.includes('translation') || t.includes('traducci')) {
      if (!translationHit) translationHit = h
    } else if (!primaryHit) {
      primaryHit = h
    }
  }

  // Si no se encontró versión romanizada en los hits iniciales, buscar explícitamente "query romanized"
  if (!romajiHit) {
    const romHits = await searchGeniusApi(`${query} romanized`)
    romajiHit = romHits.find((h) => {
      const t = h.result.title.toLowerCase()
      const art = (h.result.primary_artist?.name || '').toLowerCase()
      return t.includes('romaniz') || art.includes('romaniz')
    }) || null
  }

  const primaryPath = primaryHit?.result?.path || hits[0]?.result?.path
  if (!primaryPath) return null

  const songUrl = primaryPath.startsWith('http') ? primaryPath : `https://genius.com${primaryPath}`
  const html = await letrasFetch(songUrl)
  if (!html) return null

  const origLines = parseGeniusPage(html)
  if (origLines.length === 0) return null

  let romLines: string[] = []
  if (romajiHit?.result?.path) {
    const romUrl = romajiHit.result.path.startsWith('http') ? romajiHit.result.path : `https://genius.com${romajiHit.result.path}`
    const romHtml = await letrasFetch(romUrl)
    if (romHtml) {
      romLines = parseGeniusPage(romHtml)
    }
  }

  let transLines: string[] = []
  if (translationHit?.result?.path) {
    const transUrl = translationHit.result.path.startsWith('http') ? translationHit.result.path : `https://genius.com${translationHit.result.path}`
    const transHtml = await letrasFetch(transUrl)
    if (transHtml) {
      transLines = parseGeniusPage(transHtml)
    }
  }

  return {
    original: origLines,
    romaji: romLines,
    translated: transLines,
    sourceUrl: songUrl,
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

  // 2. Parsear página original (y traducción inline si está presente)
  const cleanBaseUrl = songPageResult.url.replace(/\/$/, '')
  const songPage = songPageResult.html ?? (await letrasFetch(songPageResult.url))
  const parsed = songPage ? parseLetrasSongPage(songPage) : null

  // Si la página original ya trajo traducción alineada, usarla; si no, buscar traduccion.html
  let translated = parsed?.translated && parsed.translated.length === (parsed.original?.length || 0)
    ? parsed.translated
    : null

  if (!translated) {
    const transPage = await letrasFetch(`${cleanBaseUrl}/traduccion.html`)
    translated = transPage ? parseLetrasTranslationPage(transPage) : null
  }

  let romaji = parsed?.romaji ?? []
  if (parsed?.original && parsed.original.length > 0 && romaji.every((r) => !r)) {
    // Si Letras.com no contenía romaji, intentar complementar con Genius
    const genius = await fetchGeniusLyrics(title, artist)
    if (genius && genius.romaji.length > 0) {
      if (genius.romaji.length === parsed.original.length) {
        romaji = genius.romaji
      } else if (genius.original.length === genius.romaji.length) {
        parsed.original = genius.original
        romaji = genius.romaji
      } else {
        romaji = parsed.original.map((_, i) => genius.romaji[i] || '')
      }
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
  searchGeniusApi,
  fetchGeniusLyrics,
  slugify,
  clearCache: () => letrasCache.clear(),
}
