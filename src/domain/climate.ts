import { consumptionPeriods, consumptionStats, dailyConsumption, hopperEstimate, statsData, storedStock } from './calc';
import { addDays, diffDays, todayIso } from './dates';
import type { AppData, OutdoorDay, TempReading } from './types';

/** Grados-día de calefacción de un día: cuántos grados por debajo de la base estuvo la media exterior. */
export const hdd = (meanC: number, baseC: number) => Math.max(0, baseC - meanC);

export function outdoorByDate(data: AppData): Map<string, OutdoorDay> {
  return new Map((data.climate.outdoor?.daily ?? []).map((d) => [d.date, d]));
}

export interface EfficiencyModel {
  /** kg de pellet por grado-día (solo calefacción). */
  kgPerHdd: number;
  /** kg/día fijos (agua caliente y pérdidas), se gastan aunque no haga frío. */
  baseKgPerDay: number;
  /** De dónde sale baseKgPerDay: puesto a mano, calculado con los datos o sin separar todavía. */
  baseSource: 'manual' | 'auto' | 'none';
  /** Días con consumo y temperatura usados. */
  days: number;
  totalKg: number;
  totalHdd: number;
}

/** Mínimo de días con consumo y temperatura para estimar kg/grado-día. */
export const MIN_DAYS_FOR_MODEL = 3;

/** Periodos con consumo conocido y temperatura de todos sus días: kg, días y grados-día. */
function periodSamples(data: AppData, today: string): { kg: number; days: number; hdd: number }[] {
  const temps = outdoorByDate(data);
  const base = data.settings.climate.baseTempC;
  const out: { kg: number; days: number; hdd: number }[] = [];
  for (const p of consumptionPeriods(statsData(data))) {
    const first = p.source === 'inventario' && p.end > p.start ? addDays(p.start, 1) : p.start;
    if (p.end > today) continue;
    const n = diffDays(first, p.end) + 1;
    let h = 0;
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      const t = temps.get(addDays(first, i));
      if (!t) ok = false;
      else h += hdd(t.mean, base);
    }
    if (ok && n > 0 && p.kg > 0) out.push({ kg: p.kg, days: n, hdd: h });
  }
  return out;
}

/**
 * Separa el consumo fijo (agua caliente) del que depende del frío: kg = base·días + k·grados-día.
 * Con periodos de frío distinto se ajusta por mínimos cuadrados; si los datos no lo permiten
 * todavía, todo se atribuye al frío (como antes). Devuelve null si el ajuste no es fiable.
 */
export function splitBase(samples: { kg: number; days: number; hdd: number }[]): { base: number; k: number } | null {
  if (samples.length < 3) return null;
  let dd = 0, dh = 0, hh = 0, dk = 0, hk = 0;
  for (const s of samples) {
    dd += s.days * s.days;
    dh += s.days * s.hdd;
    hh += s.hdd * s.hdd;
    dk += s.days * s.kg;
    hk += s.hdd * s.kg;
  }
  const det = dd * hh - dh * dh;
  // Hace falta que los periodos tengan un frío medio bastante distinto entre sí.
  if (det <= 0 || det < 0.05 * dd * hh) return null;
  const base = (dk * hh - hk * dh) / det;
  const k = (dd * hk - dh * dk) / det;
  if (!(base >= 0) || !(k > 0)) return null;
  return { base, k };
}

/**
 * Relación consumo / frío: kg por grado-día (y kg/día fijos del agua caliente), a partir de los días
 * con consumo real y temperatura exterior conocida. No se calcula si faltan datos.
 */
export function efficiencyModel(data: AppData, today = todayIso()): EfficiencyModel | null {
  const temps = outdoorByDate(data);
  const base = data.settings.climate.baseTempC;
  let totalKg = 0;
  let totalHdd = 0;
  let days = 0;
  for (const [date, kg] of dailyConsumption(statsData(data))) {
    if (date > today) continue;
    const t = temps.get(date);
    if (!t) continue;
    totalKg += kg;
    totalHdd += hdd(t.mean, base);
    days++;
  }
  if (days < MIN_DAYS_FOR_MODEL || totalKg <= 0) return null;

  const manual = data.settings.climate.dhwKgPerDay;
  if (manual != null && manual >= 0) {
    const heatKg = Math.max(0, totalKg - manual * days);
    return { kgPerHdd: totalHdd >= 1 ? heatKg / totalHdd : 0, baseKgPerDay: manual, baseSource: 'manual', days, totalKg, totalHdd };
  }
  const fit = splitBase(periodSamples(data, today));
  if (fit) return { kgPerHdd: fit.k, baseKgPerDay: fit.base, baseSource: 'auto', days, totalKg, totalHdd };
  if (totalHdd < 1) return null;
  return { kgPerHdd: totalKg / totalHdd, baseKgPerDay: 0, baseSource: 'none', days, totalKg, totalHdd };
}

export interface ForecastDay {
  date: string;
  mean: number;
  hdd: number;
  /** kg previstos, null si no hay modelo. */
  kg: number | null;
  cost: number | null;
}

export interface ClimateForecast {
  days: ForecastDay[];
  totalKg: number | null;
  totalCost: number | null;
  /** Fecha estimada en la que se agota el pellet disponible dentro del horizonte, si ocurre. */
  runOutDate: string | null;
  /** kg disponibles (almacén + tolva estimada). */
  availableKg: number;
}

/** Previsión de consumo para los próximos días según la temperatura prevista. */
export function climateForecast(data: AppData, horizon = 7, today = todayIso()): ClimateForecast | null {
  const daily = data.climate.outdoor?.daily;
  if (!daily?.length) return null;
  const base = data.settings.climate.baseTempC;
  const model = efficiencyModel(data, today);
  const price = consumptionStats(statsData(data), today).pricePerKg;
  const future = daily.filter((d) => d.date >= today).slice(0, horizon);
  if (!future.length) return null;

  const availableKg = storedStock(data).kg + (hopperEstimate(data)?.kg ?? 0);
  let acc = 0;
  let runOutDate: string | null = null;
  const days = future.map((d) => {
    const h = hdd(d.mean, base);
    const kg = model ? model.baseKgPerDay + h * model.kgPerHdd : null;
    if (kg != null) {
      acc += kg;
      if (!runOutDate && acc >= availableKg) runOutDate = d.date;
    }
    return { date: d.date, mean: d.mean, hdd: h, kg, cost: kg != null && price != null ? kg * price : null };
  });
  return {
    days,
    totalKg: model ? acc : null,
    totalCost: model && price != null ? acc * price : null,
    runOutDate,
    availableKg,
  };
}

/** Última lectura de cada sensor. */
export function latestReadings(readings: TempReading[]): Map<string, TempReading> {
  const m = new Map<string, TempReading>();
  for (const r of readings) {
    const cur = m.get(r.deviceId);
    if (!cur || r.at > cur.at) m.set(r.deviceId, r);
  }
  return m;
}

/** Media diaria interior (de los sensores interiores elegidos). */
export function indoorDaily(data: AppData): Map<string, number> {
  const ids = new Set(data.settings.climate.indoorIds);
  const sum = new Map<string, { s: number; n: number }>();
  for (const r of data.climate.readings) {
    if (!ids.has(r.deviceId)) continue;
    const d = r.at.slice(0, 10);
    const cur = sum.get(d) ?? { s: 0, n: 0 };
    cur.s += r.temperature;
    cur.n++;
    sum.set(d, cur);
  }
  return new Map([...sum].map(([d, v]) => [d, v.s / v.n]));
}

/** Temperatura exterior actual: sensor SwitchBot exterior si existe y es reciente, si no Open-Meteo. */
export function currentOutdoor(data: AppData): { temperature: number; humidity: number | null; at: string; source: 'sensor' | 'open-meteo' } | null {
  const id = data.settings.climate.outdoorId;
  if (id) {
    const r = latestReadings(data.climate.readings).get(id);
    if (r && Date.now() - new Date(r.at).getTime() < 3 * 3600_000)
      return { temperature: r.temperature, humidity: r.humidity, at: r.at, source: 'sensor' };
  }
  const c = data.climate.outdoor?.current;
  return c ? { ...c, source: 'open-meteo' } : null;
}

/** Media interior actual entre los sensores elegidos (lecturas de menos de 3 h). */
export function currentIndoor(data: AppData): { temperature: number; humidity: number | null; at: string; sensors: number } | null {
  const latest = latestReadings(data.climate.readings);
  const fresh = data.settings.climate.indoorIds
    .map((id) => latest.get(id))
    .filter((r): r is TempReading => !!r && Date.now() - new Date(r.at).getTime() < 3 * 3600_000);
  if (!fresh.length) return null;
  const hum = fresh.filter((r) => r.humidity != null);
  return {
    temperature: fresh.reduce((s, r) => s + r.temperature, 0) / fresh.length,
    humidity: hum.length ? hum.reduce((s, r) => s + r.humidity!, 0) / hum.length : null,
    at: fresh.map((r) => r.at).sort().at(-1)!,
    sensors: fresh.length,
  };
}

/** Límite de lecturas guardadas (≈ 2 meses a una lectura cada 15 min por sensor). */
export const MAX_READINGS = 12000;
