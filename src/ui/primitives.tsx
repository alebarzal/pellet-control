import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { haptic } from './haptics';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'h-11 px-4 text-[0.9375rem]' : 'h-9 px-3 text-sm',
        variant === 'primary' && 'bg-forest text-paper shadow-soft hover:bg-forest-2',
        variant === 'secondary' && 'bg-surface text-ink ring-1 ring-line ring-inset hover:bg-sand-soft',
        variant === 'ghost' && 'text-ink-2 hover:bg-sand-soft hover:text-ink',
        variant === 'danger' && 'bg-rust-soft text-rust hover:bg-[#efcfc2]',
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function Card({
  className,
  children,
  as: As = 'section',
}: {
  className?: string;
  children: ReactNode;
  as?: 'section' | 'div' | 'article';
}) {
  return <As className={cx('rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/70 sm:p-6', className)}>{children}</As>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.025em] text-balance sm:text-[2rem]">{title}</h1>
        {description && <p className="mt-1.5 text-[0.9375rem] text-ink-2 text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="text-[1.0625rem] font-bold tracking-[-0.01em]">{children}</h2>
      {aside}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  compact,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cx('flex flex-col items-start gap-3 rounded-2xl border border-dashed border-line bg-sand-soft/50', compact ? 'p-4' : 'p-5')}>
      <span className="grid size-10 place-items-center rounded-xl bg-surface text-olive shadow-soft">{icon}</span>
      <div>
        <p className="font-semibold">{title}</p>
        <div className="mt-1 max-w-prose text-sm text-ink-2 text-pretty">{children}</div>
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'muted' }) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-ink-2">{label}</p>
      <p className={cx('num mt-1 text-[1.375rem] font-bold tracking-[-0.02em]', tone === 'muted' && 'text-ink-3')}>{value}</p>
      {hint && <p className="mt-0.5 text-[0.8125rem] text-ink-3">{hint}</p>}
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'olive' | 'amber' | 'rust' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold',
        tone === 'neutral' && 'bg-sand text-ink-2',
        tone === 'olive' && 'bg-olive-soft text-olive-strong',
        tone === 'amber' && 'bg-amber-soft text-amber',
        tone === 'rust' && 'bg-rust-soft text-rust',
      )}
    >
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 overflow-x-auto rounded-2xl bg-sand-soft p-1 ring-1 ring-line/60 ring-inset">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => {
            if (value !== o.value) haptic.tap();
            onChange(o.value);
          }}
          className={cx(
            'flex flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-semibold transition-[background-color,color,box-shadow,transform] duration-200 active:scale-[0.97]',
            size === 'md' ? 'h-10 px-3 text-sm' : 'h-8 px-2.5 text-[0.8125rem]',
            value === o.value ? 'bg-surface text-ink shadow-soft' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
