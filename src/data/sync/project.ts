/**
 * Proyecto de Supabase que la app trae de serie (se fija al compilar con `.env.local`):
 *   VITE_SUPABASE_URL=https://xxxx.supabase.co
 *   VITE_SUPABASE_KEY=sb_publishable_...   (clave pública «anon/publishable», nunca la secreta)
 * Con él, crear un hogar no pide nada y unirse solo pide el código de 6 dígitos.
 */
const REMEMBERED = 'pellet-control:project';

/**
 * El APK que compila GitHub no lleva `.env.local` (el repositorio es público), así que el proyecto
 * se recuerda en el móvil la primera vez que se instala una versión que sí lo trae.
 */
export const builtinProject = (): { url: string; key: string } | null => {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const key = (import.meta.env.VITE_SUPABASE_KEY as string | undefined)?.trim();
  try {
    if (url && key) {
      const v = JSON.stringify({ url, key });
      if (localStorage.getItem(REMEMBERED) !== v) localStorage.setItem(REMEMBERED, v);
      return { url, key };
    }
    const saved = JSON.parse(localStorage.getItem(REMEMBERED) ?? 'null') as { url?: unknown; key?: unknown } | null;
    if (saved && typeof saved.url === 'string' && typeof saved.key === 'string' && saved.url && saved.key) return { url: saved.url, key: saved.key };
  } catch {
    /* sin almacenamiento: vale lo que traiga la compilación */
  }
  return url && key ? { url, key } : null;
};

/** ¿Es un código de 6 dígitos? */
export const isShortCode = (c: string) => /^\d{6}$/.test(c);

/** Extrae los 6 dígitos de lo que escriba o pegue el usuario («482 615», «482-615», «Código: 482615»…). Null si no son 6. */
export const parseShortCode = (input: string): string | null => {
  const d = input.replace(/\D/g, '');
  return d.length === 6 ? d : null;
};

/** «482913» → «482 913» */
export const prettyCode = (c: string) => (/^\d{6}$/.test(c) ? `${c.slice(0, 3)} ${c.slice(3)}` : c);
