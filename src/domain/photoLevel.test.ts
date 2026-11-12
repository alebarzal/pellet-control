import { describe, expect, it } from 'vitest';
import { createInitialData } from '../data/seed';
import { photoCalibration, photoKg, photoPercent, windowFraction } from './photoLevel';
import type { AppData, NewRecord } from './types';

let n = 0;
const add = (d: AppData, r: NewRecord, at: number): AppData => ({ ...d, records: [...d.records, { ...r, id: `p${++n}`, createdAt: at } as never] });
const H = 3600_000;
const base = Date.UTC(2026, 10, 12, 10);

describe('nivel por foto', () => {
  it('posición en el visor', () => {
    expect(windowFraction(0.2, 0.5, 0.8)).toBe(0.5);
    expect(photoPercent(0.2, 0.2, 0.8)).toBe(100);
    expect(photoPercent(0.2, 0.9, 0.8)).toBe(0);
    expect(windowFraction(0.8, 0.5, 0.2)).toBeNull();
  });

  it('sin calibrar, el visor representa toda la tolva', () => {
    expect(photoKg(0.4, { kgPerWindow: null, pairs: 0 }, 240)).toEqual({ kg: 96, percent: 40 });
  });

  it('calibra con una foto antes y otra después de recargar, sin ver nunca la tolva vacía', () => {
    let d = createInitialData();
    d = add(d, { kind: 'level', date: '2026-11-12', percent: 40, approximate: false, photo: 0.3, notes: '' }, base);
    d = add(d, { kind: 'refill', date: '2026-11-12', bags: 4, kg: null, notes: '' }, base + 0.1 * H); // 60 kg
    d = add(d, { kind: 'level', date: '2026-11-12', percent: 70, approximate: false, photo: 0.6, notes: '' }, base + 0.2 * H);
    const cal = photoCalibration(d);
    expect(cal).toEqual({ kgPerWindow: 200, pairs: 1 }); // 60 kg / 0,3 del visor
    // Bajo el visor quedan 240 − 200 = 40 kg; a mitad de visor: 40 + 100 = 140 kg
    expect(photoKg(0.5, cal, 240)).toEqual({ kg: 140, percent: 58 });
  });

  it('ignora parejas con consumos en medio, recargas sin cantidad o pellet fuera del visor', () => {
    let d = createInitialData();
    d = add(d, { kind: 'level', date: '2026-11-12', percent: 0, approximate: false, photo: 0, notes: '' }, base);
    d = add(d, { kind: 'refill', date: '2026-11-12', bags: 4, kg: null, notes: '' }, base + 0.1 * H);
    d = add(d, { kind: 'level', date: '2026-11-12', percent: 50, approximate: false, photo: 0.5, notes: '' }, base + 0.2 * H);
    d = add(d, { kind: 'refill', date: '2026-11-12', bags: null, kg: null, notes: '' }, base + 0.3 * H);
    d = add(d, { kind: 'level', date: '2026-11-12', percent: 90, approximate: false, photo: 0.9, notes: '' }, base + 0.4 * H);
    expect(photoCalibration(d).pairs).toBe(0);
  });
});
