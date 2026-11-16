import { describe, expect, it } from 'vitest';
import { sampleData } from '../test/fixtures';
import { burnRate, hopperEstimate, hopperModel, photoCheck, photoCheckPlan } from './hopperModel';
import type { AppData, PelletRecord, PlugReading } from './types';

const t = (day: number, h = 0, m = 0) => new Date(2026, 10, day, h, m).getTime();
const iso = (day: number) => `2026-11-${String(day).padStart(2, '0')}`;

/** Enchufe midiendo cada 15 min; el quemador funciona de 6 a 9 y de 18 a 21 (6 h al día). */
function plug(fromDay: number, toDay: number): PlugReading[] {
  const out: PlugReading[] = [];
  for (let x = t(fromDay); x < t(toDay, 23, 59); x += 15 * 60_000) {
    const h = new Date(x).getHours();
    out.push({ at: new Date(x).toISOString(), watts: (h >= 6 && h < 9) || (h >= 18 && h < 21) ? 120 : 4 });
  }
  return out;
}

let n = 0;
const rec = (r: Record<string, unknown>, at: number) => ({ notes: '', ...r, id: `h${++n}`, createdAt: at }) as unknown as PelletRecord;
const level = (day: number, h: number, percent: number, approximate = false) => rec({ kind: 'level', date: iso(day), percent, approximate }, t(day, h));

/** Tolva de 240 kg, sin lecturas de nivel ni consumos apuntados. */
function base(withPlug: boolean): AppData {
  const d = sampleData();
  return {
    ...d,
    settings: { ...d.settings, hopperCapacityKg: 240, bagWeightKg: 15, climate: { ...d.settings.climate, plugId: withPlug ? 'p' : null, plugThresholdW: 30, kgPerBurnerHour: null } },
    records: d.records.filter((r) => r.kind !== 'level' && r.kind !== 'consumption' && r.kind !== 'refill'),
    climate: { ...d.climate, plug: withPlug ? plug(1, 6) : [] },
  };
}

describe('nivel de la tolva calculado', () => {
  it('saca los kg por hora de quemador de dos lecturas seguidas', () => {
    const d = base(true);
    // 80 % → 65 % en dos días: 36 kg en 12 h de quemador.
    d.records.push(level(2, 8, 80), level(4, 8, 65));
    const r = burnRate(d, t(5, 8))!;
    expect(r.source).toBe('lecturas');
    expect(r.kgPerHour).toBeCloseTo(3, 1);
    expect(r.samples).toBe(1);
  });

  it('descuenta lo quemado desde la última lectura', () => {
    const d = base(true);
    d.records.push(level(2, 8, 80), level(4, 8, 65));
    const m = hopperModel(d, t(5, 8))!;
    // Un día más: 6 h de quemador × 3 kg/h = 18 kg menos que los 156 kg de la lectura.
    expect(m.method).toBe('quemador');
    expect(m.burnerHours).toBeCloseTo(6, 1);
    expect(m.burnedKg).toBeCloseTo(18, 0);
    expect(m.kg).toBeCloseTo(138, 0);
    expect(m.percent).toBeCloseTo(57.5, 0);
    expect(m.coverage).toBeGreaterThan(0.95);
    const h = hopperEstimate(d, t(5, 8))!;
    expect(h.live).toBe(true);
    expect(h.approximate).toBe(true);
    expect(h.percent).toBeCloseTo(57.5, 0);
    expect(h.date).toBe(iso(4));
  });

  it('pide una foto cuando el cálculo ha bajado 20 puntos desde la última lectura', () => {
    const d = base(true);
    d.records.push(level(2, 8, 80), level(3, 8, 72.5));
    // Un día después: 7,5 puntos. Todavía no.
    const soon = photoCheck(hopperModel(d, t(4, 8)))!;
    expect(soon.due).toBe(false);
    expect(soon.from).toBeCloseTo(72.5, 0);
    expect(soon.drop).toBeCloseTo(7.5, 0);
    // Más de tres días después: unas 21 h de quemador, más de 60 kg y de 20 puntos.
    const m = hopperModel(d, t(6, 22))!;
    const late = photoCheck(m)!;
    expect(late.due).toBe(true);
    expect(late.from).toBeCloseTo(72.5, 0);
    expect(late.drop).toBeGreaterThan(24);
    expect(late.drop).toBeLessThan(29);
    expect(late.to).toBeCloseTo(late.from - late.drop, 5);
    // «Ahora no»: calla hasta que baje 10 puntos más, y solo para esa misma lectura.
    expect(photoCheck(m, { anchorAt: m.anchor.at, percent: m.percent })!.due).toBe(false);
    expect(photoCheck(m, { anchorAt: m.anchor.at, percent: m.percent + 11 })!.due).toBe(true);
    expect(photoCheck(m, { anchorAt: m.anchor.at - 1, percent: m.percent })!.due).toBe(true);
    // Una lectura nueva lo deja a cero.
    d.records.push(level(6, 22, 44));
    expect(photoCheck(hopperModel(d, t(6, 23)))!.due).toBe(false);
  });

  it('calcula cuánto falta por quemar para avisar con la app cerrada', () => {
    const d = base(true);
    d.records.push(level(2, 8, 80), level(3, 8, 72.5));
    // Un día después: de 72,5 % a 65 %. Salta al llegar a 52,5 %: faltan 12,5 puntos = 30 kg.
    const m1 = hopperModel(d, t(4, 8))!;
    const plan = photoCheckPlan(m1)!;
    expect(plan.targetPercent).toBeCloseTo(52.5, 0);
    expect(plan.remainingKg).toBeCloseTo(30, 0);
    expect(plan.kgPerHour).toBeCloseTo(3, 1);
    expect(plan.kgPerDay).toBeGreaterThan(0);
    expect(plan.key).toBe(`${m1.anchor.at}:${Math.round(plan.targetPercent)}`);
    // Cuando ya toca, el aviso está a la vista en la app: nada que vigilar.
    const m2 = hopperModel(d, t(6, 22))!;
    expect(photoCheckPlan(m2)).toBeNull();
    // Tras «ahora no», vigila los 10 puntos siguientes (24 kg).
    const again = photoCheckPlan(m2, { anchorAt: m2.anchor.at, percent: m2.percent })!;
    expect(again.remainingKg).toBeCloseTo(24, 0);
    expect(again.targetPercent).toBeCloseTo(m2.percent - 10, 5);
    expect(again.key).not.toBe(plan.key);
    // Sin datos de quemado no hay plan.
    const e = base(false);
    e.records.push(level(2, 8, 80));
    expect(photoCheckPlan(hopperModel(e, t(9, 8)))).toBeNull();
  });

  it('sin datos de quemado no pide foto', () => {
    const d = base(false);
    d.records.push(level(2, 8, 80));
    expect(photoCheck(hopperModel(d, t(9, 8)))).toBeNull();
  });

  it('prevé cuándo se vacía y dibuja el recorrido', () => {
    const d = base(true);
    d.records.push(level(2, 8, 80), level(4, 8, 65));
    const m = hopperModel(d, t(5, 8))!;
    // 18 kg al día: los 138 kg duran algo más de 7 días.
    expect(m.dailyKg).toBeCloseTo(18, 0);
    const days = (m.emptyAt! - t(5, 8)) / 86_400_000;
    expect(days).toBeGreaterThan(7);
    expect(days).toBeLessThan(8.5);
    expect(m.track[0].percent).toBe(65);
    expect(m.track.at(-1)!.percent).toBe(0);
    expect(m.track.some((p) => p.future)).toBe(true);
    for (const p of m.track) expect(p.low).toBeLessThanOrEqual(p.high);
  });

  it('suma las recargas posteriores a la lectura sin pasar de la capacidad', () => {
    const d = base(true);
    d.records.push(level(2, 8, 80), level(4, 8, 65), rec({ kind: 'refill', date: iso(4), bags: 2, kg: null }, t(4, 9)));
    const m = hopperModel(d, t(5, 8))!;
    expect(m.refilledKg).toBe(30);
    // 156 + 30 − lo quemado en el día (18 kg).
    expect(m.kg).toBeCloseTo(168, 0);
    const lleno = base(true);
    lleno.records.push(level(2, 8, 80), level(4, 8, 95), rec({ kind: 'refill', date: iso(4), bags: 4, kg: null }, t(4, 8, 5)));
    expect(hopperModel(lleno, t(4, 8, 10))!.kg).toBeLessThanOrEqual(240);
  });

  it('compara cada lectura con lo que decía el cálculo', () => {
    const d = base(true);
    // Tercera lectura un día después: el cálculo decía 57,5 % y se mide 55 %.
    d.records.push(level(2, 8, 80), level(4, 8, 65), level(5, 8, 55));
    const m = hopperModel(d, t(5, 9))!;
    const last = m.checks[0];
    expect(last.percent).toBe(55);
    expect(last.predicted).not.toBeNull();
    expect(Math.abs(last.predicted! - 55)).toBeLessThan(6);
    expect(m.meanError).not.toBeNull();
  });

  it('sin enchufe usa el consumo medio diario', () => {
    const d = base(false);
    d.records.push(rec({ kind: 'consumption', date: iso(1), endDate: iso(10), kg: 100, bags: null }, t(10, 20)), level(11, 12, 50));
    const m = hopperModel(d, t(13, 12))!;
    expect(m.method).toBe('media');
    // 10 kg/día durante dos días.
    expect(m.kg).toBeCloseTo(100, 0);
    expect(m.marginKg).toBeGreaterThan(0);
  });

  it('sin datos de quemado no se inventa nada: vale la última lectura', () => {
    const d = base(false);
    d.records.push(level(4, 8, 65));
    const h = hopperEstimate(d, t(9, 8))!;
    expect(h.live).toBe(false);
    expect(h.percent).toBe(65);
    expect(h.approximate).toBe(false);
    expect(h.model!.method).toBe('lectura');
    expect(h.model!.emptyAt).toBeNull();
  });

  it('los kg por hora puestos a mano mandan', () => {
    const d = base(true);
    d.settings.climate.kgPerBurnerHour = 2;
    d.records.push(level(4, 8, 65));
    const m = hopperModel(d, t(5, 8))!;
    expect(m.rate!.source).toBe('manual');
    expect(m.burnedKg).toBeCloseTo(12, 0);
  });
});
