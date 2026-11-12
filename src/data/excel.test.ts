import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import { sampleData as createSeedData } from '../test/fixtures';
import { buildSheets } from './excel';

describe('exportación a Excel', () => {
  it('genera todas las hojas con cabeceras y datos coherentes', async () => {
    const d = createSeedData();
    d.records.push({ id: 'c', kind: 'consumption', date: '2026-11-02', endDate: '2026-11-09', kg: 45, bags: 3, notes: '', createdAt: 1e13 });
    d.settings.climate.indoorIds = ['s1'];
    d.settings.climate.devices = [{ id: 's1', name: 'Salón', type: 'Meter' }];
    d.climate.readings = [{ at: '2026-11-09T06:00:00.000Z', deviceId: 's1', temperature: 19.5, humidity: 50, battery: 90 }];
    d.climate.outdoor = { fetchedAt: '', lat: 0, lon: 0, current: null, daily: [{ date: '2026-11-08', mean: 8, min: 3, max: 12 }, { date: '2026-11-10', mean: 6, min: 1, max: 10 }] };
    const sheets = buildSheets(d, '2026-11-09');
    expect(sheets.map((s) => s.name)).toEqual(['Resumen', 'Movimientos', 'Compras', 'Mensual', 'Diario', 'Previsión', 'Arranques caldera', 'Lecturas sensores', 'Precios mercado']);
    for (const s of sheets) for (const r of s.rows) expect(r.length).toBeLessThanOrEqual(s.widths.length);
    const compras = sheets.find((s) => s.name === 'Compras')!;
    expect(compras.rows[1][7]?.value).toBeCloseTo(39.6);
    const diario = sheets.find((s) => s.name === 'Diario')!;
    expect(diario.rows.length).toBeGreaterThan(8);
    const buf = await (writeXlsxFile as unknown as (d: unknown, o: unknown) => Promise<Buffer>)(
      sheets.map((s) => s.rows),
      { sheets: sheets.map((s) => s.name), columns: sheets.map((s) => s.widths.map((width) => ({ width }))), stickyRowsCount: 1, buffer: true },
    );
    // Un .xlsx es un zip: empieza por «PK».
    expect(buf.subarray(0, 2).toString()).toBe('PK');
  });
});
