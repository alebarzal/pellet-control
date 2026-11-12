import { describe, expect, it } from 'vitest';
import { assessQuality, emptyQuality, lastChange, marketRows, parseProductPage, sortRows, storeFromUrl } from './market';
import type { MarketProduct } from './types';

// Fichas mínimas con la misma estructura que las tiendas reales (schema.org).
const JSONLD_PAGE = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Saco Pellets 15 kg EN Plus A-1","brand":{"@type":"Brand","name":"Eider"},
"offers":{"@type":"Offer","availability":"https://schema.org/SoldOut","priceCurrency":"EUR","price":5.49,
"hasMeasurement":[{"@type":"QuantitativeValue","name":"weight","value":15,"unitCode":"kg"}]}}</script>
</head><body><p>Pellet de 6 mm, una tasa de humedad del 6,4% y una producción de ceniza del 0,4%.</p></body></html>`;

const GRAPH_PAGE = `<script type="application/ld+json">{"@graph":[{"@type":"Organization","name":"Tienda"},
{"@type":["Product"],"name":"Pellet Premium 15kg","brand":"Marca X","offers":[{"@type":"Offer","price":"6,20","priceCurrency":"EUR","availability":"https://schema.org/InStock"}]}]}</script>
<p>Certificado DINplus. Poder calorífico: 18,5 MJ/kg. Durabilidad mecánica > 98,5 %</p>`;

const META_PAGE = `<meta property="og:title" content="Pellet 15 kg"><meta property="product:price:amount" content="4.95"><meta property="product:price:currency" content="EUR">`;

describe('parseProductPage', () => {
  it('lee JSON-LD de producto con peso y calidad', () => {
    const p = parseProductPage(JSONLD_PAGE);
    expect(p.method).toBe('json-ld');
    expect(p.price).toBe(5.49);
    expect(p.brand).toBe('Eider');
    expect(p.available).toBe(false);
    expect(p.weightKg).toBe(15);
    expect(p.quality.certification).toBe('enplus-a1');
    expect(p.quality.moisturePct).toBeCloseTo(6.4);
    expect(p.quality.ashPct).toBeCloseTo(0.4);
    expect(p.quality.diameterMm).toBe(6);
  });
  it('lee @graph, precio con coma y MJ/kg', () => {
    const p = parseProductPage(GRAPH_PAGE);
    expect(p.price).toBeCloseTo(6.2);
    expect(p.brand).toBe('Marca X');
    expect(p.available).toBe(true);
    expect(p.weightKg).toBe(15);
    expect(p.quality.certification).toBe('dinplus');
    expect(p.quality.ncvKwhKg).toBeCloseTo(5.14, 1);
    expect(p.quality.durabilityPct).toBeCloseTo(98.5);
  });
  it('recurre a meta etiquetas', () => {
    const p = parseProductPage(META_PAGE);
    expect(p.method).toBe('meta');
    expect(p.price).toBe(4.95);
  });
  it('no inventa precio si no lo hay', () => {
    const p = parseProductPage('<p>Pellet 15 kg a buen precio 5,99 €</p>');
    expect(p.price).toBeNull();
    expect(p.method).toBeNull();
  });
});

describe('calidad y comparación', () => {
  it('sin datos no puntúa', () => {
    expect(assessQuality(emptyQuality()).score).toBeNull();
  });
  it('A1 con buenos parámetros puntúa más que sin certificar', () => {
    const a = assessQuality({ ...emptyQuality(), certification: 'enplus-a1', ashPct: 0.4, moisturePct: 6.4 });
    const b = assessQuality({ ...emptyQuality(), certification: 'none', ashPct: 1.5 });
    expect(a.score!).toBeGreaterThan(b.score!);
    expect(a.checks[0].ok).toBe(true);
    expect(b.checks[0].ok).toBe(false);
  });
  it('ordena por €/kg y calcula variación', () => {
    const mk = (id: string, prices: number[], kg = 15): MarketProduct => ({
      id,
      name: id,
      brand: '',
      store: '',
      url: '',
      bagWeightKg: kg,
      quality: emptyQuality(),
      prices: prices.map((p, i) => ({ at: `2026-11-0${i + 1}T10:00:00Z`, price: p, source: 'manual', available: null })),
      lastCheck: null,
      notes: '',
      createdAt: 0,
    });
    const rows = sortRows(marketRows([mk('caro', [6]), mk('barato', [5.5, 5]), mk('sin', [])]), 'precio');
    expect(rows.map((r) => r.product.id)).toEqual(['barato', 'caro', 'sin']);
    expect(lastChange(mk('x', [5.5, 5]))).toBeCloseTo(-0.5);
  });
  it('nombre de tienda', () => {
    expect(storeFromUrl('https://www.elcorteingles.es/bricor/x')).toBe('El Corte Inglés');
    expect(storeFromUrl('https://tienda-pellets.com/p')).toBe('Tienda-pellets');
  });
});
