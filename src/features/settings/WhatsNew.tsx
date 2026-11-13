import { ChevronDown, Sparkles } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { APP_VERSION, CHANGELOG, markSeen, readSeenVersion, unseenReleases, type Release } from '../../data/changelog';
import { Dialog } from '../../ui/Dialog';
import { Button, cx } from '../../ui/primitives';

const fmt = (iso: string) => new Date(iso + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

/* Abrir la pantalla desde cualquier sitio (Configuración, aviso de actualización…). */
let openState = false;
const listeners = new Set<() => void>();
const setOpen = (v: boolean) => {
  openState = v;
  listeners.forEach((l) => l());
};
export const openWhatsNew = () => setOpen(true);

function ReleaseBlock({ r, open }: { r: Release; open: boolean }) {
  return (
    <section>
      <p className="flex items-baseline justify-between gap-3">
        <span className="font-bold">Versión {r.version}</span>
        <span className="text-[0.8125rem] text-ink-3">{fmt(r.date)}</span>
      </p>
      <p className="mt-0.5 text-sm font-semibold text-olive-strong">{r.summary}</p>
      {open && (
        <ul className="mt-2.5 flex flex-col gap-2">
          {r.items.map((t) => (
            <li key={t} className="flex gap-2.5 text-[0.9375rem] text-ink-2 text-pretty">
              <span className="mt-[0.55rem] size-1.5 shrink-0 rounded-full bg-olive" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * «Novedades»: se abre sola la primera vez que se arranca una versión nueva y muestra lo que trae
 * (todas las versiones que no se hayan visto) y, debajo, un resumen de las anteriores.
 */
export function WhatsNew() {
  const open = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => openState,
  );
  const [fresh, setFresh] = useState<Release[]>([]);
  const [showOld, setShowOld] = useState(false);

  useEffect(() => {
    const seen = readSeenVersion();
    const unseen = unseenReleases(seen);
    if (unseen.length) {
      setFresh(unseen);
      // Un momento después de arrancar, para no tapar la carga.
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  const close = () => {
    markSeen();
    setOpen(false);
    setShowOld(false);
  };

  const highlighted = fresh.length ? fresh : CHANGELOG.slice(0, 1);
  const older = CHANGELOG.filter((r) => !highlighted.includes(r));

  return (
    <Dialog open={open} onClose={close} title={`Novedades de la versión ${APP_VERSION}`}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3 rounded-2xl bg-olive-soft px-4 py-3 text-forest">
          <Sparkles className="size-5 shrink-0" aria-hidden />
          <p className="text-sm font-semibold">{highlighted.length > 1 ? `Lo nuevo desde tu última versión (${highlighted.length} actualizaciones)` : 'Esto es lo que trae esta versión'}</p>
        </div>
        {highlighted.map((r) => (
          <ReleaseBlock key={r.version} r={r} open />
        ))}
        {older.length > 0 && (
          <div className="border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setShowOld((v) => !v)}
              aria-expanded={showOld}
              className="flex w-full items-center justify-between rounded-xl py-1 text-left text-sm font-semibold text-ink-2 hover:text-ink"
            >
              Versiones anteriores
              <ChevronDown className={cx('size-4 transition-transform duration-200', showOld && 'rotate-180')} aria-hidden />
            </button>
            {showOld && (
              <div className="mt-3 flex flex-col gap-4">
                {older.map((r) => (
                  <ReleaseBlock key={r.version} r={r} open={false} />
                ))}
              </div>
            )}
          </div>
        )}
        <Button variant="primary" onClick={close} className="w-full">
          Entendido
        </Button>
      </div>
    </Dialog>
  );
}
