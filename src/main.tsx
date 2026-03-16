import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App.tsx";
import "./index.css";

// Configure StatusBar on native platforms
if (Capacitor.getPlatform() !== 'web') {
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setOverlaysWebView({ overlay: true });
    StatusBar.setStyle({ style: Style.Dark });
    StatusBar.setBackgroundColor({ color: '#080808' });
  });
}

createRoot(document.getElementById("root")!).render(<App />);

// Register Service Worker for PWA (skip on native platforms)
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(() => console.log('Service Worker registered'))
      .catch((error) => console.warn('Service Worker registration failed:', error));
  });
}

// Register Service Worker for PWA (skip on native platforms)
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(() => console.log('Service Worker registered'))
      .catch((error) => console.warn('Service Worker registration failed:', error));
  });
}
