import { Info, Trash2 } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { LEVEL_PRESETS, levelCategory, storedStock } from '../../domain/calc';
import { isValidIso, todayIso } from '../../domain/dates';
import { fmtBags, fmtEur, fmtKg } from '../../domain/format';
import type { LevelCategory, NewRecord, PelletRecord, RecordKind } from '../../domain/types';
import { useStore } from '../../store/store';
import { DateInput, decimalToInput, parseDecimal, StepperInput, TextArea, TextInput } from '../../ui/fields';
import { Button, Segmented } from '../../ui/primitives';

type Errors = Record<string, string>;

interface Props {
  kind: RecordKind;
  initial?: PelletRecord;
  onDone: (saved: PelletRecord | null) => void;
  onDelete?: () => void;
}

const LEVEL_OPTIONS: { value: LevelCategory; label: string }[] = [
  { value: 'lleno', label: 'Llena' },
  { value: 'medio', label: 'Media' },
  { value: 'bajo', label: 'Baja' },
  { value: 'vacio', label: 'Vacía' },
];

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-xl bg-sand-soft px-3 py-2.5 text-[0.8125rem] text-ink-2">
      <Info className="mt-px size-4 shrink-0 text-olive" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function RecordForm({ kind, initial, onDone, onDelete }: Props) {
  const { data, addRecord, updateRecord } = useStore();
  const s = data.settings;
  const i = initial as Partial<Record<string, unknown>> | undefined;
  const g = <T,>(k: string, fallback: T): T => (i && i[k] !== undefined ? (i[k] as T) : fallback);

  const [date, setDate] = useState<string>(g('date', todayIso()));
  const [notes, setNotes] = useState<string>(g('notes', ''));
  const [errors, setErrors] = useState<Errors>({});
  const listId = useId();

  // Compra
  const [brand, setBrand] = useState<string>(g('brand', s.brands[0] ?? ''));
  const [supplier, setSupplier] = useState<string>(g('supplier', ''));
  const [bags, setBags] = useState<string>(decimalToInput(g<number | null>('bags', kind === 'purchase' ? null : null)));
  const [price, setPrice] = useState<string>(decimalToInput(g('pricePerBag', s.usualPricePerBag)));
  const [total, setTotal] = useState<string>(decimalToInput(g<number | null>('totalCost', null)));
  const [totalTouched, setTotalTouched] = useState<boolean>(!!initial);
  const [weight, setWeight] = useState<string>(decimalToInput(g('bagWeightKg', s.bagWeightKg)));

  // Recarga / ajuste
  const [kg, setKg] = useState<string>(decimalToInput(g<number | null>('kg', null)));

  // Consumo
  const [unit, setUnit] = useState<'kg' | 'sacos'>(i?.bags ? 'sacos' : 'kg');
  const [amount, setAmount] = useState<string>(
    decimalToInput(kind === 'consumption' ? (i?.bags ? (i.bags as number) : g<number | null>('kg', null)) : null),
  );
  const [periodMode, setPeriodMode] = useState<'dia' | 'periodo'>(i && i.endDate && i.endDate !== i.date ? 'periodo' : 'dia');
  const [endDate, setEndDate] = useState<string>(g('endDate', todayIso()));

  // Nivel
  const initialPercent = g<number>('percent', 50);
  const [levelMode, setLevelMode] = useState<'estimacion' | 'exacto'>(i && i.approximate === false ? 'exacto' : 'estimacion');
  const [cat, setCat] = useState<LevelCategory | null>(initial ? levelCategory(initialPercent) : null);
  const [percent, setPercent] = useState<string>(String(initialPercent));

  // Recuento
  // Un recuento nuevo parte de lo que consta ahora: basta con pulsar − o + si hay diferencia.
  const [stored, setStored] = useState<string>(() => decimalToInput(g<number | null>('storedBags', null) ?? Math.max(0, storedStock(data).bags)));
  // Ajuste de gasto
  const [spendBags, setSpendBags] = useState<string>(decimalToInput(kind === 'spend' ? g<number | null>('bags', null) : null));
  const [spendAmount, setSpendAmount] = useState<string>(decimalToInput(g<number | null>('amount', null)));
  // Ajuste de indicador (consumo del mes o precio por saco)
  const counterMetric = g<'consumption' | 'price' | 'consumed'>('metric', 'consumption');
  const [counterValue, setCounterValue] = useState<string>(decimalToInput(g<number | null>('value', null)));
  // Ajuste
  const [direction, setDirection] = useState<'mas' | 'menos'>(i && (i.bagsDelta as number) > 0 ? 'mas' : 'menos');
  const [adjBags, setAdjBags] = useState<string>(decimalToInput(i?.bagsDelta != null ? Math.abs(i.bagsDelta as number) : null));

  const stock = storedStock(data);
  const autoTotal = useMemo(() => {
    const b = parseDecimal(bags);
    const p = parseDecimal(price);
    return Number.isFinite(b) && Number.isFinite(p) ? Math.round(b * p * 100) / 100 : null;
  }, [bags, price]);
  const shownTotal = totalTouched ? total : autoTotal != null ? autoTotal.toFixed(2).replace('.', ',') : '';

  function validate(): NewRecord | null {
    const e: Errors = {};
    if (!isValidIso(date)) e.date = 'Indica una fecha válida.';
    const base = { date, notes: notes.trim() };
    let rec: NewRecord | null = null;

    const posInt = (v: string, field: string, required: boolean, label = 'Indica un número de sacos entero mayor que 0.') => {
      if (v.trim() === '') {
        if (required) e[field] = label;
        return null;
      }
      const n = parseDecimal(v);
      if (!Number.isInteger(n) || n <= 0) {
        e[field] = label;
        return null;
      }
      return n;
    };
    const posNum = (v: string, field: string, required: boolean, label: string) => {
      if (v.trim() === '') {
        if (required) e[field] = label;
        return null;
      }
      const n = parseDecimal(v);
      if (!Number.isFinite(n) || n <= 0) {
        e[field] = label;
        return null;
      }
      return n;
    };

    switch (kind) {
      case 'purchase': {
        const b = posInt(bags, 'bags', true);
        const p = posNum(price, 'price', true, 'Indica el precio por saco.');
        const w = posNum(weight, 'weight', true, 'Indica el peso del saco en kg.');
        const t = shownTotal.trim() === '' ? autoTotal : parseDecimal(shownTotal);
        if (t == null || !Number.isFinite(t) || t <= 0) e.total = 'Indica el coste total.';
        if (!brand.trim()) e.brand = 'Indica la marca.';
        if (b && p && w && t)
          rec = { kind, ...base, brand: brand.trim(), supplier: supplier.trim(), bags: b, pricePerBag: p, totalCost: t, bagWeightKg: w };
        break;
      }
      case 'refill': {
        const b = posInt(bags, 'bags', false);
        const k = posNum(kg, 'kg', false, 'Indica los kg como número positivo.');
        if (!e.bags && !e.kg) rec = { kind, ...base, bags: b, kg: k };
        break;
      }
      case 'consumption': {
        const a = posNum(amount, 'amount', true, unit === 'kg' ? 'Indica los kg consumidos.' : 'Indica los sacos consumidos.');
        let end = date;
        if (periodMode === 'periodo') {
          if (!isValidIso(endDate)) e.endDate = 'Indica una fecha de fin válida.';
          else if (endDate < date) e.endDate = 'La fecha de fin no puede ser anterior al inicio.';
          end = endDate;
        }
        if (a && !e.endDate)
          rec = { kind, ...base, endDate: end, kg: unit === 'kg' ? a : a * s.bagWeightKg, bags: unit === 'sacos' ? a : null };
        break;
      }
      case 'level': {
        if (levelMode === 'estimacion') {
          if (!cat) e.level = 'Elige cómo está la tolva.';
          else rec = { kind, ...base, percent: LEVEL_PRESETS[cat], approximate: true };
        } else {
          const p = parseDecimal(percent);
          if (!Number.isFinite(p) || p < 0 || p > 100) e.percent = 'Indica un porcentaje entre 0 y 100.';
          else rec = { kind, ...base, percent: Math.round(p), approximate: false };
        }
        break;
      }
      case 'inventory': {
        const n = parseDecimal(stored);
        if (!Number.isInteger(n) || n < 0) e.stored = 'Indica cuántos sacos hay almacenados (0 o más).';
        else rec = { kind, ...base, storedBags: n };
        break;
      }
      case 'counter': {
        if (counterMetric === 'price' && counterValue.trim() === '') {
          rec = { kind, ...base, metric: 'price', value: null };
          break;
        }
        const n = parseDecimal(counterValue);
        if (!Number.isFinite(n) || n < 0 || (counterMetric === 'price' && n === 0))
          e.counterValue = counterMetric === 'price' ? 'Indica un precio mayor que 0 o déjalo vacío para volver al calculado.' : 'Indica los kg (0 o más).';
        else rec = { kind, ...base, metric: counterMetric, value: Math.round(n * 100) / 100 };
        break;
      }
      case 'spend': {
        const n = parseDecimal(spendAmount);
        const sb = spendBags.trim() === '' ? undefined : parseDecimal(spendBags);
        if (!Number.isFinite(n) || n < 0) e.spendAmount = 'Indica un importe de 0 € o más.';
        else if (sb !== undefined && (!Number.isInteger(sb) || sb < 0)) e.spendBags = 'Indica un número entero de sacos.';
        else rec = { kind, ...base, amount: Math.round(n * 100) / 100, ...(sb !== undefined ? { bags: sb } : {}) };
        break;
      }
      case 'adjustment': {
        const b = posInt(adjBags, 'adjBags', true);
        const k = posNum(kg, 'kg', false, 'Indica los kg como número positivo.');
        if (!notes.trim()) e.notes = 'Explica el motivo del ajuste (rotura, error de recuento…).';
        if (b && !e.kg && !e.notes) rec = { kind, ...base, bagsDelta: direction === 'mas' ? b : -b, kg: k };
        break;
      }
    }
    setErrors(e);
    return Object.keys(e).length ? null : rec;
  }

  function submit(ev: FormEvent) {
    ev.preventDefault();
    const rec = validate();
    if (!rec) return;
    if (initial) {
      const full = { ...rec, id: initial.id, createdAt: initial.createdAt } as PelletRecord;
      updateRecord(full);
      onDone(full);
    } else {
      onDone(addRecord(rec));
    }
  }

  const refillBagsN = parseDecimal(bags);
  const refillExceeds = kind === 'refill' && !initial && Number.isFinite(refillBagsN) && refillBagsN > stock.bags;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {kind === 'purchase' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <DateInput label="Fecha" value={date} onChange={setDate} error={errors.date} />
            <StepperInput label="Sacos" placeholder="0" value={bags} onChange={setBags} error={errors.bags} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Marca" list={listId} value={brand} onChange={(e) => setBrand(e.target.value)} error={errors.brand} />
            <datalist id={listId}>
              {s.brands.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
            <TextInput label="Proveedor" placeholder="Opcional" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <TextInput label="Precio/saco" inputMode="decimal" suffix="€" value={price} onChange={(e) => setPrice(e.target.value)} error={errors.price} />
            <TextInput label="Peso/saco" inputMode="decimal" suffix="kg" value={weight} onChange={(e) => setWeight(e.target.value)} error={errors.weight} />
            <TextInput
              label="Total"
              inputMode="decimal"
              suffix="€"
              value={shownTotal}
              onChange={(e) => {
                setTotalTouched(true);
                setTotal(e.target.value);
              }}
              error={errors.total}
            />
          </div>
          {totalTouched && autoTotal != null && parseDecimal(shownTotal) !== autoTotal && (
            <button type="button" onClick={() => setTotalTouched(false)} className="-mt-2 self-start text-[0.8125rem] font-semibold text-olive-strong hover:underline">
              Usar sacos × precio ({fmtEur(autoTotal)})
            </button>
          )}
        </>
      )}

      {kind === 'refill' && (
        <>
          <Note>
            Una recarga mueve sacos del almacén a la tolva. No cuenta como consumo. Hay {fmtBags(stock.bags)} almacenados.
          </Note>
          <div className="grid grid-cols-2 gap-3">
            <DateInput label="Fecha" value={date} onChange={setDate} error={errors.date} />
            <StepperInput
              label="Sacos introducidos"
              placeholder="¿?"
              value={bags}
              onChange={setBags}
              error={errors.bags}
              hint={Number.isFinite(refillBagsN) && refillBagsN > 0 ? `≈ ${fmtKg(refillBagsN * s.bagWeightKg)}` : 'Vacío si no lo sabes'}
            />
          </div>
          <TextInput
            label="Peso introducido (si lo sabes)"
            inputMode="decimal"
            suffix="kg"
            placeholder="Opcional"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
            error={errors.kg}
          />
          {refillExceeds && (
            <p className="text-[0.8125rem] font-medium text-amber">
              Introduces más sacos de los que constan almacenados. Si es correcto, registra después un recuento.
            </p>
          )}
        </>
      )}

      {kind === 'consumption' && (
        <>
          <Note>Registra solo consumos que conozcas (por ejemplo, sacos vaciados por completo). Los niveles aproximados no cuentan.</Note>
          <Segmented
            label="Duración"
            value={periodMode}
            onChange={setPeriodMode}
            options={[
              { value: 'dia', label: 'Un día' },
              { value: 'periodo', label: 'Periodo' },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <DateInput label={periodMode === 'dia' ? 'Fecha' : 'Desde'} value={date} onChange={setDate} error={errors.date} />
            {periodMode === 'periodo' && <DateInput label="Hasta" value={endDate} onChange={setEndDate} error={errors.endDate} />}
          </div>
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <StepperInput
              label="Cantidad consumida"
              value={amount}
              onChange={setAmount}
              step={unit === 'sacos' ? 1 : 5}
              unit={unit === 'sacos' ? undefined : 'kg'}
              error={errors.amount}
              hint={unit === 'sacos' && Number.isFinite(parseDecimal(amount)) ? `= ${fmtKg(parseDecimal(amount) * s.bagWeightKg)}` : undefined}
            />
            <div className={errors.amount || unit === 'sacos' ? 'mb-6' : ''}>
              <Segmented
                label="Unidad"
                value={unit}
                onChange={setUnit}
                options={[
                  { value: 'kg', label: 'kg' },
                  { value: 'sacos', label: 'sacos' },
                ]}
              />
            </div>
          </div>
        </>
      )}

      {kind === 'level' && (
        <>
          <Segmented
            label="Tipo de lectura"
            value={levelMode}
            onChange={setLevelMode}
            options={[
              { value: 'estimacion', label: 'Estimación' },
              { value: 'exacto', label: 'Porcentaje' },
            ]}
          />
          {levelMode === 'estimacion' ? (
            <div className="flex flex-col gap-1.5">
              <Segmented label="Nivel de la tolva" value={cat} onChange={setCat} options={LEVEL_OPTIONS} />
              {errors.level && <p className="text-[0.8125rem] font-medium text-rust">{errors.level}</p>}
              <p className="text-[0.8125rem] text-ink-3">Las estimaciones se muestran en el panel pero no se usan para calcular consumo.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-end gap-4">
                <TextInput
                  label="Nivel"
                  inputMode="numeric"
                  suffix="%"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  error={errors.percent}
                  className="w-32"
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  aria-label="Nivel en porcentaje"
                  value={Number.isFinite(parseDecimal(percent)) ? parseDecimal(percent) : 0}
                  onChange={(e) => setPercent(e.target.value)}
                  className="mb-3 h-2 flex-1 accent-olive"
                />
              </div>
              <p className="text-[0.8125rem] text-ink-3">
                {s.hopperCapacityKg
                  ? `Con una tolva de ${fmtKg(s.hopperCapacityKg)}, ${percent || 0} % ≈ ${fmtKg((s.hopperCapacityKg * (parseDecimal(percent) || 0)) / 100)}. Dos lecturas en porcentaje permiten calcular el consumo.`
                  : 'Configura la capacidad de la tolva para convertir el porcentaje en kg.'}
              </p>
            </div>
          )}
          <DateInput label="Fecha" value={date} onChange={setDate} error={errors.date} />
        </>
      )}

      {kind === 'inventory' && (
        <>
          <Note>Un recuento fija las existencias almacenadas fuera de la tolva. Los movimientos posteriores se suman o restan a partir de él.</Note>
          <div className="grid grid-cols-2 gap-3">
            <DateInput label="Fecha" value={date} onChange={setDate} error={errors.date} />
            <StepperInput label="Sacos almacenados" value={stored} onChange={setStored} error={errors.stored} hint={`Ahora constan ${fmtBags(stock.bags)}`} />
          </div>
        </>
      )}

      {kind === 'counter' && (
        <>
          <Note>
            {counterMetric === 'price'
              ? 'Precio por saco que usa la app para costes, previsiones y ahorro. Déjalo vacío para volver a la media de tus compras.'
              : counterMetric === 'consumed'
                ? 'Total consumido que muestra Inventario. Desde aquí se suman los consumos nuevos; las estadísticas no cambian.'
                : 'Consumo que muestra Inicio para este mes. Desde aquí se suman los consumos nuevos; las estadísticas no cambian.'}
          </Note>
          <div className="grid grid-cols-2 gap-3">
            <DateInput label="Fecha" value={date} onChange={setDate} error={errors.date} />
            <TextInput
              label={counterMetric === 'price' ? 'Precio por saco' : counterMetric === 'consumed' ? 'Consumido total' : 'Consumo del mes'}
              inputMode="decimal"
              suffix={counterMetric === 'price' ? '€' : 'kg'}
              placeholder={counterMetric === 'price' ? 'Calculado' : '0'}
              value={counterValue}
              onChange={(ev) => setCounterValue(ev.target.value)}
              error={errors.counterValue}
            />
          </div>
        </>
      )}

      {kind === 'spend' && (
        <>
          <Note>Fija el contador «Gasto acumulado» de Inicio. Desde esta fecha se le suman las compras nuevas. Las estadísticas siguen usando lo que realmente has gastado.</Note>
          <div className="grid grid-cols-2 gap-3">
            <DateInput label="Fecha" value={date} onChange={setDate} error={errors.date} />
            <TextInput label="Gasto acumulado" inputMode="decimal" suffix="€" value={spendAmount} onChange={(e) => setSpendAmount(e.target.value)} error={errors.spendAmount} />
          </div>
          <TextInput label="Sacos de ese gasto" inputMode="numeric" suffix="sacos" placeholder="Opcional" value={spendBags} onChange={(e) => setSpendBags(e.target.value)} error={errors.spendBags} />
        </>
      )}

      {kind === 'adjustment' && (
        <>
          <Segmented
            label="Sentido del ajuste"
            value={direction}
            onChange={setDirection}
            options={[
              { value: 'menos', label: 'Restar sacos' },
              { value: 'mas', label: 'Sumar sacos' },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <DateInput label="Fecha" value={date} onChange={setDate} error={errors.date} />
            <StepperInput label="Sacos" value={adjBags} onChange={setAdjBags} error={errors.adjBags} />
          </div>
          <TextInput label="Peso (opcional)" inputMode="decimal" suffix="kg" value={kg} onChange={(e) => setKg(e.target.value)} error={errors.kg} />
        </>
      )}

      <TextArea
        label={kind === 'adjustment' ? 'Motivo' : 'Observaciones'}
        placeholder={kind === 'adjustment' ? 'Saco roto, error de recuento…' : 'Opcional'}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        error={errors.notes}
      />

      <div className="mt-2 flex items-center gap-2">
        {onDelete && (
          <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={onDelete}>
            Eliminar
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => onDone(null)}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary">
            {initial ? 'Guardar cambios' : 'Registrar'}
          </Button>
        </div>
      </div>
    </form>
  );
}
