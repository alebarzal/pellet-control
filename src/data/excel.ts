import {
  autonomy,
  consumptionStats,
  dailyConsumption,
  hopperEstimate,
  LEVEL_LABEL,
  levelCategory,
  purchases,
  purchaseSummary,
  sortRecords,
  spendByMonth,
  stockLedger,
  storedStock,
} from '../domain/calc';
import { climateForecast, efficiencyModel, hdd, indoorDaily, outdoorByDate } from '../domain/climate';
import { monthKey, monthRange, todayIso } from '../domain/dates';
import { CERT_LABEL, sortedPrices } from '../domain/market';
import { detectEpisodes, indoorSeries, SENSITIVITY, summarizeDays } from '../domain/heating';
import type { AppData } from '../domain/types';
import { describeRecord, KIND_META } from '../features/records/meta';

/** Celda de write-excel-file (subconjunto que usamos). */
export interface Cell {
  value: string | number | Date | null;
  type?: StringConstructor | NumberConstructor | DateConstructor;
  format?: string;
  fontWeight?: 'bold';
  backgroundColor?: string;
  color?: string;
  wrap?: boolean;
}
type Row = (Cell | null)[];

export interface Sheet {
  name: string;
  rows: Row[];
  widths: number[];
}

const EUR = '#,##0.00 "€"';
const EUR3 = '#,##0.000 "€"';
const KG = '#,##0.0 "kg"';
const DEC1 = '#,##0.0';
const INT = '#,##0';
const DATE = 'dd/mm/yyyy';
const DATETIME = 'dd/mm/yyyy hh:mm';

/** Excel no tiene zona horaria: se guarda la hora local tal cual. */
const xlDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const xlDateTime = (t: string | number) => {
  const d = new Date(t);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));
};

const h = (value: string): Cell => ({ value, fontWeight: 'bold', backgroundColor: '#E3E7CB', color: '#2C3A29' });
const s = (v: string | null | undefined): Cell | null => (v ? { value: v, type: String } : null);
const n = (v: number | null | undefined, format = DEC1): Cell | null => (v == null || !Number.isFinite(v) ? null : { value: v, type: Number, format });
const d = (iso: string | null | undefined): Cell | null => (iso ? { value: xlDate(iso), type: Date, format: DATE } : null);
const dt = (t: string | number | null | undefined): Cell | null => (t == null ? null : { value: xlDateTime(t), type: Date, format: DATETIME });

export function buildSheets(data: AppData, today = todayIso()): Sheet[] {
  const sheets: Sheet[] = [];
  const st = storedStock(data);
  const sum = purchaseSummary(data);
  const cons = consumptionStats(data, today);
  const auto = autonomy(data, today);
  const hop = hopperEstimate(data);
  const model = efficiencyModel(data, today);
  const climate = data.settings.climate;
  const outdoor = outdoorByDate(data);
  const indoor = indoorDaily(data);
  const series = indoorSeries(data.climate.readings, climate.indoorIds);
  const episodes = detectEpisodes(series, { threshold: SENSITIVITY[climate.heatSensitivity] });
  const heatDays = new Map(summarizeDays(series, episodes).map((x) => [x.date, x]));
  const seasonHdd = [...outdoor.values()]
    .filter((o) => o.date >= data.settings.seasonStart && o.date <= today)
    .reduce((a, o) => a + hdd(o.mean, climate.baseTempC), 0);

  // 1. Resumen
  const kv = (label: string, cell: Cell | null, note = ''): Row => [s(label), cell, s(note)];
  sheets.push({
    name: 'Resumen',
    widths: [34, 18, 52],
    rows: [
      [{ value: 'Pellet Control', fontWeight: 'bold' }, null, null],
      kv('Exportado', dt(Date.now())),
      kv('Caldera', s(data.settings.boilerModel)),
      [null, null, null],
      [h('Inventario'), h('Valor'), h('Nota')],
      kv('Sacos almacenados', n(st.bags, INT), 'Fuera de la tolva'),
      kv('Kg almacenados', n(st.kg, KG), `${data.settings.bagWeightKg} kg por saco`),
      kv('Nivel de la tolva', hop ? s(`${LEVEL_LABEL[levelCategory(hop.percent)]} (${hop.percent} %)`) : null, hop?.approximate ? 'Estimación visual' : ''),
      kv('Kg en la tolva (estimado)', n(hop?.kg ?? null, KG)),
      [null, null, null],
      [h('Economía'), h('Valor'), h('Nota')],
      kv('Gasto total', n(sum.totalSpent, EUR), `${sum.count} compras`),
      kv('Sacos comprados', n(sum.totalBags, INT)),
      kv('Precio medio por saco', n(sum.avgPricePerBag, EUR), 'Ponderado'),
      kv('Precio medio por kg', n(sum.avgPricePerKg, EUR3)),
      kv('Coste diario medio', n(cons.avgDailyCost, EUR), 'Consumo real × precio medio'),
      [null, null, null],
      [h('Consumo'), h('Valor'), h('Nota')],
      kv('Consumo real registrado', n(cons.totalKg, KG), `${cons.coveredDays} días con datos`),
      kv('Consumo medio diario', n(cons.avgDailyKg, KG)),
      kv('Consumo esta temporada', n(cons.seasonKg, KG)),
      kv('Autonomía estimada (días)', n(auto?.days ?? null, INT), auto ? `Hasta el ${auto.runOutDate}` : 'Necesita consumo real'),
      [null, null, null],
      [h('Clima'), h('Valor'), h('Nota')],
      kv('Localidad', s(climate.placeName || null)),
      kv('Grados-día de la temporada', n(outdoor.size ? seasonHdd : null, INT), `Base ${climate.baseTempC} °C`),
      kv('Kg de pellet por grado-día', n(model?.kgPerHdd ?? null, '#,##0.00'), model ? `${model.days} días de datos` : 'Necesita 3 días de consumo real'),
      kv('Kg de pellet al día para agua caliente', n(model && model.baseSource !== 'none' ? model.baseKgPerDay : null, '#,##0.00'), model?.baseSource === 'manual' ? 'Puesto a mano' : model?.baseSource === 'auto' ? 'Calculado con los consumos' : 'Aún sin separar'),
      kv('Arranques detectados (estimación)', n(episodes.length, INT), 'Por la temperatura interior'),
    ],
  });

  // 2. Movimientos
  const ledger = stockLedger(data);
  sheets.push({
    name: 'Movimientos',
    widths: [12, 22, 40, 10, 10, 12, 14, 44],
    rows: [
      ['Fecha', 'Tipo', 'Descripción', 'Sacos', 'Kg', 'Importe', 'Saldo almacén', 'Observaciones'].map(h),
      ...sortRecords(data.records).map((r): Row => {
        const desc = describeRecord(r, data.settings);
        const bags = r.kind === 'purchase' ? r.bags : r.kind === 'refill' ? (r.bags != null ? -r.bags : null) : r.kind === 'adjustment' ? r.bagsDelta : r.kind === 'inventory' ? r.storedBags : r.kind === 'consumption' ? r.bags : null;
        const kg = r.kind === 'purchase' ? r.bags * r.bagWeightKg : r.kind === 'refill' ? r.kg : r.kind === 'consumption' ? r.kg : r.kind === 'adjustment' ? r.kg : null;
        return [d(r.date), s(KIND_META[r.kind].label), s(desc.title), n(bags, INT), n(kg, KG), r.kind === 'purchase' ? n(r.totalCost, EUR) : r.kind === 'spend' ? n(r.amount, EUR) : null, n(ledger.get(r.id) ?? null, INT), s(r.notes)];
      }),
    ],
  });

  // 3. Compras
  sheets.push({
    name: 'Compras',
    widths: [12, 18, 18, 8, 10, 10, 12, 12, 12, 40],
    rows: [
      ['Fecha', 'Marca', 'Proveedor', 'Sacos', 'Kg/saco', 'Kg total', 'Precio/saco', 'Total', '€/kg', 'Observaciones'].map(h),
      ...purchases(data).map((p): Row => [
        d(p.date),
        s(p.brand),
        s(p.supplier),
        n(p.bags, INT),
        n(p.bagWeightKg, DEC1),
        n(p.bags * p.bagWeightKg, KG),
        n(p.pricePerBag, EUR),
        n(p.totalCost, EUR),
        n(p.pricePerBag / p.bagWeightKg, EUR3),
        s(p.notes),
      ]),
    ],
  });

  // 4. Mensual (economía + consumo)
  const spend = new Map(spendByMonth(data).map((m) => [m.month, m]));
  const consM = new Map(cons.byMonth.map((m) => [m.month, m]));
  const keys = [...spend.keys(), ...consM.keys()].sort();
  const months = keys.length ? monthRange(keys[0], keys.at(-1)!) : [];
  const hddByMonth = new Map<string, number>();
  for (const o of outdoor.values()) if (o.date <= today) hddByMonth.set(monthKey(o.date), (hddByMonth.get(monthKey(o.date)) ?? 0) + hdd(o.mean, climate.baseTempC));
  sheets.push({
    name: 'Mensual',
    widths: [12, 14, 14, 14, 16, 14],
    rows: [
      ['Mes', 'Gasto compras', 'Sacos comprados', 'Consumo real', 'Coste del consumo', 'Grados-día'].map(h),
      ...months.map((m): Row => [
        { value: xlDate(`${m}-01`), type: Date, format: 'mmm yyyy' },
        n(spend.get(m)?.spent ?? 0, EUR),
        n(spend.get(m)?.bags ?? 0, INT),
        consM.has(m) ? n(consM.get(m)!.kg, KG) : null,
        n(consM.get(m)?.cost ?? null, EUR),
        n(hddByMonth.get(m) ?? null, INT),
      ]),
    ],
  });

  // 5. Diario: consumo, temperatura y caldera
  const daily = dailyConsumption(data);
  const dayKeys = new Set<string>([...daily.keys(), ...indoor.keys(), ...heatDays.keys(), ...[...outdoor.keys()].filter((k) => k <= today && k >= data.settings.seasonStart)]);
  const sortedDays = [...dayKeys].sort();
  const price = cons.pricePerKg;
  sheets.push({
    name: 'Diario',
    widths: [12, 12, 12, 13, 13, 11, 13, 14, 12],
    rows: [
      ['Fecha', 'Consumo', 'Coste', 'T. exterior', 'T. interior', 'Grados-día', 'Arranques (est.)', 'Horas calent. (est.)', 'T. ext mín/máx'].map(h),
      ...sortedDays.map((k): Row => {
        const o = outdoor.get(k);
        const hd = heatDays.get(k);
        return [
          d(k),
          daily.has(k) ? n(daily.get(k)!, KG) : null,
          daily.has(k) && price != null ? n(daily.get(k)! * price, EUR) : null,
          n(o?.mean ?? null, '0.0 "°C"'),
          n(indoor.get(k) ?? null, '0.0 "°C"'),
          o ? n(hdd(o.mean, climate.baseTempC), DEC1) : null,
          hd ? n(hd.episodes, INT) : null,
          hd ? n(hd.hours, DEC1) : null,
          o ? s(`${o.min.toFixed(1)} / ${o.max.toFixed(1)}`) : null,
        ];
      }),
    ],
  });

  // 6. Previsión
  const fc = climateForecast(data, 16, today);
  if (fc)
    sheets.push({
      name: 'Previsión',
      widths: [12, 14, 12, 14, 12],
      rows: [
        ['Fecha', 'T. media prevista', 'Grados-día', 'Kg previstos', '€ previstos'].map(h),
        ...fc.days.map((x): Row => [d(x.date), n(x.mean, '0.0 "°C"'), n(x.hdd, DEC1), n(x.kg, KG), n(x.cost, EUR)]),
      ],
    });

  // 7. Caldera (arranques estimados)
  sheets.push({
    name: 'Arranques caldera',
    widths: [17, 17, 12, 12, 12, 14, 12],
    rows: [
      ['Inicio', 'Fin', 'Duración (min)', 'T. inicio', 'T. fin', 'Subida (°C/h)', 'Confianza'].map(h),
      ...episodes.map((e): Row => [dt(e.start), dt(e.end), n((e.end - e.start) / 60000, INT), n(e.startTemp, '0.0 "°C"'), n(e.endTemp, '0.0 "°C"'), n(e.rate, '0.00'), s(e.confidence)]),
    ],
  });

  // 8. Lecturas de sensores
  const names = new Map(climate.devices.map((x) => [x.id, x.name]));
  sheets.push({
    name: 'Lecturas sensores',
    widths: [17, 22, 10, 10, 10],
    rows: [
      ['Fecha y hora', 'Sensor', 'Temperatura', 'Humedad', 'Batería'].map(h),
      ...data.climate.readings.map((r): Row => [dt(r.at), s(names.get(r.deviceId) ?? r.deviceId), n(r.temperature, '0.0 "°C"'), n(r.humidity, '0 "%"'), n(r.battery, '0 "%"')]),
    ],
  });

  // 9. Precios de mercado
  sheets.push({
    name: 'Precios mercado',
    widths: [30, 14, 16, 9, 17, 11, 11, 9, 18, 10, 10, 12, 12, 50],
    rows: [
      ['Producto', 'Marca', 'Tienda', 'Kg', 'Fecha', 'Precio', '€/kg', 'Origen', 'Certificación', 'Cenizas %', 'Humedad %', 'PCI kWh/kg', 'Durabilidad %', 'Enlace'].map(h),
      ...data.market.flatMap((p) =>
        sortedPrices(p).map((o): Row => [
          s(p.name),
          s(p.brand),
          s(p.store),
          n(p.bagWeightKg, DEC1),
          dt(o.at),
          n(o.price, EUR),
          n(o.price / p.bagWeightKg, EUR3),
          s(o.source === 'online' ? 'Online' : 'Manual'),
          s(CERT_LABEL[p.quality.certification]),
          n(p.quality.ashPct, '0.00'),
          n(p.quality.moisturePct, '0.0'),
          n(p.quality.ncvKwhKg, '0.00'),
          n(p.quality.durabilityPct, '0.0'),
          s(p.url),
        ]),
      ),
    ],
  });

  return sheets;
}

/** Genera el .xlsx (Blob). La librería se carga solo al exportar. */
export async function buildWorkbook(data: AppData): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file');
  const sheets = buildSheets(data);
  const blob = await (writeXlsxFile as unknown as (d: unknown, o: unknown) => Promise<Blob>)(
    sheets.map((x) => x.rows),
    {
      sheets: sheets.map((x) => x.name),
      columns: sheets.map((x) => x.widths.map((width) => ({ width }))),
      stickyRowsCount: 1,
      fontFamily: 'Calibri',
      fontSize: 11,
    },
  );
  return blob;
}

export const excelFileName = () => `Pellet Control ${todayIso()}.xlsx`;
