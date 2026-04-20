type Lang = 'es' | 'en';

const translations: Record<Lang, Record<string, string>> = {
  es: {
    search: 'Buscar',
    downloads: 'Descargas',
    library: 'Biblioteca',
    playlists: 'Playlists',
    settings: 'Ajustes',
    downloadFormat: 'Formato de descarga',
    mp3: 'MP3',
    aac: 'AAC',
    mp3Quality: 'Calidad MP3',
    wifiOnly: 'Descargar solo con WiFi',
    downloadFolder: 'Carpeta de descargas',
    about: 'Acerca de',
  },
  en: {
    search: 'Search',
    downloads: 'Downloads',
    library: 'Library',
    playlists: 'Playlists',
    settings: 'Settings',
    downloadFormat: 'Download format',
    mp3: 'MP3',
    aac: 'AAC',
    mp3Quality: 'MP3 Quality',
    wifiOnly: 'Download on WiFi only',
    downloadFolder: 'Download folder',
    about: 'About',
  },
};

function detectLang(): Lang {
  try {
    const nav = navigator.language ?? navigator.languages?.[0] ?? 'en';
    return nav.startsWith('es') ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

export function t(key: string): string {
  const lang = detectLang();
  return translations[lang][key] || key;
}

export default t;
