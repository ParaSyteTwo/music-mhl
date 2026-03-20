import type { LocalTrack } from '@/types/music';

// Simple ID3v2 tag parser (browser-compatible, no Buffer dependency)
async function extractID3Tags(file: File): Promise<{
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  duration?: number;
}> {
  try {
    // Read first 512KB — covers large embedded album art (typical JPEG cover = 100-300KB)
    const READ_SIZE = 512 * 1024; // 512KB
    const fileSize = file.size;
    const readSize = Math.min(READ_SIZE, fileSize);

    // Use slice to read only the needed portion
    const fileSlice = file.slice(0, readSize);
    const buffer = await fileSlice.arrayBuffer();
    const view = new Uint8Array(buffer);
    
    // Check for ID3v2 header
    const id3Header = String.fromCharCode(view[0], view[1], view[2]);
    if (id3Header !== 'ID3') {
      return {}; // No ID3 tags
    }

    // ID3v2 version byte: 3 = ID3v2.3 (big-endian frame sizes), 4 = ID3v2.4 (synchsafe)
    const id3Version = view[3];

    // Parse basic ID3v2 structure
    const result: Record<string, string | undefined> = {};
    let coverUrl = '';

    // Skip ID3 header (10 bytes) and read frames
    let pos = 10;
    const maxPos = buffer.byteLength; // Scan the full read buffer for APIC frames

    while (pos + 10 < maxPos) {
      const frameID = String.fromCharCode(view[pos], view[pos + 1], view[pos + 2], view[pos + 3]);

      // ID3v2.4 uses synchsafe integers (7 bits per byte), v2.3 uses normal big-endian 32-bit
      let frameSize: number;
      if (id3Version >= 4) {
        frameSize = (view[pos + 4] << 21) | (view[pos + 5] << 14) | (view[pos + 6] << 7) | view[pos + 7];
      } else {
        frameSize = (view[pos + 4] << 24) | (view[pos + 5] << 16) | (view[pos + 6] << 8) | view[pos + 7];
      }

      if (frameSize <= 0 || frameSize > buffer.byteLength - pos) break;
      
      // Read frame data with proper encoding detection
      const frameDataBytes = view.slice(pos + 10, pos + 10 + Math.min(frameSize, 500000));
      
      // Handle APIC (Attached Picture) frame
      if (frameID === 'APIC' && !coverUrl) {
        try {
          // APIC format: encoding (1 byte) + MIME type (null-terminated) + description (null-terminated) + picture data
          let cursor = 1; // Skip encoding byte
          
          // Read MIME type (find null terminator)
          const mimeStart = cursor;
          while (cursor < frameDataBytes.length && frameDataBytes[cursor] !== 0) {
            cursor++;
          }
          const mimeType = new TextDecoder('utf-8').decode(frameDataBytes.slice(mimeStart, cursor));
          cursor++; // Skip null terminator
          
          // Skip picture type byte
          cursor++;
          
          // Skip description (find null terminator)
          while (cursor < frameDataBytes.length && frameDataBytes[cursor] !== 0) {
            cursor++;
          }
          cursor++; // Skip null terminator
          
          // Rest is picture data
          const pictureData = frameDataBytes.slice(cursor);
          if (pictureData.length > 0) {
            // Convert to base64
            let binary = '';
            for (let i = 0; i < pictureData.length; i++) {
              binary += String.fromCharCode(pictureData[i]);
            }
            const base64 = btoa(binary);
            coverUrl = `data:${mimeType};base64,${base64}`;
          }
        } catch (err) {
          console.warn('Failed to extract APIC:', err);
        }
      }
      
      // Handle text frames (same as before)
      if (frameID.charAt(0) === 'T' && frameID !== 'TXXX') {
        let frameData = '';
        const encoding = frameDataBytes[0];
        const dataStart = 1;
        
        try {
          if (encoding === 1 || encoding === 2) {
            frameData = new TextDecoder('utf-16').decode(frameDataBytes.slice(dataStart));
          } else if (encoding === 3) {
            frameData = new TextDecoder('utf-8').decode(frameDataBytes.slice(dataStart));
          } else {
            frameData = new TextDecoder('iso-8859-1').decode(frameDataBytes.slice(dataStart));
          }
        } catch {
          frameData = new TextDecoder('utf-8', { fatal: false }).decode(frameDataBytes);
        }
        
        // Clean up
        // eslint-disable-next-line no-control-regex
        frameData = frameData.replace(/\0/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim();
        
        if (frameID === 'TIT2') result.title = frameData; // Title
        if (frameID === 'TPE1') result.artist = frameData; // Artist
        if (frameID === 'TALB') result.album = frameData; // Album
      }
      
      pos += 10 + frameSize;
      if (frameID.charCodeAt(0) === 0) break; // Padding reached
    }
    
    if (coverUrl) result.coverUrl = coverUrl;
    return result;
  } catch (err) {
    console.error('ID3 parsing error:', err);
    return {};
  }
}

// Cache for enriched metadata (avoid repeated API calls)
const metadataCache = new Map<string, { title: string; artist: string; album: string; cover: string; duration: number; timestamp: number }>();

// Fetch from MusicBrainz API (free, no key required)
async function enrichFromMusicBrainz(
  title: string,
  artist: string
): Promise<{ album?: string; cover?: string }> {
  try {
    const cacheKey = `${artist}|${title}`;
    const cached = metadataCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 7 * 24 * 60 * 60 * 1000) {
      // Cache valid for 7 days
      return { album: cached.album, cover: cached.cover };
    }

    // MusicBrainz search API
    const query = encodeURIComponent(`artist:"${artist}" recording:"${title}"`);
    const res = await fetch(`https://musicbrainz.org/ws/2/recording?query=${query}&fmt=json&limit=1`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return {};
    const data = await res.json();

    if (data.recordings?.[0]) {
      const recording = data.recordings[0];
      const album = recording['release-list']?.[0]?.title || undefined;
      
      // Try to get album art from Cover Art Archive
      let cover = '';
      try {
        const mbid = recording['release-list']?.[0]?.id;
        if (mbid) {
          cover = `https://coverartarchive.org/release/${mbid}/front-500.jpg`;
          // Verify it exists
          const checkRes = await fetch(cover, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
          if (!checkRes.ok) cover = '';
        }
      } catch {
        cover = '';
      }

      // Cache result
      metadataCache.set(cacheKey, {
        title,
        artist,
        album: album || 'Unknown Album',
        cover,
        duration: 0,
        timestamp: Date.now(),
      });

      return { album, cover };
    }

    return {};
  } catch (err) {
    console.warn('MusicBrainz enrichment error:', err);
    return {};
  }
}

export async function parseLocalFile(file: File): Promise<LocalTrack> {
  const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Try to read ID3 tags first
  const id3Tags = await extractID3Tags(file);
  
  // Fallback to filename parsing
  const nameWithoutExt = file.name.replace(/\.[^.]+$/, '');
  const parts = nameWithoutExt.split(' - ');

  const title = id3Tags.title || parts[0]?.trim() || file.name;
  const artist = id3Tags.artist || parts[1]?.trim() || 'Unknown Artist';
  let album = id3Tags.album || 'Unknown Album';
  let cover = id3Tags.coverUrl || '';

  // Estimate duration from file size
  const estimatedBitrate = 128000; // bits per second
  const estimatedDuration = Math.round((file.size * 8) / estimatedBitrate);

  // Try to enrich with metadata from MusicBrainz if we don't have full info
  if ((!id3Tags.album || !id3Tags.coverUrl) && title && artist !== 'Unknown Artist') {
    try {
      console.log(`Enriching metadata for: ${title} - ${artist}`);
      const enriched = await enrichFromMusicBrainz(title, artist);
      if (enriched.album) album = enriched.album;
      if (enriched.cover) cover = enriched.cover;
    } catch (err) {
      console.warn(`Failed to enrich metadata:`, err);
    }
  }

  return {
    id,
    isLocal: true,
    localPath: file.name,
    title,
    artist,
    album,
    genre: '',
    duration: Math.min(estimatedDuration, 600),
    cover,
    playCount: 0,
    importedAt: Date.now(),
    preview: undefined,
  };
}

export async function parseLocalFiles(files: FileList | File[]): Promise<LocalTrack[]> {
  const fileArray = Array.from(files);
  console.log(`Parsing ${fileArray.length} files`);

  const fulfilled: LocalTrack[] = [];
  const failed: unknown[] = [];

  // Process in batches of 3 to limit concurrent metadata extraction
  // (each file slice + ID3 parsing is I/O intensive)
  const BATCH_SIZE = 3;

  for (let i = 0; i < fileArray.length; i += BATCH_SIZE) {
    const batch = fileArray.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map((file) => {
        console.log(`Started parsing: ${file.name}`);
        return parseLocalFile(file)
          .then(result => {
            console.log(`Successfully parsed: ${file.name}`);
            return result;
          })
          .catch(err => {
            console.error(`Failed to parse ${file.name}:`, err);
            throw err;
          });
      })
    );

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        fulfilled.push(result.value);
      } else {
        failed.push(result);
      }
    });
  }

  if (failed.length > 0) {
    console.warn(`${failed.length} files failed to parse`);
  }

  console.log(`Parse complete: ${fulfilled.length} succeeded, ${failed.length} failed`);
  return fulfilled;
}
