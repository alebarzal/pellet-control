import { describe, expect, it } from 'vitest';
import { CHANGELOG, compareVersions, unseenReleases } from './changelog';

describe('novedades', () => {
  it('compara versiones por números', () => {
    expect(compareVersions('1.10', '1.9')).toBeGreaterThan(0);
    expect(compareVersions('1.6', '1.6')).toBe(0);
    expect(compareVersions('1.2', '1.4')).toBeLessThan(0);
  });

  it('el registro va de la más nueva a la más antigua y sin repetir', () => {
    for (let i = 1; i < CHANGELOG.length; i++) expect(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0);
  });

  it('enseña lo que no se ha visto', () => {
    expect(unseenReleases('1.6').length).toBe(0);
    expect(unseenReleases('1.4').map((r) => r.version)).toEqual(['1.6', '1.5']);
    // Primera vez (o versión desconocida): solo la última.
    expect(unseenReleases(null).map((r) => r.version)).toEqual(['1.6']);
  });
});
