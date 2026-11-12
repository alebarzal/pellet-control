import { describe, expect, it } from 'vitest';
import { sampleData as createSeedData } from '../test/fixtures';
import {
  autonomy,
  consumptionStats,
  hopperEstimate,
  inventoryMethod,
  purchaseSummary,
  seasonProjection,
  spendCounter,
  seasonSpend,
  effectivePricePerBag,
  effectivePricePerKg,
  monthConsumption,
  consumedTotal,
  statsData,
  refillStats,
  storedStock,
} from './calc';
import type { AppData, NewRecord, PelletRecord } from './types';

const T = '2026-11-09';
let n = 1e13;
const add = (d: AppData, r: NewRecord): AppData => ({
  ...d,
  records: [...d.records, { ...r, id: `t${n}`, createdAt: n++ } as PelletRecord],
});

describe('datos iniciales', () => {
  const d = createSeedData();
  it('stock almacenado = 6 sacos / 90 kg', () => {
    const s = storedStock(d);
    expect(s.bags).toBe(6);
    expect(s.kg).toBe(90);
    expect(s.wentNegative).toBe(false);
  });
  it('gasto y precio medio', () => {
    const p = purchaseSummary(d);
    expect(p.totalSpent).toBeCloseTo(39.6);
    expect(p.avgPricePerBag).toBeCloseTo(4.95);
    expect(p.avgPricePerKg).toBeCloseTo(0.33);
  });
  it('no inventa consumo', () => {
    const c = consumptionStats(d, T);
    expect(c.totalKg).toBe(0);
    expect(c.avgDailyKg).toBeNull();
    expect(c.currentMonthKg).toBeNull();
    expect(autonomy(d, T)).toBeNull();
    expect(seasonProjection(d, T)).toBeNull();
    expect(inventoryMethod(d).periods).toHaveLength(0);
  });
  it('tolva media aproximada', () => {
    const h = hopperEstimate(d)!;
    expect(h.category).toBe('medio');
    expect(h.approximate).toBe(true);
    expect(h.kg).toBe(120);
  });
});

describe('movimientos', () => {
  it('compra suma, recarga resta, ajuste corrige', () => {
    let d = createSeedData();
    d = add(d, { kind: 'purchase', date: '2026-11-10', brand: 'X', supplier: '', bags: 10, pricePerBag: 5.5, totalCost: 55, bagWeightKg: 15, notes: '' });
    d = add(d, { kind: 'refill', date: '2026-11-11', bags: 3, kg: null, notes: '' });
    d = add(d, { kind: 'adjustment', date: '2026-11-12', bagsDelta: -1, kg: null, notes: 'roto' });
    expect(storedStock(d).bags).toBe(12);
    const p = purchaseSummary(d);
    expect(p.totalSpent).toBeCloseTo(94.6);
    expect(p.avgPricePerBag).toBeCloseTo(94.6 / 18);
  });
  it('recarga no genera consumo', () => {
    let d = createSeedData();
    d = add(d, { kind: 'refill', date: '2026-11-11', bags: 2, kg: null, notes: '' });
    expect(consumptionStats(d, T).totalKg).toBe(0);
  });
});

describe('contador de gasto', () => {
  it('sin ajustes es el total de compras', () => {
    expect(spendCounter(createSeedData()).amount).toBeCloseTo(39.6);
    expect(spendCounter(createSeedData()).since).toBeNull();
    expect(spendCounter(createSeedData()).bags).toBe(8);
  });
  it('a cero y luego suma solo las compras posteriores, sin tocar estadísticas', () => {
    let d = createSeedData();
    d = add(d, { kind: 'spend', date: '2026-11-09', amount: 0, notes: '' });
    expect(spendCounter(d).amount).toBe(0);
    d = add(d, { kind: 'purchase', date: '2026-11-10', brand: 'X', supplier: '', bags: 2, pricePerBag: 5, totalCost: 10, bagWeightKg: 15, notes: '' });
    expect(spendCounter(d).amount).toBe(10);
    expect(spendCounter(d).bags).toBe(2);
    expect(purchaseSummary(d).totalSpent).toBeCloseTo(49.6);
    expect(storedStock(d).bags).toBe(8);
  });
  it('fijado a mano', () => {
    const d = add(createSeedData(), { kind: 'spend', date: '2026-11-09', amount: 120, notes: '' });
    expect(spendCounter(d)).toEqual({ amount: 120, since: '2026-11-09', bags: null });
  });
  it('fijado a mano con sacos: las compras nuevas suman sacos', () => {
    let d = add(createSeedData(), { kind: 'spend', date: '2026-11-09', amount: 59.4, bags: 12, notes: '' });
    d = add(d, { kind: 'purchase', date: '2026-11-10', brand: 'X', supplier: '', bags: 3, pricePerBag: 5, totalCost: 15, bagWeightKg: 15, notes: '' });
    expect(spendCounter(d)).toEqual({ amount: 74.4, since: '2026-11-09', bags: 15 });
  });
});

describe('indicadores ajustables de Inicio', () => {
  it('al poner el gasto a 0, «Esta temporada» también vuelve a 0', () => {
    let d = createSeedData();
    expect(seasonSpend(d).amount).toBeCloseTo(39.6);
    d = add(d, { kind: 'spend', date: '2026-11-09', amount: 0, notes: '' });
    expect(seasonSpend(d)).toEqual({ amount: 0, since: '2026-11-09' });
    expect(purchaseSummary(d).totalSpent).toBeCloseTo(39.6); // las estadísticas no cambian
  });
  it('el precio fijado a mano se usa en los costes y se puede volver al calculado', () => {
    let d = createSeedData();
    d = add(d, { kind: 'consumption', date: '2026-11-01', endDate: '2026-11-10', kg: 150, bags: null, notes: '' });
    d = add(d, { kind: 'counter', metric: 'price', date: '2026-11-09', value: 5.95, notes: '' });
    expect(effectivePricePerBag(d)).toEqual({ value: 5.95, manual: true, calculated: 4.95 });
    expect(consumptionStats(d, '2026-11-10').avgDailyCost).toBeCloseTo(15 * (5.95 / 15));
    d = add(d, { kind: 'counter', metric: 'price', date: '2026-11-09', value: null, notes: '' });
    expect(effectivePricePerBag(d).manual).toBe(false);
    expect(effectivePricePerKg(d)).toBeCloseTo(0.33);
  });
  it('el consumido total de Inventario se pone a 0 o se fija, y suma lo registrado después', () => {
    let d = createSeedData();
    d = add(d, { kind: 'consumption', date: '2026-10-25', endDate: '2026-11-08', kg: 75, bags: null, notes: '' });
    expect(consumedTotal(d, '2026-11-09')).toMatchObject({ kg: 75, since: null });
    d = add(d, { kind: 'counter', metric: 'consumed', date: '2026-11-09', value: 0, notes: '' });
    expect(consumedTotal(d, '2026-11-09')).toMatchObject({ kg: 0, since: '2026-11-09' });
    d = add(d, { kind: 'consumption', date: '2026-11-09', endDate: '2026-11-09', kg: 15, bags: null, notes: '' });
    expect(consumedTotal(d, '2026-11-09').kg).toBeCloseTo(15);
    d = add(d, { kind: 'counter', metric: 'consumed', date: '2026-11-09', value: 60, notes: '' });
    expect(consumedTotal(d, '2026-11-09').kg).toBeCloseTo(60);
    expect(consumptionStats(d, '2026-11-09').totalKg).toBeCloseTo(90); // datos reales intactos
  });
  it('el consumo del mes se pone a 0 y suma solo lo registrado después', () => {
    let d = createSeedData();
    d = add(d, { kind: 'consumption', date: '2026-11-02', endDate: '2026-11-08', kg: 36, bags: null, notes: '' });
    expect(monthConsumption(d, '2026-11-09').kg).toBeCloseTo(36);
    d = add(d, { kind: 'counter', metric: 'consumption', date: '2026-11-09', value: 0, notes: '' });
    expect(monthConsumption(d, '2026-11-09')).toEqual({ kg: 0, since: '2026-11-09' });
    d = add(d, { kind: 'consumption', date: '2026-11-09', endDate: '2026-11-09', kg: 12, bags: null, notes: '' });
    expect(monthConsumption(d, '2026-11-09').kg).toBeCloseTo(12);
    expect(consumptionStats(d, '2026-11-09').totalKg).toBeCloseTo(48); // las estadísticas no cambian
    // El mes siguiente vuelve a contar normal
    expect(monthConsumption(d, '2026-12-05').since).toBeNull();
  });
});

describe('reinicio de estadísticas y recargas', () => {
  it('tras reiniciar, las estadísticas empiezan de cero pero el stock no cambia', () => {
    let d = createSeedData();
    d = add(d, { kind: 'consumption', date: '2026-11-01', endDate: '2026-11-08', kg: 80, bags: null, notes: '' });
    d = add(d, { kind: 'refill', date: '2026-11-05', bags: 2, kg: null, notes: '' });
    d = add(d, { kind: 'counter', metric: 'stats', date: '2026-11-09', value: null, notes: '' });
    const s = statsData(d);
    expect(purchaseSummary(s).totalSpent).toBe(0);
    expect(consumptionStats(s, '2026-11-09').totalKg).toBe(0);
    expect(refillStats(s).count).toBe(0);
    expect(storedStock(d).bags).toBe(6); // el stock usa todos los datos: manda el recuento del día 9
    // Lo registrado después del reinicio, aunque sea el mismo día, sí cuenta
    d = add(d, { kind: 'purchase', date: '2026-11-09', brand: 'X', supplier: '', bags: 3, pricePerBag: 5, totalCost: 15, bagWeightKg: 15, notes: '' });
    d = add(d, { kind: 'refill', date: '2026-11-09', bags: 1, kg: null, notes: '' });
    const s2 = statsData(d);
    expect(purchaseSummary(s2).totalSpent).toBe(15);
    expect(refillStats(s2).bags).toBe(1);
  });
  it('acumulado de recargas', () => {
    let d = createSeedData(); // trae 1 recarga sin cantidad
    d = add(d, { kind: 'refill', date: '2026-11-10', bags: 3, kg: null, notes: '' });
    d = add(d, { kind: 'refill', date: '2026-11-14', bags: 2, kg: null, notes: '' });
    d = add(d, { kind: 'refill', date: '2026-11-18', bags: null, kg: 30, notes: '' });
    const r = refillStats(d);
    expect(r.count).toBe(4);
    expect(r.unknown).toBe(1);
    expect(r.bags).toBe(7);
    expect(r.kg).toBe(105);
    expect(r.avgBagsPerRefill).toBeCloseTo(7 / 3);
    expect(r.avgDaysBetween).toBeCloseTo(3); // 9 → 18 nov en 3 intervalos
    expect(r.last).toBe('2026-11-18');
    expect(r.byMonth).toEqual([{ month: '2026-11', bags: 7, kg: 105 }]);
  });
});

describe('consumo', () => {
  it('manual por periodo', () => {
    let d = createSeedData();
    d = add(d, { kind: 'consumption', date: '2026-11-01', endDate: '2026-11-10', kg: 100, bags: null, notes: '' });
    const c = consumptionStats(d, '2026-11-10');
    expect(c.coveredDays).toBe(10);
    expect(c.avgDailyKg).toBeCloseTo(10);
    expect(c.currentMonthKg).toBeCloseTo(100);
    expect(c.avgDailyCost).toBeCloseTo(3.3);
    const a = autonomy(d, '2026-11-10')!;
    expect(a.availableKg).toBeCloseTo(90 + 120);
    expect(a.days).toBeCloseTo(21);
  });
  it('por inventario con lecturas exactas y recarga conocida', () => {
    let d = createSeedData();
    d = add(d, { kind: 'level', date: '2026-11-10', percent: 80, approximate: false, notes: '' });
    d = add(d, { kind: 'refill', date: '2026-11-12', bags: 2, kg: null, notes: '' });
    d = add(d, { kind: 'level', date: '2026-11-15', percent: 60, approximate: false, notes: '' });
    const r = inventoryMethod(d);
    expect(r.periods).toHaveLength(1);
    // (80-60)% de 240 = 48 kg + 30 kg recargados
    expect(r.periods[0].kg).toBeCloseTo(78);
  });
  it('no calcula si la recarga intermedia no tiene cantidad', () => {
    let d = createSeedData();
    d = add(d, { kind: 'level', date: '2026-11-10', percent: 80, approximate: false, notes: '' });
    d = add(d, { kind: 'refill', date: '2026-11-12', bags: null, kg: null, notes: '' });
    d = add(d, { kind: 'level', date: '2026-11-15', percent: 60, approximate: false, notes: '' });
    const r = inventoryMethod(d);
    expect(r.periods).toHaveLength(0);
    expect(r.blockers.length).toBeGreaterThan(0);
  });
  it('sin capacidad no calcula', () => {
    let d = createSeedData();
    d.settings.hopperCapacityKg = null;
    d = add(d, { kind: 'level', date: '2026-11-10', percent: 80, approximate: false, notes: '' });
    d = add(d, { kind: 'level', date: '2026-11-15', percent: 60, approximate: false, notes: '' });
    expect(inventoryMethod(d).periods).toHaveLength(0);
  });
  it('proyección de temporada', () => {
    let d = createSeedData();
    d = add(d, { kind: 'consumption', date: '2026-11-01', endDate: '2026-11-10', kg: 100, bags: null, notes: '' });
    const p = seasonProjection(d, '2026-11-10')!;
    expect(p.remainingDays).toBe(172);
    expect(p.projectedKg).toBeCloseTo(1720);
    expect(p.projectedCost).toBeCloseTo(1720 * 0.33);
  });
});
