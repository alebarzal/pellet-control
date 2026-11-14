import { useSyncExternalStore } from 'react';
import { ROUTES, type Route } from '../app/router';

/**
 * Colocación del menú en el móvil: qué secciones van en la barra de abajo (a los lados del botón +)
 * y en qué orden salen las demás en «Más». Es una preferencia de cada móvil; no se comparte con el hogar.
 */
export interface NavLayout {
  bar: Route[];
  more: Route[];
}

/** Huecos de la barra para secciones (los otros dos son el botón + y «Más»). */
export const BAR_SLOTS = 3;

const ALL = ROUTES.map((r) => r.id);
const DEFAULT_BAR: Route[] = ['inicio', 'clima', 'precios'];

export const DEFAULT_LAYOUT: NavLayout = {
  bar: DEFAULT_BAR,
  more: ALL.filter((id) => !DEFAULT_BAR.includes(id)),
};

/**
 * Deja una colocación guardada en un estado válido: solo secciones que existen, sin repetir, tres en
 * la barra y todas las demás en «Más» (las que falten, por ejemplo secciones nuevas, al final).
 */
export function normalizeLayout(raw: unknown): NavLayout {
  const o = raw && typeof raw === 'object' ? (raw as { bar?: unknown; more?: unknown }) : {};
  const seen = new Set<Route>();
  const clean = (v: unknown): Route[] => {
    const out: Route[] = [];
    for (const x of Array.isArray(v) ? v : []) {
      if (typeof x === 'string' && ALL.includes(x as Route) && !seen.has(x as Route)) {
        seen.add(x as Route);
        out.push(x as Route);
      }
    }
    return out;
  };
  const bar = clean(o.bar);
  const more = clean(o.more);
  // Lo que sobra de la barra pasa al principio de «Más».
  more.unshift(...bar.splice(BAR_SLOTS));
  for (const id of [...DEFAULT_LAYOUT.bar, ...DEFAULT_LAYOUT.more]) {
    if (seen.has(id)) continue;
    (bar.length < BAR_SLOTS ? bar : more).push(id);
  }
  while (bar.length < BAR_SLOTS && more.length) bar.push(more.shift()!);
  return { bar, more };
}

/**
 * Lleva una sección al sitio de otra. Dentro de «Más» se recoloca (las demás se corren);
 * si interviene la barra, las dos se intercambian, porque la barra siempre tiene tres.
 */
export function moveSection(l: NavLayout, id: Route, target: Route): NavLayout {
  if (id === target) return l;
  const bar = [...l.bar];
  const more = [...l.more];
  const from = more.indexOf(id);
  const to = more.indexOf(target);
  if (from >= 0 && to >= 0) {
    more.splice(from, 1);
    more.splice(to, 0, id);
    return { bar, more };
  }
  const swap = (a: Route[]) => a.map((x) => (x === id ? target : x === target ? id : x));
  if (![...bar, ...more].includes(id) || ![...bar, ...more].includes(target)) return l;
  return { bar: swap(bar), more: swap(more) };
}

export const sameLayout = (a: NavLayout, b: NavLayout) => a.bar.join() === b.bar.join() && a.more.join() === b.more.join();

const KEY = 'pellet-control:nav-layout';

function load(): NavLayout {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeLayout(JSON.parse(raw)) : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

let current: NavLayout | null = null;
const listeners = new Set<() => void>();

export function useNavLayout(): NavLayout {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (current ??= load()),
  );
}

export function saveNavLayout(l: NavLayout) {
  current = normalizeLayout(l);
  try {
    if (sameLayout(current, DEFAULT_LAYOUT)) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* sin almacenamiento: vale hasta cerrar la app */
  }
  listeners.forEach((l) => l());
}

export const resetNavLayout = () => saveNavLayout(DEFAULT_LAYOUT);
