/**
 * Nivel de la tolva a partir de tres marcas sobre una foto (posiciones verticales 0 = arriba de la imagen, 1 = abajo):
 * `full` es la altura de la tolva llena, `empty` la del fondo y `surface` donde llega el pellet.
 * Devuelve el porcentaje redondeado (0–100) o null si las marcas no tienen sentido.
 */
export function photoPercent(full: number, surface: number, empty: number): number | null {
  const span = empty - full;
  if (!Number.isFinite(span) || span < 0.05) return null;
  const p = ((empty - surface) / span) * 100;
  return Math.round(Math.max(0, Math.min(100, p)));
}

/** Marcas de referencia por defecto (tolva llena cerca de arriba, fondo cerca de abajo). */
export const DEFAULT_MARKS = { full: 0.18, surface: 0.5, empty: 0.85 };
