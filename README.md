# Music MHL 🎵

A modern music streaming application built with React, TypeScript, and Vite. Stream directly from Deezer, YouTube, or import your local music collection.

## Features

✅ **Background Playback** - MediaSession API for lock screen controls and notifications
✅ **Home Trending** - Displays trending tracks from Deezer
✅ **Queue Management** - Full playback queue with next/previous controls
✅ **Progressive Web App** - Install as a native app on your device
✅ **Local Music Import** - Import and manage music from your device storage
✅ **Shazam-like Identification** - Identify local tracks and auto-fetch metadata
✅ **Mobile-First Design** - Beautiful, responsive interface for all devices
✅ **Search** - Search tracks across integrated music sources
✅ **Library** - Save and organize your favorite tracks and playlists

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

```sh
# Clone the repository
git clone https://github.com/ParaSyteTwo/music-mhl.git

# Navigate to the project directory
cd music-mhl

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will run on `http://localhost:5173` (or another available port)

## Configuration

### AudD API Key (For Track Identification)

To use the Shazam-like track identification feature for local music:

1. Create a free account at [AudD.io](https://audd.io/)
2. Get your API key from your account dashboard
3. Create a `.env.local` file in the project root:
   ```
   VITE_AUDD_API_KEY=your_api_key_here
   ```

### Build & Deploy

```sh
# Build for production
npm run build

# Preview production build locally
npm run preview
```

Deploy to [Vercel](https://vercel.com):
1. Push your code to GitHub
2. Connect your GitHub repo to Vercel
3. Vercel will auto-deploy on every push

## Technologies

- **Frontend Framework**: React 18
- **Language**: TypeScript
- **Build Tool**: Vite
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **Components**: shadcn-ui
- **Animations**: Framer Motion
- **Backend**: Supabase
- **PWA**: vite-plugin-pwa
- **Audio APIs**: Web Audio API, MediaSession API
- **Metadata**: music-metadata-browser

## Project Structure

```
src/
├── components/
│   ├── music/           # Music-specific components
│   │   ├── TrackRow
│   │   ├── TrackCard
│   │   ├── SearchBar
│   │   ├── LyricsPanel
│   │   ├── LocalMusicImporter
│   │   └── TrackIdentifier
│   ├── layout/          # Layout components
│   │   ├── AppLayout
│   │   ├── AppSidebar
│   │   └── BottomPlayer
│   └── ui/              # shadcn-ui components
├── pages/               # Route pages
├── lib/
│   ├── audioEngine.ts   # Audio playback engine
│   ├── api/
│   │   └── musicApi.ts  # Music data sources (Deezer, YouTube)
│   └── id3Writer.ts     # ID3 tag writer
├── store/
│   └── musicStore.ts    # Zustand state management
├── types/
│   └── music.ts         # TypeScript interfaces
└── hooks/               # Custom React hooks
```

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Android)

Note: MediaSession API requires relatively recent browser versions for full background playback support
