import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

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
  if (Capacitor.isNativePlatform()) return 'android';

  return 'web';
}

export function usesRemoteBackend(
  currentPlatform: ReturnType<typeof detectPlatform> = detectPlatform(),
): boolean {
  return currentPlatform === 'web';
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
