import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { useSyncExternalStore } from 'react';

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

/* ── Comprobación al abrir la app ── */

const CHECKED_KEY = 'pellet-control:update-checked';
const AUTO_KEY = 'pellet-control:auto-update';
const FOUND_KEY = 'pellet-control:update-found';
/** Se mira cada vez que se entra, pero como mucho una consulta cada 10 minutos (GitHub limita las consultas sin cuenta). */
const CHECK_EVERY_MS = 10 * 60_000;

/**
 * Versión nueva que se encontró en la última consulta, para volver a avisar al entrar sin preguntar
 * otra vez a GitHub. Null si no había, si el dato está roto o si ya es la que está instalada.
 */
export function rememberedBuild(raw: string | null, installed: string): PublishedBuild | null {
  if (!raw) return null;
  try {
    const b = JSON.parse(raw) as Partial<PublishedBuild> | null;
    if (!b || typeof b.sha !== 'string' || !/^[0-9a-f]{40}$/.test(b.sha)) return null;
    if (typeof b.url !== 'string' || !b.url.startsWith(DOWNLOAD_PREFIX)) return null;
    if (sameCommit(b.sha, installed)) return null;
    return { sha: b.sha, url: b.url, title: typeof b.title === 'string' ? b.title : '', at: typeof b.at === 'string' ? b.at : '', sizeMb: typeof b.sizeMb === 'number' ? b.sizeMb : 0 };
  } catch {
    return null;
  }
}

let available: PublishedBuild | null = null;
const listeners = new Set<() => void>();

/** APK nuevo encontrado al abrir la app (null si no hay o aún no se ha mirado). */
export function useAvailableUpdate(): PublishedBuild | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => available,
  );
}

export function setAvailableUpdate(b: PublishedBuild | null) {
  available = b;
  try {
    if (b) localStorage.setItem(FOUND_KEY, JSON.stringify(b));
    else localStorage.removeItem(FOUND_KEY);
  } catch {
    /* sin almacenamiento: se volverá a mirar */
  }
  listeners.forEach((l) => l());
}

/* Aviso emergente al entrar: «Más tarde» lo quita hasta la próxima vez que se abra la app. */
let promptDismissed: string | null = null;

export function useUpdatePromptDismissed(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => promptDismissed,
  );
}

export function dismissUpdatePrompt(sha: string) {
  promptDismissed = sha;
  listeners.forEach((l) => l());
}

/** Mira si hay versión nueva al entrar en la app. Silenciosa: sin red o sin respuesta no avisa de nada. */
export async function checkUpdateQuietly(now = Date.now()): Promise<void> {
  if (!updaterAvailable() || !BUILD_SHA) return;
  try {
    const last = Number(localStorage.getItem(CHECKED_KEY) ?? 0);
    if (now - last < CHECK_EVERY_MS) {
      // Recién consultado: se avisa con lo que se encontró entonces.
      if (!available) {
        const b = rememberedBuild(localStorage.getItem(FOUND_KEY), BUILD_SHA);
        if (b) setAvailableUpdate(b);
      }
      return;
    }
    localStorage.setItem(CHECKED_KEY, String(now));
  } catch {
    /* sin almacenamiento: se mira igual */
  }
  try {
    const c = await checkUpdate();
    setAvailableUpdate(c.state === 'available' ? c.build : null);
  } catch {
    /* sin conexión */
  }
}

/** Los avisos de versión nueva piden a Configuración que empiece a actualizar nada más abrirse. */
export function requestAutoInstall() {
  try {
    sessionStorage.setItem(AUTO_KEY, '1');
  } catch {
    /* ignorado */
  }
}

export function takeAutoInstall(): boolean {
  try {
    const v = sessionStorage.getItem(AUTO_KEY) === '1';
    sessionStorage.removeItem(AUTO_KEY);
    return v;
  } catch {
    return false;
  }
}
