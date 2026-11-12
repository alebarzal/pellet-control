import { useState, type ReactNode } from 'react';
import { ArrowDownToLine, Camera, Gauge } from 'lucide-react';
import { hopperEstimate, LEVEL_LABEL, levelCategory } from '../../domain/calc';
import { todayIso } from '../../domain/dates';
import { fmtDate, fmtKg } from '../../domain/format';
import type { LevelCategory } from '../../domain/types';
import { useStore } from '../../store/store';
import { Button, cx } from '../../ui/primitives';
import { haptic } from '../../ui/haptics';
import { useToast } from '../../ui/Toast';
import { useRecordActions } from '../records/RecordDialogs';
import { PhotoLevelDialog } from './PhotoLevelDialog';

export const LEVEL_TONE: Record<LevelCategory, { dot: string; text: string; bar: string }> = {
  lleno: { dot: 'bg-olive', text: 'text-olive-strong', bar: 'bg-olive' },
  medio: { dot: 'bg-olive', text: 'text-olive-strong', bar: 'bg-olive' },
  bajo: { dot: 'bg-amber', text: 'text-amber', bar: 'bg-amber' },
  vacio: { dot: 'bg-rust', text: 'text-rust', bar: 'bg-rust' },
};

/** Atajos de nivel (estimación a ojo). */
const QUICK: { percent: number; label: string }[] = [
  { percent: 0, label: 'Vacía' },
  { percent: 20, label: '20' },
  { percent: 40, label: '40' },
  { percent: 60, label: '60' },
  { percent: 80, label: '80' },
  { percent: 100, label: 'Llena' },
];

/** Estado y actualización rápida del nivel de la tolva. */
/** `footer` se pinta dentro del bloque: añadirlo fuera lo sacaría de la tarjeta (el bloque ocupa todo su alto). */
export function HopperStatus({ footer }: { footer?: ReactNode } = {}) {
  const { data, addRecord, deleteRecord } = useStore();
  const { openAdd } = useRecordActions();
  const toast = useToast();
  const h = hopperEstimate(data);
  const cat = h?.category ?? null;
  const tone = cat ? LEVEL_TONE[cat] : null;
  const [photo, setPhoto] = useState(false);

  function quickSet(percent: number) {
    haptic.tap();
    const rec = addRecord({ kind: 'level', date: todayIso(), percent, approximate: true, notes: '' });
    toast.show({
      title: `Nivel actualizado: ~${percent} %`,
      action: { label: 'Deshacer', onClick: () => deleteRecord(rec.id) },
    });
  }

  function fromPhoto(percent: number, fraction: number) {
    const rec = addRecord({ kind: 'level', date: todayIso(), percent, approximate: false, photo: fraction, notes: 'Medido con foto' });
    toast.show({
      title: `Nivel medido con foto: ${percent} %`,
      action: { label: 'Deshacer', onClick: () => deleteRecord(rec.id) },
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink-2">
        <Gauge className="size-4 text-olive" aria-hidden />
        Nivel de la tolva
      </div>
      {h && tone ? (
        <>
          <p className={cx('mt-3 text-[2rem] leading-none font-bold tracking-[-0.03em]', tone.text)}>{LEVEL_LABEL[h.category]}</p>
          <p className="num mt-2 text-[0.9375rem] text-ink-2">
            {h.approximate ? `~${Math.round(h.percent)} % · estimación` : `${Math.round(h.percent)} % medido`}
            {h.kg != null && <> · ≈ {fmtKg(Math.round(h.kg))}</>}
          </p>
          {/* Nivel continuo con marcas cada 25 % */}
          <div className="relative mt-5 h-2.5 overflow-hidden rounded-full bg-sand" aria-hidden>
            <div
              className={cx('h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]', tone.bar)}
              style={{ width: `${Math.max(2, Math.min(100, h.percent))}%` }}
            />
            {[25, 50, 75].map((m) => (
              <span key={m} className="absolute top-0 h-full w-0.5 bg-surface/70" style={{ left: `${m}%` }} />
            ))}
          </div>
          <p className="mt-2 text-[0.8125rem] text-ink-3">Actualizado el {fmtDate(h.date)}</p>
        </>
      ) : (
        <p className="mt-3 text-ink-2">Aún no has indicado el nivel de la tolva.</p>
      )}

      <div className="mt-6 lg:mt-auto">
        <p className="mb-2 text-sm font-semibold">¿Cómo está ahora?</p>
        <div role="group" aria-label="Actualizar nivel de la tolva" className="grid grid-cols-6 gap-1.5">
          {QUICK.map((q) => {
            const on = h != null && Math.round(h.percent) === q.percent;
            return (
              <button
                key={q.percent}
                onClick={() => quickSet(q.percent)}
                aria-pressed={on}
                aria-label={q.percent === 0 ? 'Vacía' : q.percent === 100 ? 'Llena' : `${q.percent} %`}
                className={cx(
                  'h-10 min-w-0 rounded-xl px-0.5 text-[0.8125rem] font-semibold ring-1 ring-inset transition-[background-color,color,box-shadow,transform] duration-150 active:scale-95',
                  on ? 'bg-forest text-paper ring-forest' : 'bg-surface text-ink ring-line hover:bg-sand-soft',
                )}
              >
                {q.label}
                {q.percent > 0 && q.percent < 100 && <span className="text-[0.6875rem] font-normal opacity-70">%</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1">
          <Button size="sm" variant="ghost" icon={<Camera className="size-4" />} onClick={() => setPhoto(true)} className="-ml-2">
            Con foto
          </Button>
          <Button size="sm" variant="ghost" icon={<Gauge className="size-4" />} onClick={() => openAdd('level')}>
            Otro %
          </Button>
          <Button size="sm" variant="ghost" icon={<ArrowDownToLine className="size-4" />} onClick={() => openAdd('refill')}>
            Registrar recarga
          </Button>
        </div>
      </div>
      {footer}
      <PhotoLevelDialog open={photo} onClose={() => setPhoto(false)} onResult={fromPhoto} />
    </div>
  );
}

export { levelCategory };
