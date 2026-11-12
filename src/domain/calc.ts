import { addDays, diffDays, monthKey, monthRange, todayIso, weekStart, yearKey } from './dates';
import type {
  AppData,
  ConsumptionRecord,
  CounterRecord,
  LevelCategory,
  LevelRecord,
  PelletRecord,
  PurchaseRecord,
  RefillRecord,
  Settings,
} from './types';

/* ───────────── Orden ───────────── */

export function sortRecords<T extends PelletRecord>(records: T[]): T[] {
  return [...records].sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
}

/* ───────────── Nivel de tolva ───────────── */

export const LEVEL_PRESETS: Record<LevelCategory, number> = { lleno: 90, medio: 50, bajo: 20, vacio: 0 };
export const LEVEL_LABEL: Record<LevelCategory, string> = {
  lleno: 'Tolva llena',
  medio: 'Tolva media',
  bajo: 'Tolva baja',
  vacio: 'Tolva vacía',
};

export function levelCategory(percent: number): LevelCategory {
  if (percent < 8) return 'vacio';
  if (percent < 35) return 'bajo';
  if (percent < 70) return 'medio';
  return 'lleno';
}

export function currentLevel(records: PelletRecord[]): LevelRecord | null {
  const levels = sortRecords(records.filter((r): r is LevelRecord => r.kind === 'level'));
  return levels.at(-1) ?? null;
}

export interface HopperEstimate {
  percent: number;
  category: LevelCategory;
  approximate: boolean;
  /** kg estimados en la tolva, null si no hay capacidad configurada. */
  kg: number | null;
  date: string;
}

export function hopperEstimate(data: AppData): HopperEstimate | null {
  const lvl = currentLevel(data.records);
  if (!lvl) return null;
  const cap = data.settings.hopperCapacityKg;
  return {
    percent: lvl.percent,
    category: levelCategory(lvl.percent),
    approximate: lvl.approximate,
    kg: cap ? (cap * lvl.percent) / 100 : null,
    date: lvl.date,
  };
}

/* ───────────── Inventario almacenado ───────────── */

export interface StockState {
  bags: number;
  kg: number;
  /** Fecha del último recuento absoluto, si existe. */
  lastCountDate: string | null;
  /** true si en algún momento el stock calculado fue negativo (datos incoherentes). */
  wentNegative: boolean;
}

/** Variación de sacos almacenados que produce un registro, o null si fija un valor absoluto. */
export function stockEffect(r: PelletRecord): number | null {
  switch (r.kind) {
    case 'purchase':
      return r.bags;
    case 'refill':
      return r.bags ? -r.bags : 0;
    case 'adjustment':
      return r.bagsDelta;
    case 'inventory':
      return null;
    default:
      return 0;
  }
}

export function storedStock(data: AppData, upTo?: string): StockState {
  let bags = 0;
  let lastCountDate: string | null = null;
  let wentNegative = false;
  for (const r of sortRecords(data.records)) {
    if (upTo && r.date > upTo) break;
    if (r.kind === 'inventory') {
      bags = r.storedBags;
      lastCountDate = r.date;
      continue;
    }
    bags += stockEffect(r) ?? 0;
    if (bags < 0) wentNegative = true;
  }
  return { bags, kg: Math.max(0, bags) * data.settings.bagWeightKg, lastCountDate, wentNegative };
}

/** Saldo de sacos almacenados tras cada registro (para la lista de movimientos). */
export function stockLedger(data: AppData): Map<string, number> {
  const out = new Map<string, number>();
  let bags = 0;
  for (const r of sortRecords(data.records)) {
    if (r.kind === 'inventory') bags = r.storedBags;
    else bags += stockEffect(r) ?? 0;
    out.set(r.id, bags);
  }
  return out;
}

/* ───────────── Contador de gasto ───────────── */

export interface SpendCounter {
  amount: number;
  /** Fecha del último ajuste o puesta a cero (null = desde la primera compra). */
  since: string | null;
  /** Sacos que suman ese gasto (null si el ajuste no los indicó). */
  bags: number | null;
}

/** «Gasto acumulado» de Inicio: último ajuste de gasto + compras posteriores. */
export function spendCounter(all: AppData): SpendCounter {
  const data = statsData(all);
  let amount = 0;
  let bags: number | null = 0;
  let since: string | null = null;
  for (const r of sortRecords(data.records)) {
    if (r.kind === 'spend') {
      amount = r.amount;
      bags = r.bags ?? (r.amount === 0 ? 0 : null);
      since = r.date;
    } else if (r.kind === 'purchase') {
      amount += r.totalCost;
      if (bags != null) bags += r.bags;
    }
  }
  return { amount, since, bags };
}

/** Gasto de la temporada que muestra Inicio: si el contador se reinició dentro de la temporada, cuenta desde ahí. */
export function seasonSpend(all: AppData): { amount: number; since: string | null } {
  const data = statsData(all);
  const c = spendCounter(data);
  const { seasonStart, seasonEnd } = data.settings;
  if (c.since && c.since >= seasonStart && c.since <= seasonEnd) return { amount: c.amount, since: c.since };
  return { amount: purchaseSummary(data, (p) => p.date >= seasonStart && p.date <= seasonEnd).totalSpent, since: null };
}

/* ───────────── Precio fijado a mano ───────────── */

/** Último precio por saco fijado a mano (null si no hay o se volvió al calculado). */
export function priceOverride(data: AppData): number | null {
  const last = sortRecords(data.records.filter((r): r is CounterRecord => r.kind === 'counter' && r.metric === 'price')).at(-1);
  return last?.value ?? null;
}

/** Precio por saco que usa la app: el fijado a mano o, si no hay, la media ponderada de las compras. */
export function effectivePricePerBag(data: AppData): { value: number | null; manual: boolean; calculated: number | null } {
  const calculated = purchaseSummary(data).avgPricePerBag;
  const manual = priceOverride(data);
  return { value: manual ?? calculated, manual: manual != null, calculated };
}

export function effectivePricePerKg(data: AppData): number | null {
  const manual = priceOverride(data);
  return manual != null ? manual / data.settings.bagWeightKg : purchaseSummary(data).avgPricePerKg;
}

/* ───────────── Compras ───────────── */

export function purchases(data: AppData): PurchaseRecord[] {
  return sortRecords(data.records.filter((r): r is PurchaseRecord => r.kind === 'purchase'));
}

export interface PurchaseSummary {
  count: number;
  totalSpent: number;
  totalBags: number;
  totalKg: number;
  avgPricePerBag: number | null;
  avgPricePerKg: number | null;
}

export function purchaseSummary(data: AppData, filter?: (p: PurchaseRecord) => boolean): PurchaseSummary {
  const list = purchases(data).filter(filter ?? (() => true));
  const totalSpent = list.reduce((s, p) => s + p.totalCost, 0);
  const totalBags = list.reduce((s, p) => s + p.bags, 0);
  const totalKg = list.reduce((s, p) => s + p.bags * p.bagWeightKg, 0);
  return {
    count: list.length,
    totalSpent,
    totalBags,
    totalKg,
    avgPricePerBag: totalBags > 0 ? totalSpent / totalBags : null,
    avgPricePerKg: totalKg > 0 ? totalSpent / totalKg : null,
  };
}

export function spendByMonth(data: AppData): { month: string; spent: number; bags: number }[] {
  const list = purchases(data);
  if (!list.length) return [];
  const map = new Map<string, { spent: number; bags: number }>();
  for (const p of list) {
    const k = monthKey(p.date);
    const cur = map.get(k) ?? { spent: 0, bags: 0 };
    cur.spent += p.totalCost;
    cur.bags += p.bags;
    map.set(k, cur);
  }
  const months = monthRange(monthKey(list[0].date), monthKey(maxIso(list.at(-1)!.date, todayIso())));
  return months.map((m) => ({ month: m, spent: map.get(m)?.spent ?? 0, bags: map.get(m)?.bags ?? 0 }));
}

export function spendByYear(data: AppData): { year: string; spent: number }[] {
  const map = new Map<string, number>();
  for (const p of purchases(data)) map.set(yearKey(p.date), (map.get(yearKey(p.date)) ?? 0) + p.totalCost);
  return [...map.entries()].sort().map(([year, spent]) => ({ year, spent }));
}

export interface PricePoint {
  id: string;
  date: string;
  brand: string;
  pricePerBag: number;
  pricePerKg: number;
  /** Variación respecto a la compra anterior (€/saco), null en la primera. */
  deltaPerBag: number | null;
}

export function priceEvolution(data: AppData): PricePoint[] {
  let prev: number | null = null;
  return purchases(data).map((p) => {
    const pt: PricePoint = {
      id: p.id,
      date: p.date,
      brand: p.brand,
      pricePerBag: p.pricePerBag,
      pricePerKg: p.pricePerBag / p.bagWeightKg,
      deltaPerBag: prev === null ? null : p.pricePerBag - prev,
    };
    prev = p.pricePerBag;
    return pt;
  });
}

export function spendBySupplierOrBrand(data: AppData): { name: string; spent: number }[] {
  const map = new Map<string, number>();
  for (const p of purchases(data)) {
    const name = [p.brand, p.supplier].filter(Boolean).join(' · ') || 'Sin marca';
    map.set(name, (map.get(name) ?? 0) + p.totalCost);
  }
  return [...map.entries()].map(([name, spent]) => ({ name, spent })).sort((a, b) => b.spent - a.spent);
}

/* ───────────── Consumo ───────────── */

export interface ConsumptionPeriod {
  id: string;
  start: string;
  end: string;
  kg: number;
  source: 'manual' | 'inventario';
  detail: string;
}

export interface InventoryMethodResult {
  periods: ConsumptionPeriod[];
  /** Explicaciones de por qué no se pudo calcular (para mostrar al usuario). */
  blockers: string[];
}

/** Kg introducidos en una recarga, o null si no se conoce. */
export function refillKg(r: RefillRecord, settings: Settings): number | null {
  if (r.kg != null) return r.kg;
  if (r.bags != null) return r.bags * settings.bagWeightKg;
  return null;
}

/**
 * Método por inventario: entre dos lecturas de nivel exactas (no aproximadas),
 * consumo = (nivel inicial − nivel final) × capacidad + kg recargados entre ambas.
 * Solo se calcula si la capacidad está configurada y todas las recargas intermedias tienen cantidad.
 */
export function inventoryMethod(data: AppData): InventoryMethodResult {
  const cap = data.settings.hopperCapacityKg;
  const sorted = sortRecords(data.records);
  const exact = sorted.filter((r): r is LevelRecord => r.kind === 'level' && !r.approximate);
  const blockers: string[] = [];
  if (!cap) blockers.push('Configura la capacidad de la tolva en kg.');
  if (exact.length < 2)
    blockers.push(
      exact.length === 0
        ? 'Registra dos lecturas de nivel en porcentaje (no estimaciones lleno/medio/bajo).'
        : 'Falta una segunda lectura de nivel en porcentaje para cerrar el periodo.',
    );
  if (!cap || exact.length < 2) return { periods: [], blockers };

  const periods: ConsumptionPeriod[] = [];
  for (let i = 1; i < exact.length; i++) {
    const a = exact[i - 1];
    const b = exact[i];
    const ia = sorted.indexOf(a);
    const ib = sorted.indexOf(b);
    const refills = sorted.slice(ia + 1, ib).filter((r): r is RefillRecord => r.kind === 'refill');
    const kgs = refills.map((r) => refillKg(r, data.settings));
    if (kgs.some((k) => k === null)) {
      blockers.push(
        `Entre el ${a.date} y el ${b.date} hay una recarga sin cantidad: no se calcula el consumo de ese periodo.`,
      );
      continue;
    }
    const refilled = (kgs as number[]).reduce((s, k) => s + k, 0);
    const kg = ((a.percent - b.percent) / 100) * cap + refilled;
    if (kg < -0.5) {
      blockers.push(`Entre el ${a.date} y el ${b.date} el nivel subió más que lo recargado: revisa las lecturas.`);
      continue;
    }
    if (a.date === b.date && kg < 0.5) continue;
    periods.push({
      id: `inv-${a.id}-${b.id}`,
      start: a.date,
      end: b.date,
      kg: Math.max(0, kg),
      source: 'inventario',
      detail: `${a.percent} % → ${b.percent} %${refilled ? ` con ${refilled} kg recargados` : ''}`,
    });
  }
  return { periods, blockers };
}

export function manualPeriods(data: AppData): ConsumptionPeriod[] {
  return sortRecords(data.records.filter((r): r is ConsumptionRecord => r.kind === 'consumption')).map((r) => ({
    id: r.id,
    start: r.date,
    end: r.endDate || r.date,
    kg: r.kg,
    source: 'manual',
    detail: r.notes,
  }));
}

const overlaps = (a: ConsumptionPeriod, b: ConsumptionPeriod) => a.start <= b.end && b.start <= a.end;

/** Periodos de consumo confirmados. Los manuales tienen prioridad sobre los calculados que se solapan. */
export function consumptionPeriods(data: AppData): ConsumptionPeriod[] {
  const manual = manualPeriods(data);
  const inv = inventoryMethod(data).periods.filter((p) => !manual.some((m) => overlaps(m, p)));
  return [...manual, ...inv].sort((a, b) => (a.start < b.start ? -1 : 1));
}

/**
 * Reparte cada periodo uniformemente entre sus días.
 * Para periodos por inventario (lectura a lectura) el día de inicio no se cuenta: el consumo ocurre después.
 */
export function dailyConsumption(data: AppData): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of consumptionPeriods(data)) {
    const first = p.source === 'inventario' && p.end > p.start ? addDays(p.start, 1) : p.start;
    const days = diffDays(first, p.end) + 1;
    for (let i = 0; i < days; i++) {
      const d = addDays(first, i);
      map.set(d, (map.get(d) ?? 0) + p.kg / days);
    }
  }
  return map;
}

export interface ConsumptionStats {
  totalKg: number;
  coveredDays: number;
  avgDailyKg: number | null;
  avgWeeklyKg: number | null;
  /** €/kg usado para valorar el consumo. */
  pricePerKg: number | null;
  avgDailyCost: number | null;
  byMonth: { month: string; kg: number; cost: number | null }[];
  byWeek: { week: string; kg: number; days: number }[];
  seasonKg: number;
  currentMonthKg: number | null;
  firstDay: string | null;
  lastDay: string | null;
}

/** Mínimo de días con datos para considerar fiables medias y autonomía. */
export const MIN_DAYS_FOR_AVERAGE = 3;

export function consumptionStats(data: AppData, today = todayIso()): ConsumptionStats {
  const daily = dailyConsumption(data);
  const days = [...daily.keys()].sort();
  const totalKg = [...daily.values()].reduce((s, v) => s + v, 0);
  const coveredDays = days.length;
  const pricePerKg = effectivePricePerKg(data);
  const enough = coveredDays >= MIN_DAYS_FOR_AVERAGE && totalKg > 0;
  const avgDailyKg = enough ? totalKg / coveredDays : null;

  const mMap = new Map<string, number>();
  const wMap = new Map<string, number>();
  const wDays = new Map<string, number>();
  let seasonKg = 0;
  for (const [d, kg] of daily) {
    mMap.set(monthKey(d), (mMap.get(monthKey(d)) ?? 0) + kg);
    wMap.set(weekStart(d), (wMap.get(weekStart(d)) ?? 0) + kg);
    wDays.set(weekStart(d), (wDays.get(weekStart(d)) ?? 0) + 1);
    if (d >= data.settings.seasonStart && d <= data.settings.seasonEnd) seasonKg += kg;
  }
  const byMonth = days.length
    ? monthRange(monthKey(days[0]), monthKey(days.at(-1)!)).map((m) => ({
        month: m,
        kg: mMap.get(m) ?? 0,
        cost: pricePerKg != null ? (mMap.get(m) ?? 0) * pricePerKg : null,
      }))
    : [];
  const byWeek = [...wMap.entries()].sort().map(([week, kg]) => ({ week, kg, days: wDays.get(week)! }));
  const cm = monthKey(today);
  return {
    totalKg,
    coveredDays,
    avgDailyKg,
    avgWeeklyKg: avgDailyKg != null ? avgDailyKg * 7 : null,
    pricePerKg,
    avgDailyCost: avgDailyKg != null && pricePerKg != null ? avgDailyKg * pricePerKg : null,
    byMonth,
    byWeek,
    seasonKg,
    currentMonthKg: mMap.has(cm) ? mMap.get(cm)! : null,
    firstDay: days[0] ?? null,
    lastDay: days.at(-1) ?? null,
  };
}

/* ───────────── Autonomía y proyección ───────────── */

export interface Autonomy {
  days: number;
  availableKg: number;
  includesHopper: boolean;
  hopperApproximate: boolean;
  runOutDate: string;
}

export function autonomy(data: AppData, today = todayIso()): Autonomy | null {
  const stats = consumptionStats(statsData(data), today);
  if (stats.avgDailyKg == null) return null;
  const stock = storedStock(data);
  const hopper = hopperEstimate(data);
  const hopperKg = hopper?.kg ?? 0;
  const availableKg = stock.kg + hopperKg;
  const days = availableKg / stats.avgDailyKg;
  return {
    days,
    availableKg,
    includesHopper: hopper?.kg != null,
    hopperApproximate: hopper?.approximate ?? false,
    runOutDate: addDays(today, Math.floor(days)),
  };
}

export interface SeasonProjection {
  remainingDays: number;
  projectedKg: number;
  projectedCost: number;
  spentSoFar: number;
  /** kg que habría que comprar además de lo disponible. */
  bagsToBuy: number;
  monthly: { month: string; realSpent: number; projectedSpent: number }[];
}

export function seasonProjection(data: AppData, today = todayIso()): SeasonProjection | null {
  const sdata = statsData(data);
  const stats = consumptionStats(sdata, today);
  const { seasonStart, seasonEnd, bagWeightKg } = data.settings;
  if (stats.avgDailyKg == null || stats.pricePerKg == null) return null;
  const from = maxIso(today, seasonStart);
  if (from > seasonEnd) return null;
  const remainingDays = diffDays(from, seasonEnd) + 1;
  const projectedKg = remainingDays * stats.avgDailyKg;
  const projectedCost = projectedKg * stats.pricePerKg;
  const spentSoFar = purchaseSummary(sdata, (p) => p.date >= seasonStart && p.date <= seasonEnd).totalSpent;
  const av = autonomy(data, today);
  const missingKg = Math.max(0, projectedKg - (av?.availableKg ?? 0));
  const realByMonth = new Map(spendByMonth(sdata).map((m) => [m.month, m.spent]));
  const monthly = monthRange(monthKey(seasonStart), monthKey(seasonEnd)).map((m) => {
    // Días proyectados dentro de este mes
    let projDays = 0;
    for (let i = 0; i < remainingDays; i++) if (monthKey(addDays(from, i)) === m) projDays++;
    return {
      month: m,
      realSpent: realByMonth.get(m) ?? 0,
      projectedSpent: projDays * stats.avgDailyKg! * stats.pricePerKg!,
    };
  });
  return {
    remainingDays,
    projectedKg,
    projectedCost,
    spentSoFar,
    bagsToBuy: Math.ceil(missingKg / bagWeightKg),
    monthly,
  };
}

function maxIso(a: string, b: string) {
  return a > b ? a : b;
}

/* ───────────── Contador de consumo del mes ───────────── */

/**
 * Consumo del mes que muestra Inicio. Si se fijó o se puso a 0 este mes, vale ese número más los consumos
 * registrados después (las estadísticas siguen usando todos los datos reales).
 */
export function monthConsumption(all: AppData, today = todayIso()): { kg: number | null; since: string | null } {
  const data = statsData(all);
  const month = monthKey(today);
  const c = sortRecords(
    data.records.filter((r): r is CounterRecord => r.kind === 'counter' && r.metric === 'consumption' && monthKey(r.date) === month),
  ).at(-1);
  if (!c) return { kg: consumptionStats(data, today).currentMonthKg, since: null };
  return { kg: (c.value ?? 0) + consumedAfter(data, c, month), since: c.date };
}

/** kg consumidos registrados después de un ajuste (opcionalmente solo la parte de un mes). */
function consumedAfter(data: AppData, c: CounterRecord, month?: string): number {
  const createdAt = new Map(data.records.map((r) => [r.id, r.createdAt]));
  let kg = 0;
  for (const p of consumptionPeriods(data)) {
    const after = p.source === 'manual' ? (createdAt.get(p.id) ?? 0) > c.createdAt : p.end > c.date;
    if (!after) continue;
    if (!month) {
      kg += p.kg;
      continue;
    }
    const first = p.source === 'inventario' && p.end > p.start ? addDays(p.start, 1) : p.start;
    const days = diffDays(first, p.end) + 1;
    let inMonth = 0;
    for (let i = 0; i < days; i++) if (monthKey(addDays(first, i)) === month) inMonth++;
    kg += (p.kg * inMonth) / days;
  }
  return kg;
}

/**
 * «Consumido» de Inventario: total real o, si se fijó o se puso a 0, ese número más lo consumido después.
 */
export function consumedTotal(all: AppData, today = todayIso()): { kg: number; days: number; since: string | null } {
  const data = statsData(all);
  const stats = consumptionStats(data, today);
  const c = sortRecords(data.records.filter((r): r is CounterRecord => r.kind === 'counter' && r.metric === 'consumed')).at(-1);
  if (!c) return { kg: stats.totalKg, days: stats.coveredDays, since: null };
  return { kg: (c.value ?? 0) + consumedAfter(data, c), days: stats.coveredDays, since: c.date };
}

/* ───────────── Reinicio de estadísticas ───────────── */

/** Último reinicio de estadísticas (null si nunca se reinició). */
export function statsReset(data: AppData): CounterRecord | null {
  return sortRecords(data.records.filter((r): r is CounterRecord => r.kind === 'counter' && r.metric === 'stats')).at(-1) ?? null;
}

/** Registros que no son estadística y se conservan siempre (existencias, tolva, precio fijado). */
const ALWAYS: PelletRecord['kind'][] = ['inventory', 'adjustment', 'level'];

/**
 * Datos para estadísticas: si se reiniciaron, solo cuenta lo posterior al reinicio
 * (mismo día: lo registrado después de pulsar el botón). El stock y la tolva usan siempre todos los datos.
 */
export function statsData(data: AppData): AppData {
  const reset = statsReset(data);
  if (!reset) return data;
  const after = (r: PelletRecord) => r.date > reset.date || (r.date === reset.date && r.createdAt > reset.createdAt);
  return {
    ...data,
    records: data.records.filter(
      (r) => ALWAYS.includes(r.kind) || (r.kind === 'counter' && r.metric === 'price') || (r.kind === 'counter' && r.metric === 'stats') || after(r),
    ),
  };
}

/* ───────────── Recargas de la tolva ───────────── */

export interface RefillStats {
  count: number;
  /** Recargas sin cantidad anotada. */
  unknown: number;
  bags: number;
  kg: number;
  avgBagsPerRefill: number | null;
  /** Días medios entre recargas (null con menos de 2). */
  avgDaysBetween: number | null;
  last: string | null;
  byWeek: { week: string; bags: number }[];
  byMonth: { month: string; bags: number; kg: number }[];
}

export function refillStats(data: AppData): RefillStats {
  const list = sortRecords(data.records.filter((r): r is RefillRecord => r.kind === 'refill'));
  let bags = 0;
  let kg = 0;
  let unknown = 0;
  const w = new Map<string, number>();
  const m = new Map<string, { bags: number; kg: number }>();
  for (const r of list) {
    const k = refillKg(r, data.settings);
    const b = r.bags ?? (r.kg != null ? r.kg / data.settings.bagWeightKg : null);
    if (b == null || k == null) {
      unknown++;
      continue;
    }
    bags += b;
    kg += k;
    w.set(weekStart(r.date), (w.get(weekStart(r.date)) ?? 0) + b);
    const cur = m.get(monthKey(r.date)) ?? { bags: 0, kg: 0 };
    cur.bags += b;
    cur.kg += k;
    m.set(monthKey(r.date), cur);
  }
  const dates = [...new Set(list.map((r) => r.date))].sort();
  const known = list.length - unknown;
  return {
    count: list.length,
    unknown,
    bags,
    kg,
    avgBagsPerRefill: known ? bags / known : null,
    avgDaysBetween: dates.length >= 2 ? diffDays(dates[0], dates.at(-1)!) / (dates.length - 1) : null,
    last: list.at(-1)?.date ?? null,
    byWeek: [...w.entries()].sort().map(([week, b]) => ({ week, bags: b })),
    byMonth: [...m.entries()].sort().map(([month, v]) => ({ month, ...v })),
  };
}
