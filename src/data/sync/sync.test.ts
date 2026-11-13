import { describe, expect, it } from 'vitest';
import { purchaseSummary, storedStock } from '../../domain/calc';
import type { AppData, PelletRecord } from '../../domain/types';
import { sampleData as createSeedData } from '../../test/fixtures';
import { SyncEngine, type SyncBackend } from './engine';
import { allItems, applyRemote, diff, emptyFrom, type SyncItem } from './model';

/** Servidor en memoria con hora monótona y que reordena claves como jsonb. */
class FakeServer implements SyncBackend {
  rows = new Map<string, SyncItem & { household: string }>();
  clock = 0;
  offline = false;
  private reorder(v: unknown): unknown {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map((x) => this.reorder(x));
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().reverse().map((k) => [k, this.reorder(o[k])]));
  }
  async upsert(h: string, items: SyncItem[]) {
    if (this.offline) throw new Error('sin red');
    for (const it of items) {
      const t = new Date(Date.UTC(2026, 10, 9) + ++this.clock).toISOString();
      this.rows.set(`${h}|${it.collection}:${it.id}`, { ...it, data: this.reorder(it.data), updated_at: t, household: h });
    }
  }
  async since(h: string, cursor: string | null, limit: number) {
    if (this.offline) throw new Error('sin red');
    return [...this.rows.values()]
      .filter((r) => r.household === h && (!cursor || r.updated_at! > cursor))
      .sort((a, b) => (a.updated_at! < b.updated_at! ? -1 : 1))
      .slice(0, limit)
      .map(({ household: _h, ...r }) => r);
  }
}

/** Un móvil: datos locales + motor. Los cambios del usuario se encolan; los remotos no. */
class Device {
  data: AppData;
  engine: SyncEngine;
  constructor(server: FakeServer, data: AppData, household = 'H') {
    this.data = data;
    this.engine = new SyncEngine(server, { householdId: household, cursor: null, pending: [] }, () => {});
  }
  edit(fn: (d: AppData) => AppData) {
    const next = fn(this.data);
    this.engine.enqueue(diff(this.data, next));
    this.data = next;
  }
  async sync() {
    const remote = await this.engine.sync();
    this.data = applyRemote(this.data, remote);
  }
}

const purchase = (id: string, bags: number): PelletRecord => ({
  id,
  kind: 'purchase',
  date: '2026-11-10',
  createdAt: Date.now(),
  brand: 'Huella Verde',
  supplier: '',
  bags,
  pricePerBag: 5,
  totalCost: bags * 5,
  bagWeightKg: 15,
  notes: '',
});

async function setup() {
  const server = new FakeServer();
  const a = new Device(server, createSeedData());
  a.data.settings.climate.switchbotToken = 'token-de-A';
  a.engine.enqueue(allItems(a.data));
  await a.sync();
  const bLocal = createSeedData();
  bLocal.records = []; // un móvil recién instalado con otros datos
  const b = new Device(server, emptyFrom(bLocal));
  await b.sync();
  return { server, a, b };
}

describe('sincronización entre móviles', () => {
  it('quien se une recibe todos los datos del hogar, sin las credenciales', async () => {
    const { a, b } = await setup();
    expect(b.data.records.map((r) => r.id).sort()).toEqual(a.data.records.map((r) => r.id).sort());
    expect(storedStock(b.data).bags).toBe(6);
    expect(b.data.settings.climate.switchbotToken).toBe('');
    expect(a.engine.pendingCount).toBe(0);
  });

  it('una compra en un móvil aparece en el otro y no rebota', async () => {
    const { a, b } = await setup();
    b.edit((d) => ({ ...d, records: [...d.records, purchase('p-b', 10)] }));
    await b.sync();
    await a.sync();
    expect(storedStock(a.data).bags).toBe(16);
    expect(purchaseSummary(a.data).totalSpent).toBeCloseTo(89.6);
    // Aplicar lo remoto no genera cambios que subir, aunque el servidor haya reordenado claves.
    a.edit((d) => ({ ...d }));
    expect(a.engine.pendingCount).toBe(0);
    await a.sync();
    expect(b.engine.pendingCount).toBe(0);
  });

  it('borrar se propaga', async () => {
    const { a, b } = await setup();
    a.edit((d) => ({ ...d, records: d.records.filter((r) => r.id !== 'seed-purchase-1') }));
    await a.sync();
    await b.sync();
    expect(b.data.records.some((r) => r.id === 'seed-purchase-1')).toBe(false);
  });

  it('sin conexión los cambios esperan en la cola', async () => {
    const { server, a, b } = await setup();
    server.offline = true;
    a.edit((d) => ({ ...d, records: [...d.records, purchase('p-a', 2)] }));
    await expect(a.sync()).rejects.toThrow();
    expect(a.engine.pendingCount).toBe(1);
    server.offline = false;
    await a.sync();
    await b.sync();
    expect(b.data.records.some((r) => r.id === 'p-a')).toBe(true);
    expect(a.engine.pendingCount).toBe(0);
  });

  it('si los dos editan lo mismo, gana la última edición subida', async () => {
    const { a, b } = await setup();
    a.edit((d) => ({ ...d, records: d.records.map((r) => (r.id === 'seed-purchase-1' ? { ...r, notes: 'A' } : r)) }));
    b.edit((d) => ({ ...d, records: d.records.map((r) => (r.id === 'seed-purchase-1' ? { ...r, notes: 'B' } : r)) }));
    await a.sync();
    await b.sync(); // B sube después: su versión queda en el servidor
    await a.sync();
    const note = (d: AppData) => d.records.find((r) => r.id === 'seed-purchase-1')!.notes;
    expect(note(a.data)).toBe('B');
    expect(note(b.data)).toBe('B');
  });

  it('las credenciales y los avisos de cada móvil no se comparten', async () => {
    const { a, b } = await setup();
    b.edit((d) => ({ ...d, settings: { ...d.settings, climate: { ...d.settings.climate, notifyHeating: true, placeName: 'Vitoria' } } }));
    await b.sync();
    await a.sync();
    expect(a.data.settings.climate.placeName).toBe('Vitoria');
    expect(a.data.settings.climate.notifyHeating).toBe(false);
    expect(a.data.settings.climate.switchbotToken).toBe('token-de-A');
  });

  it('las lecturas de sensores se suman y no se duplican', async () => {
    const { a, b } = await setup();
    const r = { at: '2026-11-09T16:00:00.000Z', deviceId: 'hub', temperature: 21, humidity: 50, battery: null };
    a.edit((d) => ({ ...d, climate: { ...d.climate, readings: [r] } }));
    b.edit((d) => ({ ...d, climate: { ...d.climate, readings: [r] } }));
    await a.sync();
    await b.sync();
    await a.sync();
    expect(a.data.climate.readings).toHaveLength(1);
    expect(b.data.climate.readings).toHaveLength(1);
  });
});

describe('enchufe compartido', () => {
  it('las lecturas del enchufe de un móvil llegan al otro del hogar, sin las claves', () => {
    const base = emptyFrom(createSeedData());
    const a: AppData = {
      ...base,
      settings: { ...base.settings, climate: { ...base.settings.climate, plugId: 'P1', switchbotToken: 'tok', switchbotSecret: 'sec' } },
    };
    const a2: AppData = { ...a, climate: { ...a.climate, plug: [{ at: '2026-11-13T16:00:00.000Z', watts: 53 }] } };
    const changes = diff(a, a2);
    expect(changes.some((c) => c.collection === 'reading' && c.id.startsWith('plug|'))).toBe(true);
    const b = applyRemote(emptyFrom(createSeedData()), allItems(a2));
    expect(b.climate.plug).toEqual([{ at: '2026-11-13T16:00:00.000Z', watts: 53 }]);
    expect(b.climate.readings).toEqual([]);
    expect(b.settings.climate.plugId).toBe('P1');
    expect(b.settings.climate.switchbotToken).not.toBe('tok');
  });
});
