import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { isPyWebView } from '@/lib/platform';

export interface BackupExportResult {
  success: boolean;
  cancelled?: boolean;
  location?: string;
  fileName?: string;
  error?: string;
}

export interface BackupImportResult {
  success: boolean;
  cancelled?: boolean;
  data?: string;
  location?: string;
  error?: string;
}

export type BackupParseResult =
  | { valid: true; normalized: string; trackCount: number }
  | { valid: false; reason: 'corrupt' | 'invalid' };

interface PyWebViewBackupApi {
  export_backup?: (
    jsonContent: string,
    defaultName: string,
  ) => Promise<{
    success: boolean;
    cancelled?: boolean;
    filePath?: string;
    fileName?: string;
    error?: string;
  }>;
  import_backup?: () => Promise<{
    success: boolean;
    cancelled?: boolean;
    data?: string;
    filePath?: string;
    error?: string;
  }>;
}

function getPyWebViewBackupApi(): PyWebViewBackupApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { pywebview?: { api?: PyWebViewBackupApi } }).pywebview?.api;
}

export function buildDefaultBackupFileName(date = new Date()): string {
  const isoDay = date.toISOString().split('T')[0];
  return `mhl-music-backup-${isoDay}.json`;
}

export function parseAndValidateBackup(raw: string): BackupParseResult {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { valid: false, reason: 'corrupt' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, reason: 'corrupt' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, reason: 'invalid' };
  }

  const state = (parsed as { state?: unknown }).state;
  if (!state || typeof state !== 'object') {
    return { valid: false, reason: 'invalid' };
  }

  const downloads = (state as { downloads?: unknown }).downloads;
  if (!Array.isArray(downloads)) {
    return { valid: false, reason: 'invalid' };
  }

  return {
    valid: true,
    normalized: JSON.stringify(parsed),
    trackCount: downloads.length,
  };
}

export async function exportAppBackup(rawState: string): Promise<BackupExportResult> {
  if (!rawState || !rawState.trim()) {
    return { success: false, error: 'Empty backup state' };
  }

  const fileName = buildDefaultBackupFileName();

  if (isPyWebView || getPyWebViewBackupApi()?.export_backup) {
    const api = getPyWebViewBackupApi();
    if (api?.export_backup) {
      const res = await api.export_backup(rawState, fileName);
      if (res?.cancelled) return { success: false, cancelled: true };
      if (!res?.success) {
        return { success: false, error: res?.error || 'Desktop backup export failed' };
      }
      return {
        success: true,
        location: res.filePath || res.fileName || fileName,
        fileName: res.fileName || fileName,
      };
    }
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const relativePath = `MHL Music/${fileName}`;
      await Filesystem.writeFile({
        path: relativePath,
        data: rawState,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      return {
        success: true,
        location: `Documentos/MHL Music/${fileName}`,
        fileName,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Android backup export failed',
      };
    }
  }

  const blob = new Blob([rawState], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
  return { success: true, location: fileName, fileName };
}

export async function importAppBackupDesktop(): Promise<BackupImportResult> {
  if (!isPyWebView && !getPyWebViewBackupApi()?.import_backup) {
    return { success: false, error: 'Not on Desktop pywebview' };
  }
  const api = getPyWebViewBackupApi();
  if (!api?.import_backup) {
    return { success: false, error: 'Desktop backup import bridge unavailable' };
  }
  const res = await api.import_backup();
  if (res?.cancelled) {
    return { success: false, cancelled: true };
  }
  if (!res?.success || typeof res.data !== 'string') {
    return { success: false, error: res?.error || 'Could not read backup file' };
  }
  return {
    success: true,
    data: res.data,
    location: res.filePath,
  };
}
