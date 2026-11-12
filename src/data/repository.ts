import type { AppData } from '../domain/types';
import { createInitialData, defaultClimateSettings } from './seed';

/**
 * Contrato de persistencia. La app solo depende de esta interfaz, de modo que
 * migrar a Supabase consiste en implementar otra clase (p. ej. SupabaseRepository
 * con tablas `settings` y `records`) y cambiar `createRepository`.
 */
export interface Repository {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
}

const STORAGE_KEY = 'pellet-control:v1';

export class LocalStorageRepository implements Repository {
  async load(): Promise<AppData> {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      throw new Error('El navegador no permite guardar datos (almacenamiento bloqueado).');
    }
    if (!raw) {
      const initial = createInitialData();
      await this.save(initial);
      return initial;
    }
    const parsed = JSON.parse(raw) as AppData;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.records)) {
      throw new Error('Los datos guardados tienen un formato desconocido.');
    }
    // Completa ajustes añadidos en versiones posteriores.
    parsed.settings = { ...createInitialData().settings, ...parsed.settings };
    normalize(parsed);
    return parsed;
  }

  async save(data: AppData): Promise<void> {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      throw new Error('No se pudo guardar. Comprueba el espacio o los permisos del navegador.');
    }
  }
}

export function createRepository(): Repository {
  return new LocalStorageRepository();
}

/** Completa campos añadidos en versiones posteriores. */
function normalize(d: AppData) {
  if (!Array.isArray(d.market)) d.market = [];
  if (!d.climate || !Array.isArray(d.climate.readings)) d.climate = { readings: [], outdoor: null };
  d.settings.climate = { ...defaultClimateSettings(), ...(d.settings.climate ?? {}) };
}

/** Copia de seguridad sin las credenciales de SwitchBot. */
export function exportData(data: AppData): string {
  const safe: AppData = {
    ...data,
    settings: { ...data.settings, climate: { ...data.settings.climate, switchbotToken: '', switchbotSecret: '' } },
  };
  return JSON.stringify(safe, null, 2);
}

export function parseImport(text: string): AppData {
  const parsed = JSON.parse(text) as AppData;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.records) || !parsed.settings) {
    throw new Error('El archivo no es una copia de seguridad de Pellet Control.');
  }
  normalize(parsed);
  return parsed;
}
