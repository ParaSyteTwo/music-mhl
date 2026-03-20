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
    appLanguage: 'Idioma de la app',
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
    appLanguage: 'App language',
    downloadFolder: 'Download folder',
    about: 'About',
  },
};

import { useMusicStore } from '@/store/musicStore';

export function t(key: string): string {
  const lang = useMusicStore.getState().appLanguage || 'es';
  return translations[lang as Lang][key] || key;
}

export default t;
