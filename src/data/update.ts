import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/** Commit con el que se compiló esta app y cuándo (los pone Vite al compilar). */
declare const __BUILD_SHA__: string;
declare const __BUILD_TIME__: string;

export const BUILD_SHA: string = typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : '';
export const BUILD_TIME: string = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';

const REPO = 'alebarzal/pellet-control';
const API = `https://api.github.com/repos/${REPO}`;
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;

/** Plugin nativo (android/.../UpdaterPlugin.java). */
interface PelletUpdaterPlugin {
  install(o: { url: string; sha: string }): Promise<{ status: 'installing' | 'permission' }>;
  addListener(event: 'progress', cb: (p: { percent: number }) => void): Promise<PluginListenerHandle>;
}
const Plugin = registerPlugin<PelletUpdaterPlugin>('PelletUpdater');

export const updaterAvailable = () => Capacitor.getPlatform() === 'android';

export interface PublishedBuild {
  /** Commit del que salió el APK publicado. */
  sha: string;
  url: string;
  /** Primera línea del commit: qué trae. */
  title: string;
  /** Cuándo se subió el APK (ISO). */
  at: string;
  sizeMb: number;
}

/** Lee la release «latest» de GitHub. Null si aún no tiene un APK válido. */
export function parseRelease(json: unknown): PublishedBuild | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as { name?: unknown; body?: unknown; assets?: unknown };
  const sha = typeof r.body === 'string' ? (/commit:\s*([0-9a-f]{40})/.exec(r.body)?.[1] ?? null) : null;
  const assets = Array.isArray(r.assets) ? (r.assets as { name?: unknown; browser_download_url?: unknown; updated_at?: unknown; size?: unknown }[]) : [];
  const apk = assets.find((a) => typeof a.name === 'string' && a.name.endsWith('.apk'));
  const url = apk && typeof apk.browser_download_url === 'string' ? apk.browser_download_url : null;
  if (!sha || !url || !url.startsWith(DOWNLOAD_PREFIX)) return null;
  return {
    sha,
    url,
    title: typeof r.name === 'string' ? r.name : '',
    at: typeof apk!.updated_at === 'string' ? apk!.updated_at : '',
    sizeMb: typeof apk!.size === 'number' ? Math.round(apk!.size / 104857.6) / 10 : 0,
  };
}

export type UpdateCheck =
  /** Ya está instalada la última versión publicada. */
  | { state: 'current' }
  /** Hay un APK más nuevo listo para instalar. */
  | { state: 'available'; build: PublishedBuild }
  /** Hay un push más nuevo que el APK publicado: GitHub todavía lo está compilando. */
  | { state: 'building'; build: PublishedBuild | null };

export const sameCommit = (a: string, b: string) => !!a && !!b && (a.startsWith(b) || b.startsWith(a));

/** Compara lo instalado con el último push de GitHub y con el APK publicado. */
export function decide(installed: string, build: PublishedBuild | null, headSha: string | null): UpdateCheck {
  const building = !!headSha && (!build || !sameCommit(build.sha, headSha));
  if (build && !sameCommit(build.sha, installed)) {
    // El APK publicado es distinto del instalado. Si además va por detrás del último push y lo instalado
    // ya es ese último push (APK instalado a mano), no se ofrece volver atrás.
    if (building && headSha && sameCommit(installed, headSha)) return { state: 'building', build: null };
    return { state: 'available', build };
  }
  return building && !(headSha && sameCommit(installed, headSha)) ? { state: 'building', build } : { state: 'current' };
}

async function getJson(url: string): Promise<unknown | null> {
  const r = await fetch(url, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(r.status === 403 || r.status === 429 ? 'GitHub pide esperar un rato antes de volver a mirar.' : `GitHub respondió ${r.status}.`);
  return r.json();
}

export async function checkUpdate(): Promise<UpdateCheck> {
  const [release, head] = await Promise.all([getJson(`${API}/releases/tags/latest`), getJson(`${API}/commits/main`).catch(() => null)]);
  const headSha = head && typeof (head as { sha?: unknown }).sha === 'string' ? (head as { sha: string }).sha : null;
  return decide(BUILD_SHA, parseRelease(release), headSha);
}

/**
 * Descarga el APK y abre el instalador. Devuelve «permission» si antes hay que permitir
 * a la app instalar aplicaciones (Android abre ese ajuste; luego se vuelve a pulsar).
 */
export async function installUpdate(build: PublishedBuild, onProgress: (percent: number) => void): Promise<'installing' | 'permission'> {
  const h = await Plugin.addListener('progress', (p) => onProgress(p.percent));
  try {
    return (await Plugin.install({ url: build.url, sha: build.sha })).status;
  } finally {
    void h.remove();
  }
}
