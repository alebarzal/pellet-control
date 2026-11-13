import { describe, expect, it } from 'vitest';
import { defaultClimateSettings } from '../data/seed';
import { burnerMinutesByDay, plugSummary } from './plug';

const at = (h: number, m = 0) => new Date(2026, 10, 10, h, m).toISOString();

describe('enchufe de la caldera', () => {
  it('cuenta el tiempo por encima del umbral', () => {
    const r = [
      { at: at(8, 0), watts: 3 },
      { at: at(8, 15), watts: 120 },
      { at: at(8, 30), watts: 95 },
      { at: at(8, 45), watts: 4 },
    ];
    const d = burnerMinutesByDay(r, 30, new Date(2026, 10, 10, 9).getTime());
    expect([...d.values()][0].minutes).toBe(30);
  });

  it('no cuenta huecos largos sin lecturas', () => {
    const r = [
      { at: at(8, 0), watts: 120 },
      { at: at(12, 0), watts: 3 },
    ];
    const d = burnerMinutesByDay(r, 30, new Date(2026, 10, 10, 13).getTime());
    expect([...d.values()][0].minutes).toBe(30);
  });

  it('resumen: estado actual y kg si hay calibración', () => {
    const c = { ...defaultClimateSettings(), plugThresholdW: 30, kgPerBurnerHour: 2 };
    const now = new Date(2026, 10, 10, 9, 0).getTime();
    const s = plugSummary(
      [
        { at: at(8, 0), watts: 120 },
        { at: at(8, 30), watts: 110 },
        { at: at(8, 50), watts: 115 },
      ],
      c,
      now,
    );
    expect(s.on).toBe(true);
    expect(s.today.minutes).toBe(60);
    expect(s.today.kg).toBe(2);
    expect(s.week).toHaveLength(7);
  });
});

import { createInitialData } from '../data/seed';
import { autoKgPerBurnerHour, kgPerBurnerHour } from './plug';

describe('kg por hora de quemador automáticos', () => {
  it('cruza un consumo apuntado con las horas que midió el enchufe esos días', () => {
    const d = createInitialData();
    d.settings.climate = { ...d.settings.climate, plugId: 'P', plugThresholdW: 30 };
    // 10 y 11 de nov: lecturas cada 15 min; el quemador funciona de 6:00 a 9:00 (3 h al día).
    const plug = [];
    for (const day of [10, 11]) {
      for (let q = 0; q < 96; q++) {
        const h = Math.floor(q / 4);
        plug.push({ at: new Date(2026, 10, day, h, (q % 4) * 15).toISOString(), watts: h >= 6 && h < 9 ? 50 : 5 });
      }
    }
    d.climate = { ...d.climate, plug };
    d.records = [{ id: 'c', kind: 'consumption', date: '2026-11-10', endDate: '2026-11-11', kg: 12, bags: null, notes: '', createdAt: 1 }];
    const now = new Date(2026, 10, 12, 10).getTime();
    expect(autoKgPerBurnerHour(d, now)).toEqual({ value: 2, days: 2 }); // 12 kg / 6 h
    expect(kgPerBurnerHour(d, now)?.source).toBe('auto');
    d.settings.climate.kgPerBurnerHour = 2.5;
    expect(kgPerBurnerHour(d, now)).toEqual({ value: 2.5, source: 'manual', days: 0 });
  });
});
