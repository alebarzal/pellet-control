import { Capacitor, CapacitorHttp } from '@capacitor/core';

/**
 * Cliente mínimo de la API SwitchBot v1.1 (solo lectura de sensores).
 * Docs: https://github.com/OpenWonderLabs/SwitchBotAPI
 * Cada petición va firmada: sign = Base64(HMAC-SHA256(secret, token + t + nonce)).
 */

const API = 'https://api.switch-bot.com';

export class SwitchBotError extends Error {}

export interface SwitchBotDevice {
  id: string;
  name: string;
  type: string;
}

export interface SwitchBotStatus {
  temperature: number;
  humidity: number | null;
  battery: number | null;
}

/** Tipos de dispositivo que miden temperatura (termómetros, sensor exterior y hubs con sensor). */
export const isThermoType = (t: string) => /meter|iosensor|hub\s?[23]|thermo/i.test(t);

const b64 = (buf: ArrayBuffer) => {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s);
};

/**
 * La documentación oficial se contradice sobre las mayúsculas (los ejemplos JS/Python no las usan;
 * el texto y los ejemplos PHP/Go sí). Se prueba primero sin ellas y, si SwitchBot rechaza la firma,
 * se reintenta en mayúsculas y se recuerda la variante que funciona.
 */
let upperSign = false;

export async function signHeaders(token: string, secret: string, t = Date.now(), nonce: string = crypto.randomUUID(), upper = false) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${token}${t}${nonce}`));
  return {
    Authorization: token,
    sign: upper ? b64(sig).toUpperCase() : b64(sig),
    nonce,
    t: String(t),
    'Content-Type': 'application/json; charset=utf8',
  };
}

const MESSAGES: Record<number, string> = {
  151: 'Ese dispositivo no admite esta consulta.',
  152: 'No se encuentra el dispositivo. Vuelve a cargar la lista de sensores.',
  161: 'El sensor está desconectado. Revisa la pila y el Hub.',
  171: 'El Hub está desconectado. Comprueba su conexión wifi.',
  190: 'SwitchBot no ha podido leer el sensor. Inténtalo en unos minutos.',
};

async function get<T>(path: string, token: string, secret: string): Promise<T> {
  if (!token.trim() || !secret.trim()) throw new SwitchBotError('Falta el token o el secret de SwitchBot.');
  try {
    return await request<T>(path, token, secret, upperSign);
  } catch (e) {
    if (e instanceof AuthError) {
      try {
        const res = await request<T>(path, token, secret, !upperSign);
        upperSign = !upperSign;
        return res;
      } catch (e2) {
        if (e2 instanceof AuthError)
          throw new SwitchBotError(
            'SwitchBot rechaza el acceso: revisa el token y el secret (cópialos de nuevo de la app) o espera a mañana si se ha superado el límite diario de 10.000 consultas.',
          );
        throw e2;
      }
    }
    throw e;
  }
}

class AuthError extends Error {}

async function request<T>(path: string, token: string, secret: string, upper: boolean): Promise<T> {
  const headers = await signHeaders(token.trim(), secret.trim(), Date.now(), crypto.randomUUID(), upper);
  let status: number;
  let json: { statusCode?: number; message?: string; body?: unknown };
  try {
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({ url: API + path, headers, connectTimeout: 15000, readTimeout: 15000 });
      status = res.status;
      json = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    } else {
      // En el PC (desarrollo) pasa por el proxy de Vite: la API no admite peticiones desde el navegador (CORS).
      const res = await fetch(`/api/switchbot${path}`, { headers });
      status = res.status;
      json = await res.json().catch(() => ({}));
    }
  } catch {
    throw new SwitchBotError('No se pudo conectar con SwitchBot. Revisa la conexión a internet.');
  }
  if (status === 401 || status === 403) throw new AuthError();
  if (status === 429) throw new SwitchBotError('Has superado el límite diario de consultas de SwitchBot. Se reanudará mañana.');
  if (status >= 400) throw new SwitchBotError(`SwitchBot respondió con un error (${status}).`);
  if (json.statusCode !== 100) throw new SwitchBotError(MESSAGES[json.statusCode ?? 0] ?? `SwitchBot: ${json.message ?? 'error desconocido'}.`);
  return json.body as T;
}

/** Enchufes con medidor de consumo (Plug Mini y similares). */
export const isPlugType = (t: string) => /plug/i.test(t);

/** Todos los dispositivos útiles de la cuenta: termómetros y enchufes con medidor. */
export async function listDevices(token: string, secret: string): Promise<{ thermo: SwitchBotDevice[]; plugs: SwitchBotDevice[] }> {
  const body = await get<{ deviceList?: { deviceId: string; deviceName: string; deviceType: string }[] }>('/v1.1/devices', token, secret);
  const all = (body.deviceList ?? []).map((d) => ({ id: d.deviceId, name: d.deviceName, type: d.deviceType ?? '' }));
  return { thermo: all.filter((d) => isThermoType(d.type)), plugs: all.filter((d) => isPlugType(d.type)) };
}

export async function listThermoDevices(token: string, secret: string): Promise<SwitchBotDevice[]> {
  return (await listDevices(token, secret)).thermo;
}

/**
 * Potencia instantánea (W) a partir del estado del enchufe. Según el modelo, SwitchBot la da en
 * `power` o en `weight` (Plug Mini, en vatios), o hay que calcularla con tensión × corriente
 * (la corriente llega en amperios o, en algunos modelos, en miliamperios).
 */
export function plugWatts(b: Record<string, unknown>): number | null {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const p = num(b.power) ?? num(b.weight);
  if (p != null) return Math.max(0, p);
  const v = num(b.voltage);
  const i = num(b.electricCurrent);
  if (v != null && i != null) return Math.max(0, v * (i > 20 ? i / 1000 : i));
  return null;
}

export async function readPlug(id: string, token: string, secret: string): Promise<{ watts: number }> {
  const b = await get<Record<string, unknown>>(`/v1.1/devices/${encodeURIComponent(id)}/status`, token, secret);
  const watts = plugWatts(b ?? {});
  if (watts == null) throw new SwitchBotError('Este enchufe no informa de su consumo. Necesitas un modelo con medidor (Plug Mini).');
  return { watts: Math.round(watts * 10) / 10 };
}

export async function readStatus(id: string, token: string, secret: string): Promise<SwitchBotStatus> {
  const b = await get<{ temperature?: number; humidity?: number; battery?: number }>(`/v1.1/devices/${encodeURIComponent(id)}/status`, token, secret);
  if (typeof b.temperature !== 'number') throw new SwitchBotError('Este dispositivo no devuelve temperatura.');
  return {
    temperature: b.temperature,
    humidity: typeof b.humidity === 'number' ? b.humidity : null,
    battery: typeof b.battery === 'number' ? b.battery : null,
  };
}

export const TYPE_LABEL = (t: string) =>
  /iosensor/i.test(t) ? 'Sensor exterior' : /hub/i.test(t) ? 'Hub con sensor' : /pro/i.test(t) ? 'Meter Pro' : /plus/i.test(t) ? 'Meter Plus' : 'Termómetro';
