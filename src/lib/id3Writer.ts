import { ID3Writer } from 'browser-id3-writer';

interface ID3Tags {
  title: string;
  artist: string;
  album: string;
  albumArtist?: string;
  coverUrl?: string;
  year?: number;
  trackNumber?: number;
  genre?: string;
}

/**
 * Fetches an image and returns its ArrayBuffer + MIME type.
 */
async function fetchCoverArt(url: string): Promise<{ buffer: ArrayBuffer; mime: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn('[id3Writer] Cover fetch failed:', res.status, url);
      return null;
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = await res.arrayBuffer();
    return { buffer, mime: contentType.split(';')[0] };
  } catch (e) {
    console.warn('[id3Writer] Cover fetch error:', e);
    return null;
  }
}

/**
 * Takes raw MP3 ArrayBuffer, writes ID3v2 tags (title, artist, album, cover art),
 * and returns a new Blob with the metadata embedded.
 */
export async function writeID3Tags(mp3Buffer: ArrayBuffer, tags: ID3Tags): Promise<Blob> {
  const writer = new ID3Writer(mp3Buffer);
  const albumArtist = tags.albumArtist?.trim() || tags.artist;

  // Core text frames
  writer.setFrame('TIT2', tags.title);       // Title
  writer.setFrame('TPE1', [tags.artist]);     // Artist(s)
  writer.setFrame('TPE2', albumArtist);       // Album artist / band
  writer.setFrame('TALB', tags.album);        // Album

  if (tags.year) {
    writer.setFrame('TYER', tags.year);       // Year
  }

  if (tags.trackNumber) {
    writer.setFrame('TRCK', String(tags.trackNumber)); // Track number
  }

  if (tags.genre) {
    writer.setFrame('TCON', [tags.genre]);    // Genre
  }

  // Album art (APIC frame)
  if (tags.coverUrl) {
    const cover = await fetchCoverArt(tags.coverUrl);
    if (cover) {
      writer.setFrame('APIC', {
        type: 3, // Cover (front)
        data: cover.buffer,
        description: 'Cover',
        useUnicodeEncoding: false,
      });
    }
  }

  writer.addTag();
  return writer.getBlob();
}
