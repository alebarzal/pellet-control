import { ChevronRight } from 'lucide-react';
import { fmtDate } from '../../domain/format';
import type { PelletRecord } from '../../domain/types';
import { useStore } from '../../store/store';
import { cx } from '../../ui/primitives';
import { describeRecord, KindIcon } from './meta';
import { useRecordActions } from './RecordDialogs';

/** Lista de registros editable (no tabla): icono, título, detalle, valor. */
export function RecordList({
  records,
  showDate = true,
  balance,
}: {
  records: PelletRecord[];
  showDate?: boolean;
  /** Saldo de sacos almacenados tras cada registro. */
  balance?: Map<string, number>;
}) {
  const { data } = useStore();
  const { openEdit } = useRecordActions();
  return (
    <ul className="-mx-2 flex flex-col">
      {records.map((r) => {
        const d = describeRecord(r, data.settings);
        const bal = balance?.get(r.id);
        return (
          <li key={r.id}>
            <button
              onClick={() => openEdit(r)}
              className="group flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-[transform,background-color] duration-150 hover:bg-sand-soft/70 active:scale-[0.985] active:bg-sand-soft"
            >
              <KindIcon kind={r.kind} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-pretty">{d.title}</span>
                <span className="block text-sm text-ink-2 text-pretty">
                  {showDate && <>{fmtDate(r.date)} · </>}
                  {r.notes && r.kind !== 'adjustment' ? r.notes : d.detail}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                {d.value && <span className="num font-semibold">{d.value}</span>}
                {balance && d.stockChange && (
                  <span className={cx('num text-sm', d.value ? 'text-ink-3' : 'font-semibold text-ink')}>
                    {d.stockChange} {bal != null && <span className="text-ink-3">→ {bal}</span>}
                  </span>
                )}
              </span>
              <ChevronRight className="size-4 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
