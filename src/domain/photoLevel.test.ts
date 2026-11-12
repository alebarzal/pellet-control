import { describe, expect, it } from 'vitest';
import { photoPercent } from './photoLevel';

describe('nivel por foto', () => {
  it('a mitad de camino entre lleno y fondo es 50 %', () => {
    expect(photoPercent(0.2, 0.5, 0.8)).toBe(50);
  });
  it('en las marcas da 100 % y 0 %', () => {
    expect(photoPercent(0.2, 0.2, 0.8)).toBe(100);
    expect(photoPercent(0.2, 0.8, 0.8)).toBe(0);
  });
  it('por encima o por debajo se limita a 0–100', () => {
    expect(photoPercent(0.2, 0.1, 0.8)).toBe(100);
    expect(photoPercent(0.2, 0.9, 0.8)).toBe(0);
  });
  it('marcas invertidas o pegadas no valen', () => {
    expect(photoPercent(0.8, 0.5, 0.2)).toBeNull();
    expect(photoPercent(0.5, 0.5, 0.52)).toBeNull();
  });
});
