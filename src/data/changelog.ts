/**
 * Novedades de cada versión, de la más nueva a la más antigua.
 * Al publicar cambios que se noten, se añade una entrada arriba (y se sube versionName/versionCode en
 * android/app/build.gradle). La primera vez que se abre la app con una versión nueva se enseña.
 */
export interface Release {
  version: string;
  /** AAAA-MM-DD */
  date: string;
  /** Una línea: lo más importante de la versión. */
  summary: string;
  items: string[];
}

export const CHANGELOG: Release[] = [
  {
    version: '1.6',
    date: '2026-11-14',
    summary: 'Novedades al actualizar, aviso de pellet bajo y atajos',
    items: [
      'Esta pantalla: al abrir la app después de actualizar verás qué ha cambiado. También está en Configuración → Versión y novedades.',
      'Aviso de nueva versión: al abrir la app se comprueba si hay una actualización en GitHub y aparece un aviso en Inicio para instalarla con un toque.',
      'Aviso de pellet bajo en Inicio cuando quedan menos días de pellet que el margen de compra (7 días si no lo has cambiado en Calendario).',
      'Deshacer al añadir un movimiento: el aviso de «registrado» tiene botón Deshacer, por si se te escapa el dedo.',
      'Las compras nuevas vienen rellenas con la marca, el proveedor, los sacos y el precio de tu última compra.',
      'Atajos en el icono: mantén pulsado el icono de la app para ir directo a Compra, Recarga o Consumo.',
    ],
  },
  {
    version: '1.5',
    date: '2026-11-13',
    summary: 'Actualizar la app desde GitHub',
    items: [
      'Botón «Actualizar desde GitHub» en Configuración: descarga la última versión y abre el instalador, sin pasar el APK a mano.',
      'Cada cambio que se sube a GitHub se compila solo y queda listo para instalar.',
    ],
  },
  {
    version: '1.4',
    date: '2026-11-13',
    summary: 'Enchufe de la caldera y widget con el quemador',
    items: [
      'Lectura correcta del enchufe SwitchBot Plug Mini (EU, US y JP): potencia, horas de quemador y arranques.',
      'Las lecturas del enchufe se comparten con el hogar: el otro móvil las ve sin poner las claves de SwitchBot.',
      'Los kg por hora de quemador se calculan solos cruzando tus consumos con el enchufe.',
      'El widget muestra si la caldera está quemando o en reposo.',
    ],
  },
  {
    version: '1.3',
    date: '2026-11-13',
    summary: 'Agua caliente aparte y Clima en la barra',
    items: [
      'La previsión separa el pellet del agua caliente (fijo cada día) del de calefacción (según el frío).',
      'Clima pasa a la barra inferior; Inventario sigue en «Más».',
      'Las recargas nuevas proponen los mismos sacos que la última vez.',
    ],
  },
  {
    version: '1.2',
    date: '2026-11-12',
    summary: 'Nivel de la tolva con foto y gesto atrás',
    items: [
      'Nivel de la tolva midiendo con una foto, calibrado con el visor y con tus recargas.',
      'Más niveles de tolva para afinar la estimación.',
      'El gesto atrás cierra menús, vuelve a Inicio y pregunta antes de salir.',
    ],
  },
  {
    version: '1.0',
    date: '2026-11-12',
    summary: 'Primera versión',
    items: [
      'Inventario de sacos, compras, recargas, consumo y nivel de la tolva.',
      'Estadísticas, historial, gasto por temporada y exportar a Excel.',
      'Comparador de precios de pellet en tiendas online.',
      'Hogar compartido con un código de 6 dígitos.',
      'Termómetros SwitchBot y tiempo de tu zona para prever el consumo.',
      'Widget en la pantalla de inicio y avisos en el calendario.',
    ],
  },
];

export const APP_VERSION = CHANGELOG[0].version;

/** Compara «1.10» y «1.9» como versiones, no como texto. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Versiones que no ha visto quien tenía `seen` instalada (todas si no se sabe). */
export function unseenReleases(seen: string | null, log: Release[] = CHANGELOG): Release[] {
  if (!seen) return log.slice(0, 1);
  return log.filter((r) => compareVersions(r.version, seen) > 0);
}

const SEEN_KEY = 'pellet-control:seen-version';

export function readSeenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export function markSeen(version = APP_VERSION) {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    /* sin almacenamiento: se volverá a enseñar */
  }
}
