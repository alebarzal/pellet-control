import type { ReactNode } from 'react';
import { ArrowDownToLine, Gauge } from 'lucide-react';
import { hopperEstimate, LEVEL_LABEL, LEVEL_PRESETS, levelCategory } from '../../domain/calc';
import { todayIso } from '../../domain/dates';
import { fmtDate, fmtKg } from '../../domain/format';
import type { LevelCategory } from '../../domain/types';
import { useStore } from '../../store/store';
import { Button, cx } from '../../ui/primitives';
import { haptic } from '../../ui/haptics';
import { useToast } from '../../ui/Toast';
import { useRecordActions } from '../records/RecordDialogs';

export const LEVEL_TONE: Record<LevelCategory, { dot: string; text: string; bar: string }> = {
  lleno: { dot: 'bg-olive', text: 'text-olive-strong', bar: 'bg-olive' },
  medio: { dot: 'bg-olive', text: 'text-olive-strong', bar: 'bg-olive' },
  bajo: { dot: 'bg-amber', text: 'text-amber', bar: 'bg-amber' },
  vacio: { dot: 'bg-rust', text: 'text-rust', bar: 'bg-rust' },
};

const STEPS: { value: LevelCategory; label: string }[] = [
  { value: 'vacio', label: 'Vacía' },
  { value: 'bajo', label: 'Baja' },
  { value: 'medio', label: 'Media' },
  { value: 'lleno', label: 'Llena' },
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

  function quickSet(c: LevelCategory) {
    haptic.tap();
    const rec = addRecord({ kind: 'level', date: todayIso(), percent: LEVEL_PRESETS[c], approximate: true, notes: '' });
    toast.show({
      title: `Nivel actualizado: ${LEVEL_LABEL[c].toLowerCase()}`,
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
            {h.approximate ? 'Estimación visual' : `${h.percent} %`}
            {h.kg != null && <> · ≈ {fmtKg(Math.round(h.kg))}</>}
          </p>
          {/* Indicador por zonas */}
          <div className="mt-5 grid grid-cols-4 gap-1.5" aria-hidden>
            {STEPS.map((s, i) => {
              const filled = STEPS.findIndex((x) => x.value === h.category) >= i;
              return (
                <div key={s.value} className="flex flex-col gap-1.5">
                  <div className={cx('h-2.5 rounded-full transition-colors duration-300', filled ? tone.bar : 'bg-sand')} />
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[0.8125rem] text-ink-3">Actualizado el {fmtDate(h.date)}</p>
        </>
      ) : (
        <p className="mt-3 text-ink-2">Aún no has indicado el nivel de la tolva.</p>
      )}

      <div className="mt-6 lg:mt-auto">
        <p className="mb-2 text-sm font-semibold">¿Cómo está ahora?</p>
        <div role="group" aria-label="Actualizar nivel de la tolva" className="grid grid-cols-4 gap-1.5">
          {STEPS.slice()
            .reverse()
            .map((s) => (
              <button
                key={s.value}
                onClick={() => quickSet(s.value)}
                aria-pressed={cat === s.value}
                className={cx(
                  'h-10 rounded-xl text-sm font-semibold ring-1 ring-inset transition-[background-color,color,box-shadow,transform] duration-150 active:scale-95',
                  cat === s.value ? 'bg-forest text-paper ring-forest' : 'bg-surface text-ink ring-line hover:bg-sand-soft',
                )}
              >
                {s.label}
              </button>
            ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" icon={<Gauge className="size-4" />} onClick={() => openAdd('level')} className="-ml-2">
            Lectura en %
          </Button>
          <Button size="sm" variant="ghost" icon={<ArrowDownToLine className="size-4" />} onClick={() => openAdd('refill')}>
            Registrar recarga
          </Button>
        </div>
      </div>
      {footer}
    </div>
  );
}

export { levelCategory };
