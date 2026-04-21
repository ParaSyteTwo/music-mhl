import { useState, useEffect } from 'react';

// Detecta si corre en Tauri (desktop), Android (Capacitor) o Web
export function detectPlatform(): 'tauri' | 'android' | 'web' {
  if (typeof window !== 'undefined' && (
    '__TAURI_INTERNALS__' in window ||
    '__TAURI__' in window ||
    navigator.userAgent.includes('Tauri')
  )) return 'tauri';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Capacitor } = require('@capacitor/core');
    if (Capacitor.isNativePlatform()) return 'android';
  } catch {}
  return 'web';
}

// Hook reactivo — re-evalúa tras el mount para capturar Tauri tardío
export function usePlatform() {
  const [p, setP] = useState<'tauri' | 'android' | 'web'>(() => detectPlatform());
  useEffect(() => { setP(detectPlatform()); }, []);
  return p;
}

export const platform = detectPlatform();
export const isTauri  = platform === 'tauri';
export const isAndroid = platform === 'android';
export const isWeb    = platform === 'web';
