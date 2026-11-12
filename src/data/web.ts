import { Capacitor, registerPlugin } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

/** Plugin nativo (android/.../PageFetcherPlugin.java): carga la página con el motor de navegador del teléfono. */
const PageFetcher = registerPlugin<{ fetch(o: { url: string }): Promise<{ status: number; html: string }> }>('PageFetcher');

export class FetchError extends Error {}

function explain(status: number): string {
  if (status === 403 || status === 429 || status === 503)
    return 'La tienda bloquea las consultas automáticas. Ábrela en el navegador y anota el precio a mano.';
  if (status === 404) return 'La página ya no existe. Revisa el enlace del producto.';
  return `La tienda respondió con un error (${status}).`;
}

/**
 * Descarga el HTML de una ficha de producto.
 * - En la app Android carga la página en una vista web oculta (como un navegador normal).
 * - En el navegador de escritorio usa el proxy del servidor de desarrollo (/api/proxy).
 */
export async function fetchPage(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new FetchError('El enlace no es válido.');
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new FetchError('El enlace debe empezar por http o https.');

  try {
    if (Capacitor.isNativePlatform()) {
      const res = await PageFetcher.fetch({ url });
      if (res.status >= 400) throw new FetchError(explain(res.status));
      return res.html;
    }
    const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
    if (res.status === 404 && res.headers.get('x-proxy') !== '1')
      throw new FetchError('La consulta online solo funciona en la app Android o con el servidor de desarrollo.');
    if (!res.ok) throw new FetchError(explain(res.status));
    return await res.text();
  } catch (e) {
    if (e instanceof FetchError) throw e;
    throw new FetchError('Sin conexión o la tienda no responde. Inténtalo más tarde.');
  }
}

export async function openExternal(url: string) {
  if (Capacitor.isNativePlatform()) await Browser.open({ url });
  else window.open(url, '_blank', 'noopener');
}

export const isNative = () => Capacitor.isNativePlatform();
