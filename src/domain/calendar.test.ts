import { describe, expect, it } from 'vitest';
import { sampleData as createSeedData } from '../test/fixtures';
import { calendarPlan } from './calendar';
import type { AppData, NewRecord } from './types';

let n = 0;
const add = (d: AppData, r: NewRecord): AppData => ({ ...d, records: [...d.records, { ...r, id: `t${++n}`, createdAt: Date.now() + n } as never] });

describe('calendario', () => {
  it('sin consumo registrado no inventa fechas', () => {
    expect(calendarPlan(createSeedData(), 7, '2026-11-10')).toEqual([]);
  });

  it('con consumo calcula recarga y compra', () => {
    let d = createSeedData();
    // 10 kg/día durante 10 días
    for (let i = 1; i <= 10; i++) { const day = `2026-10-${String(10 + i).padStart(2, '0')}`; d = add(d, { kind: 'consumption', date: day, endDate: day, bags: null, kg: 10, notes: '' }); }
    // Tolva al 50 % (120 kg) el 9/11
    d = add(d, { kind: 'level', date: '2026-11-09', percent: 50, approximate: false, notes: '' } as NewRecord);
    const plan = calendarPlan(d, 7, '2026-11-10');
    const refill = plan.find((e) => e.key === 'refill')!;
    const purchase = plan.find((e) => e.key === 'purchase')!;
    // (120 - 60) / 10 = 6 días después del 9/11
    expect(refill.date).toBe('2026-11-15');
    expect(purchase.date > refill.date).toBe(true);
    expect(purchase.title).toBe('Comprar pellet');
  });
});
