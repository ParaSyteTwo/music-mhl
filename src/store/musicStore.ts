import { create } from 'zustand';
import { Track, Playlist, Download, AudioFormat } from '@/types/music';

interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  volume: number;
  progress: number;
  duration: number;
  showLyrics: boolean;
}

interface MusicStore {
  // Player
  player: PlayerState;
  setCurrentTrack: (track: Track) => void;
  togglePlay: () => void;
  setVolume: (v: number) => void;
  setProgress: (p: number) => void;
  toggleLyrics: () => void;

  // Library
  library: Track[];
  addToLibrary: (track: Track) => void;
  removeFromLibrary: (id: string) => void;

  // Playlists
  playlists: Playlist[];
  createPlaylist: (name: string) => void;
  addToPlaylist: (playlistId: string, track: Track) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;

  // Downloads
  downloads: Download[];
  startDownload: (track: Track, format: AudioFormat) => void;
  updateDownloadProgress: (id: string, progress: number) => void;

  // Search
  searchQuery: string;
  searchResults: Track[];
  setSearchQuery: (q: string) => void;
  setSearchResults: (results: Track[]) => void;
}

// Mock data for demo
const mockTracks: Track[] = [
  {
    id: '1', title: 'Midnight City', artist: 'M83', album: 'Hurry Up, We\'re Dreaming',
    duration: 243, cover: '', bitrate: '320kbps', format: 'MP3', fileSize: '9.4MB',
    lyrics: "Waiting in a car\nWaiting for a ride in the dark\nThe city looks so bright from far\nDriving through the city at night\n\nWaiting in a car\nWaiting for a ride in the dark\nThe city looks so bright from far\n\nWaiting in a car\nWaiting for the right time to start",
    translatedLyrics: "Esperando en un coche\nEsperando un viaje en la oscuridad\nLa ciudad se ve tan brillante desde lejos\nConduciendo por la ciudad de noche\n\nEsperando en un coche\nEsperando un viaje en la oscuridad\nLa ciudad se ve tan brillante desde lejos\n\nEsperando en un coche\nEsperando el momento adecuado para empezar",
  },
  {
    id: '2', title: 'Intro', artist: 'The xx', album: 'xx',
    duration: 127, cover: '', bitrate: '320kbps', format: 'FLAC', fileSize: '24.1MB',
    lyrics: "(Instrumental)", translatedLyrics: "(Instrumental)",
  },
  {
    id: '3', title: 'Breathe', artist: 'Télépopmusik', album: 'Genetic World',
    duration: 282, cover: '', bitrate: '256kbps', format: 'MP3', fileSize: '8.7MB',
    lyrics: "Just breathe\nBreathe in the air\nSet your intentions right\nFeel that gentle air\n\nAnother day begins\nAnother chance we find\nJust breathe\nAnd let it go",
    translatedLyrics: "Solo respira\nRespira el aire\nEstablece tus intenciones\nSiente ese aire suave\n\nOtro día comienza\nOtra oportunidad encontramos\nSolo respira\nY déjalo ir",
  },
  {
    id: '4', title: 'Tadow', artist: 'Masego & FKJ', album: 'Tadow',
    duration: 305, cover: '', bitrate: '320kbps', format: 'MP3', fileSize: '11.2MB',
    lyrics: "I saw her and she hit me like Tadow\nAin't nothing new but a new beginning\n\nOh I saw her from the other side\nHad to let her know that I was alright\n\nTadow, ain't nothing but a heartbreak\nTadow, that's what I said when she walked away",
    translatedLyrics: "La vi y me golpeó como Tadow\nNo hay nada nuevo sino un nuevo comienzo\n\nOh la vi desde el otro lado\nTenía que hacerle saber que estaba bien\n\nTadow, no es más que un desamor\nTadow, eso es lo que dije cuando se fue",
  },
  {
    id: '5', title: 'Resonance', artist: 'HOME', album: 'Odyssey',
    duration: 213, cover: '', bitrate: '320kbps', format: 'FLAC', fileSize: '32.5MB',
    lyrics: "(Instrumental - Synthwave)", translatedLyrics: "(Instrumental - Synthwave)",
  },
  {
    id: '6', title: 'Redbone', artist: 'Childish Gambino', album: 'Awaken, My Love!',
    duration: 327, cover: '', bitrate: '320kbps', format: 'MP3', fileSize: '12.1MB',
    lyrics: "Daylight\nI wake up feeling like you won't play right\nI used to know but now that shit don't feel right\nIt made me put away my pride\n\nSo long\nYou made a nigga wait for way too long\nYou make it hard for boy like that to go on\nI'm wishing I could make this mine",
    translatedLyrics: "Luz del día\nMe despierto sintiendo que no jugarás limpio\nSolía saber pero ahora eso no se siente bien\nMe hizo guardar mi orgullo\n\nTanto tiempo\nMe hiciste esperar demasiado\nHaces difícil que un chico como yo continúe\nDesearía poder hacer esto mío",
  },
];

export const useMusicStore = create<MusicStore>((set, get) => ({
  player: {
    currentTrack: null,
    isPlaying: false,
    volume: 0.8,
    progress: 0,
    duration: 0,
    showLyrics: false,
  },
  setCurrentTrack: (track) => set((s) => ({
    player: { ...s.player, currentTrack: track, isPlaying: true, progress: 0, duration: track.duration }
  })),
  togglePlay: () => set((s) => ({
    player: { ...s.player, isPlaying: !s.player.isPlaying }
  })),
  setVolume: (v) => set((s) => ({ player: { ...s.player, volume: v } })),
  setProgress: (p) => set((s) => ({ player: { ...s.player, progress: p } })),
  toggleLyrics: () => set((s) => ({ player: { ...s.player, showLyrics: !s.player.showLyrics } })),

  library: [mockTracks[0], mockTracks[3]],
  addToLibrary: (track) => set((s) => ({
    library: s.library.find(t => t.id === track.id) ? s.library : [...s.library, { ...track, isDownloaded: true }]
  })),
  removeFromLibrary: (id) => set((s) => ({
    library: s.library.filter(t => t.id !== id)
  })),

  playlists: [
    { id: 'p1', name: 'Late Night Vibes', tracks: [mockTracks[0], mockTracks[2]], createdAt: new Date() },
    { id: 'p2', name: 'Focus Mode', tracks: [mockTracks[1], mockTracks[4]], createdAt: new Date() },
  ],
  createPlaylist: (name) => set((s) => ({
    playlists: [...s.playlists, { id: `p${Date.now()}`, name, tracks: [], createdAt: new Date() }]
  })),
  addToPlaylist: (playlistId, track) => set((s) => ({
    playlists: s.playlists.map(p =>
      p.id === playlistId && !p.tracks.find(t => t.id === track.id)
        ? { ...p, tracks: [...p.tracks, track] }
        : p
    )
  })),
  removeFromPlaylist: (playlistId, trackId) => set((s) => ({
    playlists: s.playlists.map(p =>
      p.id === playlistId ? { ...p, tracks: p.tracks.filter(t => t.id !== trackId) } : p
    )
  })),

  downloads: [
    { id: 'd1', track: mockTracks[0], format: 'MP3', progress: 100, status: 'completed' },
    { id: 'd2', track: mockTracks[3], format: 'FLAC', progress: 67, status: 'downloading' },
  ],
  startDownload: (track, format) => set((s) => ({
    downloads: [...s.downloads, {
      id: `d${Date.now()}`, track, format, progress: 0, status: 'downloading'
    }]
  })),
  updateDownloadProgress: (id, progress) => set((s) => ({
    downloads: s.downloads.map(d =>
      d.id === id ? { ...d, progress, status: progress >= 100 ? 'completed' : 'downloading' } : d
    )
  })),

  searchQuery: '',
  searchResults: mockTracks,
  setSearchQuery: (q) => {
    set({ searchQuery: q });
    const filtered = q
      ? mockTracks.filter(t =>
          t.title.toLowerCase().includes(q.toLowerCase()) ||
          t.artist.toLowerCase().includes(q.toLowerCase()) ||
          t.album.toLowerCase().includes(q.toLowerCase())
        )
      : mockTracks;
    set({ searchResults: filtered });
  },
  setSearchResults: (results) => set({ searchResults: results }),
}));
