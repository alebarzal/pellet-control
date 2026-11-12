import { consumptionStats, effectivePricePerBag, hopperEstimate, statsData, storedStock } from './calc';
import { addDays, todayIso } from './dates';
import { fmtBags, fmtDate, fmtEur, fmtKg } from './format';
import type { AppData } from './types';

export interface PlannedEvent {
  key: 'purchase' | 'refill';
  title: string;
  description: string;
  /** yyyy-mm-dd */
  date: string;
}

/** La tolva se recarga cuando baja de este porcentaje. */
export const REFILL_AT_PERCENT = 25;

/**
 * Fechas previstas para el calendario, a partir del consumo medio real.
 * Sin media de consumo no se inventa nada: no hay eventos.
 */
export function calendarPlan(data: AppData, leadDays: number, today = todayIso()): PlannedEvent[] {
  const avg = consumptionStats(statsData(data), today).avgDailyKg;
  if (avg == null || avg <= 0) return [];
  const events: PlannedEvent[] = [];
  const cap = data.settings.hopperCapacityKg;
  const hopper = hopperEstimate(data);
  const stock = storedStock(data);
  const bagKg = data.settings.bagWeightKg;
  const later = (d: string) => (d < today ? today : d);

  // Recarga: cuando la tolva baje del umbral, contando desde el último nivel apuntado.
  let hopperEmptyDate: string | null = null;
  if (hopper?.kg != null && cap) {
    const lowKg = (cap * REFILL_AT_PERCENT) / 100;
    const days = Math.max(0, Math.floor((hopper.kg - lowKg) / avg));
    const date = later(addDays(hopper.date, days));
    const bags = Math.max(1, Math.min(Math.max(0, stock.bags), Math.round((cap - lowKg) / bagKg)));
    events.push({
      key: 'refill',
      title: 'Recargar la tolva de pellet',
      description:
        `Previsión de Pellet Control: la tolva bajará de ~${REFILL_AT_PERCENT} % (${fmtKg(Math.round(lowKg))}). ` +
        (stock.bags > 0 ? `Caben unos ${fmtBags(bags)}; hay ${fmtBags(stock.bags)} guardados.` : 'No quedan sacos guardados.') +
        ` Consumo medio: ${fmtKg(Math.round(avg * 10) / 10)}/día.`,
      date,
    });
    hopperEmptyDate = addDays(hopper.date, Math.floor(hopper.kg / avg));
  }

  // Compra: unos días antes de que se acabe todo el pellet (almacén + tolva).
  const totalKg = Math.max(0, stock.kg) + (hopper?.kg ?? 0);
  const base = hopper?.kg != null ? hopper.date : today;
  const runOut = addDays(base, Math.floor(totalKg / avg));
  const price = effectivePricePerBag(data).value;
  events.push({
    key: 'purchase',
    title: 'Comprar pellet',
    description:
      `Previsión de Pellet Control: el pellet se acabaría hacia el ${fmtDate(runOut)}` +
      (hopperEmptyDate && stock.bags <= 0 ? ' (ya solo queda lo de la tolva)' : '') +
      `. Aviso con ${leadDays} ${leadDays === 1 ? 'día' : 'días'} de margen.` +
      (price ? ` Último precio: ${fmtEur(price)}/saco.` : ''),
    date: later(addDays(runOut, -leadDays)),
  });

  return events;
}
