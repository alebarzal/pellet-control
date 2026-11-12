import { RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';
import { useStatsReset } from './StatsReset';
import { consumedTotal, effectivePricePerBag, monthConsumption, spendCounter, storedStock } from '../../domain/calc';
import { todayIso } from '../../domain/dates';
import { fmtBags, fmtEur, fmtKg } from '../../domain/format';
import type { NewRecord } from '../../domain/types';
import { useStore } from '../../store/store';
import { Dialog } from '../../ui/Dialog';
import { decimalToInput, parseDecimal, StepperInput } from '../../ui/fields';
import { haptic } from '../../ui/haptics';
import { Button } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

export type QuickEditTarget = 'bags' | 'spend' | 'consumption' | 'price' | 'consumed';

const COPY: Record<QuickEditTarget, { title: string; help: string; label: string; unit?: string; step: number; resetLabel: string }> = {
  bags: {
    title: 'Sacos almacenados',
    help: 'Se guarda como un recuento: los movimientos siguientes se suman o restan a partir de esta cifra.',
    label: 'Sacos fuera de la tolva',
    step: 1,
    resetLabel: 'Poner a 0',
  },
  spend: {
    title: 'Gasto acumulado',
    help: 'Funciona como el parcial de un coche: desde hoy se le suman las compras nuevas (euros y sacos), también en «Esta temporada». Las estadísticas guardan lo gastado de verdad.',
    label: 'Gasto acumulado',
    unit: '€',
    step: 5,
    resetLabel: 'Poner a 0',
  },
  consumption: {
    title: 'Consumo del mes',
    help: 'Desde aquí se le suman los consumos nuevos que registres. Las estadísticas guardan los datos reales.',
    label: 'Consumo de este mes',
    unit: 'kg',
    step: 5,
    resetLabel: 'Poner a 0',
  },
  consumed: {
    title: 'Consumido',
    help: 'Total consumido que muestra Inventario. Desde aquí se le suman los consumos nuevos. Las estadísticas guardan los datos reales.',
    label: 'Consumido total',
    unit: 'kg',
    step: 5,
    resetLabel: 'Poner a 0',
  },
  price: {
    title: 'Precio por saco',
    help: 'Se usa para calcular costes, previsiones y ahorro. «Volver al calculado» usa otra vez la media de tus compras.',
    label: 'Precio por saco',
    unit: '€',
    step: 0.05,
    resetLabel: 'Volver al calculado',
  },
};

const money = (n: number) => n.toFixed(2).replace('.', ',');

/** Edición directa de un indicador de Inicio. Crea un movimiento (recuento o ajuste) que se puede deshacer. */
export function QuickEditDialog({ target, onClose }: { target: QuickEditTarget | null; onClose: () => void }) {
  return (
    <Dialog open={!!target} onClose={onClose} title={target ? COPY[target].title : ''} description={target ? COPY[target].help : undefined}>
      {target && <QuickEditForm key={target} target={target} onClose={onClose} />}
    </Dialog>
  );
}

function QuickEditForm({ target, onClose }: { target: QuickEditTarget; onClose: () => void }) {
  const { data, addRecord, deleteRecord } = useStore();
  const toast = useToast();
  const price = effectivePricePerBag(data);
  const current =
    target === 'bags'
      ? Math.max(0, storedStock(data).bags)
      : target === 'spend'
        ? spendCounter(data).amount
        : target === 'consumption'
          ? Math.round((monthConsumption(data).kg ?? 0) * 10) / 10
          : target === 'consumed'
            ? Math.round(consumedTotal(data).kg * 10) / 10
            : (price.value ?? 0);
  const fmt = (n: number) => (target === 'bags' ? fmtBags(n) : target === 'consumption' || target === 'consumed' ? fmtKg(n) : fmtEur(n));
  const [value, setValue] = useState(target === 'spend' || target === 'price' ? money(current) : decimalToInput(current));
  const [error, setError] = useState('');
  // Gasto: cuántos sacos son ese gasto (vacío = sin indicar)
  const spendBags = target === 'spend' ? spendCounter(data).bags : null;
  const [bagsValue, setBagsValue] = useState(spendBags != null ? String(spendBags) : '');
  const [bagsError, setBagsError] = useState('');
  // Al poner a 0 gasto o consumo, reiniciar también las estadísticas (marcado por defecto).
  const canResetStats = target === 'spend' || target === 'consumption' || target === 'consumed';
  const [alsoStats, setAlsoStats] = useState(true);
  const createStatsReset = useStatsReset();
  const extraUndo = useRef<string[]>([]);

  function commit(rec: NewRecord, title: string) {
    const saved = addRecord(rec);
    const ids = [saved.id, ...extraUndo.current];
    extraUndo.current = [];
    haptic.success();
    onClose();
    toast.show({
      title,
      body: ids.length > 1 ? `Antes: ${fmt(current)} · estadísticas reiniciadas` : `Antes: ${fmt(current)}`,
      action: { label: 'Deshacer', onClick: () => ids.forEach((id) => deleteRecord(id)) },
    });
  }

  function save(v: number, spendB?: number | null) {
    if (target === 'spend' && spendB !== undefined) {
      if (spendB != null && (!Number.isInteger(spendB) || spendB < 0)) return setBagsError('Indica un número entero de sacos (0 o más).');
    }
    if (target === 'bags' && (!Number.isInteger(v) || v < 0)) return setError('Indica un número entero de sacos (0 o más).');
    if (target !== 'bags' && (!Number.isFinite(v) || v < 0)) return setError('Indica una cifra de 0 o más.');
    if (target === 'price' && v === 0) return setError('Un saco no puede costar 0 €. Usa «Volver al calculado».');
    const sameBags = target !== 'spend' || spendB === undefined || spendB === spendBags;
    if (Math.abs(v - current) < 0.001 && sameBags) return onClose();
    const date = todayIso();
    const notes = 'Editado desde Inicio';
    const r = Math.round(v * 100) / 100;
    if (target === 'bags') commit({ kind: 'inventory', date, storedBags: v, notes }, v === 0 ? 'Sacos almacenados a 0' : `Sacos almacenados: ${fmtBags(v)}`);
    if (target === 'spend') {
      const b = r === 0 ? 0 : (spendB ?? undefined);
      commit(
        { kind: 'spend', date, amount: r, ...(b != null ? { bags: b } : {}), notes },
        r === 0 ? 'Gasto acumulado a 0' : `Gasto acumulado: ${fmtEur(r)}${b != null ? ` · ${fmtBags(b)}` : ''}`,
      );
    }
    if (target === 'consumption')
      commit({ kind: 'counter', metric: 'consumption', date, value: r, notes }, r === 0 ? 'Consumo del mes a 0' : `Consumo del mes: ${fmtKg(r)}`);
    if (target === 'consumed')
      commit({ kind: 'counter', metric: 'consumed', date, value: r, notes }, r === 0 ? 'Consumido puesto a 0' : `Consumido: ${fmtKg(r)}`);
    if (target === 'price') commit({ kind: 'counter', metric: 'price', date, value: r, notes }, `Precio por saco fijado en ${fmtEur(r)}`);
  }

  function reset() {
    if (target === 'price') {
      if (!price.manual) return onClose();
      commit(
        { kind: 'counter', metric: 'price', date: todayIso(), value: null, notes: 'Editado desde Inicio' },
        price.calculated != null ? `Precio calculado: ${fmtEur(price.calculated)}` : 'Precio calculado con tus compras',
      );
      return;
    }
    // El reinicio de estadísticas va primero: el contador a 0 queda registrado justo después.
    if (canResetStats && alsoStats) extraUndo.current = [createStatsReset({ silent: true }).id];
    save(0, 0);
  }

  const resetDisabled = target === 'price' ? !price.manual : current === 0;

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (target === 'spend') save(parseDecimal(value), bagsValue.trim() === '' ? null : parseDecimal(bagsValue));
        else save(parseDecimal(value));
      }}
    >
      <StepperInput
        label={COPY[target].label}
        value={value}
        onChange={(v) => {
          setValue(v);
          setError('');
        }}
        step={COPY[target].step}
        unit={COPY[target].unit}
        error={error}
        hint={
          target === 'price'
            ? price.manual
              ? `Fijado a mano · calculado con tus compras: ${price.calculated != null ? fmtEur(price.calculated) : '—'}`
              : 'Ahora: media de tus compras'
            : `Ahora: ${fmt(current)}`
        }
      />
      {target === 'spend' && (
        <StepperInput
          label="Sacos de ese gasto"
          value={bagsValue}
          onChange={(v) => {
            setBagsValue(v);
            setBagsError('');
            // Al cambiar los sacos, el gasto se recalcula con el precio medio por saco.
            const b = parseDecimal(v);
            if (price.value && Number.isFinite(b) && b >= 0) {
              setValue(money(Math.round(b * price.value * 100) / 100));
              setError('');
            }
          }}
          step={1}
          unit="sacos"
          placeholder="Sin indicar"
          error={bagsError}
          hint={(() => {
            const amt = parseDecimal(value);
            const p = price.value;
            const b = parseDecimal(bagsValue);
            if (p && Number.isFinite(b) && b >= 0 && Math.abs(b * p - amt) < 0.01)
              return `${fmtBags(b)} × ${fmtEur(p)} (precio medio) = ${fmtEur(b * p)}`;
            const guess = p && Number.isFinite(amt) && amt > 0 ? Math.round(amt / p) : null;
            if (guess == null) return spendBags != null ? `Ahora: ${fmtBags(spendBags)}` : 'Opcional';
            return (
              <span className="flex flex-wrap items-center gap-x-2">
                <span>
                  A {fmtEur(p!)}/saco serían unos {fmtBags(guess)}
                </span>
                {String(guess) !== bagsValue && (
                  <button type="button" className="font-semibold text-olive-strong underline" onClick={() => setBagsValue(String(guess))}>
                    Usar
                  </button>
                )}
              </span>
            );
          })()}
        />
      )}
      {canResetStats && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-sand-soft px-3.5 py-3 text-sm">
          <input type="checkbox" checked={alsoStats} onChange={(e) => setAlsoStats(e.target.checked)} className="mt-0.5 size-4 accent-olive" />
          <span>
            <span className="font-semibold">Al poner a 0, reiniciar también las estadísticas</span>
            <span className="block text-ink-2">Gasto, consumo, medias y recargas empiezan de cero. No se borra nada.</span>
          </span>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="danger" icon={<RotateCcw className="size-4" />} onClick={reset} disabled={resetDisabled}>
          {COPY[target].resetLabel}
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary">
            Guardar
          </Button>
        </div>
      </div>
    </form>
  );
}
