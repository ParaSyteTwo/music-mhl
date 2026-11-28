import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SettingsPage from './SettingsPage';

vi.mock('@capacitor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/core')>();
  return {
    ...actual,
    Capacitor: {
      ...actual.Capacitor,
      getPlatform: vi.fn(() => 'android'),
      isNativePlatform: vi.fn(() => true),
    },
    CapacitorHttp: {
      get: vi.fn(),
      post: vi.fn(),
    },
  };
});

vi.mock('@/lib/openFileBridge', () => ({
  getAudioPlayers: vi.fn().mockResolvedValue([
    { packageName: 'com.vlc.player', label: 'VLC' },
    { packageName: 'com.spotify.music', label: 'Spotify' },
  ]),
}));

vi.mock('@/lib/ytdlpBridge', () => ({
  getYtDlpVersion: vi.fn().mockResolvedValue('2026.01.01'),
  isYtDlpVersionOutdated: vi.fn().mockReturnValue(false),
  updateYtDlp: vi.fn().mockResolvedValue('DONE'),
}));

describe('SettingsPage', () => {
  it('renders the 7 compact rows and 1-line footer cleanly', () => {
    render(<SettingsPage />);
    expect(screen.getAllByText(/Settings|Ajustes/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Language|Idioma/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Appearance & Themes|Apariencia & Temas/i)).toBeDefined();
    expect(screen.getByText(/Downloads & audio|Descargas y audio/i)).toBeDefined();
    expect(screen.getByText(/^Lyrics$|^Letras$/i)).toBeDefined();
    expect(screen.getByText(/Backup & restore|Backup y restaurar/i)).toBeDefined();
    expect(screen.getByText(/App updates|Actualizaciones de la aplicación/i)).toBeDefined();
    expect(screen.getByText(/Advanced options|Opciones avanzadas/i)).toBeDefined();
    expect(screen.getByText(/MHL Music ·/i)).toBeDefined();
  });

  it('can open appearance accordion and show themes', () => {
    render(<SettingsPage />);
    const appearanceBtn = screen.getByText(/Appearance & Themes|Apariencia/i).closest('button');
    expect(appearanceBtn).not.toBeNull();
    fireEvent.click(appearanceBtn!);

    expect(screen.getByText(/Acid Cyberpunk/i)).toBeDefined();
    expect(screen.getByText(/Matrix Terminal/i)).toBeDefined();
  });

  it('can open downloads accordion to configure format, player on Android, and anime mode', async () => {
    render(<SettingsPage />);
    const downloadsBtn = screen.getByText(/Downloads & audio|Descargas y audio/i).closest('button');
    expect(downloadsBtn).not.toBeNull();
    fireEvent.click(downloadsBtn!);

    expect(screen.getByText(/M4A \/ AAC/i)).toBeDefined();
    expect(screen.getByText(/MP3 320k/i)).toBeDefined();
    expect(await screen.findByText(/Ask every time|Preguntar siempre/i)).toBeDefined();
    expect(screen.getByRole('switch', { name: /anime/i })).toBeDefined();
  });

  it('can open lyrics accordion with all lyric toggles and translation target language', () => {
    render(<SettingsPage />);
    const lyricsBtn = screen.getByText(/^Lyrics$|^Letras$/i).closest('button');
    expect(lyricsBtn).not.toBeNull();
    fireEvent.click(lyricsBtn!);

    expect(screen.getByRole('switch', { name: /Original/i })).toBeDefined();
    expect(screen.getByRole('switch', { name: /Romanization|Romanización/i })).toBeDefined();
    expect(screen.getByRole('switch', { name: /Translation|Traducción/i })).toBeDefined();
    expect(screen.getByText(/Lyrics translation language|Idioma de traducción de letras/i)).toBeDefined();
  });

  it('can open backup accordion and show export/import controls', () => {
    render(<SettingsPage />);
    const backupBtn = screen.getByText(/Backup & restore|Backup y restaurar/i).closest('button');
    expect(backupBtn).not.toBeNull();
    fireEvent.click(backupBtn!);

    expect(screen.getByText(/Export JSON|Exportar JSON/i)).toBeDefined();
    expect(screen.getByText(/Import JSON|Importar JSON/i)).toBeDefined();
  });

  it('can open advanced accordion with simplified data saver switch and no mobile data sub-buttons', () => {
    render(<SettingsPage />);
    const advancedBtn = screen.getByText(/Advanced options|Opciones avanzadas/i).closest('button');
    expect(advancedBtn).not.toBeNull();
    fireEvent.click(advancedBtn!);

    expect(screen.getByRole('switch', { name: /Auto-download|Descarga automática/i })).toBeDefined();
    expect(screen.getByRole('switch', { name: /Data saver on searches|Ahorro de datos en búsquedas/i })).toBeDefined();
    expect(screen.getByRole('switch', { name: /podcasts/i })).toBeDefined();
    expect(screen.queryByText(/On mobile data|En datos móviles/i)).toBeNull();
    expect(screen.getByText(/^yt-dlp$/i)).toBeDefined();
  });
});
