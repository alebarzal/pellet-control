import type { Certification, MarketProduct, PriceObservation, QualitySpec } from './types';

/* ───────────── Lectura de fichas de producto ───────────── */

export interface ParsedProduct {
  name: string | null;
  brand: string | null;
  price: number | null;
  currency: string | null;
  available: boolean | null;
  weightKg: number | null;
  quality: Partial<QualitySpec>;
  /** De dónde salió el precio. */
  method: 'json-ld' | 'meta' | null;
}

const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const t = v.trim().replace(/\s|€/g, '');
    // "1.234,56" o "1234,56" o "1234.56"
    const norm = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    const n = Number(norm);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

function* walk(node: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(node)) for (const n of node) yield* walk(n);
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    yield o;
    if (o['@graph']) yield* walk(o['@graph']);
  }
}

const isType = (o: Record<string, unknown>, t: string) => {
  const ty = o['@type'];
  return ty === t || (Array.isArray(ty) && ty.includes(t));
};

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

/** Texto visible aproximado de la página, para buscar datos de calidad. */
export function pageText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

const pct = (re: RegExp, text: string): number | null => {
  const m = text.match(re);
  return m ? num(m[1]) : null;
};

export function extractQuality(text: string): Partial<QualitySpec> {
  const t = text;
  const q: Partial<QualitySpec> = {};
  const enA1 = /en\s?-?\s?plus\s*(?:®)?\s*(?:clase\s*)?a\s?-?\s?1\b/i.test(t);
  const enA2 = /en\s?-?\s?plus\s*(?:®)?\s*(?:clase\s*)?a\s?-?\s?2\b/i.test(t);
  const din = /din\s?-?\s?plus/i.test(t);
  if (enA1) q.certification = 'enplus-a1';
  else if (din) q.certification = 'dinplus';
  else if (enA2) q.certification = 'enplus-a2';
  else if (/\b(?:en|iso)\s?-?\s?a\s?-?\s?1\b|\bclase a1\b/i.test(t)) q.certification = 'iso-a1';

  q.ashPct = pct(/cenizas?[^%\d]{0,40}?(?:<|≤|inferior a|menor (?:a|de)|del?)?\s*(\d+(?:[.,]\d+)?)\s?%/i, t) ?? pct(/ash[^%\d]{0,25}?(\d+(?:[.,]\d+)?)\s?%/i, t);
  q.moisturePct = pct(/humedad[^%\d]{0,40}?(?:<|≤|inferior a|menor (?:a|de)|del?)?\s*(\d+(?:[.,]\d+)?)\s?%/i, t);
  q.durabilityPct = pct(/durabilidad[^%\d]{0,40}?(?:>|≥|superior a|mayor (?:a|de)|del?)?\s*(\d{2}(?:[.,]\d+)?)\s?%/i, t);
  const kwh = pct(/(\d+(?:[.,]\d+)?)\s?kwh\s?\/\s?kg/i, t);
  const mj = pct(/(\d{2}(?:[.,]\d+)?)\s?mj\s?\/\s?kg/i, t);
  q.ncvKwhKg = kwh ?? (mj != null ? Math.round((mj / 3.6) * 100) / 100 : null);
  const dia = t.match(/(?:di[aá]metro|grosor)[^\d]{0,20}(\d(?:[.,]\d)?)\s?mm/i) ?? t.match(/\b([68])\s?mm\b/i);
  q.diameterMm = dia ? num(dia[1]) : null;

  // Descarta valores absurdos (p. ej. porcentajes que no son de cenizas)
  if (q.ashPct != null && (q.ashPct <= 0 || q.ashPct > 10)) q.ashPct = null;
  if (q.moisturePct != null && (q.moisturePct <= 0 || q.moisturePct > 25)) q.moisturePct = null;
  if (q.durabilityPct != null && (q.durabilityPct < 80 || q.durabilityPct > 100)) q.durabilityPct = null;
  if (q.ncvKwhKg != null && (q.ncvKwhKg < 3 || q.ncvKwhKg > 6)) q.ncvKwhKg = null;
  if (q.diameterMm != null && (q.diameterMm < 4 || q.diameterMm > 12)) q.diameterMm = null;
  return q;
}

export function extractWeightKg(text: string): number | null {
  const m = text.match(/(\d{1,4}(?:[.,]\d)?)\s?kg\b/i);
  const n = m ? num(m[1]) : null;
  // Admite sacos (5–30 kg) y packs o palés (hasta 1.500 kg)
  return n != null && n >= 5 && n <= 1500 ? n : null;
}

/** Extrae precio, nombre, marca y datos de calidad de una ficha de producto (schema.org / meta). */
export function parseProductPage(html: string): ParsedProduct {
  const out: ParsedProduct = {
    name: null,
    brand: null,
    price: null,
    currency: null,
    available: null,
    weightKg: null,
    quality: {},
    method: null,
  };

  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.price == null) {
    let json: unknown;
    try {
      json = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    for (const o of walk(json)) {
      if (!isType(o, 'Product')) continue;
      out.name ??= typeof o.name === 'string' ? decodeEntities(o.name) : null;
      const b = o.brand as unknown;
      out.brand ??= typeof b === 'string' ? b : b && typeof b === 'object' && typeof (b as { name?: unknown }).name === 'string' ? (b as { name: string }).name : null;
      for (const off of walk(o.offers)) {
        const price = num(off.price) ?? num(off.lowPrice);
        if (price != null && price > 0) {
          out.price = price;
          out.currency = typeof off.priceCurrency === 'string' ? off.priceCurrency : null;
          const av = typeof off.availability === 'string' ? off.availability : '';
          out.available = av ? /InStock|LimitedAvailability|OnlineOnly|PreOrder/i.test(av) : null;
          for (const meas of walk(off.hasMeasurement)) {
            if (/weight|peso/i.test(String(meas.name ?? '')) && /kg|KGM/i.test(String(meas.unitCode ?? ''))) out.weightKg ??= num(meas.value);
          }
          out.method = 'json-ld';
          break;
        }
      }
      if (out.price != null) break;
    }
  }

  if (out.price == null) {
    const meta = (prop: string) => {
      const r1 = new RegExp(`<meta[^>]+(?:property|itemprop|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i');
      const r2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|itemprop|name)=["']${prop}["']`, 'i');
      return (html.match(r1) ?? html.match(r2))?.[1] ?? null;
    };
    const p = num(meta('product:price:amount') ?? meta('og:price:amount') ?? meta('price'));
    if (p != null && p > 0) {
      out.price = p;
      out.currency = meta('product:price:currency') ?? meta('og:price:currency') ?? meta('priceCurrency');
      out.method = 'meta';
    }
    out.name ??= meta('og:title');
  }

  const text = pageText(html);
  out.quality = extractQuality(`${out.name ?? ''} ${text}`);
  out.weightKg ??= extractWeightKg(out.name ?? '') ?? extractWeightKg(text.slice(0, 4000));
  return out;
}

export function storeFromUrl(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    const base = h.split('.').slice(-2, -1)[0] ?? h;
    const known: Record<string, string> = {
      elcorteingles: 'El Corte Inglés',
      obramat: 'Obramat',
      leroymerlin: 'Leroy Merlin',
      bricomart: 'Obramat',
      autosolar: 'Autosolar',
      amazon: 'Amazon',
      manomano: 'ManoMano',
      bauhaus: 'Bauhaus',
      carrefour: 'Carrefour',
      alcampo: 'Alcampo',
      lidl: 'Lidl',
      bricodepot: 'Brico Dépôt',
    };
    return known[base] ?? base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return '';
  }
}

/* ───────────── Calidad ───────────── */

export const CERT_LABEL: Record<Certification, string> = {
  'enplus-a1': 'ENplus A1',
  'enplus-a2': 'ENplus A2',
  dinplus: 'DINplus',
  'iso-a1': 'A1 sin sello',
  none: 'Sin certificar',
  unknown: 'Certificación desconocida',
};

/**
 * Referencia de la clase A1 (ISO 17225-2 / esquema ENplus).
 * La durabilidad usa el umbral ENplus (98 %); la ISO 17225-2 admite 97,5 %.
 */
export const A1_LIMITS = { ashPct: 0.7, moisturePct: 10, durabilityPct: 98, ncvKwhKg: 4.6 };

export interface QualityCheck {
  label: string;
  value: string;
  limit: string;
  ok: boolean | null;
}

export interface QualityAssessment {
  /** 0–100, null si no hay ningún dato. */
  score: number | null;
  label: string;
  checks: QualityCheck[];
  /** Cuántos de los datos clave se conocen (certificación + 4 parámetros). */
  known: number;
}

const f1 = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });

export function assessQuality(q: QualitySpec): QualityAssessment {
  const checks: QualityCheck[] = [
    {
      label: 'Cenizas',
      value: q.ashPct != null ? `${f1(q.ashPct)} %` : '—',
      limit: `≤ ${f1(A1_LIMITS.ashPct)} %`,
      ok: q.ashPct != null ? q.ashPct <= A1_LIMITS.ashPct : null,
    },
    {
      label: 'Humedad',
      value: q.moisturePct != null ? `${f1(q.moisturePct)} %` : '—',
      limit: `≤ ${A1_LIMITS.moisturePct} %`,
      ok: q.moisturePct != null ? q.moisturePct <= A1_LIMITS.moisturePct : null,
    },
    {
      label: 'Poder calorífico',
      value: q.ncvKwhKg != null ? `${f1(q.ncvKwhKg)} kWh/kg` : '—',
      limit: `≥ ${f1(A1_LIMITS.ncvKwhKg)} kWh/kg`,
      ok: q.ncvKwhKg != null ? q.ncvKwhKg >= A1_LIMITS.ncvKwhKg : null,
    },
    {
      label: 'Durabilidad',
      value: q.durabilityPct != null ? `${f1(q.durabilityPct)} %` : '—',
      limit: `≥ ${A1_LIMITS.durabilityPct} %`,
      ok: q.durabilityPct != null ? q.durabilityPct >= A1_LIMITS.durabilityPct : null,
    },
  ];
  const known = checks.filter((c) => c.ok != null).length + (q.certification !== 'unknown' ? 1 : 0);
  if (known === 0) return { score: null, label: 'Sin datos de calidad', checks, known };

  const base: Record<Certification, number> = {
    'enplus-a1': 72,
    dinplus: 72,
    'iso-a1': 60,
    'enplus-a2': 52,
    none: 30,
    unknown: 45,
  };
  let s = base[q.certification];
  if (q.ashPct != null) s += q.ashPct <= 0.5 ? 10 : q.ashPct <= 0.7 ? 5 : q.ashPct <= 1.2 ? -8 : -18;
  if (q.moisturePct != null) s += q.moisturePct <= 8 ? 6 : q.moisturePct <= 10 ? 2 : -15;
  if (q.ncvKwhKg != null) s += q.ncvKwhKg >= 5 ? 6 : q.ncvKwhKg >= 4.6 ? 2 : -10;
  if (q.durabilityPct != null) s += q.durabilityPct >= 98.5 ? 6 : q.durabilityPct >= 98 ? 2 : -8;
  const score = Math.max(0, Math.min(100, Math.round(s)));
  const label = score >= 85 ? 'Excelente' : score >= 72 ? 'Buena' : score >= 55 ? 'Aceptable' : 'Baja';
  return { score, label, checks, known };
}

/* ───────────── Precios ───────────── */

export function sortedPrices(p: MarketProduct): PriceObservation[] {
  return [...p.prices].sort((a, b) => (a.at < b.at ? -1 : 1));
}

export function latestPrice(p: MarketProduct): PriceObservation | null {
  return sortedPrices(p).at(-1) ?? null;
}

export function pricePerKg(p: MarketProduct): number | null {
  const l = latestPrice(p);
  return l && p.bagWeightKg > 0 ? l.price / p.bagWeightKg : null;
}

/** Variación del último precio respecto al anterior distinto. */
export function lastChange(p: MarketProduct): number | null {
  const s = sortedPrices(p);
  const last = s.at(-1);
  if (!last) return null;
  for (let i = s.length - 2; i >= 0; i--) if (s[i].price !== last.price) return last.price - s[i].price;
  return null;
}

export interface MarketRow {
  product: MarketProduct;
  price: PriceObservation | null;
  perKg: number | null;
  quality: QualityAssessment;
  /** Puntos de calidad por euro/kg: más alto, mejor relación calidad/precio. */
  value: number | null;
}

export function marketRows(products: MarketProduct[]): MarketRow[] {
  return products.map((product) => {
    const perKg = pricePerKg(product);
    const quality = assessQuality(product.quality);
    return {
      product,
      price: latestPrice(product),
      perKg,
      quality,
      value: perKg && quality.score != null ? quality.score / (perKg * 100) : null,
    };
  });
}

export type MarketSort = 'precio' | 'calidad' | 'valor';

export function sortRows(rows: MarketRow[], by: MarketSort): MarketRow[] {
  const key = (r: MarketRow) => (by === 'precio' ? r.perKg : by === 'calidad' ? r.quality.score : r.value);
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka == null && kb == null) return 0;
    if (ka == null) return 1;
    if (kb == null) return -1;
    return by === 'precio' ? ka - kb : kb - ka;
  });
}

export const emptyQuality = (): QualitySpec => ({
  certification: 'unknown',
  ashPct: null,
  moisturePct: null,
  ncvKwhKg: null,
  durabilityPct: null,
  diameterMm: null,
});

/* ───────────── Importar desde una foto (saco o etiqueta de precio) ───────────── */

/** Marcas habituales en España, para reconocerlas en el texto de la foto. */
const KNOWN_BRANDS = ['Huella Verde', 'Naturpellet', 'Enerbio', 'Burpellet', 'Ecoforest', 'Pellets Asturias', 'Biomasa Forestal', 'Amatex', 'Ribpellet', 'Gesbrick', 'Pinewells'];

export interface LabelData {
  name: string | null;
  brand: string | null;
  weightKg: number | null;
  /** Precio del saco (no el precio por kg que también traen las etiquetas del lineal). */
  price: number | null;
  quality: Partial<QualitySpec>;
}

/** Precio del formato en un texto de etiqueta: ignora los «€/kg» y se queda con el importe mayor. */
export function extractLabelPrice(text: string): number | null {
  const found: number[] = [];
  const re = /(?:€\s?(\d{1,4}[.,]\d{2})|(\d{1,4}[.,]\d{2})\s?(?:€|eur\b))(\s?\/\s?(?:kg|kilo|k\b))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[3]) continue;
    const n = num(m[1] ?? m[2]);
    if (n != null && n >= 1 && n <= 2000) found.push(n);
  }
  return found.length ? Math.max(...found) : null;
}

/** Saca del texto leído en la foto lo que sirva para rellenar la ficha. No inventa nada: lo que no está, queda vacío. */
export function parseLabelText(raw: string, brands: string[] = []): LabelData {
  const text = raw.replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const brand = [...brands, ...KNOWN_BRANDS].find((b) => b.trim() && lower.includes(b.trim().toLowerCase())) ?? null;
  const weightKg = extractWeightKg(text);
  const line = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /pel+ets?/i.test(l) && l.length >= 6 && l.length <= 60);
  const name = brand ? `Pellet ${brand}${weightKg ? ` ${weightKg} kg` : ''}` : (line ?? null);
  return { name, brand, weightKg, price: extractLabelPrice(text), quality: extractQuality(text) };
}

/* ───────────── Buscar el mismo pellet en otras tiendas ───────────── */

/** Qué buscar para comparar un producto: marca (o nombre) y formato. */
export function offerQuery(p: Pick<MarketProduct, 'name' | 'brand' | 'bagWeightKg'>): string {
  const what = p.brand.trim() || p.name.replace(/pel+ets?/gi, '').replace(/\d+(?:[.,]\d+)?\s?kg/gi, '').trim();
  return `pellet ${what} ${p.bagWeightKg} kg precio`.replace(/\s+/g, ' ').trim();
}

/** Enlaces de los resultados de la página de búsqueda (versión HTML sin scripts de DuckDuckGo), sin anuncios. */
export function searchResultUrls(html: string): string[] {
  const out: string[] = [];
  const re = /class="result__a"[^>]*href="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = decodeEntities(m[1]);
    let target = href;
    const u = /[?&]uddg=([^&]+)/.exec(href);
    if (u) {
      try {
        target = decodeURIComponent(u[1]);
      } catch {
        continue;
      }
    }
    if (!/^https?:\/\//.test(target)) continue;
    // Anuncios y redirecciones del propio buscador
    if (/duckduckgo\.com\/y\.js|bing\.com\/aclick/.test(target)) continue;
    if (/(youtube|facebook|instagram|wikipedia|pinterest|tiktok)\./.test(target)) continue;
    if (!out.includes(target)) out.push(target);
  }
  return out;
}

export interface WebOffer {
  url: string;
  store: string;
  name: string;
  brand: string;
  price: number;
  weightKg: number;
  perKg: number;
  available: boolean | null;
  quality: Partial<QualitySpec>;
}

/** Convierte una ficha de tienda en una oferta comparable. Null si no es pellet o no publica precio y peso. */
export function offerFromPage(url: string, html: string): WebOffer | null {
  const p = parseProductPage(html);
  if (p.price == null || !p.weightKg || !p.name) return null;
  if (!/pel+ets?/i.test(`${p.name} ${url}`)) return null;
  if (p.currency && !/eur/i.test(p.currency)) return null;
  const perKg = p.price / p.weightKg;
  // Fuera de rango: accesorios, estufas o pesos mal leídos.
  if (perKg < 0.1 || perKg > 2) return null;
  return { url, store: storeFromUrl(url), name: p.name, brand: p.brand ?? '', price: p.price, weightKg: p.weightKg, perKg, available: p.available, quality: p.quality };
}
