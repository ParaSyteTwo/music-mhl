// Descarga con yt-dlp local bundleado en el .exe
import { Command } from '@tauri-apps/plugin-shell';
import { invoke } from '@tauri-apps/api/core';

export async function getYtdlpPath(): Promise<string> {
  const resourceDir = await invoke<string>('get_resource_path', { resource: 'resources/win/yt-dlp.exe' });
  return resourceDir;
}

export async function downloadWithYtdlp(
  videoId: string,
  outputDir: string,
  title: string,
  artist: string,
  onProgress?: (pct: number) => void
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const ytdlpPath = await getYtdlpPath();
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const safeTitle = title.replace(/[/\\?<>:*|"]/g, '_');
    const safeArtist = artist.replace(/[/\\?<>:*|"]/g, '_');
    const outputTemplate = `${outputDir}\\${safeArtist} - ${safeTitle}.%(ext)s`;

    const command = Command.create('ytdlp-exec', [
      url,
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--add-metadata',
      '--embed-thumbnail',
      '-o', outputTemplate,
      '--newline',
      '--no-playlist',
    ], { program: ytdlpPath });

    return new Promise((resolve) => {
      command.stdout.on('data', (line: string) => {
        const match = line.match(/\[download\]\s+([\d.]+)%/);
        if (match && onProgress) onProgress(parseFloat(match[1]));
      });
      command.on('close', (data) => {
        if (data.code === 0) {
          resolve({ success: true, path: outputDir });
        } else {
          resolve({ success: false, error: `yt-dlp salió con código ${data.code}` });
        }
      });
      command.on('error', (err) => resolve({ success: false, error: err }));
      command.spawn().catch((err) => resolve({ success: false, error: String(err) }));
    });
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
