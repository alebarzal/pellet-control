import type { AppData, MarketProduct, PelletRecord, Settings, TempReading } from '../../domain/types';

/**
 * Traducción entre los datos de la app y las filas de la tabla `items` de Supabase.
 * Cada registro, producto o lectura es una fila; los ajustes son una sola fila.
 */

export type Collection = 'record' | 'product' | 'settings' | 'reading';

export interface SyncItem {
  collection: Collection;
  id: string;
  data: unknown;
  deleted: boolean;
  /** Hora del servidor (ISO). Vacía en los cambios locales aún no subidos. */
  updated_at?: string;
}

/** Ajustes que son de cada móvil y no se comparten. */
const LOCAL_ONLY = ['switchbotToken', 'switchbotSecret', 'notifyHeating'] as const;

export function sharedSettings(s: Settings): Settings {
  const climate = { ...s.climate };
  for (const k of LOCAL_ONLY) delete (climate as Partial<typeof climate>)[k];
  return { ...s, climate: climate as Settings['climate'] };
}

export const readingId = (r: TempReading) => `${r.deviceId}|${r.at}`;

/** JSON con claves ordenadas: la base de datos reordena las claves al guardar. */
export function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(',')}}`;
}

type Keyed = Map<string, { collection: Collection; id: string; data: unknown }>;

function index(d: AppData): Keyed {
  const m: Keyed = new Map();
  for (const r of d.records) m.set(`record:${r.id}`, { collection: 'record', id: r.id, data: r });
  for (const p of d.market) m.set(`product:${p.id}`, { collection: 'product', id: p.id, data: p });
  for (const r of d.climate.readings) m.set(`reading:${readingId(r)}`, { collection: 'reading', id: readingId(r), data: r });
  m.set('settings:settings', { collection: 'settings', id: 'settings', data: sharedSettings(d.settings) });
  return m;
}

/** Todos los datos como filas (para subir un hogar nuevo). */
export function allItems(d: AppData): SyncItem[] {
  return [...index(d).values()].map((x) => ({ ...x, deleted: false }));
}

/** Cambios entre dos estados locales. Las lecturas solo se añaden (los recortes por antigüedad no se borran en el hogar). */
export function diff(prev: AppData, next: AppData): SyncItem[] {
  const a = index(prev);
  const b = index(next);
  const out: SyncItem[] = [];
  for (const [k, v] of b) {
    const old = a.get(k);
    if (!old || stable(old.data) !== stable(v.data)) out.push({ ...v, deleted: false });
  }
  for (const [k, v] of a) if (!b.has(k) && v.collection !== 'reading') out.push({ collection: v.collection, id: v.id, data: null, deleted: true });
  return out;
}

/** Aplica cambios llegados del hogar. Conserva lo propio del móvil (credenciales, avisos). */
export function applyRemote(d: AppData, items: SyncItem[]): AppData {
  if (!items.length) return d;
  const records = new Map(d.records.map((r) => [r.id, r]));
  const market = new Map(d.market.map((p) => [p.id, p]));
  const readings = new Map(d.climate.readings.map((r) => [readingId(r), r]));
  let settings = d.settings;
  for (const it of items) {
    switch (it.collection) {
      case 'record':
        if (it.deleted) records.delete(it.id);
        else records.set(it.id, it.data as PelletRecord);
        break;
      case 'product':
        if (it.deleted) market.delete(it.id);
        else market.set(it.id, it.data as MarketProduct);
        break;
      case 'reading':
        if (!it.deleted && !readings.has(it.id)) readings.set(it.id, it.data as TempReading);
        break;
      case 'settings':
        if (!it.deleted && it.data) {
          const s = it.data as Settings;
          settings = {
            ...settings,
            ...s,
            climate: {
              ...settings.climate,
              ...s.climate,
              switchbotToken: settings.climate.switchbotToken,
              switchbotSecret: settings.climate.switchbotSecret,
              notifyHeating: settings.climate.notifyHeating,
            },
          };
        }
        break;
    }
  }
  return {
    ...d,
    settings,
    records: [...records.values()],
    market: [...market.values()],
    climate: { ...d.climate, readings: [...readings.values()].sort((x, y) => (x.at < y.at ? -1 : 1)) },
  };
}

/** Datos vacíos de un hogar al que uno se une (conserva credenciales y avisos de este móvil). */
export function emptyFrom(d: AppData): AppData {
  return { ...d, records: [], market: [], climate: { ...d.climate, readings: [] } };
}
