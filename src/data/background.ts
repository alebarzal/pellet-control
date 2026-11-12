import { Capacitor, registerPlugin } from '@capacitor/core';
import { SENSITIVITY } from '../domain/heating';
import type { ClimateSettings, PlugReading, TempReading } from '../domain/types';

/** Plugin nativo (android/.../BackgroundSensorsPlugin.java): lectura de sensores con la app cerrada y avisos. */
interface BackgroundSensorsPlugin {
  configure(o: {
    token: string;
    secret: string;
    deviceIds: string[];
    indoorIds: string[];
    threshold: number;
    notify: boolean;
    plugId: string;
    plugThresholdW: number;
  }): Promise<void>;
  drain(): Promise<{ readings: TempReading[]; plug?: PlugReading[]; heating: boolean }>;
  requestNotifications(): Promise<{ granted: boolean }>;
  testNotification(): Promise<void>;
}

const Plugin = registerPlugin<BackgroundSensorsPlugin>('BackgroundSensors');
export const backgroundAvailable = () => Capacitor.getPlatform() === 'android';

export async function configureBackground(c: ClimateSettings) {
  if (!backgroundAvailable()) return;
  const deviceIds = [...new Set([...c.indoorIds, ...(c.outdoorId ? [c.outdoorId] : [])])];
  await Plugin.configure({
    token: c.switchbotToken,
    secret: c.switchbotSecret,
    deviceIds,
    indoorIds: c.indoorIds,
    threshold: SENSITIVITY[c.heatSensitivity],
    notify: c.notifyHeating,
    plugId: c.plugId ?? '',
    plugThresholdW: c.plugThresholdW,
  });
}

export async function drainBackground(): Promise<{ readings: TempReading[]; plug: PlugReading[] }> {
  if (!backgroundAvailable()) return { readings: [], plug: [] };
  try {
    const r = await Plugin.drain();
    return { readings: Array.isArray(r.readings) ? r.readings : [], plug: Array.isArray(r.plug) ? r.plug : [] };
  } catch {
    return { readings: [], plug: [] };
  }
}

export async function requestNotifications(): Promise<boolean> {
  if (!backgroundAvailable()) return false;
  return (await Plugin.requestNotifications()).granted;
}

export async function testNotification() {
  if (backgroundAvailable()) await Plugin.testNotification();
}
