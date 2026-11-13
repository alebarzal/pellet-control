import type { AppData, ClimateSettings } from '../domain/types';

export const defaultClimateSettings = (): ClimateSettings => ({
  placeName: '',
  lat: null,
  lon: null,
  baseTempC: 15,
  dhwKgPerDay: null,
  switchbotToken: '',
  switchbotSecret: '',
  indoorIds: [],
  outdoorId: null,
  devices: [],
  heatSensitivity: 'media',
  notifyHeating: false,
  plugs: [],
  plugId: null,
  plugThresholdW: 30,
  kgPerBurnerHour: null,
});

/** Temporada de calefacción que contiene la fecha: del 1 de octubre al 30 de abril. */
function currentSeason(now = new Date()): { start: string; end: string } {
  const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return { start: `${y}-10-01`, end: `${y + 1}-04-30` };
}

/** Datos de una instalación nueva: sin registros, con ajustes por defecto editables en Configuración. */
export function createInitialData(): AppData {
  const season = currentSeason();
  return {
    version: 1,
    market: [],
    climate: { readings: [], outdoor: null },
    settings: {
      boilerModel: 'Domusa Bioclass IC DX',
      hopperCapacityKg: 240,
      bagWeightKg: 15,
      brands: [],
      usualPricePerBag: 5,
      seasonBudget: null,
      monthlyBudget: null,
      seasonStart: season.start,
      seasonEnd: season.end,
      climate: defaultClimateSettings(),
    },
    records: [],
  };
}
