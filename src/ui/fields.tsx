import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import { haptic } from './haptics';
import { cx } from './primitives';

const control =
  'w-full rounded-xl bg-surface px-3.5 text-base text-ink ring-1 ring-line ring-inset transition-shadow placeholder:text-ink-3 hover:ring-ink-3/40 focus:outline-none focus:ring-2 focus:ring-olive disabled:bg-sand-soft disabled:text-ink-3';

export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: (id: string, describedBy?: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children(id, error || hint ? msgId : undefined)}
      {error ? (
        <p id={msgId} className="text-[0.8125rem] font-medium text-rust">
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="text-[0.8125rem] text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  label,
  error,
  hint,
  suffix,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: ReactNode; suffix?: string }) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(id, d) => (
        <div className="relative">
          <input
            id={id}
            aria-invalid={!!error}
            aria-describedby={d}
            {...rest}
            className={cx(control, 'h-11', suffix && 'pr-14', error && 'ring-rust/70')}
          />
          {suffix && (
            <span className="pointer-events-none absolute inset-y-0 right-3.5 grid place-items-center text-sm text-ink-3">{suffix}</span>
          )}
        </div>
      )}
    </Field>
  );
}

export function SelectInput({
  label,
  error,
  hint,
  children,
  className,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: ReactNode }) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(id, d) => (
        <div className="relative">
          <select id={id} aria-describedby={d} {...rest} className={cx(control, 'h-11 appearance-none pr-10')}>
            {children}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
        </div>
      )}
    </Field>
  );
}

export function TextArea({
  label,
  error,
  hint,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: ReactNode }) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(id, d) => <textarea id={id} aria-describedby={d} rows={2} {...rest} className={cx(control, 'resize-y py-2.5')} />}
    </Field>
  );
}

/** Convierte texto con coma o punto decimal a número. Devuelve NaN si no es válido. */
export function parseDecimal(v: string): number {
  const t = v.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return NaN;
  return /^-?\d*\.?\d+$/.test(t) ? Number(t) : NaN;
}

export function decimalToInput(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '';
  return String(Math.round(n * 1000) / 1000).replace('.', ',');
}

/** Campo numérico con botones − / + para cambiar la cantidad sin abrir el teclado. */
export function StepperInput({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  error,
  hint,
  placeholder,
  unit,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: number;
  min?: number;
  error?: string;
  hint?: ReactNode;
  placeholder?: string;
  unit?: string;
  className?: string;
}) {
  const n = parseDecimal(value);
  const has = Number.isFinite(n);
  const set = (v: number) => onChange(decimalToInput(Math.max(min, Math.round(v * 100) / 100)));
  const btn =
    'grid w-11 shrink-0 place-items-center text-ink-2 transition-colors hover:bg-sand-soft hover:text-ink active:bg-sand disabled:opacity-35 disabled:hover:bg-transparent [&>svg]:transition-transform [&>svg]:duration-100 active:[&>svg]:scale-75';
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(id, d) => (
        <div
          className={cx(
            'flex h-11 overflow-hidden rounded-xl border border-line bg-surface transition-shadow focus-within:border-olive focus-within:ring-1 focus-within:ring-olive',
            error && 'border-rust/70',
          )}
        >
          <button type="button" className={btn} aria-label={`Restar ${step} a ${label}`} disabled={!has || n - step < min} onClick={() => {
              haptic.tap();
              set(n - step);
            }}>
            <Minus className="size-4" aria-hidden />
          </button>
          <div className="relative min-w-0 flex-1">
            <input
              id={id}
              inputMode="decimal"
              enterKeyHint="done"
              aria-invalid={!!error}
              aria-describedby={d}
              value={value}
              placeholder={placeholder}
              onChange={(e) => onChange(e.target.value)}
              className={cx(
                'num h-full w-full bg-transparent text-center text-base font-semibold text-ink placeholder:font-normal placeholder:text-ink-3 focus:outline-none',
                unit && 'pr-6',
              )}
            />
            {unit && <span className="pointer-events-none absolute inset-y-0 right-1 grid place-items-center text-sm text-ink-3">{unit}</span>}
          </div>
          <button type="button" className={btn} aria-label={`Sumar ${step} a ${label}`} onClick={() => {
              haptic.tap();
              set(has ? n + step : Math.max(min, step));
            }}>
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </Field>
  );
}

const isoOffset = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Fecha con atajos «Hoy» y «Ayer». */
export function DateInput({
  label,
  value,
  onChange,
  error,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  className?: string;
}) {
  const chips = [
    { label: 'Hoy', v: isoOffset(0) },
    { label: 'Ayer', v: isoOffset(-1) },
  ];
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <TextInput label={label} type="date" value={value} onChange={(e) => onChange(e.target.value)} error={error} />
      <div className="flex gap-1.5">
        {chips.map((c) => (
          <button
            key={c.label}
            type="button"
            aria-pressed={value === c.v}
            onClick={() => onChange(c.v)}
            className={cx(
              'h-7 rounded-full px-3 text-xs font-semibold ring-1 ring-inset transition-[transform,background-color,color] duration-150 active:scale-95',
              value === c.v ? 'bg-olive-soft text-olive-strong ring-olive/30' : 'text-ink-2 ring-line hover:bg-sand-soft',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
