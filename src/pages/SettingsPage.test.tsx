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
  updateYtDlp: vi.fn().mockResolvedValue(true),
}));

describe('SettingsPage', () => {
  it('renders without throwing errors and displays essential headers', () => {
    render(<SettingsPage />);
    expect(screen.getAllByText(/Settings|Ajustes/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Appearance|Apariencia/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Language|Idioma/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Advanced|Avanzadas/i).length).toBeGreaterThan(0);
  });

  it('can open and close theme accordion and shows themes', () => {
    render(<SettingsPage />);
    const appearanceBtn = screen.getByText(/Appearance & Themes|Apariencia/i).closest('button');
    expect(appearanceBtn).not.toBeNull();
    fireEvent.click(appearanceBtn!);

    expect(screen.getByText(/Acid Cyberpunk/i)).toBeDefined();
    expect(screen.getByText(/Matrix Terminal/i)).toBeDefined();
  });

  it('can open and close advanced options accordion', () => {
    render(<SettingsPage />);
    const advancedBtn = screen.getByText(/Advanced options|Opciones avanzadas/i).closest('button');
    expect(advancedBtn).not.toBeNull();
    fireEvent.click(advancedBtn!);

    expect(screen.getAllByText(/Anime|Buscar/i).length).toBeGreaterThan(0);
  });

  it('can open and close default audio player accordion on Android', () => {
    render(<SettingsPage />);
    const playerBtn = screen.getByText(/Default player|Reproductor predeterminado/i).closest('button');
    expect(playerBtn).not.toBeNull();
    fireEvent.click(playerBtn!);

    expect(screen.getAllByText(/Ask every time|Preguntar/i).length).toBeGreaterThan(0);
  });
});
