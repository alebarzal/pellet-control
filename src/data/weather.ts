import { addDays, diffDays, todayIso } from '../domain/dates';
import type { ClimateData, OutdoorDay } from '../domain/types';

/** Tiempo exterior con Open-Meteo (gratis, sin cuenta ni clave; admite peticiones desde el navegador). */

export class WeatherError extends Error {}

export interface Place {
  name: string;
  detail: string;
  lat: number;
  lon: number;
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = (country: boolean) =>
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=es${country ? '&countryCode=ES' : ''}`;
  try {
    type R = { results?: { name: string; latitude: number; longitude: number; admin1?: string; admin2?: string; country?: string }[] };
    let r: R = await (await fetch(url(true))).json();
    if (!r.results?.length) r = await (await fetch(url(false))).json();
    return (r.results ?? []).map((p) => ({
      name: p.name,
      detail: [p.admin2, p.admin1, p.country].filter((x, i, a) => x && a.indexOf(x) === i).join(', '),
      lat: p.latitude,
      lon: p.longitude,
    }));
  } catch {
    throw new WeatherError('No se pudo buscar la localidad. Revisa la conexión.');
  }
}

type Daily = { time: string[]; temperature_2m_mean: (number | null)[]; temperature_2m_max: (number | null)[]; temperature_2m_min: (number | null)[] };

const toDays = (d: Daily): OutdoorDay[] =>
  d.time
    .map((date, i) => {
      const max = d.temperature_2m_max[i];
      const min = d.temperature_2m_min[i];
      const mean = d.temperature_2m_mean[i] ?? (max != null && min != null ? (max + min) / 2 : null);
      return mean != null && max != null && min != null ? { date, mean, min, max } : null;
    })
    .filter((x): x is OutdoorDay => !!x);

/**
 * Descarga la temperatura diaria desde `since` (inicio de temporada) hasta 16 días de previsión.
 * La previsión cubre los últimos 92 días; lo anterior se pide al archivo histórico.
 */
export async function fetchOutdoor(lat: number, lon: number, since: string): Promise<NonNullable<ClimateData['outdoor']>> {
  const today = todayIso();
  const pastDays = Math.max(1, Math.min(92, diffDays(since, today) + 1));
  const daily = 'temperature_2m_mean,temperature_2m_max,temperature_2m_min';
  try {
    const f = await (
      await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=${daily}&current=temperature_2m,relative_humidity_2m&past_days=${pastDays}&forecast_days=16&timezone=auto`,
      )
    ).json();
    if (!f.daily) throw new Error();
    let days = toDays(f.daily as Daily);
    const firstForecastDay = addDays(today, -(pastDays - 1));
    if (since < firstForecastDay) {
      const a = await (
        await fetch(
          `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${since}&end_date=${addDays(firstForecastDay, -1)}&daily=${daily}&timezone=auto`,
        )
      ).json();
      if (a.daily) days = [...toDays(a.daily as Daily), ...days];
    }
    return {
      fetchedAt: new Date().toISOString(),
      lat,
      lon,
      daily: days,
      current: f.current
        ? { at: new Date().toISOString(), temperature: f.current.temperature_2m, humidity: f.current.relative_humidity_2m ?? null }
        : null,
    };
  } catch {
    throw new WeatherError('No se pudo obtener el tiempo exterior. Revisa la conexión.');
  }
}
