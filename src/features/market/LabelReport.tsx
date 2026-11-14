import { Check, PenLine, ScanText } from 'lucide-react';
import type { LabelReportItem } from '../../domain/market';
import { cx } from '../../ui/primitives';

/**
 * Resumen de lo que se ha leído en la foto: qué datos ha rellenado la app y cuáles hay que poner a mano
 * (en ámbar los obligatorios, en gris los que se pueden dejar en blanco).
 */
export function LabelReport({ items }: { items: LabelReportItem[] }) {
  const found = items.filter((i) => i.value != null);
  const missing = items.filter((i) => i.value == null);
  const required = missing.filter((i) => i.required);

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line" role="status">
      <p className="flex items-center gap-2 text-sm font-bold">
        <ScanText className="size-4 text-olive" aria-hidden />
        {found.length ? `La foto ha dado ${found.length} de ${items.length} datos` : 'No se ha reconocido ningún dato en la foto'}
      </p>

      {found.length > 0 && (
        <div>
          <p className="mb-1.5 text-[0.75rem] font-bold tracking-wide text-olive-strong uppercase">Leído · revísalo</p>
          <ul className="flex flex-wrap gap-1.5">
            {found.map((i) => (
              <li key={i.key} className="flex max-w-full items-center gap-1.5 rounded-full bg-olive-soft py-1 pr-3 pl-2 text-[0.8125rem] text-forest">
                <Check className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">
                  {i.label}: <span className="font-semibold">{i.value}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {missing.length > 0 && (
        <div>
          <p className="mb-1.5 text-[0.75rem] font-bold tracking-wide text-ink-3 uppercase">Ponlo a mano</p>
          <ul className="flex flex-wrap gap-1.5">
            {missing.map((i) => (
              <li
                key={i.key}
                className={cx(
                  'flex items-center gap-1.5 rounded-full py-1 pr-3 pl-2 text-[0.8125rem]',
                  i.required ? 'bg-amber-soft font-semibold text-amber' : 'bg-sand-soft text-ink-2',
                )}
              >
                <PenLine className="size-3.5 shrink-0" aria-hidden />
                {i.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[0.8125rem] text-ink-3 text-pretty">
        {!found.length
          ? 'Rellena la ficha a mano o repite la foto más cerca de la etiqueta, con buena luz y sin reflejos.'
          : required.length
            ? 'Lo marcado en ámbar hace falta para guardar. Lo gris puedes dejarlo en blanco si el saco no lo dice.'
            : 'Tienes lo necesario para guardar. Lo gris puedes dejarlo en blanco si el saco no lo dice.'}
      </p>
    </div>
  );
}
