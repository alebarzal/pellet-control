import { useSyncExternalStore } from 'react';
import type { CheckSnooze } from '../domain/hopperModel';

/**
 * Aviso de «toca comprobar la tolva con una foto»: el aplazamiento («ahora no») y si se quiere también
 * como notificación del móvil. Son cosas de cada móvil; no se comparten con el hogar.
 */
const SNOOZE_KEY = 'pellet-control:photo-check-snooze';
const NOTIFY_KEY = 'pellet-control:photo-check-notify';

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const emit = () => listeners.forEach((l) => l());

function loadSnooze(): CheckSnooze | null {
  try {
    const v = JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? 'null') as CheckSnooze | null;
    return v && typeof v.anchorAt === 'number' && typeof v.percent === 'number' ? v : null;
  } catch {
    return null;
  }
}

function loadNotify(): boolean {
  try {
    return localStorage.getItem(NOTIFY_KEY) === '1';
  } catch {
    return false;
  }
}

let snooze: CheckSnooze | null | undefined;
let notify: boolean | undefined;

export function useCheckSnooze(): CheckSnooze | null {
  return useSyncExternalStore(subscribe, () => (snooze === undefined ? (snooze = loadSnooze()) : snooze));
}

export function setCheckSnooze(v: CheckSnooze) {
  snooze = v;
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(v));
  } catch {
    /* sin almacenamiento: vale para esta sesión */
  }
  emit();
}

export function usePhotoNotify(): boolean {
  return useSyncExternalStore(subscribe, () => (notify ??= loadNotify()));
}

export function setPhotoNotify(on: boolean) {
  notify = on;
  try {
    if (on) localStorage.setItem(NOTIFY_KEY, '1');
    else localStorage.removeItem(NOTIFY_KEY);
  } catch {
    /* sin almacenamiento */
  }
  emit();
}
