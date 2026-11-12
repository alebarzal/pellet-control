import { ArrowDownToLine, ClipboardCheck, Flame, Gauge, ShoppingBag, SlidersHorizontal, Wallet, type LucideIcon } from 'lucide-react';
import { LEVEL_LABEL, levelCategory, refillKg } from '../../domain/calc';
import { fmtBags, fmtDate, fmtEur, fmtKg } from '../../domain/format';
import type { PelletRecord, RecordKind, Settings } from '../../domain/types';

export const KIND_META: Record<RecordKind, { label: string; short: string; icon: LucideIcon; tint: string; fem: boolean }> = {
  purchase: { label: 'Compra', short: 'Compra', icon: ShoppingBag, tint: 'bg-olive-soft text-olive-strong', fem: true },
  refill: { label: 'Recarga de tolva', short: 'Recarga', icon: ArrowDownToLine, tint: 'bg-sand text-forest', fem: true },
  consumption: { label: 'Consumo', short: 'Consumo', icon: Flame, tint: 'bg-amber-soft text-amber', fem: false },
  level: { label: 'Nivel de tolva', short: 'Nivel', icon: Gauge, tint: 'bg-sand-soft text-ink-2', fem: false },
  inventory: { label: 'Recuento de inventario', short: 'Recuento', icon: ClipboardCheck, tint: 'bg-sand-soft text-ink-2', fem: false },
  adjustment: { label: 'Ajuste manual', short: 'Ajuste', icon: SlidersHorizontal, tint: 'bg-sand-soft text-ink-2', fem: false },
  spend: { label: 'Ajuste de gasto', short: 'Gasto', icon: Wallet, tint: 'bg-olive-soft text-olive-strong', fem: false },
  counter: { label: 'Ajuste de indicador', short: 'Indicador', icon: SlidersHorizontal, tint: 'bg-olive-soft text-olive-strong', fem: false },
};

export interface RecordSummary {
  title: string;
  detail: string;
  /** Valor destacado a la derecha (importe, kg…). */
  value?: string;
  /** Efecto en sacos almacenados. */
  stockChange?: string;
}

export function describeRecord(r: PelletRecord, s: Settings): RecordSummary {
  switch (r.kind) {
    case 'purchase':
      return {
        title: `Compra de ${fmtBags(r.bags)}${r.brand ? ` · ${r.brand}` : ''}`,
        detail: [`${fmtEur(r.pricePerBag)}/saco`, fmtKg(r.bags * r.bagWeightKg), r.supplier].filter(Boolean).join(' · '),
        value: fmtEur(r.totalCost),
        stockChange: `+${r.bags}`,
      };
    case 'refill': {
      const kg = refillKg(r, s);
      return {
        title: r.bags ? `Recarga de ${fmtBags(r.bags)}` : 'Recarga de tolva',
        detail: kg != null ? `${fmtKg(kg)} introducidos` : 'Cantidad no registrada',
        stockChange: r.bags ? `−${r.bags}` : undefined,
      };
    }
    case 'consumption':
      return {
        title: `Consumo de ${fmtKg(r.kg)}`,
        detail: r.endDate && r.endDate !== r.date ? `Del ${fmtDate(r.date)} al ${fmtDate(r.endDate)}` : 'Un día',
        value: fmtKg(r.kg),
      };
    case 'level':
      return {
        title: r.approximate ? LEVEL_LABEL[levelCategory(r.percent)] : `Nivel de tolva al ${r.percent} %`,
        detail: r.approximate ? 'Estimación visual' : 'Lectura en porcentaje',
      };
    case 'inventory':
      return {
        title: `Recuento: ${fmtBags(r.storedBags)} almacenados`,
        detail: 'Fija las existencias fuera de la tolva',
        stockChange: `= ${r.storedBags}`,
      };
    case 'spend':
      return {
        title: r.amount === 0 ? 'Gasto acumulado puesto a 0' : `Gasto acumulado fijado en ${fmtEur(r.amount)}${r.bags != null ? ` (${fmtBags(r.bags)})` : ''}`,
        detail: 'Desde aquí se suman las compras nuevas',
        value: fmtEur(r.amount),
      };
    case 'counter':
      if (r.metric === 'price')
        return r.value == null
          ? { title: 'Precio por saco: vuelve al calculado', detail: 'Media de las compras reales' }
          : { title: `Precio por saco fijado en ${fmtEur(r.value)}`, detail: 'Se usa en costes, previsiones y ahorro', value: fmtEur(r.value) };
      if (r.metric === 'stats')
        return { title: 'Estadísticas reiniciadas', detail: 'Desde aquí empiezan a contar gasto, consumo, medias y recargas' };
      if (r.metric === 'consumed')
        return {
          title: r.value === 0 ? 'Consumido total puesto a 0' : `Consumido total fijado en ${fmtKg(r.value ?? 0)}`,
          detail: 'Desde aquí se suman los consumos nuevos',
          value: fmtKg(r.value ?? 0),
        };
      return {
        title: r.value === 0 ? 'Consumo del mes puesto a 0' : `Consumo del mes fijado en ${fmtKg(r.value ?? 0)}`,
        detail: 'Desde aquí se suman los consumos nuevos',
        value: fmtKg(r.value ?? 0),
      };
    case 'adjustment':
      return {
        title: `Ajuste de ${r.bagsDelta > 0 ? '+' : '−'}${fmtBags(Math.abs(r.bagsDelta))}`,
        detail: r.notes || 'Sin motivo indicado',
        stockChange: `${r.bagsDelta > 0 ? '+' : '−'}${Math.abs(r.bagsDelta)}`,
      };
  }
}

export function KindIcon({ kind, size = 'md' }: { kind: RecordKind; size?: 'sm' | 'md' }) {
  const m = KIND_META[kind];
  const Icon = m.icon;
  return (
    <span className={`grid shrink-0 place-items-center rounded-xl ${m.tint} ${size === 'md' ? 'size-10' : 'size-8'}`}>
      <Icon className={size === 'md' ? 'size-[1.125rem]' : 'size-4'} strokeWidth={2} aria-hidden />
    </span>
  );
}

export const done = (k: RecordKind, verb: 'registrad' | 'eliminad') => `${KIND_META[k].label} ${verb}${KIND_META[k].fem ? 'a' : 'o'}`;
