import type { TempReading } from './types';

/**
 * Detección aproximada del funcionamiento de la caldera a partir de la temperatura interior.
 * Idea: cuando la caldera calienta, la casa sube a un ritmo sostenido (°C/h). Se buscan tramos
 * consecutivos de subida y se agrupan en «episodios». Es una estimación: el sol, cocinar o
 * mucha gente también calientan la casa, y la casa reacciona con retraso.
 */

export interface IndoorPoint {
  at: number; // ms
  temp: number;
}

export interface HeatingEpisode {
  start: number;
  end: number;
  startTemp: number;
  endTemp: number;
  /** Ritmo medio de subida (°C/h). */
  rate: number;
  /** true si sigue subiendo en la última lectura reciente. */
  ongoing: boolean;
  confidence: 'alta' | 'media' | 'baja';
}

/** Hueco máximo entre lecturas para considerarlas seguidas. */
export const MAX_GAP_MS = 45 * 60_000;
/** Tamaño de las franjas para promediar varios sensores. */
const BUCKET_MS = 15 * 60_000;

/** Serie interior: media de los sensores elegidos en franjas de 15 min. */
export function indoorSeries(readings: TempReading[], indoorIds: string[]): IndoorPoint[] {
  const ids = new Set(indoorIds);
  const buckets = new Map<number, { s: number; n: number; at: number }>();
  for (const r of readings) {
    if (!ids.has(r.deviceId)) continue;
    const t = new Date(r.at).getTime();
    const k = Math.floor(t / BUCKET_MS);
    const b = buckets.get(k) ?? { s: 0, n: 0, at: 0 };
    b.s += r.temperature;
    b.n++;
    b.at = Math.max(b.at, t);
    buckets.set(k, b);
  }
  return [...buckets.values()].map((b) => ({ at: b.at, temp: b.s / b.n })).sort((a, b) => a.at - b.at);
}

export interface DetectOptions {
  /** Subida mínima para considerar que calienta (°C/h). */
  threshold: number;
  /** Subida total mínima de un episodio (°C). */
  minRise?: number;
  now?: number;
}

export function detectEpisodes(series: IndoorPoint[], { threshold, minRise = 0.3, now = Date.now() }: DetectOptions): HeatingEpisode[] {
  const episodes: HeatingEpisode[] = [];
  let cur: { startIdx: number; endIdx: number; flat: number } | null = null;

  const close = (c: { startIdx: number; endIdx: number }) => {
    const a = series[c.startIdx];
    const b = series[c.endIdx];
    const rise = b.temp - a.temp;
    const hours = (b.at - a.at) / 3_600_000;
    if (rise < minRise || hours <= 0) return;
    const rate = rise / hours;
    const hour = new Date(a.at).getHours();
    const sunny = hour >= 11 && hour < 17;
    episodes.push({
      start: a.at,
      end: b.at,
      startTemp: a.temp,
      endTemp: b.temp,
      rate,
      ongoing: false,
      confidence: sunny ? 'baja' : rate >= threshold * 1.6 ? 'alta' : 'media',
    });
  };

  for (let i = 1; i < series.length; i++) {
    const p = series[i - 1];
    const q = series[i];
    const gap = q.at - p.at;
    if (gap > MAX_GAP_MS || gap <= 0) {
      if (cur) close(cur);
      cur = null;
      continue;
    }
    const rate = (q.temp - p.temp) / (gap / 3_600_000);
    if (rate >= threshold) {
      if (!cur) cur = { startIdx: i - 1, endIdx: i, flat: 0 };
      else {
        cur.endIdx = i;
        cur.flat = 0;
      }
    } else if (cur && rate > -threshold / 2 && cur.flat === 0) {
      // Admite una franja de meseta sin cortar el episodio (el termostato modula).
      cur.flat = 1;
    } else if (cur) {
      close(cur);
      cur = null;
    }
  }
  if (cur) close(cur);

  // ¿Sigue calentando? El último episodio acaba en la última lectura y es reciente.
  const last = series.at(-1);
  const ep = episodes.at(-1);
  if (ep && last && ep.end === last.at && now - last.at < 35 * 60_000) ep.ongoing = true;
  return episodes;
}

export interface DaySummary {
  date: string;
  episodes: number;
  /** Horas de subida detectadas (aproximación al tiempo de funcionamiento). */
  hours: number;
  firstStart: number | null;
  /** Horas cubiertas por lecturas ese día (para saber si el dato es completo). */
  coverageHours: number;
}

const isoDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function summarizeDays(series: IndoorPoint[], episodes: HeatingEpisode[]): DaySummary[] {
  const days = new Map<string, DaySummary>();
  const get = (d: string) => {
    let s = days.get(d);
    if (!s) {
      s = { date: d, episodes: 0, hours: 0, firstStart: null, coverageHours: 0 };
      days.set(d, s);
    }
    return s;
  };
  for (let i = 1; i < series.length; i++) {
    const gap = series[i].at - series[i - 1].at;
    if (gap <= MAX_GAP_MS) get(isoDay(series[i].at)).coverageHours += gap / 3_600_000;
  }
  for (const e of episodes) {
    const s = get(isoDay(e.start));
    s.episodes++;
    s.hours += (e.end - e.start) / 3_600_000;
    s.firstStart = s.firstStart == null ? e.start : Math.min(s.firstStart, e.start);
  }
  return [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export const SENSITIVITY: Record<'alta' | 'media' | 'baja', number> = { alta: 0.3, media: 0.5, baja: 0.8 };
