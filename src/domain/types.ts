/** Nivel cualitativo de la tolva. */
export type LevelCategory = 'lleno' | 'medio' | 'bajo' | 'vacio';

export interface Settings {
  boilerModel: string;
  /** Capacidad de la tolva en kg. null = no configurada. */
  hopperCapacityKg: number | null;
  /** Peso por defecto de un saco en kg. */
  bagWeightKg: number;
  brands: string[];
  usualPricePerBag: number;
  /** Objetivo de gasto por temporada (€). null = sin objetivo. */
  seasonBudget: number | null;
  /** Objetivo de gasto mensual (€). null = sin objetivo. */
  monthlyBudget: number | null;
  /** ISO yyyy-mm-dd */
  seasonStart: string;
  /** ISO yyyy-mm-dd */
  seasonEnd: string;
  climate: ClimateSettings;
}

interface BaseRecord {
  id: string;
  /** Fecha ISO yyyy-mm-dd */
  date: string;
  /** Marca de creación, sirve para ordenar registros del mismo día. */
  createdAt: number;
  notes: string;
}

export interface PurchaseRecord extends BaseRecord {
  kind: 'purchase';
  brand: string;
  supplier: string;
  bags: number;
  pricePerBag: number;
  totalCost: number;
  bagWeightKg: number;
}

/** Sacos sacados del almacén e introducidos en la tolva. */
export interface RefillRecord extends BaseRecord {
  kind: 'refill';
  /** null si no se sabe cuántos sacos se introdujeron. */
  bags: number | null;
  /** Peso introducido, si se conoce. */
  kg: number | null;
}

/** Consumo real registrado a mano. */
export interface ConsumptionRecord extends BaseRecord {
  kind: 'consumption';
  kg: number;
  /** Fin del periodo (ISO). Si es igual a date, es un consumo de un día. */
  endDate: string;
  /** Sacos equivalentes indicados por el usuario (informativo). */
  bags: number | null;
}

/** Lectura del nivel de la tolva. */
export interface LevelRecord extends BaseRecord {
  kind: 'level';
  /** Porcentaje 0..100. */
  percent: number;
  /** true si procede de una estimación visual (lleno/medio/bajo/vacío). */
  approximate: boolean;
  /** Si se midió con foto: posición del pellet en el visor (0 = abajo, 1 = arriba). Sirve para calibrar. */
  photo?: number;
}

/** Recuento absoluto de existencias almacenadas fuera de la tolva. */
export interface InventoryRecord extends BaseRecord {
  kind: 'inventory';
  storedBags: number;
}

/** Ajuste manual (+/-) de sacos almacenados: roturas, regalos, errores… */
export interface AdjustmentRecord extends BaseRecord {
  kind: 'adjustment';
  bagsDelta: number;
  kg: number | null;
}

/**
 * Puesta a cero o corrección del contador «Gasto acumulado» (como el parcial de un coche):
 * desde esta fecha el contador vale `amount` más las compras posteriores. No altera estadísticas ni precios medios.
 */
export interface SpendRecord extends BaseRecord {
  kind: 'spend';
  amount: number;
  /** Sacos que corresponden a ese gasto (opcional en registros antiguos). */
  bags?: number;
}

export type PelletRecord =
  | PurchaseRecord
  | RefillRecord
  | ConsumptionRecord
  | LevelRecord
  | InventoryRecord
  | AdjustmentRecord
  | SpendRecord
  | CounterRecord;

/**
 * Ajuste manual de un indicador de Inicio, sin tocar los datos reales:
 * - `consumption`: el consumo del mes vale `value` kg y desde aquí se suman los consumos nuevos.
 * - `price`: el precio por saco se fija en `value` € (null = volver al calculado con las compras).
 */
export interface CounterRecord extends BaseRecord {
  kind: 'counter';
  /** `consumed`: total «Consumido» de Inventario; desde aquí se suman los consumos nuevos. */
  /** `stats`: las estadísticas empiezan de cero en este momento (los registros antiguos se conservan). */
  metric: 'consumption' | 'price' | 'consumed' | 'stats';
  value: number | null;
}

export type RecordKind = PelletRecord['kind'];

export interface AppData {
  version: 1;
  settings: Settings;
  records: PelletRecord[];
  /** Productos seguidos en tiendas online. */
  market: MarketProduct[];
  climate: ClimateData;
}

/** Distribuye Omit sobre la unión. */
export type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type NewRecord = DistributiveOmit<PelletRecord, 'id' | 'createdAt'>;

/* ───────────── Mercado: seguimiento de precios y calidad ───────────── */

export type Certification = 'enplus-a1' | 'enplus-a2' | 'dinplus' | 'iso-a1' | 'none' | 'unknown';

export interface QualitySpec {
  certification: Certification;
  /** Cenizas en % (base seca). */
  ashPct: number | null;
  /** Humedad en %. */
  moisturePct: number | null;
  /** Poder calorífico inferior en kWh/kg. */
  ncvKwhKg: number | null;
  /** Durabilidad mecánica en %. */
  durabilityPct: number | null;
  diameterMm: number | null;
}

export interface PriceObservation {
  /** Fecha y hora ISO. */
  at: string;
  /** Precio por saco en €. */
  price: number;
  source: 'online' | 'manual';
  /** Disponibilidad leída de la tienda, null si no se conoce. */
  available: boolean | null;
}

export interface MarketProduct {
  id: string;
  name: string;
  brand: string;
  store: string;
  /** Ficha del producto en la tienda (vacío si es un precio anotado a mano). */
  url: string;
  bagWeightKg: number;
  quality: QualitySpec;
  prices: PriceObservation[];
  lastCheck: { at: string; ok: boolean; message: string } | null;
  notes: string;
  /** Miniatura (data URL JPEG) de la foto del saco o de la etiqueta de precio. */
  photo?: string | null;
  createdAt: number;
}

/* ───────────── Clima: sensores SwitchBot y tiempo exterior ───────────── */

export interface ClimateSettings {
  /** Ubicación para la temperatura exterior (Open-Meteo). */
  placeName: string;
  lat: number | null;
  lon: number | null;
  /** Temperatura base de los grados-día de calefacción (°C). */
  baseTempC: number;
  /** kg/día que gasta el agua caliente (lo que se quema aunque no haga frío). Null = calcularlo solo. */
  dhwKgPerDay?: number | null;
  /** Credenciales de la API de SwitchBot. Solo se guardan en este dispositivo y no se exportan. */
  switchbotToken: string;
  switchbotSecret: string;
  /** Sensores interiores elegidos. */
  indoorIds: string[];
  /** Sensor exterior SwitchBot opcional (si no, se usa Open-Meteo). */
  outdoorId: string | null;
  /** Dispositivos con sensor de temperatura detectados en la cuenta. */
  devices: { id: string; name: string; type: string }[];
  /** Sensibilidad para detectar que la caldera calienta (subida mínima de la casa). */
  heatSensitivity: 'alta' | 'media' | 'baja';
  /** Notificar en el móvil cuando parece que arranca. */
  notifyHeating: boolean;
  /** Enchufes SwitchBot con medidor detectados en la cuenta. */
  plugs: { id: string; name: string; type: string }[];
  /** Enchufe en el que está la caldera (null = no se usa). */
  plugId: string | null;
  /** A partir de estos vatios se considera que el quemador está funcionando. */
  plugThresholdW: number;
  /** kg de pellet por hora de quemador, para estimar el consumo (null = sin calibrar). */
  kgPerBurnerHour: number | null;
}

/** Lectura del enchufe de la caldera. */
export interface PlugReading {
  /** Fecha y hora ISO. */
  at: string;
  watts: number;
}

export interface TempReading {
  /** Fecha y hora ISO. */
  at: string;
  deviceId: string;
  temperature: number;
  humidity: number | null;
  battery: number | null;
}

export interface OutdoorDay {
  date: string;
  mean: number;
  min: number;
  max: number;
}

export interface ClimateData {
  readings: TempReading[];
  /** Lecturas de potencia del enchufe de la caldera. */
  plug?: PlugReading[];
  outdoor: {
    fetchedAt: string;
    lat: number;
    lon: number;
    /** Días pasados y previstos; los posteriores a hoy son previsión. */
    daily: OutdoorDay[];
    current: { at: string; temperature: number; humidity: number | null } | null;
  } | null;
}
