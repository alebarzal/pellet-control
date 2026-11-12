import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { useSyncExternalStore } from 'react';

/** Preferencia de este móvil (no se comparte con el hogar). */
const KEY = 'pellet-control:haptics';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}
let enabled = read();

export function hapticsEnabled() {
  return enabled;
}

export function setHapticsEnabled(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* sin almacenamiento: vale para esta sesión */
  }
  listeners.forEach((l) => l());
}

export function useHapticsEnabled() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => enabled,
  );
}

/** Vibración breve solo en la app nativa y si está activada; en el navegador no hace nada. */
const native = () => enabled && Capacitor.isNativePlatform();

export const haptic = {
  /** Toque ligero: navegación, botones − / +, selección. */
  tap() {
    if (native()) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  },
  /** Toque marcado: botón principal. */
  press() {
    if (native()) void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
  },
  success() {
    if (native()) void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  },
  warning() {
    if (native()) void Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
  },
};
