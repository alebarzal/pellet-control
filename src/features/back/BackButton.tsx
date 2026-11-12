import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { LogOut } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Route } from '../../app/router';
import { Dialog } from '../../ui/Dialog';
import { haptic } from '../../ui/haptics';

/* ── Preferencia de este móvil: preguntar antes de salir ── */

const KEY = 'pellet-control:ask-exit';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}
let askExit = read();

export function setAskExit(on: boolean) {
  askExit = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* sin almacenamiento: vale para esta sesión */
  }
  listeners.forEach((l) => l());
}

export function useAskExit() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => askExit,
  );
}

/** Cierra el menú o diálogo abierto más reciente. Devuelve true si había alguno. */
function closeTopDialog(): boolean {
  const open = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')];
  const top = open.at(-1);
  if (!top) return false;
  const close = top.querySelector<HTMLButtonElement>('button[aria-label="Cerrar"]');
  if (close) close.click();
  else top.dispatchEvent(new Event('cancel', { cancelable: true }));
  return true;
}

/**
 * Gesto o botón «atrás» de Android:
 * 1) cierra el menú o diálogo abierto;
 * 2) fuera de Inicio, vuelve a Inicio;
 * 3) en Inicio, pregunta si salir (con «No volver a preguntar») o sale directamente.
 */
export function BackButtonHandler({ route, go }: { route: Route; go: (r: Route) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);
  const routeRef = useRef(route);
  routeRef.current = route;
  const goRef = useRef(go);
  goRef.current = go;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const sub = CapApp.addListener('backButton', () => {
      if (closeTopDialog()) return;
      if (routeRef.current !== 'inicio') {
        haptic.tap();
        goRef.current('inicio');
        return;
      }
      if (askExit) {
        setDontAsk(false);
        setConfirm(true);
      } else {
        void CapApp.exitApp();
      }
    });
    return () => void sub.then((s) => s.remove());
  }, []);

  function exit() {
    if (dontAsk) setAskExit(false);
    setConfirm(false);
    void CapApp.exitApp();
  }

  return (
    <Dialog open={confirm} onClose={() => setConfirm(false)} title="¿Salir de Pellet Control?">
      <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-sand-soft px-3.5 py-3 text-sm">
        <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} className="size-4 accent-olive" />
        <span>
          <span className="font-semibold">No volver a preguntar</span>
          <span className="block text-ink-2">Puedes cambiarlo en Configuración › Este móvil.</span>
        </span>
      </label>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={() => setConfirm(false)} className="h-11 rounded-xl px-4 font-semibold text-ink-2 hover:bg-sand-soft">
          Quedarme
        </button>
        <button type="button" onClick={exit} className="flex h-11 items-center gap-2 rounded-xl bg-forest px-4 font-semibold text-paper">
          <LogOut className="size-4" aria-hidden /> Salir
        </button>
      </div>
    </Dialog>
  );
}
