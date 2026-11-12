import { describe, expect, it } from 'vitest';
import { sampleData as createSeedData } from '../test/fixtures';
import { climateForecast, currentIndoor, efficiencyModel, hdd } from './climate';
import type { AppData, OutdoorDay } from './types';

const day = (date: string, mean: number): OutdoorDay => ({ date, mean, min: mean - 3, max: mean + 3 });

function withWeather(d: AppData, days: OutdoorDay[]): AppData {
  return { ...d, climate: { ...d.climate, outdoor: { fetchedAt: '2026-11-10T10:00:00Z', lat: 42.8, lon: -2.7, daily: days, current: null } } };
}

describe('grados-día', () => {
  it('solo cuenta el frío por debajo de la base', () => {
    expect(hdd(5, 15)).toBe(10);
    expect(hdd(18, 15)).toBe(0);
  });

  it('sin consumo real no hay modelo ni previsión de kg', () => {
    const d = withWeather(createSeedData(), [day('2026-11-09', 8), day('2026-11-10', 6)]);
    expect(efficiencyModel(d, '2026-11-09')).toBeNull();
    const f = climateForecast(d, 7, '2026-11-09')!;
    expect(f.totalKg).toBeNull();
    expect(f.days[0].hdd).toBe(7);
  });

  it('calcula kg por grado-día y prevé el consumo', () => {
    let d = createSeedData();
    d = {
      ...d,
      records: [
        ...d.records,
        { id: 'c', kind: 'consumption', date: '2026-11-01', endDate: '2026-11-04', kg: 40, bags: null, notes: '', createdAt: 1e13 },
      ],
    };
    // 4 días a 5 °C → 10 grados-día cada uno = 40 GD; 40 kg → 1 kg/GD
    d = withWeather(d, [
      day('2026-11-01', 5),
      day('2026-11-02', 5),
      day('2026-11-03', 5),
      day('2026-11-04', 5),
      day('2026-11-10', 0),
      day('2026-11-11', 10),
    ]);
    const m = efficiencyModel(d, '2026-11-10')!;
    expect(m.kgPerHdd).toBeCloseTo(1);
    expect(m.days).toBe(4);
    const f = climateForecast(d, 7, '2026-11-10')!;
    expect(f.days.map((x) => x.kg)).toEqual([15, 5]);
    expect(f.totalKg).toBeCloseTo(20);
    expect(f.totalCost).toBeCloseTo(20 * 0.33);
    expect(f.runOutDate).toBeNull(); // 90 kg almacén + 120 kg tolva
  });

  it('media interior solo con lecturas recientes de sensores elegidos', () => {
    const d = createSeedData();
    d.settings.climate.indoorIds = ['a', 'b'];
    const now = new Date().toISOString();
    d.climate.readings = [
      { at: now, deviceId: 'a', temperature: 20, humidity: 50, battery: 90 },
      { at: now, deviceId: 'b', temperature: 22, humidity: null, battery: 90 },
      { at: now, deviceId: 'x', temperature: 5, humidity: 80, battery: 90 },
      { at: '2020-01-01T00:00:00Z', deviceId: 'a', temperature: 10, humidity: 50, battery: 90 },
    ];
    const c = currentIndoor(d)!;
    expect(c.temperature).toBe(21);
    expect(c.humidity).toBe(50);
    expect(c.sensors).toBe(2);
  });
});
