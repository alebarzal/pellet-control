import { describe, expect, it } from 'vitest';
import { detectEpisodes, indoorSeries, summarizeDays, type IndoorPoint } from './heating';

const Q = 15 * 60_000;
// 9 nov 2026, 06:00 hora local
const T0 = new Date(2026, 10, 9, 6, 0).getTime();
const series = (temps: number[], start = T0): IndoorPoint[] => temps.map((temp, i) => ({ at: start + i * Q, temp }));

describe('detección de calefacción', () => {
  it('detecta una subida sostenida de madrugada como episodio de confianza alta', () => {
    // 18 °C estable, sube 0,3 °C cada 15 min (1,2 °C/h) durante 1 h, luego estable
    const s = series([18, 18, 18, 18.3, 18.6, 18.9, 19.2, 19.2, 19.2]);
    const eps = detectEpisodes(s, { threshold: 0.5, now: s.at(-1)!.at + Q });
    expect(eps).toHaveLength(1);
    expect(eps[0].start).toBe(T0 + 2 * Q);
    expect(eps[0].end).toBe(T0 + 6 * Q);
    expect(eps[0].endTemp - eps[0].startTemp).toBeCloseTo(1.2);
    expect(eps[0].confidence).toBe('alta');
    expect(eps[0].ongoing).toBe(false);
  });

  it('ignora fluctuaciones pequeñas', () => {
    const s = series([20, 20.1, 20, 20.1, 20, 20.1]);
    expect(detectEpisodes(s, { threshold: 0.5 })).toHaveLength(0);
  });

  it('tolera una franja de meseta dentro del episodio', () => {
    const s = series([18, 18.3, 18.6, 18.6, 18.9, 19.2, 19.1, 19]);
    const eps = detectEpisodes(s, { threshold: 0.5, now: s.at(-1)!.at + Q });
    expect(eps).toHaveLength(1);
    expect(eps[0].endTemp).toBeCloseTo(19.2);
  });

  it('corta en huecos sin lecturas', () => {
    const a = series([18, 18.3, 18.6]);
    const b = series([18.6, 18.9, 19.2], a.at(-1)!.at + 2 * 3_600_000);
    const eps = detectEpisodes([...a, ...b], { threshold: 0.5, now: b.at(-1)!.at + Q });
    expect(eps).toHaveLength(2);
  });

  it('marca como en curso si sigue subiendo ahora', () => {
    const s = series([18, 18, 18.3, 18.6]);
    const eps = detectEpisodes(s, { threshold: 0.5, now: s.at(-1)!.at + 5 * 60_000 });
    expect(eps.at(-1)!.ongoing).toBe(true);
  });

  it('subidas a mediodía tienen confianza baja (posible sol)', () => {
    const s = series([20, 20.3, 20.6, 20.9], new Date(2026, 10, 9, 13, 0).getTime());
    expect(detectEpisodes(s, { threshold: 0.5 })[0].confidence).toBe('baja');
  });

  it('promedia sensores y resume por día', () => {
    const at = (i: number) => new Date(T0 + i * Q).toISOString();
    const readings = [0, 1, 2, 3].flatMap((i) => [
      { at: at(i), deviceId: 'a', temperature: 18 + i * 0.3, humidity: null, battery: null },
      { at: at(i), deviceId: 'b', temperature: 18.2 + i * 0.3, humidity: null, battery: null },
      { at: at(i), deviceId: 'x', temperature: 5, humidity: null, battery: null },
    ]);
    const s = indoorSeries(readings, ['a', 'b']);
    expect(s).toHaveLength(4);
    expect(s[0].temp).toBeCloseTo(18.1);
    const eps = detectEpisodes(s, { threshold: 0.5, now: s.at(-1)!.at + Q });
    const days = summarizeDays(s, eps);
    expect(days).toHaveLength(1);
    expect(days[0].episodes).toBe(1);
    expect(days[0].hours).toBeCloseTo(0.75);
    expect(days[0].coverageHours).toBeCloseTo(0.75);
  });
});
