import { Capacitor, registerPlugin } from '@capacitor/core';

export interface AudioPlayer {
  packageName: string;
  label: string;
  icon?: string;
}

type OpenFilePlugin = {
  openDownloadedFile(options: {
    fileName?: string;
    mediaUri?: string;
    preferredPackage?: string;
  }): Promise<void>;
  getAudioPlayers(): Promise<{ players: AudioPlayer[] }>;
};

const OpenFile = registerPlugin<OpenFilePlugin>('OpenFile');

/**
 * Abre un archivo de audio en un reproductor externo.
 * Usa la URI de MediaStore si está disponible; queryea por nombre si no.
 * Si preferredPackage está set, va directo sin chooser y desde el inicio.
 */
export async function openDownloadedFile(
  fileName?: string,
  mediaUri?: string,
  preferredPackage?: string,
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (!fileName && !mediaUri) return false;
  try {
    await OpenFile.openDownloadedFile({ fileName, mediaUri, preferredPackage });
    return true;
  } catch (e) {
    console.warn('[openFileBridge] openDownloadedFile failed:', e);
    return false;
  }
}

/**
 * Devuelve la lista de apps instaladas que pueden reproducir audio.
 * Solo funciona en Android.
 */
export async function getAudioPlayers(): Promise<AudioPlayer[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const { players } = await OpenFile.getAudioPlayers();
    return players ?? [];
  } catch (e) {
    console.warn('[openFileBridge] getAudioPlayers failed:', e);
    return [];
  }
}
