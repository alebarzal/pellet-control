import { describe, expect, it } from 'vitest';
import { APP_VERSION, CHANGELOG, compareVersions, unseenReleases, type Release } from './changelog';

const r = (version: string): Release => ({ version, date: '2026-01-01', summary: '', items: [] });
const LOG = [r('1.6'), r('1.5'), r('1.4'), r('1.0')];

describe('novedades', () => {
  it('compara versiones por números', () => {
    expect(compareVersions('1.10', '1.9')).toBeGreaterThan(0);
    expect(compareVersions('1.6', '1.6')).toBe(0);
    expect(compareVersions('1.2', '1.4')).toBeLessThan(0);
  });

  it('el registro va de la más nueva a la más antigua, sin repetir y con contenido', () => {
    expect(CHANGELOG[0].version).toBe(APP_VERSION);
    for (let i = 1; i < CHANGELOG.length; i++) expect(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0);
    for (const rel of CHANGELOG) expect(rel.items.length).toBeGreaterThan(0);
  });

  it('enseña lo que no se ha visto', () => {
    expect(unseenReleases('1.6', LOG).length).toBe(0);
    expect(unseenReleases('1.4', LOG).map((x) => x.version)).toEqual(['1.6', '1.5']);
    // Primera vez (o versión desconocida): solo la última.
    expect(unseenReleases(null, LOG).map((x) => x.version)).toEqual(['1.6']);
    expect(unseenReleases(APP_VERSION).length).toBe(0);
  });
});
