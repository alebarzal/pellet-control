import { History, Pencil } from 'lucide-react';
import { useState } from 'react';
import type { PageProps } from '../app/App';
import { describeRecord, KIND_META, KindIcon } from '../features/records/meta';
import { useRecordActions } from '../features/records/RecordDialogs';
import { sortRecords } from '../domain/calc';
import { monthKey } from '../domain/dates';
import { fmtDateShort, fmtMonth } from '../domain/format';
import type { RecordKind } from '../domain/types';
import { useStore } from '../store/store';
import { Card, EmptyState, PageHeader, cx } from '../ui/primitives';

const FILTERS: { value: 'all' | RecordKind; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'purchase', label: 'Compras' },
  { value: 'refill', label: 'Recargas' },
  { value: 'inventory', label: 'Inventario' },
  { value: 'consumption', label: 'Consumo' },
  { value: 'level', label: 'Nivel' },
  { value: 'adjustment', label: 'Ajustes' },
  { value: 'spend', label: 'Gasto' },
  { value: 'counter', label: 'Indicadores' },
];

export function HistoryPage(_: PageProps) {
  const { data } = useStore();
  const { openEdit } = useRecordActions();
  const [filter, setFilter] = useState<'all' | RecordKind>('all');
  const list = sortRecords(data.records)
    .reverse()
    .filter((r) => filter === 'all' || r.kind === filter);

  const groups = new Map<string, typeof list>();
  for (const r of list) {
    const k = monthKey(r.date);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  return (
    <>
      <PageHeader title="Historial" description="Todo lo que ha pasado, en orden. Toca un registro para consultarlo o editarlo." />

      <div role="radiogroup" aria-label="Filtrar por tipo" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            role="radio"
            aria-checked={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cx(
              'h-9 shrink-0 rounded-full px-4 text-sm font-semibold ring-1 ring-inset transition-[transform,background-color,color] duration-150 active:scale-95',
              filter === f.value ? 'bg-forest text-paper ring-forest' : 'bg-surface text-ink-2 ring-line hover:text-ink',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<History className="size-5" />} title="No hay registros de este tipo">
          Cuando los añadas desde «Añadir movimiento» aparecerán aquí.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {[...groups.entries()].map(([month, items]) => (
            <section key={month} aria-labelledby={`m-${month}`}>
              <h2 id={`m-${month}`} className="mb-3 text-sm font-bold tracking-[-0.005em] text-ink-2 first-letter:uppercase">
                {fmtMonth(month, true)}
              </h2>
              <Card className="p-3 sm:p-4">
                <ol className="relative">
                  {items.map((r, i) => {
                    const d = describeRecord(r, data.settings);
                    return (
                      <li key={r.id} className="relative">
                        {i < items.length - 1 && <span className="absolute top-12 bottom-0 left-[1.625rem] w-px bg-line" aria-hidden />}
                        <button
                          onClick={() => openEdit(r)}
                          className="group flex w-full items-start gap-3 rounded-2xl p-1.5 text-left transition-[transform,background-color] duration-150 hover:bg-sand-soft/70 active:scale-[0.985] active:bg-sand-soft"
                        >
                          <KindIcon kind={r.kind} />
                          <span className="min-w-0 flex-1 pt-0.5">
                            <span className="flex flex-wrap items-baseline gap-x-2">
                              <span className="font-semibold">{d.title}</span>
                              <span className="text-xs font-semibold text-ink-3">{KIND_META[r.kind].label}</span>
                            </span>
                            <span className="mt-0.5 block text-sm text-ink-2">{d.detail}</span>
                            {r.notes && r.kind !== 'adjustment' && <span className="mt-1 block text-sm text-ink-3 italic">«{r.notes}»</span>}
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
                            <span className="num text-sm text-ink-2">{fmtDateShort(r.date)}</span>
                            {d.value && <span className="num font-semibold">{d.value}</span>}
                            <Pencil className="size-3.5 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
