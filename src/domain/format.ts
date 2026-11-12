const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const eur3 = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const num = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const int = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

export const fmtEur = (v: number) => eur.format(v);
/** Precio por kg, con 3 decimales. */
export const fmtEurKg = (v: number) => eur3.format(v);
export const fmtNum = (v: number) => num.format(v);
export const fmtInt = (v: number) => int.format(v);
export const fmtKg = (v: number) => `${num.format(v)} kg`;
export const fmtBags = (v: number) => `${num.format(v)} ${Math.abs(v) === 1 ? 'saco' : 'sacos'}`;

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const fmtDate = (iso: string) =>
  parseIso(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDateLong = (iso: string) =>
  parseIso(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtDateShort = (iso: string) =>
  parseIso(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

/** "2026-10" -> "oct 2026" */
export function fmtMonth(key: string, long = false): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-ES', {
    month: long ? 'long' : 'short',
    year: 'numeric',
  });
}

export const fmtPercent = (v: number) => `${int.format(v)} %`;
