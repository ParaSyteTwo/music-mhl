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
  it('renders without throwing errors and displays the four main groups plus promoted essentials', () => {
    render(<SettingsPage />);
    expect(screen.getAllByText(/Settings|Ajustes/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Personalization|Personalización/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Downloads & audio|Descargas y audio/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Lyrics|Letras/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/System & advanced|Sistema y avanzado/i).length).toBeGreaterThan(0);

    // Promoted out of Advanced options
    expect(screen.getByText(/M4A \/ AAC/i)).toBeDefined();
    expect(screen.getByText(/MP3 320k/i)).toBeDefined();
    expect(screen.getAllByText(/Anime/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Backup|Backup y restaurar/i)).toBeDefined();
  });

  it('can open and close theme accordion and shows themes', () => {
    render(<SettingsPage />);
    const appearanceBtn = screen.getByText(/Appearance & Themes|Apariencia/i).closest('button');
    expect(appearanceBtn).not.toBeNull();
    fireEvent.click(appearanceBtn!);

    expect(screen.getByText(/Acid Cyberpunk/i)).toBeDefined();
    expect(screen.getByText(/Matrix Terminal/i)).toBeDefined();
  });

  it('can open unified lyrics accordion with all lyric toggles and translation target selector', () => {
    render(<SettingsPage />);
    const lyricsBtn = screen.getByText(/Original, romanization|Original, romanización/i).closest('button');
    expect(lyricsBtn).not.toBeNull();
    fireEvent.click(lyricsBtn!);

    expect(screen.getByRole('switch', { name: /Original/i })).toBeDefined();
    expect(screen.getByRole('switch', { name: /Romanization|Romanización/i })).toBeDefined();
    expect(screen.getByRole('switch', { name: /Translation|Traducción/i })).toBeDefined();
    expect(screen.getByText(/Lyrics translation language|Idioma de traducción de letras/i)).toBeDefined();
  });

  it('can open and close advanced options accordion with technical controls and mobile data policy on Android', () => {
    render(<SettingsPage />);
    const advancedBtn = screen.getByText(/Advanced options|Opciones avanzadas/i).closest('button');
    expect(advancedBtn).not.toBeNull();
    fireEvent.click(advancedBtn!);

    expect(screen.getByText(/Auto-download|Descarga automática/i)).toBeDefined();
    expect(screen.getByText(/Pre-resolve versions while searching|Pre-cargar versiones al buscar/i)).toBeDefined();
    expect(screen.getByText(/Download podcasts|Descargar podcasts/i)).toBeDefined();
    expect(screen.getByText(/On mobile data|En datos móviles/i)).toBeDefined();
  });

  it('can open and close default audio player accordion on Android', () => {
    render(<SettingsPage />);
    const playerBtn = screen.getByText(/Default player|Reproductor predeterminado/i).closest('button');
    expect(playerBtn).not.toBeNull();
    fireEvent.click(playerBtn!);

    expect(screen.getAllByText(/Ask every time|Preguntar/i).length).toBeGreaterThan(0);
  });
});
