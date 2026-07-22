import { Capacitor, registerPlugin } from '@capacitor/core';

export interface DeviceContext {
  online: boolean;
  metered: boolean;
  networkType: 'wifi' | 'cellular' | 'other' | 'offline';
  batteryPercent: number;
  charging: boolean;
  batterySaver: boolean;
  availableMemoryMb: number;
  totalMemoryMb: number;
  processors: number;
  locale: string;
}

interface DeviceContextPlugin {
  getContext(): Promise<DeviceContext>;
}

const NativeDeviceContext = registerPlugin<DeviceContextPlugin>('DeviceContext');

function browserFallback(): DeviceContext {
  const locale = navigator.languages?.[0] || navigator.language || 'en';
  return {
    online: navigator.onLine,
    metered: false,
    networkType: navigator.onLine ? 'other' : 'offline',
    batteryPercent: 100,
    charging: true,
    batterySaver: false,
    availableMemoryMb: 0,
    totalMemoryMb: 0,
    processors: navigator.hardwareConcurrency || 4,
    locale,
  };
}

export async function getDeviceContext(): Promise<DeviceContext> {
  if (Capacitor.getPlatform() === 'android') {
    try {
      return await NativeDeviceContext.getContext();
    } catch {
      return browserFallback();
    }
  }
  if (typeof window !== 'undefined' && 'pywebview' in window) {
    try {
      const api = (window as Window & { pywebview?: { api?: { get_device_context?: () => Promise<DeviceContext> } } }).pywebview?.api;
      if (api?.get_device_context) return await api.get_device_context();
    } catch { /* fallback below */ }
  }
  return browserFallback();
}

export function canRunBackgroundResolution(context: DeviceContext): boolean {
  return context.online
    && !context.batterySaver
    && (context.batteryPercent < 0 || context.batteryPercent >= 20 || context.charging);
}
