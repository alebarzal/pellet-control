import { Capacitor, registerPlugin } from '@capacitor/core';
import { useSyncExternalStore } from 'react';
import type { PlannedEvent } from '../domain/calendar';

/** Plugin nativo (android/.../CalendarPlugin.java). */
interface PelletCalendarPlugin {
  requestAccess(): Promise<{ granted: boolean }>;
  listCalendars(): Promise<{ calendars: PhoneCalendar[] }>;
  sync(o: { calendarId: string; events: PlannedEvent[] }): Promise<{ changed: number }>;
  clear(): Promise<void>;
}

export interface PhoneCalendar {
  id: string;
  name: string;
  account: string;
  primary: boolean;
}

const Plugin = registerPlugin<PelletCalendarPlugin>('PelletCalendar');
export const calendarAvailable = () => Capacitor.getPlatform() === 'android';

/* ── Preferencia de este móvil (cada uno elige su calendario; no se comparte con el hogar) ── */

export interface CalendarPrefs {
  enabled: boolean;
  calendarId: string | null;
  calendarName: string;
  /** Días de margen para comprar antes de que se acabe el pellet. */
  leadDays: number;
}

const KEY = 'pellet-control:calendar';
const DEFAULTS: CalendarPrefs = { enabled: false, calendarId: null, calendarName: '', leadDays: 7 };
const listeners = new Set<() => void>();

function read(): CalendarPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<CalendarPrefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}
let prefs = read();

export function setCalendarPrefs(p: Partial<CalendarPrefs>) {
  prefs = { ...prefs, ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* sin almacenamiento: vale para esta sesión */
  }
  listeners.forEach((l) => l());
}

export function useCalendarPrefs() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => prefs,
  );
}

export async function requestCalendarAccess(): Promise<boolean> {
  if (!calendarAvailable()) return false;
  return (await Plugin.requestAccess()).granted;
}

export async function listPhoneCalendars(): Promise<PhoneCalendar[]> {
  const r = await Plugin.listCalendars();
  return Array.isArray(r.calendars) ? r.calendars : [];
}

export async function syncCalendar(calendarId: string, events: PlannedEvent[]) {
  return Plugin.sync({ calendarId, events });
}

export async function clearCalendar() {
  if (calendarAvailable()) await Plugin.clear().catch(() => {});
}
