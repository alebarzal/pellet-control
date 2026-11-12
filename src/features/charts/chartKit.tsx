import type { ReactNode } from 'react';

export const C = {
  olive: '#6b7a36',
  forest: '#2c3a29',
  sand: '#d9cdb1',
  projected: '#b9ad8f',
  grid: '#e7e0cf',
  axis: '#6a6e63',
  amber: '#b5832f',
};

export const axisProps = {
  tick: { fill: C.axis, fontSize: 12 },
  tickLine: false,
  axisLine: false,
} as const;

export const gridProps = { stroke: C.grid, vertical: false } as const;

export function ChartTooltip({
  active,
  payload,
  label,
  labelFormat,
  valueFormat,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string; payload?: Record<string, unknown> }[];
  label?: string | number;
  labelFormat?: (l: string) => string;
  valueFormat: (v: number, key?: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value != null && !(p.value === 0 && String(p.dataKey).startsWith('proj')));
  if (!rows.length) return null;
  return (
    <div className="rounded-xl bg-ink px-3 py-2 text-sm text-paper shadow-lift">
      {label != null && <p className="mb-1 font-semibold">{labelFormat ? labelFormat(String(label)) : label}</p>}
      {rows.map((p, i) => (
        <p key={i} className="num flex items-center gap-2 text-paper/85">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold text-paper">{valueFormat(p.value!, p.dataKey)}</span>
        </p>
      ))}
    </div>
  );
}

export function ChartCard({ title, subtitle, legend, children }: { title: string; subtitle?: string; legend?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/70 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-[1.0625rem] font-bold tracking-[-0.01em]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
        </div>
        {legend}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-[0.8125rem] text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-3.5 rounded-[3px]"
            style={
              i.dashed
                ? { background: `repeating-linear-gradient(135deg, ${i.color} 0 3px, transparent 3px 6px)`, boxShadow: `inset 0 0 0 1px ${i.color}` }
                : { background: i.color }
            }
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Patrón rayado para datos proyectados. Insertar dentro de <defs>. */
export function ProjectedPattern({ id = 'proj' }: { id?: string }) {
  return (
    <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="#efe9da" />
      <rect width="3" height="6" fill={C.projected} />
    </pattern>
  );
}
