import { useState, useEffect } from 'react';

// Detecta si corre en Android (Capacitor), pywebview (Python) o Web.
export function detectPlatform(): 'android' | 'pywebview' | 'web' {
  if (typeof window === 'undefined') return 'web';

  // pywebview — detectado por query param ?platform=pywebview (inyectado por launcher.py)
  // o por window.pywebview si ya está disponible
  if (
    new URLSearchParams(window.location.search).get('platform') === 'pywebview' ||
    'pywebview' in window
  ) {
    return 'pywebview';
  }

  // Android (Capacitor)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Capacitor } = require('@capacitor/core');
    if (Capacitor.isNativePlatform()) return 'android';
  } catch {}

  return 'web';
}

// Hook reactivo — re-evalúa tras el mount
export function usePlatform() {
  const [p, setP] = useState<'android' | 'pywebview' | 'web'>(() => detectPlatform());
  useEffect(() => { setP(detectPlatform()); }, []);
  return p;
}

export const platform     = detectPlatform();
export const isAndroid    = platform === 'android';
export const isPyWebView  = platform === 'pywebview';
export const isWeb        = platform === 'web';