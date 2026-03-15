import { supabase } from '@/integrations/supabase/client';
import { Track } from '@/types/music';

// ─── Deezer Search ───
export async function searchDeezer(query: string): Promise<Track[]> {
  const { data, error } = await supabase.functions.invoke('deezer-search', {
    body: { query, limit: 25 },
  });

  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'Search failed');

  return (data.tracks || []).map((t: any) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    duration: t.duration,
    cover: t.cover,
    coverSmall: t.coverSmall,
    preview: t.preview, // Deezer 30s preview
    deezerId: t.deezerId,
  }));
}

// ─── Deezer Trending ───
export async function getTrendingTracks(limit: number = 20): Promise<Track[]> {
  try {
    const response = await fetch('https://api.deezer.com/chart/0/tracks?limit=' + limit);
    const data = await response.json();
    
    if (!data.data) throw new Error('No trending data');
    
    return data.data.map((t: any) => ({
      id: t.id,
      title: t.title,
      artist: t.artist?.name || 'Unknown Artist',
      album: t.album?.title || 'Unknown Album',
      duration: t.duration,
      cover: t.album?.cover_big || t.album?.cover_medium,
      coverSmall: t.album?.cover_small,
      preview: t.preview_url,
      deezerId: t.id,
    }));
  } catch (error) {
    console.error('Trending fetch failed:', error);
    return [];
  }
}

// ─── YouTube Audio ───
export async function searchYouTube(query: string) {
  const { data, error } = await supabase.functions.invoke('yt-stream', {
    body: { action: 'search', query },
  });

  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'YouTube search failed');
  return data.results || [];
}

export async function getYouTubeStream(videoId: string) {
  const { data, error } = await supabase.functions.invoke('yt-stream', {
    body: { action: 'stream', videoId },
  });

  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'Stream fetch failed');
  return data;
}

// ─── LRCLIB Lyrics (public API, CORS-friendly) ───
export async function fetchLyrics(
  title: string,
  artist: string,
  album?: string,
  duration?: number
): Promise<{ lyrics: string; syncedLyrics: string | null } | null> {
  try {
    const params = new URLSearchParams({
      track_name: title,
      artist_name: artist,
    });
    if (album) params.set('album_name', album);
    if (duration) params.set('duration', String(duration));

    const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: { 'User-Agent': 'MHL v1.0 (https://mhl.app)' },
    });

    if (!response.ok) return null;
    const data = await response.json();

    return {
      lyrics: data.plainLyrics || '',
      syncedLyrics: data.syncedLyrics || null,
    };
  } catch {
    return null;
  }
}

// ─── Language Detection ───
export async function detectLanguage(text: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.libretranslate.de/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.result?.language || null;
  } catch {
    return null;
  }
}

// ─── Smart Translation with Fallbacks ───
export async function detectAndTranslate(lyrics: string): Promise<string | null> {
  try {
    // Get system language
    const systemLang = navigator.language.split('-')[0];
    
    // Skip if system language is English
    if (systemLang === 'en') return null;

    // Detect lyrics language
    const detectedLang = await detectLanguage(lyrics);
    
    // Skip if detected language matches system language
    if (detectedLang === systemLang) return null;

    // Split into chunks (max 400 chars, break at newlines)
    const chunks: string[] = [];
    let currentChunk = '';
    
    for (const line of lyrics.split('\n')) {
      if ((currentChunk + line).length > 400) {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = line;
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }
    if (currentChunk) chunks.push(currentChunk);

    // Try translation services
    let translated = '';
    const deepLKey = import.meta.env.VITE_DEEPL_API_KEY;
    
    // Try DeepL first
    if (deepLKey) {
      try {
        const deepLResult = await Promise.all(
          chunks.map((chunk) =>
            fetch('https://api-free.deepl.com/v1/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: chunk,
                source_lang: detectedLang?.toUpperCase() || 'AUTO',
                target_lang: systemLang.toUpperCase(),
                auth_key: deepLKey,
              }),
            }).then((r) => (r.ok ? r.json() : null))
          )
        );
        if (deepLResult.every(Boolean)) {
          translated = deepLResult.map((r) => r.translations[0].text).join('\n');
          return translated;
        }
      } catch {
        // Fall through to LibreTranslate
      }
    }

    // Try LibreTranslate
    try {
      const libreResult = await Promise.all(
        chunks.map((chunk) =>
          fetch('https://api.libretranslate.de/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              q: chunk,
              source_language: detectedLang || 'auto',
              target_language: systemLang,
            }),
          }).then((r) => (r.ok ? r.json() : null))
        )
      );
      if (libreResult.every(Boolean)) {
        translated = libreResult.map((r) => r.translatedText).join('\n');
        return translated;
      }
    } catch {
      // Fall through to MyMemory
    }

    // Try MyMemory (last resort)
    try {
      const memoryResult = await Promise.all(
        chunks.map((chunk) =>
          fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk.slice(0, 500))}&langpair=${detectedLang || 'en'}|${systemLang}`
          ).then((r) => (r.ok ? r.json() : null))
        )
      );
      if (memoryResult.every(Boolean)) {
        translated = memoryResult.map((r) => r.responseData?.translatedText || '').join('\n');
        if (translated) return translated;
      }
    } catch {
      // All failed
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Translate text (simple free translation) ───
export async function translateText(text: string, targetLang: string = 'es'): Promise<string> {
  try {
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|${targetLang}`
    );
    if (!response.ok) return text;
    const data = await response.json();
    return data.responseData?.translatedText || text;
  } catch {
    return text;
  }
}
