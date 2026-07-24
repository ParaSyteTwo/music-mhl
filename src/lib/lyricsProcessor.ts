import type { Lang } from '@/lib/language'

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

export type LyricSourceLang = Lang | 'unknown'

const ES_WORDS = /\b(el|la|los|las|un|una|unos|unas|de|del|que|y|en|por|para|con|sin|mi|tu|yo|te|me|se|su|sus|es|soy|eres|somos|estoy|estas|esta|hay|amor|corazon|vida|noche|dia|alma|cielo|ojos|quiero|puedo|porque|cuando|donde|como|aunque|siempre|nunca|nada|todo|toda|contigo|conmigo|baila|besame|deja|sigo)\b/gi
const EN_WORDS = /\b(the|and|you|your|me|my|i|we|to|of|in|on|for|with|without|love|heart|life|night|day|soul|eyes|want|are|is|am|like|baby|because|when|where|always|never|nothing|everything|dance|kiss|let|still)\b/gi

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length
}

export function detectLatinLyricLanguage(text: string): LyricSourceLang {
  const sample = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!sample) return 'unknown'
  const raw = text.toLowerCase()
  const hasSpanishSignals =
    /[áéíóúñ¿¡]/i.test(text) ||
    /\b(que|porque|aunque|estoy|eres|corazon|cancion|contigo|conmigo|quiero)\b/i.test(raw)
  const esScore = countMatches(sample, ES_WORDS) + (hasSpanishSignals ? 3 : 0)
  const enScore = countMatches(sample, EN_WORDS)

  if (esScore >= 4 && esScore >= enScore + 1) return 'es'
  if (enScore >= 4 && enScore >= esScore + 1) return 'en'
  return 'unknown'
}

export function detectLyricSourceLanguage(text: string, script = detectScript(text)): LyricSourceLang {
  return script === 'latin' ? detectLatinLyricLanguage(text) : 'unknown'
}

export function shouldTranslateLyrics(
  sourceLang: LyricSourceLang,
  targetLang: Lang,
  enabled: boolean,
): boolean {
  if (!enabled) return false
  return sourceLang === 'unknown' || sourceLang !== targetLang
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
      const { default: kuromoji } = await import('kuromoji/build/kuromoji.js')
      const isAndroid = typeof navigator !== 'undefined' &&
        /android/i.test(navigator.userAgent)
      const dictPath = isAndroid
        ? 'file:///android_asset/public/kuromoji-dict/'
        : '/kuromoji-dict/'

      const analyzer = {
        tokenizer: null as JapaneseTokenizer | null,
        init() {
          return new Promise<void>((resolve, reject) => {
            kuromoji.builder({ dicPath: dictPath }).build((error, tokenizer) => {
              if (error) {
                reject(error)
                return
              }
              this.tokenizer = tokenizer
              resolve()
            })
          })
        },
        async parse(text: string) {
          if (!this.tokenizer) throw new Error('Japanese analyzer is not initialized')
          return this.tokenizer.tokenize(text)
        },
      }

      const ks = new Kuroshiro()
      await ks.init(analyzer)
      _kuroshiro = ks
    } catch (e) {
      console.warn('[lyrics] kuroshiro-kuromoji init failed:', e)
      _kuroshiro = null
    }
  })()

  return _kuroshiroPromise.then(() => _kuroshiro)
}

// ─── Romanization ────────────────────────────────────────────────────────────

export async function romanizeLines(lines: string[], _script: Script): Promise<string[]> {
  try {
    const output: string[] = []
    for (const line of lines) {
      const lineScript = detectScript(line)
      if (lineScript === 'latin') output.push(line)
      else if (lineScript === 'japanese') output.push((await _romanizeJapanese([line]))[0])
      else if (lineScript === 'korean') output.push((await _romanizeKorean([line]))[0])
      else if (lineScript === 'chinese') output.push((await _romanizeChinese([line]))[0])
      else output.push((await _romanizeOther([line]))[0])
    }
    return output
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
  const initials = [
    'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's',
    'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h',
  ]
  const vowels = [
    'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa',
    'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i',
  ]
  const finals = [
    '', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k',
    'm', 'p', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't',
    't', 'ng', 't', 't', 'k', 't', 'p', 't',
  ]

  return lines.map((line) => Array.from(line).map((char) => {
    const code = char.charCodeAt(0)
    if (code < 0xac00 || code > 0xd7a3) return char
    const syllable = code - 0xac00
    const initial = Math.floor(syllable / 588)
    const vowel = Math.floor((syllable % 588) / 28)
    const final = syllable % 28
    return `${initials[initial]}${vowels[vowel]}${finals[final]}`
  }).join(''))
}

async function _romanizeChinese(lines: string[]): Promise<string[]> {
  const { pinyin } = await import('pinyin-pro')
  return lines.map(l => l.trim()
    ? pinyin(l, { toneType: 'none', separator: ' ' })
    : l
  )
}

async function _romanizeOther(lines: string[]): Promise<string[]> {
  const { transliterate } = await import('transliteration')
  return lines.map(l => l.trim() ? transliterate(l) : l)
}

// ─── Translation via MyMemory (gratuito, sin API key) ────────────────────────

export async function translateLines(lines: string[], targetLang: Lang): Promise<string[] | null> {
  const indexed = lines.map((l, i) => ({ i, l })).filter(x => x.l.trim())
  if (!indexed.length) return null

  const translated = await _translateInChunks(indexed.map(x => x.l), targetLang)
  if (!translated) return null

  const result = new Array(lines.length).fill('')
  indexed.forEach(({ i }, pos) => { result[i] = translated[pos] ?? '' })
  return result
}

async function _translateInChunks(lines: string[], lang: Lang): Promise<string[] | null> {
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

async function _callMyMemory(text: string, lang: Lang): Promise<string | null> {
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
  latinOnly?: boolean
}

function normalizeLyricLine(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function areLyricLinesEquivalent(left: string, right: string): boolean {
  const normalizedLeft = normalizeLyricLine(left)
  return normalizedLeft.length > 0 && normalizedLeft === normalizeLyricLine(right)
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

    const selectedLines: string[] = []
    const pushDistinct = (line: string | undefined) => {
      if (
        !line?.trim() ||
        selectedLines.some((selected) => areLyricLinesEquivalent(selected, line))
      ) {
        return
      }
      selectedLines.push(line)
      plain.push(line)
    }

    const rom = romanized?.[idx]
    if (flags.latinOnly) {
      pushDistinct(rom || text)
    } else {
      if (flags.original) pushDistinct(text)
      if (flags.romanization) pushDistinct(rom)
    }

    const tra = translated?.[idx]
    if (flags.translation) pushDistinct(tra)
    synced.push(`${ts}${selectedLines.join('  •  ')}`)
  })

  return { synced: synced.join('\n'), plain: plain.join('\n') }
}

// ─── Pipeline completo ───────────────────────────────────────────────────────

export interface LyricPrefs {
  lyricOriginal: boolean
  lyricRomanization: boolean
  lyricTranslation: boolean
  lyricLatinOnly?: boolean
  deviceLang: Lang
}

export async function processLyrics(
  syncedLrc: string,
  plainLrc: string,
  prefs: LyricPrefs,
): Promise<{ synced: string | null; plain: string | null }> {
  if (!syncedLrc) {
    if (!plainLrc || !prefs.lyricLatinOnly) return { synced: null, plain: plainLrc || null }
    const plainLines = plainLrc.split('\n')
    const script = detectScript(plainLines.join('\n').slice(0, 500))
    if (script === 'latin') return { synced: null, plain: plainLrc }
    const romanized = await romanizeLines(plainLines, script)
    return { synced: null, plain: romanized.join('\n') || null }
  }

  const rawLines = syncedLrc.split('\n').map(l => {
    const m = LRC_RE.exec(l); return m ? m[2] : l
  })
  const sample = rawLines.join('\n').slice(0, 500)
  const script = detectScript(sample)
  const isLatin = script === 'latin'
  const sourceLang = detectLyricSourceLanguage(sample, script)
  const shouldTranslate = shouldTranslateLyrics(sourceLang, prefs.deviceLang, prefs.lyricTranslation)

  const [romanized, translated] = await Promise.all([
    (prefs.lyricRomanization || prefs.lyricLatinOnly) && !isLatin
      ? romanizeLines(rawLines, script)
      : Promise.resolve(null),
    shouldTranslate
      ? translateLines(rawLines, prefs.deviceLang)
      : Promise.resolve(null),
  ])

  const { synced, plain } = buildLRC(syncedLrc, romanized, translated, {
    original:     prefs.lyricOriginal,
    romanization: prefs.lyricRomanization,
    translation:  shouldTranslate,
    latinOnly:    prefs.lyricLatinOnly,
  })

  return { synced: synced || null, plain: plain || null }
}
