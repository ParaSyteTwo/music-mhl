const MYMEMORY_URL = 'https://api.mymemory.translated.net/get'
const MAX_CHARS = 450

// ─── Script Detection (expanded for ALL non-Latin scripts) ──────────────────

export type Script =
  | 'japanese'   // kanji + kana
  | 'korean'     // hangul
  | 'chinese'    // hanzi (simplified/traditional)
  | 'arabic'     // arabic script
  | 'thai'       // thai script
  | 'cyrillic'   // russian, bulgarian, serbian, etc.
  | 'devanagari' // hindi, nepali, etc.
  | 'hebrew'     // hebrew
  | 'greek'      // greek
  | 'latin'      // european languages

export function detectScript(text: string): Script {
  const s = text.slice(0, 200)
  if (/[\uAC00-\uD7A3]/.test(s)) return 'korean'
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(s)) return 'japanese'
  if (/[\u4E00-\u9FFF]/.test(s)) return 'chinese'
  if (/[\u0600-\u06FF]/.test(s)) return 'arabic'
  if (/[\u0E00-\u0E7F]/.test(s)) return 'thai'
  if (/[\u0400-\u04FF]/.test(s)) return 'cyrillic'
  if (/[\u0900-\u097F]/.test(s)) return 'devanagari'
  if (/[\u0590-\u05FF]/.test(s)) return 'hebrew'
  if (/[\u0370-\u03FF]/.test(s)) return 'greek'
  return 'latin'
}

// ─── Kuroshiro singleton (kuromoji dictionary — heavy, load once) ───────────
// kuroshiro y kuromoji-analyzer son CJS. En Android los dicts están en
// android/app/src/main/assets/public/kuromoji-dict/ y se acceden como
// file:///android_asset/public/kuromoji-dict/ desde el WebView.
// En web (Vite dev / build) están en /kuromoji-dict (carpeta pública).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _kuroshiro: any = null
let _kuroshiroLoading = false
let _kuroshiroPromise: Promise<void> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function _getKuroshiro(): Promise<any | null> {
  if (_kuroshiro) return _kuroshiro
  if (_kuroshiroLoading) return _kuroshiroPromise ?? null
  _kuroshiroLoading = true

  _kuroshiroPromise = (async () => {
    try {
      const { default: Kuroshiro } = await import('kuroshiro')
      const { default: KuromojiAnalyzer } = await import('kuroshiro-analyzer-kuromoji/lib/index.js')

      // Detectar plataforma para ubicar los dicts correctamente
      const isAndroid = typeof navigator !== 'undefined' &&
        /android/i.test(navigator.userAgent)
      const dictPath = isAndroid
        ? 'file:///android_asset/public/kuromoji-dict/'
        : '/kuromoji-dict/'

      const ks = new Kuroshiro()
      await ks.init(new KuromojiAnalyzer({ dictPath }))
      _kuroshiro = ks
    } catch (e) {
      console.warn('[lyrics] kuroshiro-kuromoji init failed:', e)
      _kuroshiro = null
    }
  })()

  return _kuroshiroPromise.then(() => _kuroshiro)
}

// ─── Romanization ────────────────────────────────────────────────────────────

export async function romanizeLines(lines: string[], script: Script): Promise<string[]> {
  try {
    if (script === 'japanese') return await _romanizeJapanese(lines)
    if (script === 'korean')   return await _romanizeKorean(lines)
    if (script === 'chinese')  return await _romanizeChinese(lines)
    if (script !== 'latin')    return await _romanizeOther(lines)
  } catch { /* silencioso */ }
  return lines
}

async function _romanizeJapanese(lines: string[]): Promise<string[]> {
  // Try kuroshiro-kuromoji first (handles kanji with proper readings)
  const kuroshiro = await _getKuroshiro()
  if (kuroshiro) {
    const results: string[] = []
    for (const line of lines) {
      if (!line.trim()) { results.push(line); continue }
      try {
        const converted = await kuroshiro.convert(line, { to: 'romaji', mode: 'normal' })
        results.push(converted as string)
      } catch {
        results.push(line)
      }
    }
    return results
  }

  // Fallback: wanakana (handles kana only, passes through kanji it can't read)
  const { toRomaji } = await import('wanakana')
  return lines.map(l => l.trim() ? toRomaji(l) : l)
}

async function _romanizeKorean(lines: string[]): Promise<string[]> {
  const { romanize } = await import('@romanize/korean')
  return lines.map(l => l.trim() ? romanize(l) : l)
}

async function _romanizeChinese(lines: string[]): Promise<string[]> {
  const { pinyin } = await import('pinyin-pro')
  return lines.map(l => l.trim()
    ? pinyin(l, { toneType: 'none', separator: ' ' })
    : l
  )
}

async function _romanizeOther(lines: string[]): Promise<string[]> {
  const { default: transliterate } = await import('transliteration')
  return lines.map(l => l.trim() ? transliterate(l) : l)
}

// ─── Translation via MyMemory (gratuito, sin API key) ────────────────────────

export async function translateLines(lines: string[], targetLang: string): Promise<string[] | null> {
  const indexed = lines.map((l, i) => ({ i, l })).filter(x => x.l.trim())
  if (!indexed.length) return null

  const translated = await _translateInChunks(indexed.map(x => x.l), targetLang)
  if (!translated) return null

  const result = new Array(lines.length).fill('')
  indexed.forEach(({ i }, pos) => { result[i] = translated[pos] ?? '' })
  return result
}

async function _translateInChunks(lines: string[], lang: string): Promise<string[] | null> {
  const chunks: string[][] = []
  let chunk: string[] = [], len = 0
  for (const line of lines) {
    const size = line.length + 1
    if (chunk.length && len + size > MAX_CHARS) { chunks.push(chunk); chunk = [line]; len = size }
    else { chunk.push(line); len += size }
  }
  if (chunk.length) chunks.push(chunk)

  const result: string[] = []
  for (const c of chunks) {
    const out = await _callMyMemory(c.join('\n'), lang)
    if (!out) return null
    const tLines = out.split('\n')
    c.forEach((_, i) => result.push(tLines[i] ?? c[i]))
  }
  return result
}

async function _callMyMemory(text: string, lang: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ q: text, langpair: `autodetect|${lang}` })
    const res = await fetch(`${MYMEMORY_URL}?${params}`)
    if (!res.ok) return null
    const data = await res.json()
    if (data.responseStatus !== 200) return null
    return (data.responseData?.translatedText as string) ?? null
  } catch {
    return null
  }
}

// ─── LRC Builder ─────────────────────────────────────────────────────────────

const LRC_RE = /^\[(\d+:\d+\.\d+)\](.*)/

interface LyricFlags {
  original: boolean
  romanization: boolean
  translation: boolean
}

export function buildLRC(
  syncedLrc: string,
  romanized: string[] | null,
  translated: string[] | null,
  flags: LyricFlags,
): { synced: string; plain: string } {
  const synced: string[] = []
  const plain: string[] = []

  syncedLrc.split('\n').forEach((raw, idx) => {
    const m = LRC_RE.exec(raw)
    if (!m) { synced.push(raw); plain.push(raw); return }

    const ts = `[${m[1]}]`
    const text = m[2]

    if (!text.trim()) { synced.push(ts); plain.push(''); return }

    if (flags.original) { synced.push(`${ts}${text}`); plain.push(text) }

    const rom = romanized?.[idx]
    if (flags.romanization && rom) { synced.push(`${ts}${rom}`); plain.push(rom) }

    const tra = translated?.[idx]
    if (flags.translation && tra) { synced.push(`${ts}${tra}`); plain.push(tra) }
  })

  return { synced: synced.join('\n'), plain: plain.join('\n') }
}

// ─── Pipeline completo ───────────────────────────────────────────────────────

export interface LyricPrefs {
  lyricOriginal: boolean
  lyricRomanization: boolean
  lyricTranslation: boolean
  deviceLang: string
}

export async function processLyrics(
  syncedLrc: string,
  plainLrc: string,
  prefs: LyricPrefs,
): Promise<{ synced: string | null; plain: string | null }> {
  if (!syncedLrc) return { synced: null, plain: plainLrc || null }

  const sample = syncedLrc.replace(LRC_RE, '$2').slice(0, 200)
  const script = detectScript(sample)
  const isLatin = script === 'latin'

  const rawLines = syncedLrc.split('\n').map(l => {
    const m = LRC_RE.exec(l); return m ? m[2] : l
  })

  const [romanized, translated] = await Promise.all([
    prefs.lyricRomanization && !isLatin
      ? romanizeLines(rawLines, script)
      : Promise.resolve(null),
    prefs.lyricTranslation
      ? translateLines(rawLines, prefs.deviceLang)
      : Promise.resolve(null),
  ])

  const { synced, plain } = buildLRC(syncedLrc, romanized, translated, {
    original:     prefs.lyricOriginal,
    romanization: prefs.lyricRomanization,
    translation:  prefs.lyricTranslation,
  })

  return { synced: synced || null, plain: plain || null }
}