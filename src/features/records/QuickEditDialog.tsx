import { RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';
import { useStatsReset } from './StatsReset';
import { consumedTotal, effectivePricePerBag, lastSpend, monthConsumption, purchasesAfterSpend, sortRecords, spendCounter, storedStock } from '../../domain/calc';
import { isValidIso, todayIso } from '../../domain/dates';
import { fmtBags, fmtDate, fmtEur, fmtKg } from '../../domain/format';
import type { NewRecord, PelletRecord, Settings } from '../../domain/types';
import { useStore } from '../../store/store';
import { Dialog } from '../../ui/Dialog';
import { DateInput, decimalToInput, parseDecimal, StepperInput } from '../../ui/fields';
import { haptic } from '../../ui/haptics';
import { Button } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

export type QuickEditTarget = 'bags' | 'spend' | 'consumption' | 'price' | 'consumed';

const COPY: Record<QuickEditTarget, { title: string; help: string; label: string; unit?: string; step: number; resetLabel: string }> = {
  bags: {
    title: 'Sacos almacenados',
    help: 'Se guarda como un recuento en la fecha que elijas: los movimientos siguientes se suman o restan a partir de esta cifra.',
    label: 'Sacos fuera de la tolva',
    step: 1,
    resetLabel: 'Poner a 0',
  },
  spend: {
    title: 'Gasto acumulado',
    help: 'Funciona como el parcial de un coche: desde la fecha que elijas se le suman las compras (euros y sacos), también en «Esta temporada». Las estadísticas guardan lo gastado de verdad.',
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
  const { data, addRecord, deleteRecord, updateRecord, updateSettings } = useStore();
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
  const today = todayIso();

  // Fecha: «contando desde» del gasto, o el día del recuento de sacos.
  const spendRec = target === 'spend' ? lastSpend(data) : null;
  const [date, setDate] = useState(target === 'spend' ? (spendRec?.date ?? today) : today);
  const [dateError, setDateError] = useState('');
  const datedOk = isValidIso(date) && date <= today;
  // Compras desde esa fecha, para proponerlas como gasto.
  const since = target === 'spend' && datedOk ? purchasesAfterSpend(data, { date, createdAt: date === today ? Date.now() : (spendRec?.createdAt ?? Date.now()) }) : null;
  // Recuento posterior a la fecha elegida: mandaría sobre este.
  const laterCount =
    target === 'bags' && datedOk ? sortRecords(data.records.filter((r) => r.kind === 'inventory' && r.date > date)).at(-1) ?? null : null;

  // Temporada (solo en el gasto): inicio, fin y objetivo.
  const s = data.settings;
  const [seasonStart, setSeasonStart] = useState(s.seasonStart);
  const [seasonEnd, setSeasonEnd] = useState(s.seasonEnd);
  const [budget, setBudget] = useState(s.seasonBudget != null ? money(s.seasonBudget) : '');
  const [seasonError, setSeasonError] = useState('');

  function commit(rec: NewRecord | { update: PelletRecord; before: PelletRecord }, title: string, settingsBefore?: Partial<Settings>) {
    let undoRec: () => void;
    if ('update' in rec) {
      updateRecord(rec.update);
      undoRec = () => updateRecord(rec.before);
    } else {
      const saved = addRecord(rec);
      undoRec = () => deleteRecord(saved.id);
    }
    const ids = [...extraUndo.current];
    extraUndo.current = [];
    haptic.success();
    onClose();
    toast.show({
      title,
      body: ids.length ? `Antes: ${fmt(current)} · estadísticas reiniciadas` : `Antes: ${fmt(current)}`,
      action: {
        label: 'Deshacer',
        onClick: () => {
          undoRec();
          ids.forEach((id) => deleteRecord(id));
          if (settingsBefore) updateSettings(settingsBefore);
        },
      },
    });
  }

  /** Guarda inicio, fin y objetivo de la temporada si han cambiado. Devuelve lo anterior (para deshacer), o false si hay un error. */
  function saveSeason(): Partial<Settings> | null | false {
    if (target !== 'spend') return null;
    if (!isValidIso(seasonStart) || !isValidIso(seasonEnd)) return (setSeasonError('Fecha no válida.'), false);
    if (seasonEnd <= seasonStart) return (setSeasonError('El fin debe ser posterior al inicio.'), false);
    const b = budget.trim() === '' ? null : parseDecimal(budget);
    if (b != null && (!Number.isFinite(b) || b < 0)) return (setSeasonError('Indica un objetivo de 0 € o más, o déjalo vacío.'), false);
    const next = { seasonStart, seasonEnd, seasonBudget: b != null ? Math.round(b * 100) / 100 : null };
    if (next.seasonStart === s.seasonStart && next.seasonEnd === s.seasonEnd && next.seasonBudget === s.seasonBudget) return null;
    updateSettings(next);
    return { seasonStart: s.seasonStart, seasonEnd: s.seasonEnd, seasonBudget: s.seasonBudget };
  }

  function save(v: number, spendB?: number | null) {
    if (target === 'spend' && spendB !== undefined) {
      if (spendB != null && (!Number.isInteger(spendB) || spendB < 0)) return setBagsError('Indica un número entero de sacos (0 o más).');
    }
    if (target === 'bags' && (!Number.isInteger(v) || v < 0)) return setError('Indica un número entero de sacos (0 o más).');
    if (target !== 'bags' && (!Number.isFinite(v) || v < 0)) return setError('Indica una cifra de 0 o más.');
    if (target === 'price' && v === 0) return setError('Un saco no puede costar 0 €. Usa «Volver al calculado».');
    if ((target === 'spend' || target === 'bags') && !datedOk) return setDateError(isValidIso(date) ? 'No puede ser una fecha futura.' : 'Fecha no válida.');
    if (laterCount) return setDateError(`Hay un recuento posterior (${fmtDate(laterCount.date)}) que mandaría sobre este.`);
    const season = saveSeason();
    if (season === false) return;
    const settingsBefore = season ?? undefined;
    const sameBags = target !== 'spend' || spendB === undefined || spendB === spendBags;
    const sameDate = target === 'spend' ? date === (spendRec?.date ?? null) : target === 'bags' ? date === today : true;
    if (Math.abs(v - current) < 0.001 && sameBags && (sameDate || target === 'bags')) {
      if (settingsBefore) {
        haptic.success();
        onClose();
        toast.show({ title: 'Temporada actualizada', action: { label: 'Deshacer', onClick: () => updateSettings(settingsBefore) } });
        return;
      }
      if (sameDate) return onClose();
    }
    const notes = 'Editado desde Inicio';
    const r = Math.round(v * 100) / 100;
    if (target === 'bags')
      commit(
        { kind: 'inventory', date, storedBags: v, notes },
        (v === 0 ? 'Sacos almacenados a 0' : `Sacos almacenados: ${fmtBags(v)}`) + (date !== today ? ` el ${fmtDate(date)}` : ''),
      );
    if (target === 'spend') {
      // Lo que se escribe es el gasto de hoy: se guarda la base que, con las compras desde esa fecha, da esa cifra.
      const createdAt = date === today || !spendRec ? Date.now() : spendRec.createdAt;
      const after = purchasesAfterSpend(data, { date, createdAt });
      const base = Math.round((r - after.amount) * 100) / 100;
      if (base < -0.004) return setError(`Desde el ${fmtDate(date)} ya hay ${fmtEur(after.amount)} en compras: el gasto no puede ser menor.`);
      const b = r === 0 ? 0 : (spendB ?? undefined);
      const bBase = b != null ? b - after.bags : undefined;
      if (bBase != null && bBase < 0) return setBagsError(`Desde el ${fmtDate(date)} ya hay ${fmtBags(after.bags)} comprados.`);
      const fields = { date, amount: Math.max(0, base), bags: bBase, notes };
      const title = (r === 0 ? 'Gasto acumulado a 0' : `Gasto acumulado: ${fmtEur(r)}${b != null ? ` · ${fmtBags(b)}` : ''}`) + ` · desde el ${fmtDate(date)}`;
      if (spendRec && date !== today) {
        // Cambiar la fecha de inicio corrige el ajuste vigente (uno nuevo con fecha anterior no mandaría).
        const { bags: _old, ...rest } = spendRec;
        void _old;
        commit({ update: { ...rest, ...fields, ...(bBase != null ? { bags: bBase } : {}) } as PelletRecord, before: spendRec }, title, settingsBefore);
      } else {
        const { bags: _b, ...f } = fields;
        void _b;
        commit({ kind: 'spend', ...f, ...(bBase != null ? { bags: bBase } : {}) }, title, settingsBefore);
      }
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
    if (target === 'spend') {
      commit({ kind: 'spend', date: today, amount: 0, bags: 0, notes: 'Editado desde Inicio' }, 'Gasto acumulado a 0');
      return;
    }
    if (target === 'bags') {
      commit({ kind: 'inventory', date: today, storedBags: 0, notes: 'Editado desde Inicio' }, 'Sacos almacenados a 0');
      return;
    }
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
      {(target === 'spend' || target === 'bags') && (
        <div className="flex flex-col gap-1.5">
          <DateInput
            label={target === 'spend' ? 'Contando desde' : 'Fecha del recuento'}
            value={date}
            onChange={(v) => {
              setDate(v);
              setDateError('');
            }}
            error={dateError}
          />
          {target === 'spend' && since && (
            <p className="num flex flex-wrap items-center gap-x-2 text-[0.8125rem] text-ink-2">
              <span>
                Compras apuntadas desde el {fmtDate(date)}: {fmtEur(since.amount)} · {fmtBags(since.bags)}
              </span>
              {Math.abs(parseDecimal(value) - since.amount) >= 0.005 && (
                <button
                  type="button"
                  className="font-semibold text-olive-strong underline"
                  onClick={() => {
                    setValue(money(since.amount));
                    setBagsValue(String(since.bags));
                    setError('');
                    setBagsError('');
                  }}
                >
                  Usar
                </button>
              )}
            </p>
          )}
          {target === 'bags' && <p className="text-[0.8125rem] text-ink-2">Sacos que había ese día; lo registrado después se suma o se resta.</p>}
        </div>
      )}
      {target === 'spend' && (
        <details className="group rounded-xl bg-sand-soft px-3.5 py-3" open={!!seasonError}>
          <summary className="cursor-pointer list-none text-sm font-semibold">
            Temporada y objetivo
            <span className="ml-2 font-normal text-ink-2">
              {fmtDate(seasonStart)} – {fmtDate(seasonEnd)}
              {budget.trim() !== '' && <> · {fmtEur(parseDecimal(budget))}</>}
            </span>
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <DateInput label="Inicio" value={seasonStart} onChange={(v) => (setSeasonStart(v), setSeasonError(''))} />
              <DateInput label="Fin" value={seasonEnd} onChange={(v) => (setSeasonEnd(v), setSeasonError(''))} />
            </div>
            <StepperInput
              label="Objetivo de gasto de la temporada"
              value={budget}
              onChange={(v) => (setBudget(v), setSeasonError(''))}
              step={10}
              unit="€"
              placeholder="Sin objetivo"
              error={seasonError}
              hint="«Esta temporada» y la barra del objetivo usan estas fechas."
            />
          </div>
        </details>
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
