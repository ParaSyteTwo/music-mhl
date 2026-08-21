import { Track } from '@/types/music';

export function cleanTrackTitleForFileName(title: string): string {
  const normalized = title
    .replace(/\s+/g, ' ')
    .replace(/\b(opening|ending)\s+theme\s+song\b/gi, '')
    .replace(/\b(opening|ending)\s+theme\b/gi, '')
    .replace(/\btheme\s+song\b/gi, '')
    .replace(/\b(ost|original soundtrack|soundtrack)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const parts = normalized.split(/\s[-\u2013]\s/); // Includes em-dash
  if (parts.length > 1) {
    const [first, ...rest] = parts;
    const suffix = rest.join(' - ');
    if (/(opening|ending|theme|ost|soundtrack|season|anime|ver\.?|version)/i.test(suffix)) {
      return first.trim() || normalized;
    }
  }

  return normalized || title.trim();
}

export function buildDownloadFileName(track: Track, fileExtension: string): string {
  const preferredTitle = track.canonicalTitle?.trim() || track.title;
  const cleanTitle = cleanTrackTitleForFileName(preferredTitle);
  return `${cleanTitle} - ${track.artist}.${fileExtension}`
    .replace(/[\/\\?%*:|"<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getPreferredAlbumName(track: Track): string {
  return track.canonicalAlbum?.trim() || track.album;
}
