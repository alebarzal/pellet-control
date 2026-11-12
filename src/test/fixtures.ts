import { defaultClimateSettings } from '../data/seed';
import type { AppData } from '../domain/types';

/**
 * Escenario de pruebas: una compra, una recarga sin cantidad y recuentos.
 * La recarga del 9/11 no tiene cantidad conocida: se registra como recarga sin cantidad
 * y como recuento de inventario, nunca como consumo.
 */
export function sampleData(): AppData {
  const base = Date.UTC(2026, 10, 9);
  return {
    version: 1,
    market: [],
    climate: { readings: [], outdoor: null },
    settings: {
      boilerModel: 'Domusa Bioclass IC DX',
      hopperCapacityKg: 240,
      bagWeightKg: 15,
      brands: ['Huella Verde'],
      usualPricePerBag: 4.95,
      seasonBudget: null,
      monthlyBudget: null,
      seasonStart: '2026-10-01',
      seasonEnd: '2027-04-30',
      climate: defaultClimateSettings(),
    },
    records: [
      {
        id: 'seed-purchase-1',
        kind: 'purchase',
        date: '2026-10-21',
        createdAt: Date.UTC(2026, 9, 21),
        brand: 'Huella Verde',
        supplier: '',
        bags: 8,
        pricePerBag: 4.95,
        totalCost: 39.6,
        bagWeightKg: 15,
        notes: '',
      },
      {
        id: 'seed-inventory-before',
        kind: 'inventory',
        date: '2026-11-09',
        createdAt: base + 1,
        storedBags: 6,
        notes: 'Existencias anteriores a la recarga: 6 sacos sin introducir en la tolva.',
      },
      {
        id: 'seed-level-before',
        kind: 'level',
        date: '2026-11-09',
        createdAt: base + 2,
        percent: 50,
        approximate: true,
        notes: 'Nivel anterior a la recarga.',
      },
      {
        id: 'seed-refill',
        kind: 'refill',
        date: '2026-11-09',
        createdAt: base + 3,
        bags: null,
        kg: null,
        notes: 'Se introdujeron pellets en la tolva. Cantidad no registrada.',
      },
      {
        id: 'seed-inventory-after',
        kind: 'inventory',
        date: '2026-11-09',
        createdAt: base + 4,
        storedBags: 6,
        notes: 'Última actualización: quedan 6 sacos almacenados fuera de la tolva.',
      },
      {
        id: 'seed-level-after',
        kind: 'level',
        date: '2026-11-09',
        createdAt: base + 5,
        percent: 50,
        approximate: true,
        notes: 'Nivel actual tras la recarga.',
      },
    ],
  };
}
