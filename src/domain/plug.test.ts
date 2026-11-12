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
