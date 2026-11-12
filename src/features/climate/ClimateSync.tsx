import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { configureBackground, drainBackground } from '../../data/background';
import { readPlug, readStatus, SwitchBotError } from '../../data/switchbot';
import { MAX_PLUG_READINGS } from '../../domain/plug';
import { fetchOutdoor, WeatherError } from '../../data/weather';
import { latestReadings, MAX_READINGS } from '../../domain/climate';
import type { PlugReading, TempReading } from '../../domain/types';

function mergePlug(prev: PlugReading[] | undefined, add: PlugReading[]): PlugReading[] {
  const seen = new Set((prev ?? []).map((r) => r.at));
  return [...(prev ?? []), ...add.filter((r) => !seen.has(r.at))].sort((a, b) => (a.at < b.at ? -1 : 1)).slice(-MAX_PLUG_READINGS);
}
import { useStore } from '../../store/store';

/** Cada cuánto se consultan los sensores mientras la app está abierta. */
const SENSOR_EVERY_MS = 15 * 60_000;
/** Antigüedad máxima del tiempo exterior antes de volver a descargarlo. */
const WEATHER_EVERY_MS = 3 * 3600_000;

interface ClimateSyncApi {
  syncing: boolean;
  sensorError: string | null;
  weatherError: string | null;
  plugError: string | null;
  lastSync: string | null;
  /** Fuerza una consulta inmediata de sensores y tiempo. */
  syncNow: () => Promise<void>;
}

const Ctx = createContext<ClimateSyncApi | null>(null);

export function ClimateSyncProvider({ children }: { children: ReactNode }) {
  const { data, patchClimate } = useStore();
  const dataRef = useRef(data);
  dataRef.current = data;
  const running = useRef(false);
  const [syncing, setSyncing] = useState(false);
  const [sensorError, setSensorError] = useState<string | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [plugError, setPlugError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const run = useCallback(
    async (force: boolean) => {
      if (running.current) return;
      running.current = true;
      setSyncing(true);
      // Lecturas tomadas en segundo plano con la app cerrada (Android).
      const bgAll = await drainBackground();
      const bg = bgAll.readings;
      if (bgAll.plug.length) patchClimate((cl) => ({ ...cl, plug: mergePlug(cl.plug, bgAll.plug) }));
      if (bg.length)
        patchClimate((cl) => {
          const seen = new Set(cl.readings.map((r) => r.deviceId + r.at));
          const add = bg.filter((r) => !seen.has(r.deviceId + r.at));
          return { ...cl, readings: [...cl.readings, ...add].sort((a, b) => (a.at < b.at ? -1 : 1)).slice(-MAX_READINGS) };
        });
      const d = dataRef.current;
      const c = d.settings.climate;
      try {
        // Tiempo exterior (Open-Meteo)
        if (c.lat != null && c.lon != null) {
          const o = d.climate.outdoor;
          const stale =
            force || !o || o.lat !== c.lat || o.lon !== c.lon || Date.now() - new Date(o.fetchedAt).getTime() > WEATHER_EVERY_MS;
          if (stale) {
            try {
              const outdoor = await fetchOutdoor(c.lat, c.lon, d.settings.seasonStart);
              patchClimate((cl) => ({ ...cl, outdoor }));
              setWeatherError(null);
            } catch (e) {
              setWeatherError(e instanceof WeatherError ? e.message : 'No se pudo obtener el tiempo exterior.');
            }
          }
        }
        // Sensores SwitchBot
        const ids = [...new Set([...c.indoorIds, ...(c.outdoorId ? [c.outdoorId] : [])])];
        if (c.switchbotToken && c.switchbotSecret && ids.length) {
          const latest = latestReadings(d.climate.readings);
          const due = ids.filter((id) => {
            const r = latest.get(id);
            return force || !r || Date.now() - new Date(r.at).getTime() > SENSOR_EVERY_MS - 60_000;
          });
          const fresh: TempReading[] = [];
          let err: string | null = null;
          for (const id of due) {
            try {
              const s = await readStatus(id, c.switchbotToken, c.switchbotSecret);
              fresh.push({ at: new Date().toISOString(), deviceId: id, ...s });
            } catch (e) {
              err = e instanceof SwitchBotError ? e.message : 'No se pudo leer un sensor.';
            }
          }
          if (fresh.length) patchClimate((cl) => ({ ...cl, readings: [...cl.readings, ...fresh].slice(-MAX_READINGS) }));
          if (due.length) setSensorError(err);
        }
        // Enchufe de la caldera
        if (c.switchbotToken && c.switchbotSecret && c.plugId) {
          const last = (d.climate.plug ?? []).at(-1);
          if (force || !last || Date.now() - new Date(last.at).getTime() > SENSOR_EVERY_MS - 60_000) {
            try {
              const p = await readPlug(c.plugId, c.switchbotToken, c.switchbotSecret);
              patchClimate((cl) => ({ ...cl, plug: mergePlug(cl.plug, [{ at: new Date().toISOString(), watts: p.watts }]) }));
              setPlugError(null);
            } catch (e) {
              setPlugError(e instanceof SwitchBotError ? e.message : 'No se pudo leer el enchufe.');
            }
          }
        }
        setLastSync(new Date().toISOString());
      } finally {
        running.current = false;
        setSyncing(false);
      }
    },
    [patchClimate],
  );

  // Mantiene configurada la tarea en segundo plano con los sensores y ajustes actuales.
  const c = data.settings.climate;
  const bgKey = JSON.stringify([c.switchbotToken, c.switchbotSecret, c.indoorIds, c.outdoorId, c.heatSensitivity, c.notifyHeating, c.plugId, c.plugThresholdW]);
  useEffect(() => {
    void configureBackground(dataRef.current.settings.climate).catch(() => {});
  }, [bgKey]);

  // Al abrir, cada 15 min y al volver a la app.
  useEffect(() => {
    void run(false);
    const iv = window.setInterval(() => void run(false), SENSOR_EVERY_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') void run(false);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [run]);

  const api = useMemo<ClimateSyncApi>(
    () => ({ syncing, sensorError, weatherError, plugError, lastSync, syncNow: () => run(true) }),
    [syncing, sensorError, weatherError, plugError, lastSync, run],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useClimateSync() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useClimateSync fuera del proveedor');
  return c;
}
