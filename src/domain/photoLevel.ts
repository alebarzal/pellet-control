import { sortRecords } from './calc';
import type { AppData, LevelRecord } from './types';

/**
 * Posición del pellet dentro del visor (0 = abajo del visor, 1 = arriba), a partir de tres marcas sobre
 * una foto (posiciones verticales 0 = arriba de la imagen, 1 = abajo). Null si las marcas no tienen sentido.
 */
export function windowFraction(top: number, surface: number, bottom: number): number | null {
  const span = bottom - top;
  if (!Number.isFinite(span) || span < 0.05) return null;
  return Math.max(0, Math.min(1, (bottom - surface) / span));
}

/** Porcentaje del visor (0–100), para compatibilidad. */
export function photoPercent(top: number, surface: number, bottom: number): number | null {
  const f = windowFraction(top, surface, bottom);
  return f == null ? null : Math.round(f * 100);
}

/** Marcas por defecto (extremos del visor y superficie). */
export const DEFAULT_MARKS = { full: 0.18, surface: 0.5, empty: 0.85 };

/** Una foto antes y otra después de recargar deben estar como mucho a estas horas de distancia. */
const MAX_PAIR_MS = 12 * 3600_000;

export interface PhotoCalibration {
  /** kg que caben entre el extremo inferior y el superior del visor (null = sin calibrar). */
  kgPerWindow: number | null;
  /** Recargas usadas para calibrar. */
  pairs: number;
}

/**
 * Calibración automática: busca parejas «foto → recarga(s) con cantidad conocida → foto».
 * La subida del pellet en el visor frente a los kg echados da los kg que hay en todo el visor.
 * Se descartan las fotos con el pellet fuera del visor (por debajo o por encima) y las subidas pequeñas.
 */
export function photoCalibration(data: AppData): PhotoCalibration {
  const cap = data.settings.hopperCapacityKg;
  const bagKg = data.settings.bagWeightKg;
  const recs = sortRecords(data.records);
  const slopes: number[] = [];
  let before: LevelRecord | null = null;
  let added = 0;
  let clean = true;
  for (const r of recs) {
    if (r.kind === 'level' && typeof r.photo === 'number') {
      if (before && added > 0 && clean && r.createdAt - before.createdAt <= MAX_PAIR_MS) {
        const df = r.photo - before.photo!;
        if (before.photo! > 0.02 && r.photo < 0.98 && df >= 0.05) slopes.push(added / df);
      }
      before = r;
      added = 0;
      clean = true;
    } else if (r.kind === 'refill') {
      const kg = r.kg ?? (r.bags != null ? r.bags * bagKg : null);
      if (kg == null) clean = false;
      else added += kg;
    } else if (r.kind === 'level' || r.kind === 'consumption') {
      // Otra lectura o un consumo en medio: la pareja ya no es limpia.
      clean = false;
    }
  }
  const valid = slopes.filter((s) => !cap || (s >= cap * 0.1 && s <= cap * 2));
  if (!valid.length) return { kgPerWindow: null, pairs: 0 };
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { kgPerWindow: Math.round(median * 10) / 10, pairs: valid.length };
}

/**
 * kg en la tolva a partir de la posición en el visor.
 * Sin calibrar: el visor representa toda la tolva. Calibrado: el extremo superior del visor es la tolva llena
 * y lo que queda por debajo del visor es la capacidad menos los kg del visor (no hace falta verla vacía).
 */
export function photoKg(fraction: number, cal: PhotoCalibration, capacityKg: number | null): { kg: number | null; percent: number } {
  if (!capacityKg) return { kg: null, percent: Math.round(fraction * 100) };
  if (cal.kgPerWindow == null) return { kg: Math.round(fraction * capacityKg), percent: Math.round(fraction * 100) };
  const below = Math.max(0, capacityKg - cal.kgPerWindow);
  const kg = Math.min(capacityKg, below + cal.kgPerWindow * fraction);
  return { kg: Math.round(kg), percent: Math.round((kg / capacityKg) * 100) };
}
