import { GripVertical, LayoutGrid, Lock, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { ROUTES, type Route } from '../../app/router';
import { DEFAULT_LAYOUT, moveSection, resetNavLayout, sameLayout, saveNavLayout, useNavLayout } from '../../data/navLayout';
import { Dialog } from '../../ui/Dialog';
import { haptic } from '../../ui/haptics';
import { Button, cx } from '../../ui/primitives';

/* Abrir el editor desde «Más» o desde Configuración. */
let openState = false;
const listeners = new Set<() => void>();
const setOpen = (v: boolean) => {
  openState = v;
  listeners.forEach((l) => l());
};
export const openNavEditor = () => setOpen(true);

const info = (id: Route) => ROUTES.find((r) => r.id === id)!;

type Drag = { id: Route; dx: number; dy: number; over: Route | null };

/**
 * «Personalizar el menú»: una maqueta de la barra de abajo y la lista de «Más». Se arrastra una sección
 * encima de otra para cambiarla de sitio (o se toca una y luego otra). Se guarda al momento.
 */
export function NavEditor() {
  const open = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => openState,
  );
  const layout = useNavLayout();
  const [drag, setDrag] = useState<Drag | null>(null);
  const [picked, setPicked] = useState<Route | null>(null);
  const els = useRef(new Map<Route, HTMLElement>());
  const start = useRef<{ id: Route; x: number; y: number; active: boolean } | null>(null);
  const over = useRef<Route | null>(null);
  /** Dónde estaba cada pieza antes de un cambio, para animarla hasta su sitio nuevo. */
  const before = useRef<Map<Route, DOMRect> | null>(null);

  useEffect(() => {
    if (!open) {
      setPicked(null);
      setDrag(null);
      start.current = null;
    }
  }, [open]);

  const snapshot = () => {
    const m = new Map<Route, DOMRect>();
    els.current.forEach((el, id) => m.set(id, el.getBoundingClientRect()));
    before.current = m;
  };

  // Cada pieza se desliza desde donde estaba hasta donde ha quedado.
  useLayoutEffect(() => {
    const prev = before.current;
    if (!prev) return;
    before.current = null;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    els.current.forEach((el, id) => {
      const a = prev.get(id);
      if (!a) return;
      const b = el.getBoundingClientRect();
      const dx = a.left + a.width / 2 - (b.left + b.width / 2);
      const dy = a.top + a.height / 2 - (b.top + b.height / 2);
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 340, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    });
  });

  const move = (id: Route, target: Route) => {
    snapshot();
    saveNavLayout(moveSection(layout, id, target));
    haptic.press();
  };

  const tap = (id: Route) => {
    if (picked && picked !== id) {
      move(picked, id);
      setPicked(null);
    } else {
      haptic.tap();
      setPicked(picked === id ? null : id);
    }
  };

  const onDown = (id: Route) => (e: PointerEvent<HTMLElement>) => {
    if (e.button) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* sin captura: el arrastre sigue mientras el dedo no salga de la pieza */
    }
    start.current = { id, x: e.clientX, y: e.clientY, active: false };
    over.current = null;
  };

  const onMove = (e: PointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.active) {
      if (Math.hypot(dx, dy) < 6) return;
      s.active = true;
      setPicked(null);
      haptic.tap();
    }
    let hit: Route | null = null;
    els.current.forEach((el, id) => {
      if (id === s.id) return;
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) hit = id;
    });
    if (hit && hit !== over.current) haptic.tap();
    over.current = hit;
    setDrag({ id: s.id, dx, dy, over: hit });
  };

  const onUp = () => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (!s.active) return tap(s.id);
    const target = over.current;
    over.current = null;
    if (target) move(s.id, target);
    else snapshot(); // Soltada fuera: vuelve a su sitio.
    setDrag(null);
  };

  const onCancel = () => {
    if (start.current?.active) snapshot();
    start.current = null;
    over.current = null;
    setDrag(null);
  };

  /** Lo común a las piezas de la barra y de «Más». */
  const piece = (id: Route) => {
    const dragging = drag?.id === id;
    const target = drag?.over === id;
    const style: CSSProperties = dragging ? { transform: `translate(${drag.dx}px, ${drag.dy}px) scale(1.06)`, transition: 'none' } : {};
    return {
      ref: (el: HTMLElement | null) => {
        if (el) els.current.set(id, el);
        else els.current.delete(id);
      },
      role: 'button',
      tabIndex: 0,
      'aria-pressed': picked === id,
      onPointerDown: onDown(id),
      onPointerMove: onMove,
      onPointerUp: onUp,
      onPointerCancel: onCancel,
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          tap(id);
        }
      },
      style,
      state: cx(
        'relative cursor-grab touch-none select-none ring-inset transition-[background-color,box-shadow,scale] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-forest',
        dragging && 'z-20 cursor-grabbing bg-surface shadow-[0_14px_34px_-10px_rgb(38_42_37/0.45)] ring-1 ring-olive/40',
        target && 'scale-[0.94] bg-olive-soft ring-2 ring-olive',
        picked === id && !drag && 'bg-olive-soft ring-2 ring-forest',
      ),
    };
  };

  const BarPiece = (id: Route) => {
    const r = info(id);
    const { state, ...p } = piece(id);
    return (
      <div key={id} {...p} className={cx('mx-0.5 flex h-[3.75rem] flex-col items-center justify-center gap-1 rounded-2xl text-[0.6875rem] font-semibold text-forest', !drag && picked !== id && 'ring-1 ring-line/0', state)}>
        <r.icon className="size-5" aria-hidden />
        <span className="max-w-full truncate px-1">{r.label}</span>
      </div>
    );
  };

  const fixed = 'mx-0.5 flex h-[3.75rem] flex-col items-center justify-center gap-1 rounded-2xl text-[0.6875rem] font-semibold text-ink-3/70';
  const isDefault = sameLayout(layout, DEFAULT_LAYOUT);
  const hint = picked
    ? `Toca ahora dónde quieres poner «${info(picked).label}».`
    : drag
      ? drag.over
        ? `Suelta para ponerla en el sitio de «${info(drag.over).label}».`
        : 'Llévala encima de otra sección.'
      : 'Arrastra una sección encima de otra para cambiarla de sitio. También puedes tocar una y después otra.';

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Personalizar el menú">
      <div className="flex flex-col gap-5">
        <p className="min-h-10 text-sm text-ink-2 text-pretty" role="status">
          {hint}
        </p>

        <section>
          <p className="mb-2 text-[0.8125rem] font-bold tracking-wide text-ink-3 uppercase">Barra de abajo</p>
          <div className="rounded-[1.75rem] bg-sand-soft/70 p-2 ring-1 ring-line/70 ring-inset">
            <div className="grid grid-cols-5 items-center rounded-[1.4rem] bg-surface py-1 shadow-[0_8px_24px_-12px_rgb(38_42_37/0.3)] ring-1 ring-line/80">
              {BarPiece(layout.bar[0])}
              {BarPiece(layout.bar[1])}
              <div className="flex justify-center" aria-hidden>
                <span className="grid size-11 place-items-center rounded-[0.95rem] bg-forest/25 text-paper">
                  <Plus className="size-5" strokeWidth={2.5} />
                </span>
              </div>
              {BarPiece(layout.bar[2])}
              <div className={fixed} aria-hidden>
                <LayoutGrid className="size-5" />
                Más
              </div>
            </div>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[0.75rem] text-ink-3">
              <Lock className="size-3" aria-hidden />
              El botón + y «Más» se quedan en su sitio
            </p>
          </div>
        </section>

        <section>
          <p className="mb-2 text-[0.8125rem] font-bold tracking-wide text-ink-3 uppercase">Dentro de «Más»</p>
          <div className="grid grid-cols-2 gap-2">
            {layout.more.map((id) => {
              const r = info(id);
              const { state, ...p } = piece(id);
              return (
                <div key={id} {...p} className={cx('flex h-14 items-center gap-2 rounded-2xl bg-surface pr-1.5 pl-3 text-sm font-semibold ring-1 ring-line', state)}>
                  <r.icon className="size-5 shrink-0 text-olive" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  <GripVertical className="size-3.5 shrink-0 text-ink-3/60" aria-hidden />
                </div>
              );
            })}
          </div>
        </section>

        <div className="flex gap-2">
          <Button
            icon={<RotateCcw className="size-4" />}
            disabled={isDefault}
            onClick={() => {
              snapshot();
              setPicked(null);
              resetNavLayout();
              haptic.tap();
            }}
          >
            Restablecer
          </Button>
          <Button variant="primary" className="flex-1" onClick={() => setOpen(false)}>
            Hecho
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
