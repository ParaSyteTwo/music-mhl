export interface LyricLineGroup {
  time: number; // seconds (-1 when unsynced)
  texts: string[];
}

export interface ParsedLyrics {
  synced: boolean;
  lines: LyricLineGroup[];
}

const TIMESTAMP_LINE_RE = /^((?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\])+)(.*)$/;
const SINGLE_TIMESTAMP_RE = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const LRC_METADATA_TAG_RE = /^\[(ti|ar|al|au|by|length|offset|re|ve):.*\]$/i;

function parseTimestampSeconds(minutesStr: string, secondsStr: string, fracStr?: string): number {
  const minutes = Number.parseInt(minutesStr, 10);
  const seconds = Number.parseInt(secondsStr, 10);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return -1;
  let frac = 0;
  if (fracStr) {
    const padded = fracStr.length === 1 ? `${fracStr}00` : fracStr.length === 2 ? `${fracStr}0` : fracStr.slice(0, 3);
    frac = Number.parseInt(padded, 10) / 1000;
  }
  return minutes * 60 + seconds + frac;
}

/**
 * Parses embedded LRC (single or multi-layer original/romaji/translation sharing timestamps)
 * or plain unsynced lyrics into sorted display groups.
 */
export function parseSyncedLyrics(raw: string): ParsedLyrics {
  if (!raw || typeof raw !== 'string') {
    return { synced: false, lines: [] };
  }

  const rawLines = raw.replace(/\r\n?/g, '\n').split('\n');
  const timeBuckets = new Map<number, string[]>();
  const plainLines: string[] = [];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed || LRC_METADATA_TAG_RE.test(trimmed)) continue;

    const match = trimmed.match(TIMESTAMP_LINE_RE);
    if (match) {
      const tagsPart = match[1];
      const text = match[2].trim();
      SINGLE_TIMESTAMP_RE.lastIndex = 0;
      let tagMatch: RegExpExecArray | null;
      while ((tagMatch = SINGLE_TIMESTAMP_RE.exec(tagsPart)) !== null) {
        const sec = parseTimestampSeconds(tagMatch[1], tagMatch[2], tagMatch[3]);
        if (sec < 0) continue;
        // Bucket at millisecond granularity so multi-layer lyrics (original/romaji/translation) group cleanly
        const key = Math.round(sec * 1000);
        const existing = timeBuckets.get(key);
        if (existing) {
          if (text && !existing.includes(text)) {
            existing.push(text);
          }
        } else {
          timeBuckets.set(key, text ? [text] : []);
        }
      }
    } else {
      plainLines.push(trimmed);
    }
  }

  if (timeBuckets.size > 0) {
    const sorted = Array.from(timeBuckets.entries())
      .sort((a, b) => a[0] - b[0])
      .filter(([, texts]) => texts.length > 0)
      .map(([ms, texts]) => ({ time: ms / 1000, texts }));
    return { synced: true, lines: sorted };
  }

  return {
    synced: false,
    lines: plainLines.map((text) => ({ time: -1, texts: [text] })),
  };
}

export function findActiveLyricIndex(lines: LyricLineGroup[], currentTime: number): number {
  if (!lines.length || !Number.isFinite(currentTime)) return -1;
  let active = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].time < 0) continue;
    if (lines[i].time <= currentTime + 0.15) {
      active = i;
    } else {
      break;
    }
  }
  return active;
}
