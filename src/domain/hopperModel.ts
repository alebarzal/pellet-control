import { consumptionStats, currentLevel, levelCategory, refillKg, sortRecords, statsData } from './calc';
import { efficiencyModel, hdd, outdoorByDate } from './climate';
import { fromIso, todayIso, toIso } from './dates';
import { autoKgPerBurnerHour } from './plug';
import type { AppData, LevelCategory, LevelRecord, PelletRecord, PlugReading, RefillRecord } from './types';

/**
 * Nivel de la tolva «en vivo».
 *
 * Parte de la última lectura (foto, porcentaje o estimación a ojo), suma las recargas posteriores y resta
 * lo que se ha quemado desde entonces:
 *   1. Con el enchufe midiendo: horas de quemador × kg por hora.
 *   2. En los ratos sin lecturas del enchufe: el ritmo medio de los últimos días.
 * Los kg por hora salen de tus propias lecturas: entre dos lecturas de nivel seguidas se sabe cuánto
 * pellet bajó y cuántas horas estuvo el quemador encendido. Cada lectura nueva afina el ritmo y, además,
 * sirve para comprobar el cálculo (lo que decía el modelo frente a lo que has medido).
 */

const H = 3600_000;
const DAY = 24 * H;
/** Una lectura del enchufe cubre como mucho este tiempo (igual que en plug.ts). */
const MAX_SLOT_MS = 30 * 60_000;
const LAST_SLOT_MS = 15 * 60_000;
/** Límites razonables de una caldera doméstica (kg por hora de quemador). */
const MIN_RATE = 0.3;
const MAX_RATE = 8;

export interface BurnRate {
  kgPerHour: number;
  /** manual: puesto en Clima · lecturas: entre lecturas de nivel · consumos: consumos apuntados. */
  source: 'manual' | 'lecturas' | 'consumos';
  /** Tramos entre lecturas usados. */
  samples: number;
  /** Dispersión relativa entre tramos (0,15 = ±15 %). Null si solo hay uno. */
  spread: number | null;
}

export interface TrackPoint {
  at: number;
  percent: number;
  low: number;
  high: number;
  future: boolean;
}

export interface LevelCheck {
  id: string;
  at: number;
  date: string;
  /** Lo medido. */
  percent: number;
  exact: boolean;
  photo: boolean;
  /** Lo que decía el cálculo justo antes de esa lectura (null si no había de dónde partir). */
  predicted: number | null;
}

export interface HopperModel {
  capacityKg: number;
  /** Última lectura, de la que parte el cálculo. */
  anchor: { at: number; date: string; percent: number; kg: number; exact: boolean; photo: boolean };
  refilledKg: number;
  burnedKg: number;
  /** Horas de quemador medidas por el enchufe desde la última lectura. */
  burnerHours: number;
  /** Parte del tiempo desde la última lectura con el enchufe midiendo (0–1). */
  coverage: number;
  kg: number;
  percent: number;
  /** Margen de la estimación, en kg (±). */
  marginKg: number;
  rate: BurnRate | null;
  /** quemador: horas del enchufe · media: ritmo medio diario · lectura: no hay con qué calcular. */
  method: 'quemador' | 'media' | 'lectura';
  /** kg al día previstos para los próximos días. */
  dailyKg: number | null;
  /** Cuándo se vaciaría la tolva sin recargar (null si no se puede prever). */
  emptyAt: number | null;
  /** Desde la última lectura hasta ahora, y la previsión hacia delante. */
  track: TrackPoint[];
  /** Lo que iba diciendo el cálculo entre las lecturas anteriores. */
  past: TrackPoint[][];
  /** Últimas lecturas, de la más nueva a la más antigua, con lo que decía el cálculo. */
  checks: LevelCheck[];
  /** Error medio del cálculo frente a las lecturas, en puntos de porcentaje. */
  meanError: number | null;
}

/* ───────────── Enchufe: horas de quemador entre dos momentos ───────────── */

interface Slot {
  from: number;
  to: number;
  on: boolean;
}

function slots(readings: PlugReading[], thresholdW: number, now: number): Slot[] {
  const sorted = readings.map((r) => ({ t: new Date(r.at).getTime(), w: r.watts })).sort((a, b) => a.t - b.t);
  return sorted.map((r, i) => {
    const next = i + 1 < sorted.length ? sorted[i + 1].t : Math.min(now, r.t + LAST_SLOT_MS);
    return { from: r.t, to: r.t + Math.max(0, Math.min(next - r.t, MAX_SLOT_MS)), on: r.w >= thresholdW };
  });
}

/** Horas con el quemador encendido y horas cubiertas por lecturas, entre `a` y `b`. */
function burnBetween(sl: Slot[], a: number, b: number): { onH: number; covH: number } {
  let on = 0;
  let cov = 0;
  for (const s of sl) {
    if (s.to <= a) continue;
    if (s.from >= b) break;
    const d = Math.min(s.to, b) - Math.max(s.from, a);
    if (d <= 0) continue;
    cov += d;
    if (s.on) on += d;
  }
  return { onH: on / H, covH: cov / H };
}

/* ───────────── Línea de tiempo de la tolva ───────────── */

/** Momento de un registro: su hora de creación si es del mismo día; si se apuntó con otra fecha, el mediodía de esa fecha. */
function recordTime(r: PelletRecord): number {
  return toIso(new Date(r.createdAt)) === r.date ? r.createdAt : fromIso(r.date).getTime() + 12 * H;
}

interface Ev {
  at: number;
  level?: LevelRecord;
  /** kg recargados; null = recarga sin cantidad (se supone que se llenó). */
  refill?: number | null;
}

function events(data: AppData): Ev[] {
  const out: Ev[] = [];
  let last = -Infinity;
  for (const r of sortRecords(data.records)) {
    if (r.kind !== 'level' && r.kind !== 'refill') continue;
    // El orden de los registros manda: nunca se retrocede en el tiempo.
    const at = Math.max(last + 1, recordTime(r));
    last = at;
    if (r.kind === 'level') out.push({ at, level: r });
    else out.push({ at, refill: refillKg(r as RefillRecord, data.settings) });
  }
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ───────────── Ritmo: kg por hora de quemador ───────────── */

function weightedMedian(xs: { v: number; w: number }[]): number {
  const s = [...xs].sort((a, b) => a.v - b.v);
  const half = s.reduce((t, x) => t + x.w, 0) / 2;
  let acc = 0;
  for (const x of s) {
    acc += x.w;
    if (acc >= half) return x.v;
  }
  return s[s.length - 1].v;
}

/**
 * kg por hora de quemador. Entre dos lecturas de nivel seguidas: (lo que bajó + lo recargado) ÷ horas de quemador.
 * Solo cuentan los tramos con el enchufe midiendo casi todo el rato; las lecturas a ojo pesan menos que las
 * medidas, y los tramos que se salen mucho del resto se descartan.
 */
export function burnRate(data: AppData, now = Date.now()): BurnRate | null {
  const c = data.settings.climate;
  if (c.kgPerBurnerHour != null) return { kgPerHour: c.kgPerBurnerHour, source: 'manual', samples: 0, spread: null };
  const cap = data.settings.hopperCapacityKg;
  const sl = c.plugId ? slots(data.climate.plug ?? [], c.plugThresholdW, now) : [];
  const samples: { v: number; w: number }[] = [];
  if (cap && sl.length) {
    let prev: Ev | null = null;
    let added = 0;
    let clean = true;
    for (const e of events(data)) {
      if (!e.level) {
        if (e.refill == null) clean = false;
        else added += e.refill;
        continue;
      }
      if (prev?.level && clean && e.at - prev.at >= 2 * H && e.at - prev.at <= 21 * DAY) {
        const b = burnBetween(sl, prev.at, e.at);
        const total = (e.at - prev.at) / H;
        const burned = ((prev.level.percent - e.level.percent) / 100) * cap + added;
        // Con la tolva a tope o vacía no se sabe cuánto bajó de verdad.
        const usable = e.level.percent > 2 && prev.level.percent + (added / cap) * 100 <= 102;
        if (usable && b.covH / total >= 0.8 && b.onH >= 1 && burned > 0.5) {
          const v = burned / b.onH;
          const exact = !prev.level.approximate && !e.level.approximate;
          if (v >= MIN_RATE && v <= MAX_RATE) samples.push({ v, w: b.onH * (exact ? 1 : 0.35) });
        }
      }
      prev = e;
      added = 0;
      clean = true;
    }
  }
  if (samples.length) {
    const med = weightedMedian(samples);
    const kept = samples.length >= 3 ? samples.filter((s) => Math.abs(s.v - med) <= med * 0.4) : samples;
    const w = kept.reduce((t, s) => t + s.w, 0);
    const mean = kept.reduce((t, s) => t + s.v * s.w, 0) / w;
    const sd = Math.sqrt(kept.reduce((t, s) => t + s.w * (s.v - mean) ** 2, 0) / w);
    return { kgPerHour: Math.round(mean * 100) / 100, source: 'lecturas', samples: kept.length, spread: kept.length > 1 ? sd / mean : null };
  }
  const auto = autoKgPerBurnerHour(data, now);
  return auto ? { kgPerHour: auto.value, source: 'consumos', samples: 0, spread: null } : null;
}

/* ───────────── Modelo ───────────── */

interface Ctx {
  cap: number;
  sl: Slot[];
  rate: number | null;
  /** kg por hora en los ratos sin lecturas del enchufe. */
  idleKgH: number;
}

/** kg quemados entre dos momentos, separando lo medido con el enchufe de lo supuesto. */
function burned(ctx: Ctx, a: number, b: number): { measured: number; assumed: number; onH: number; covH: number } {
  if (b <= a) return { measured: 0, assumed: 0, onH: 0, covH: 0 };
  const total = (b - a) / H;
  if (ctx.rate == null) return { measured: 0, assumed: total * ctx.idleKgH, onH: 0, covH: 0 };
  const x = burnBetween(ctx.sl, a, b);
  return { measured: x.onH * ctx.rate, assumed: Math.max(0, total - x.covH) * ctx.idleKgH, onH: x.onH, covH: x.covH };
}

/** Avanza la tolva desde `kg` en `from` hasta `to`, pasando por las recargas intermedias. */
function advance(ctx: Ctx, kg: number, from: number, to: number, evs: Ev[]) {
  let t = from;
  let level = kg;
  let measured = 0;
  let assumed = 0;
  let refilled = 0;
  let onH = 0;
  let covH = 0;
  let unknownRefill = false;
  const step = (until: number) => {
    const x = burned(ctx, t, until);
    const take = Math.min(level, x.measured + x.assumed);
    const k = x.measured + x.assumed > 0 ? take / (x.measured + x.assumed) : 0;
    measured += x.measured * k;
    assumed += x.assumed * k;
    onH += x.onH;
    covH += x.covH;
    level -= take;
    t = until;
  };
  for (const e of evs) {
    if (e.level || e.at <= from || e.at > to) continue;
    step(e.at);
    if (e.refill == null) {
      unknownRefill = true;
      refilled += ctx.cap - level;
      level = ctx.cap;
    } else {
      const fit = Math.min(e.refill, ctx.cap - level);
      refilled += fit;
      level += fit;
    }
  }
  step(to);
  return { kg: level, measured, assumed, refilled, onH, covH, unknownRefill };
}

/** kg al día previstos: lo que marca el quemador estos días, ajustado al frío previsto si hay datos de clima. */
function dailyForecast(data: AppData, ctx: Ctx, now: number): { base: number | null; byDate: (iso: string) => number | null } {
  let base: number | null = null;
  let from = now - 7 * DAY;
  if (ctx.rate != null) {
    const x = burnBetween(ctx.sl, from, now);
    if (x.covH >= 12) base = (x.onH / x.covH) * 24 * ctx.rate;
    else from = now;
  }
  const avg = consumptionStats(statsData(data), toIso(new Date(now))).avgDailyKg;
  const eff = efficiencyModel(data, toIso(new Date(now)));
  const temps = outdoorByDate(data);
  const baseT = data.settings.climate.baseTempC;
  const climateKg = (iso: string) => {
    const t = temps.get(iso);
    return eff && t ? eff.baseKgPerDay + hdd(t.mean, baseT) * eff.kgPerHdd : null;
  };
  // Con quemador y clima: la forma la da el frío previsto y la escala, lo que de verdad se ha quemado estos días.
  let scale = 1;
  if (base != null && eff) {
    let sum = 0;
    let n = 0;
    for (let t = from; t < now; t += DAY) {
      const k = climateKg(toIso(new Date(t)));
      if (k != null) {
        sum += k;
        n++;
      }
    }
    if (n >= 3 && sum > 0) scale = clamp(base / (sum / n), 0.5, 2);
  }
  const flat = base ?? avg ?? null;
  return {
    base: flat,
    byDate: (iso) => {
      const k = climateKg(iso);
      if (k != null && (base != null || avg == null)) return k * scale;
      return flat ?? k;
    },
  };
}

export function hopperModel(data: AppData, now = Date.now()): HopperModel | null {
  const cap = data.settings.hopperCapacityKg;
  if (!cap) return null;
  const evs = events(data);
  const levels = evs.filter((e) => e.level);
  const last = levels.at(-1);
  if (!last?.level) return null;

  const c = data.settings.climate;
  const rate = burnRate(data, now);
  const sl = c.plugId ? slots(data.climate.plug ?? [], c.plugThresholdW, now) : [];
  const usePlug = rate != null && sl.length > 0;
  const avgDaily = consumptionStats(statsData(data), toIso(new Date(now))).avgDailyKg;
  let idleKgH = avgDaily != null ? avgDaily / 24 : 0;
  if (usePlug) {
    const recent = burnBetween(sl, now - 7 * DAY, now);
    if (recent.covH >= 12) idleKgH = (recent.onH / recent.covH) * rate.kgPerHour;
  }
  const ctx: Ctx = { cap, sl, rate: usePlug ? rate.kgPerHour : null, idleKgH };

  const anchorKg = (cap * last.level.percent) / 100;
  const end = Math.max(now, last.at);
  const run = advance(ctx, anchorKg, last.at, end, evs);
  const spread = clamp(rate?.spread ?? 0.25, 0.1, 0.5);
  const marginAt = (measured: number, assumed: number, unknown: boolean) =>
    clamp(cap * (last.level!.approximate ? 0.1 : 0.03) + measured * spread + assumed * 0.4 + (unknown ? cap * 0.1 : 0), 0, cap / 2);
  const marginKg = marginAt(run.measured, run.assumed, run.unknownRefill);
  const elapsedH = (end - last.at) / H;
  const method: HopperModel['method'] = run.measured > 0 || (usePlug && run.covH > 0) ? 'quemador' : run.assumed > 0 ? 'media' : 'lectura';

  /* Recorrido para el gráfico: desde la última lectura hasta ahora… */
  const pct = (kg: number) => clamp((kg / cap) * 100, 0, 100);
  const trace = (startKg: number, from: number, to: number, n: number): TrackPoint[] => {
    const m0 = marginAt(0, 0, false);
    const out: TrackPoint[] = [{ at: from, percent: pct(startKg), low: pct(startKg - m0), high: pct(startKg + m0), future: false }];
    const stepMs = Math.max(30 * 60_000, (to - from) / n);
    const times = new Set<number>(evs.filter((e) => !e.level && e.at > from && e.at <= to).flatMap((e) => [e.at - 1, e.at]));
    for (let x = from + stepMs; x < to; x += stepMs) times.add(x);
    if (to > from) times.add(to);
    for (const x of [...times].sort((a, b) => a - b)) {
      if (x <= from) continue;
      const r = advance(ctx, startKg, from, x, evs);
      const m = marginAt(r.measured, r.assumed, r.unknownRefill);
      out.push({ at: x, percent: pct(r.kg), low: pct(r.kg - m), high: pct(r.kg + m), future: false });
    }
    return out;
  };
  const track = trace(anchorKg, last.at, end, 40);
  const push = (at: number, kg: number, m: number, future: boolean) => track.push({ at, percent: pct(kg), low: pct(kg - m), high: pct(kg + m), future });
  // Tramos anteriores (de lectura a lectura), para ver en el gráfico si el cálculo iba cuadrando.
  const past: TrackPoint[][] = [];
  for (let i = Math.max(1, levels.length - 3); i < levels.length; i++) {
    const a = levels[i - 1];
    const b = levels[i];
    if (b.at - a.at <= 30 * DAY && b.at - a.at >= H) past.push(trace((cap * a.level!.percent) / 100, a.at, b.at, 16));
  }

  /* …y de ahora en adelante, hasta que se vacíe (o 14 días). */
  const fc = dailyForecast(data, ctx, now);
  let emptyAt: number | null = null;
  if (fc.base != null || fc.byDate(toIso(new Date(now))) != null) {
    let kg = run.kg;
    let t = end;
    let extra = 0;
    const STEP = 6 * H;
    for (let i = 0; i < 56 && kg > 0; i++) {
      const perDay = fc.byDate(toIso(new Date(t))) ?? fc.base ?? 0;
      const use = (perDay * STEP) / DAY;
      if (use <= 0) break;
      if (use >= kg) {
        emptyAt = t + (kg / use) * STEP;
        push(emptyAt, 0, marginKg + extra, true);
        kg = 0;
        break;
      }
      kg -= use;
      extra += use * 0.3;
      t += STEP;
      push(t, kg, clamp(marginKg + extra, 0, cap / 2), true);
    }
  }

  /* Cuadre: lo que decía el cálculo justo antes de cada lectura. */
  const checks: LevelCheck[] = [];
  for (let i = Math.max(0, levels.length - 8); i < levels.length; i++) {
    const e = levels[i];
    const prev = i > 0 ? levels[i - 1] : null;
    let predicted: number | null = null;
    if (prev?.level && e.at - prev.at <= 30 * DAY) {
      const r = advance(ctx, (cap * prev.level.percent) / 100, prev.at, e.at, evs);
      // Solo vale como comprobación si había con qué calcular ese tramo.
      if (r.measured + r.assumed > 0 || r.refilled > 0 || e.at - prev.at < H) predicted = pct(r.kg);
    }
    checks.push({ id: e.level!.id, at: e.at, date: e.level!.date, percent: e.level!.percent, exact: !e.level!.approximate, photo: typeof e.level!.photo === 'number', predicted });
  }
  checks.reverse();
  const errs = checks.filter((k) => k.predicted != null && k.exact).map((k) => Math.abs(k.predicted! - k.percent));

  return {
    capacityKg: cap,
    anchor: { at: last.at, date: last.level.date, percent: last.level.percent, kg: anchorKg, exact: !last.level.approximate, photo: typeof last.level.photo === 'number' },
    refilledKg: run.refilled,
    burnedKg: run.measured + run.assumed,
    burnerHours: run.onH,
    coverage: elapsedH > 0 ? clamp(run.covH / elapsedH, 0, 1) : 1,
    kg: run.kg,
    percent: pct(run.kg),
    marginKg,
    rate,
    method,
    dailyKg: fc.byDate(toIso(new Date(now))) ?? fc.base,
    emptyAt,
    track,
    past,
    checks,
    meanError: errs.length ? errs.reduce((s, v) => s + v, 0) / errs.length : null,
  };
}

/* ───────────── ¿Toca comprobarlo con una foto? ───────────── */

/** Puntos de porcentaje que puede bajar el nivel calculado desde la última lectura antes de pedir una foto. */
export const CHECK_AFTER_POINTS = 20;
/** Tras un «ahora no», se vuelve a pedir cuando baja estos puntos más. */
export const CHECK_AGAIN_POINTS = 10;

export interface PhotoCheck {
  /** Hay que pedir la foto ahora. */
  due: boolean;
  /** Nivel del que partía el cálculo (última lectura más recargas), en %. */
  from: number;
  /** Nivel calculado ahora, en %. */
  to: number;
  /** Puntos que ha bajado solo por cálculo, sin ninguna lectura que lo confirme. */
  drop: number;
}

export interface CheckSnooze {
  /** Lectura a la que se refiere el aplazamiento. */
  anchorAt: number;
  /** Nivel calculado cuando se aplazó. */
  percent: number;
}

/**
 * Cuando el nivel calculado se ha alejado mucho de la última lectura (por ejemplo de 70 % a 50 %), el error
 * acumulado puede ser grande: toca medir con una foto, que corrige el nivel y afina los kg por hora.
 */
export function photoCheck(m: HopperModel | null, snooze: CheckSnooze | null = null): PhotoCheck | null {
  if (!m || m.capacityKg <= 0 || m.method === 'lectura') return null;
  const to = m.percent;
  const from = Math.min(100, ((m.kg + m.burnedKg) / m.capacityKg) * 100);
  const drop = Math.max(0, from - to);
  let due = drop >= CHECK_AFTER_POINTS;
  if (due && snooze && snooze.anchorAt === m.anchor.at && to > snooze.percent - CHECK_AGAIN_POINTS) due = false;
  return { due, from, to, drop };
}

/** Lo que necesita el móvil para avisar con la app cerrada: cuánto pellet falta por quemar hasta pedir la foto. */
export interface PhotoCheckPlan {
  /** Identifica el aviso (lectura de partida y nivel al que salta): no se repite dos veces el mismo. */
  key: string;
  remainingKg: number;
  /** kg por hora de quemador (0 si no se calcula con el enchufe). */
  kgPerHour: number;
  /** kg al día previstos, para cuando no hay lectura del enchufe. */
  kgPerDay: number;
  fromPercent: number;
  targetPercent: number;
}

/**
 * Plan del aviso en segundo plano. Null si no hay nada que vigilar: sin datos de quemado, o si el aviso
 * ya está a la vista dentro de la app.
 */
export function photoCheckPlan(m: HopperModel | null, snooze: CheckSnooze | null = null): PhotoCheckPlan | null {
  const c = photoCheck(m, snooze);
  if (!c || !m || c.due) return null;
  const snoozed = snooze != null && snooze.anchorAt === m.anchor.at && c.drop >= CHECK_AFTER_POINTS;
  const target = snoozed ? snooze.percent - CHECK_AGAIN_POINTS : c.from - CHECK_AFTER_POINTS;
  const remainingKg = ((c.to - target) / 100) * m.capacityKg;
  if (target <= 0 || remainingKg <= 0) return null;
  const kgPerHour = m.method === 'quemador' && m.rate ? m.rate.kgPerHour : 0;
  const kgPerDay = m.dailyKg ?? 0;
  if (kgPerHour <= 0 && kgPerDay <= 0) return null;
  return { key: `${m.anchor.at}:${Math.round(target)}`, remainingKg, kgPerHour, kgPerDay, fromPercent: c.from, targetPercent: target };
}

/* ───────────── Lo que usa el resto de la app ───────────── */

/** «Ahora» para un cálculo hecho como si fuera el día `today` (hoy = el momento actual; otro día = su mediodía). */
export const nowFor = (today: string) => (today === todayIso() ? Date.now() : fromIso(today).getTime() + 12 * 3600_000);

export interface HopperEstimate {
  percent: number;
  category: LevelCategory;
  /** true si es una estimación (lectura a ojo o nivel calculado), false si es lo último medido tal cual. */
  approximate: boolean;
  /** kg estimados en la tolva, null si no hay capacidad configurada. */
  kg: number | null;
  /** Fecha de la última lectura. */
  date: string;
  /** El nivel se ha movido desde la última lectura (recargas o pellet quemado). */
  live: boolean;
  model: HopperModel | null;
}

/** Nivel actual de la tolva: la última lectura, puesta al día con recargas y pellet quemado. */
export function hopperEstimate(data: AppData, now = Date.now()): HopperEstimate | null {
  const lvl = currentLevel(data.records);
  if (!lvl) return null;
  const m = hopperModel(data, now);
  if (!m) return { percent: lvl.percent, category: levelCategory(lvl.percent), approximate: lvl.approximate, kg: null, date: lvl.date, live: false, model: null };
  const live = Math.abs(m.kg - m.anchor.kg) >= 0.05;
  const percent = live ? m.percent : lvl.percent;
  return { percent, category: levelCategory(percent), approximate: lvl.approximate || live, kg: live ? m.kg : m.anchor.kg, date: lvl.date, live, model: m };
}
