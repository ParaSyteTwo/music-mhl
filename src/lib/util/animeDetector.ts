// Detector compartido: misma regex que `musicApi.looksAnimeLike` (sobre título/artista/álbum)
// más las keywords de query del plan §2.1 (anime, opening, ending, ost, theme song)
// y el patrón `<algo> (op|ed|opening|ending) <n?>`. Mantener sincronizadas las dos regex.

const ANIME_TITLE_KEYWORDS = /(anime|opening|ending|\bop\b|\bed\b|theme|ost|project|isekai)/i;
const ANIME_QUERY_KEYWORDS = /\b(anime|opening|ending|ost|theme song)\b/i;
const ANIME_QUERY_REGEX = /^.+\s+(op|ed|opening|ending)\s*\d*$/i;

export interface AnimeLikeTrack {
  title: string;
  artist: string;
  album: string;
}

export function looksAnimeLike(track: AnimeLikeTrack): boolean {
  const source = `${track.title} ${track.artist} ${track.album}`.toLowerCase();
  return ANIME_TITLE_KEYWORDS.test(source);
}

export function looksAnimeLikeQuery(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  return ANIME_QUERY_KEYWORDS.test(trimmed) || ANIME_QUERY_REGEX.test(trimmed);
}
