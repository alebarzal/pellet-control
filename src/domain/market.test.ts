import { describe, expect, it } from 'vitest';
import { assessQuality, emptyQuality, extractLabelPrice, lastChange, marketRows, offerFromPage, offerQuery, parseLabelText, parseProductPage, searchResultUrls, sortRows, storeFromUrl } from './market';
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

describe('importar desde una foto', () => {
  it('lee la etiqueta de precio del lineal', () => {
    const t = 'PELLET HUELLA VERDE\nSACO 15 KG\n4,95 €\n0,33 €/kg\nENplus A1';
    const d = parseLabelText(t);
    expect(d.brand).toBe('Huella Verde');
    expect(d.weightKg).toBe(15);
    expect(d.price).toBe(4.95);
    expect(d.name).toBe('Pellet Huella Verde 15 kg');
    expect(d.quality.certification).toBe('enplus-a1');
  });

  it('lee los datos de calidad del saco y no inventa precio', () => {
    const d = parseLabelText('Pellets de madera 100% natural\nCenizas < 0,5 %\nHumedad < 8 %\nPoder calorífico 4,9 kWh/kg\nDiámetro 6 mm\n15 kg');
    expect(d.price).toBeNull();
    expect(d.brand).toBeNull();
    expect(d.name).toBe('Pellets de madera 100% natural');
    expect(d.quality.ashPct).toBe(0.5);
    expect(d.quality.moisturePct).toBe(8);
    expect(d.quality.ncvKwhKg).toBe(4.9);
  });

  it('no confunde el precio por kilo con el del saco', () => {
    expect(extractLabelPrice('0,33 €/kg 4,95€')).toBe(4.95);
    expect(extractLabelPrice('0,33 €/kg')).toBeNull();
    expect(extractLabelPrice('€ 5,10')).toBe(5.1);
  });
});

describe('buscar en otras tiendas', () => {
  it('prepara la búsqueda con marca y formato', () => {
    expect(offerQuery({ name: 'Pellet 15 kg', brand: 'Huella Verde', bagWeightKg: 15 })).toBe('pellet Huella Verde 15 kg precio');
    expect(offerQuery({ name: 'Pellets Leclerc 15 kg', brand: '', bagWeightKg: 15 })).toBe('pellet Leclerc 15 kg precio');
  });

  it('saca los enlaces de los resultados y descarta anuncios', () => {
    const html = `
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fduckduckgo.com%2Fy.js%3Fad_domain%3Damazon.es&amp;rut=1">Anuncio</a>
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.obramat.es%2Fproductos%2Fpellet%2Dhuella%2Dverde%2D15kg.html&amp;rut=2">Obramat</a>
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.youtube.com%2Fwatch&amp;rut=3">Vídeo</a>`;
    expect(searchResultUrls(html)).toEqual(['https://www.obramat.es/productos/pellet-huella-verde-15kg.html']);
  });

  it('convierte una ficha en oferta y descarta lo que no es pellet', () => {
    const page = (name: string, price: number) =>
      `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name, offers: { price, priceCurrency: 'EUR', availability: 'https://schema.org/InStock' } })}</script>`;
    const o = offerFromPage('https://www.obramat.es/p/pellet-15kg.html', page('Pellet Huella Verde 15 kg', 5.25))!;
    expect(o.store).toBe('Obramat');
    expect(o.perKg).toBeCloseTo(0.35, 5);
    expect(offerFromPage('https://x.es/estufa', page('Estufa de 12 kg', 899))).toBeNull();
    expect(offerFromPage('https://x.es/pellet', page('Pellet sin peso', 5))).toBeNull();
  });
});
