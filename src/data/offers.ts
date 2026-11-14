import { offerFromPage, searchResultUrls, type WebOffer } from '../domain/market';
import { fetchPage } from './web';

/** Páginas de tienda que se abren como mucho en una búsqueda (cada una tarda unos segundos). */
const MAX_PAGES = 10;
const MAX_PER_STORE = 2;

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * Busca un pellet en la web y lee el precio de las fichas de tienda que aparezcan.
 * Usa el buscador en su versión sin scripts y luego abre cada ficha como hace «Leer datos de la tienda».
 * `skip` son enlaces que ya se siguen (no se repiten).
 */
export async function findOffers(
  query: string,
  onProgress: (done: number, total: number, found: WebOffer[]) => void,
  skip: string[] = [],
  signal?: { cancelled: boolean },
): Promise<WebOffer[]> {
  const html = await fetchPage(`https://html.duckduckgo.com/html/?kl=es-es&q=${encodeURIComponent(query)}`);
  const perStore = new Map<string, number>();
  const urls: string[] = [];
  for (const u of searchResultUrls(html)) {
    const h = host(u);
    if (!h || skip.includes(u)) continue;
    const n = perStore.get(h) ?? 0;
    if (n >= MAX_PER_STORE) continue;
    perStore.set(h, n + 1);
    urls.push(u);
    if (urls.length >= MAX_PAGES) break;
  }
  const found: WebOffer[] = [];
  onProgress(0, urls.length, found);
  for (let i = 0; i < urls.length; i++) {
    if (signal?.cancelled) break;
    try {
      const offer = offerFromPage(urls[i], await fetchPage(urls[i]));
      if (offer) found.push(offer);
    } catch {
      /* tienda que bloquea o no responde: se salta */
    }
    onProgress(i + 1, urls.length, [...found].sort((a, b) => a.perKg - b.perKg));
  }
  return found.sort((a, b) => a.perKg - b.perKg);
}
