import { describe, expect, it } from 'vitest';
import { ROUTES } from '../app/router';
import { BAR_SLOTS, DEFAULT_LAYOUT, moveSection, normalizeLayout, sameLayout } from './navLayout';

const all = (l: { bar: string[]; more: string[] }) => [...l.bar, ...l.more].sort();
const EVERY = ROUTES.map((r) => r.id).sort();

describe('colocación del menú', () => {
  it('por defecto: tres en la barra y el resto en «Más», sin que falte ninguna', () => {
    expect(DEFAULT_LAYOUT.bar).toEqual(['inicio', 'clima', 'precios']);
    expect(all(DEFAULT_LAYOUT)).toEqual(EVERY);
  });

  it('arregla lo guardado: quita lo que no existe y lo repetido, y añade lo que falte', () => {
    expect(sameLayout(normalizeLayout(null), DEFAULT_LAYOUT)).toBe(true);
    expect(sameLayout(normalizeLayout('x'), DEFAULT_LAYOUT)).toBe(true);
    const l = normalizeLayout({ bar: ['historial', 'no-existe', 'historial', 'consumo'], more: ['inicio', 'consumo'] });
    expect(l.bar.slice(0, 2)).toEqual(['historial', 'consumo']);
    expect(l.bar.length).toBe(BAR_SLOTS);
    expect(l.more[0]).toBe('inicio');
    expect(all(l)).toEqual(EVERY);
  });

  it('si en la barra hay más de tres, las que sobran pasan a «Más»', () => {
    const l = normalizeLayout({ bar: ['inicio', 'clima', 'precios', 'hogar', 'consumo'], more: [] });
    expect(l.bar).toEqual(['inicio', 'clima', 'precios']);
    expect(l.more.slice(0, 2)).toEqual(['hogar', 'consumo']);
    expect(all(l)).toEqual(EVERY);
  });

  it('entre la barra y «Más» se intercambian', () => {
    const l = moveSection(DEFAULT_LAYOUT, 'historial', 'clima');
    expect(l.bar).toEqual(['inicio', 'historial', 'precios']);
    expect(l.more.indexOf('clima')).toBe(DEFAULT_LAYOUT.more.indexOf('historial'));
    expect(all(l)).toEqual(EVERY);
    // Y dentro de la barra también.
    expect(moveSection(DEFAULT_LAYOUT, 'inicio', 'precios').bar).toEqual(['precios', 'clima', 'inicio']);
  });

  it('dentro de «Más» se recoloca y las demás se corren', () => {
    const more = DEFAULT_LAYOUT.more;
    const last = more[more.length - 1];
    const l = moveSection(DEFAULT_LAYOUT, last, more[0]);
    expect(l.more).toEqual([last, ...more.slice(0, -1)]);
    expect(l.bar).toEqual(DEFAULT_LAYOUT.bar);
    const down = moveSection(DEFAULT_LAYOUT, more[0], more[2]);
    expect(down.more.slice(0, 3)).toEqual([more[1], more[2], more[0]]);
    expect(moveSection(DEFAULT_LAYOUT, 'inicio', 'inicio')).toBe(DEFAULT_LAYOUT);
  });
});
