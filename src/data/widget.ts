import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { autonomy, hopperEstimate, storedStock } from '../domain/calc';
import { fmtDateShort } from '../domain/format';
import { currentIndoor, currentOutdoor } from '../domain/climate';
import type { AppData } from '../domain/types';

/** Datos que pinta el widget de la pantalla de inicio (android/.../PelletWidget.java). */
export interface WidgetPayload {
  bags: string;
  bagsSub: string;
  /** Porcentaje de la tolva; se omite si no hay nivel registrado. */
  hopperPct?: number;
  hopperApprox: boolean;
  hopperSub: string;
  /** Momento estimado en que se acaba el pellet (ms); 0 = sin datos de consumo. */
  runOutAt: number;
  /** Temperatura interior media y exterior, con su hora (ms). */
  tIn?: number;
  tInAt?: number;
  tOut?: number;
  tOutAt?: number;
  /** Enchufe de la caldera: hay uno elegido, y su última lectura (W, si supera el umbral y hora en ms). */
  plug: boolean;
  plugW?: number;
  plugOn?: boolean;
  plugAt?: number;
}

export type WidgetAction = 'purchase' | 'refill';

interface PelletWidgetPlugin {
  update(o: WidgetPayload): Promise<void>;
  takeAction(): Promise<{ action: string | null }>;
  addListener(event: 'action', cb: (e: { action: string }) => void): Promise<PluginListenerHandle>;
}

const Plugin = registerPlugin<PelletWidgetPlugin>('PelletWidget');
export const widgetAvailable = () => Capacitor.getPlatform() === 'android';

export function widgetPayload(data: AppData, now = Date.now()): WidgetPayload {
  const stock = Math.max(0, storedStock(data).bags);
  const hopper = hopperEstimate(data);
  const auto = autonomy(data);
  const tin = currentIndoor(data);
  const tout = currentOutdoor(data);
  const c = data.settings.climate;
  const plugList = c.plugId ? (data.climate.plug ?? []) : [];
  const lastPlug = plugList.length ? plugList.reduce((a, b) => (a.at > b.at ? a : b)) : null;
  return {
    plug: !!c.plugId,
    ...(lastPlug ? { plugW: Math.round(lastPlug.watts), plugOn: lastPlug.watts >= c.plugThresholdW, plugAt: new Date(lastPlug.at).getTime() } : {}),
    ...(tin ? { tIn: Math.round(tin.temperature * 10) / 10, tInAt: new Date(tin.at).getTime() } : {}),
    ...(tout ? { tOut: Math.round(tout.temperature * 10) / 10, tOutAt: new Date(tout.at).getTime() } : {}),
    bags: String(stock),
    bagsSub: stock === 1 ? 'saco guardado' : 'sacos guardados',
    hopperPct: hopper ? Math.round(hopper.percent) : undefined,
    hopperApprox: hopper?.approximate ?? true,
    hopperSub: hopper ? `tolva · ${fmtDateShort(hopper.date)}` : 'tolva sin nivel',
    runOutAt: auto ? Math.round(now + auto.days * 86_400_000) : 0,
  };
}

export async function updateWidget(data: AppData) {
  if (!widgetAvailable()) return;
  try {
    await Plugin.update(widgetPayload(data));
  } catch {
    /* sin widget nativo: no pasa nada */
  }
}

const asAction = (a: string | null | undefined): WidgetAction | null => (a === 'purchase' || a === 'refill' ? a : null);

/** Escucha los botones del widget: la acción con la que se abrió la app y las que lleguen después. */
export function onWidgetAction(cb: (a: WidgetAction) => void): () => void {
  if (!widgetAvailable()) return () => {};
  let handle: PluginListenerHandle | null = null;
  let stopped = false;
  void Plugin.takeAction()
    .then((r) => {
      const a = asAction(r.action);
      if (a && !stopped) cb(a);
    })
    .catch(() => {});
  void Plugin.addListener('action', (e) => {
    const a = asAction(e.action);
    if (a) cb(a);
  })
    .then((h) => {
      if (stopped) void h.remove();
      else handle = h;
    })
    .catch(() => {});
  return () => {
    stopped = true;
    void handle?.remove();
  };
}
