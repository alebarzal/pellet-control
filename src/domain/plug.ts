import { addDays, toIso } from './dates';
import type { ClimateSettings, PlugReading } from './types';

/** Lecturas de enchufe que se guardan (≈ 50 días a una cada 15 min). */
export const MAX_PLUG_READINGS = 5000;
/** Una lectura vale como mucho este tiempo; si hay huecos más largos no se cuentan. */
const MAX_SLOT_MS = 30 * 60_000;
/** La última lectura vale hasta este tiempo después. */
const LAST_SLOT_MS = 15 * 60_000;

export interface BurnerDay {
  date: string;
  /** Minutos estimados con el quemador funcionando. */
  minutes: number;
  /** kg estimados (null si no hay kg/h calibrados). */
  kg: number | null;
  samples: number;
}

export interface PlugSummary {
  last: PlugReading | null;
  /** El quemador funciona ahora mismo (última lectura reciente por encima del umbral). */
  on: boolean;
  /** La última lectura tiene menos de 40 minutos. */
  fresh: boolean;
  today: BurnerDay;
  /** Últimos 7 días, de hoy hacia atrás. */
  week: BurnerDay[];
  /** Potencia media cuando está encendida y en reposo, para ayudar a ajustar el umbral. */
  avgOnW: number | null;
  avgOffW: number | null;
}

/**
 * Minutos de quemador por día: cada lectura por encima del umbral cuenta el tiempo hasta la siguiente
 * (con tope de 30 min por si faltan lecturas). Con una lectura cada 15 min es una estimación.
 */
export function burnerMinutesByDay(readings: PlugReading[], thresholdW: number, now = Date.now()): Map<string, { minutes: number; samples: number }> {
  const sorted = [...readings].sort((a, b) => (a.at < b.at ? -1 : 1));
  const out = new Map<string, { minutes: number; samples: number }>();
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const t = new Date(r.at).getTime();
    const next = i + 1 < sorted.length ? new Date(sorted[i + 1].at).getTime() : Math.min(now, t + LAST_SLOT_MS);
    const slot = Math.max(0, Math.min(next - t, MAX_SLOT_MS));
    const day = toIso(new Date(t));
    const cur = out.get(day) ?? { minutes: 0, samples: 0 };
    cur.samples++;
    if (r.watts >= thresholdW) cur.minutes += slot / 60_000;
    out.set(day, cur);
  }
  return out;
}

export function plugSummary(readings: PlugReading[] | undefined, c: ClimateSettings, now = Date.now()): PlugSummary {
  const list = readings ?? [];
  const byDay = burnerMinutesByDay(list, c.plugThresholdW, now);
  const today = toIso(new Date(now));
  const day = (date: string): BurnerDay => {
    const d = byDay.get(date);
    const minutes = Math.round(d?.minutes ?? 0);
    return { date, minutes, samples: d?.samples ?? 0, kg: c.kgPerBurnerHour != null ? Math.round((minutes / 60) * c.kgPerBurnerHour * 10) / 10 : null };
  };
  const last = list.length ? list.reduce((a, b) => (a.at > b.at ? a : b)) : null;
  const fresh = !!last && now - new Date(last.at).getTime() < 40 * 60_000;
  const on = list.filter((r) => r.watts >= c.plugThresholdW);
  const off = list.filter((r) => r.watts < c.plugThresholdW);
  const avg = (xs: PlugReading[]) => (xs.length ? Math.round(xs.reduce((s, r) => s + r.watts, 0) / xs.length) : null);
  return {
    last,
    on: fresh && !!last && last.watts >= c.plugThresholdW,
    fresh,
    today: day(today),
    week: Array.from({ length: 7 }, (_, i) => day(addDays(today, -i))),
    avgOnW: avg(on),
    avgOffW: avg(off),
  };
}
