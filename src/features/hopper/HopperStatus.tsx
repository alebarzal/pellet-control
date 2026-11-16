import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDownToLine, Camera, ChartLine, Gauge } from 'lucide-react';
import { LEVEL_LABEL, levelCategory } from '../../domain/calc';
import { hopperEstimate } from '../../domain/hopperModel';
import { todayIso } from '../../domain/dates';
import { fmtDate, fmtKg, fmtNum } from '../../domain/format';
import type { LevelCategory } from '../../domain/types';
import { useStore } from '../../store/store';
import { Button, cx } from '../../ui/primitives';
import { haptic } from '../../ui/haptics';
import { useToast } from '../../ui/Toast';
import { useRecordActions } from '../records/RecordDialogs';
import { Dialog } from '../../ui/Dialog';
import { fmtSpan, fmtWhen, HopperForecast } from './HopperForecast';
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

/** La hora actual, refrescada cada minuto: el nivel calculado baja solo mientras la caldera quema. */
function useNow(everyMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, everyMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [everyMs]);
  return now;
}

/** Estado y actualización rápida del nivel de la tolva. */
/** `footer` se pinta dentro del bloque: añadirlo fuera lo sacaría de la tarjeta (el bloque ocupa todo su alto). */
export function HopperStatus({ footer }: { footer?: ReactNode } = {}) {
  const { data, addRecord, deleteRecord } = useStore();
  const { openAdd } = useRecordActions();
  const toast = useToast();
  const now = useNow();
  const h = hopperEstimate(data, now);
  const m = h?.model ?? null;
  const cat = h?.category ?? null;
  const tone = cat ? LEVEL_TONE[cat] : null;
  const [photo, setPhoto] = useState(false);
  const [forecast, setForecast] = useState(false);

  /** Al apuntar una lectura: lo que marcaba el cálculo justo antes, para ver si va cuadrando. */
  const versus = (percent: number): string | undefined => {
    if (!h?.live) return undefined;
    const d = Math.round(h.percent) - Math.round(percent);
    if (d === 0) return 'El cálculo marcaba lo mismo.';
    return `El cálculo marcaba ${Math.round(h.percent)} %: ${Math.abs(d)} ${Math.abs(d) === 1 ? 'punto' : 'puntos'} ${d > 0 ? 'de más' : 'de menos'}. Queda corregido.`;
  };

  function quickSet(percent: number) {
    haptic.tap();
    const body = versus(percent);
    const rec = addRecord({ kind: 'level', date: todayIso(), percent, approximate: true, notes: '' });
    toast.show({
      title: `Nivel actualizado: ~${percent} %`,
      body,
      action: { label: 'Deshacer', onClick: () => deleteRecord(rec.id) },
    });
  }

  function fromPhoto(percent: number, fraction: number) {
    const body = versus(percent);
    const rec = addRecord({ kind: 'level', date: todayIso(), percent, approximate: false, photo: fraction, notes: 'Medido con foto' });
    toast.show({
      title: `Nivel medido con foto: ${percent} %`,
      body,
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
            {h.live ? `~${Math.round(h.percent)} % · calculado` : h.approximate ? `~${Math.round(h.percent)} % · estimación` : `${Math.round(h.percent)} % medido`}
            {h.kg != null && <> · ≈ {fmtKg(Math.round(h.kg))}</>}
            {h.live && m && <span className="text-ink-3"> ± {Math.round(m.marginKg)}</span>}
          </p>
          {/* Nivel continuo con marcas cada 25 %; si está calculado, también el margen y la última lectura */}
          <div className="relative mt-5 h-2.5 rounded-full bg-sand" aria-hidden>
            <div className="absolute inset-0 overflow-hidden rounded-full">
              <div
                className={cx('h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]', tone.bar)}
                style={{ width: `${Math.max(2, Math.min(100, h.percent))}%` }}
              />
              {h.live && m && (
                <span
                  className="absolute top-0 h-full bg-[repeating-linear-gradient(135deg,rgb(255_255_255/0.55)_0_2px,transparent_2px_5px)]"
                  style={{
                    left: `${Math.max(0, ((m.kg - m.marginKg) / m.capacityKg) * 100)}%`,
                    width: `${Math.max(0, Math.min(100, ((m.kg + m.marginKg) / m.capacityKg) * 100) - Math.max(0, ((m.kg - m.marginKg) / m.capacityKg) * 100))}%`,
                  }}
                />
              )}
              {[25, 50, 75].map((mk) => (
                <span key={mk} className="absolute top-0 h-full w-0.5 bg-surface/70" style={{ left: `${mk}%` }} />
              ))}
            </div>
            {h.live && m && (
              <span
                className="absolute -top-1 h-[1.125rem] w-0.5 -translate-x-1/2 rounded-full bg-forest"
                style={{ left: `${Math.max(0, Math.min(100, m.anchor.percent))}%` }}
                title="Última lectura"
              />
            )}
          </div>
          {h.live && m ? (
            <div className="mt-2.5 flex flex-col gap-0.5 text-[0.8125rem] text-ink-3">
              <p className="num">
                <span className="mr-1.5 inline-block h-2.5 w-0.5 translate-y-px rounded-full bg-forest" aria-hidden />
                Última lectura: {Math.round(m.anchor.percent)} % el {fmtDate(h.date)}
                {m.refilledKg > 0 && <> · +{fmtKg(Math.round(m.refilledKg))} recargados</>}
              </p>
              <p className="num">
                Quemados desde entonces ≈ {fmtKg(Math.round(m.burnedKg * 10) / 10)}
                {m.method === 'quemador' ? ` en ${fmtNum(Math.round(m.burnerHours * 10) / 10)} h de quemador` : ' (consumo medio)'}
              </p>
              {m.emptyAt && (
                <p className="num font-medium text-ink-2">
                  Se vaciaría en {fmtSpan(m.emptyAt - now)} · {fmtWhen(m.emptyAt)}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-[0.8125rem] text-ink-3">Actualizado el {fmtDate(h.date)}</p>
          )}
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
          {h && (
            <Button size="sm" variant="ghost" icon={<ChartLine className="size-4" />} onClick={() => setForecast(true)}>
              Previsión
            </Button>
          )}
        </div>
      </div>
      {footer}
      {h && (
        <Dialog open={forecast} onClose={() => setForecast(false)} title="Previsión de la tolva" description="Lo que queda, calculado con lo que va quemando la caldera.">
          <HopperForecast h={h} now={now} />
        </Dialog>
      )}
      <PhotoLevelDialog open={photo} onClose={() => setPhoto(false)} onResult={fromPhoto} />
    </div>
  );
}

export { levelCategory };
