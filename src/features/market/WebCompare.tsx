import { ExternalLink, Loader2, Plus, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { findOffers } from '../../data/offers';
import { FetchError, openExternal } from '../../data/web';
import { emptyQuality, offerQuery, pricePerKg, type WebOffer } from '../../domain/market';
import { fmtEur, fmtEurKg, fmtInt, fmtNum } from '../../domain/format';
import type { MarketProduct } from '../../domain/types';
import { useStore } from '../../store/store';
import { TextInput } from '../../ui/fields';
import { Badge, Button, cx } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

/**
 * Busca en la web el mismo pellet (o parecido) y compara el €/kg de cada tienda con el producto de referencia:
 * el que compras en una tienda que no publica precios, por ejemplo.
 */
export function WebCompare({ reference, yourPerKg }: { reference?: MarketProduct; yourPerKg: number | null }) {
  const { data, addProduct } = useStore();
  const toast = useToast();
  const [query, setQuery] = useState(reference ? offerQuery(reference) : 'pellet 15 kg ENplus A1 precio');
  const [state, setState] = useState<{ k: 'idle' } | { k: 'busy'; done: number; total: number } | { k: 'done' } | { k: 'error'; text: string }>({ k: 'idle' });
  const [offers, setOffers] = useState<WebOffer[]>([]);
  const signal = useRef({ cancelled: false });
  useEffect(() => () => void (signal.current.cancelled = true), []);

  const refPerKg = (reference ? pricePerKg(reference) : null) ?? yourPerKg;
  const refLabel = reference ? reference.store || reference.name : 'tu precio medio';
  const followed = new Set(data.market.map((p) => p.url).filter(Boolean));

  async function run() {
    signal.current = { cancelled: false };
    const s = signal.current;
    setOffers([]);
    setState({ k: 'busy', done: 0, total: 0 });
    try {
      const found = await findOffers(
        query.trim(),
        (done, total, list) => {
          if (s.cancelled) return;
          setOffers(list);
          setState({ k: 'busy', done, total });
        },
        [],
        s,
      );
      if (s.cancelled) return;
      setOffers(found);
      setState({ k: 'done' });
    } catch (e) {
      if (!s.cancelled) setState({ k: 'error', text: e instanceof FetchError ? e.message : 'No se pudo buscar. Inténtalo más tarde.' });
    }
  }

  function follow(o: WebOffer) {
    const now = new Date().toISOString();
    addProduct({
      name: o.name,
      brand: o.brand,
      store: o.store,
      url: o.url,
      bagWeightKg: o.weightKg,
      quality: { ...emptyQuality(), ...Object.fromEntries(Object.entries(o.quality).filter(([, v]) => v != null)) },
      prices: [{ at: now, price: o.price, source: 'online', available: o.available }],
      lastCheck: { at: now, ok: true, message: 'Precio leído de la tienda' },
      notes: '',
    });
    toast.show({ title: 'Producto añadido', body: `${o.store} · ${fmtEurKg(o.perKg)}/kg` });
  }

  const busy = state.k === 'busy';
  return (
    <div className="flex flex-col gap-4">
      {refPerKg != null && (
        <p className="rounded-2xl bg-olive-soft px-4 py-3 text-sm text-forest">
          Referencia: <span className="font-semibold">{refLabel}</span> a <span className="num font-semibold">{fmtEurKg(refPerKg)}/kg</span>
          {reference && pricePerKg(reference) != null && <> ({fmtEur(pricePerKg(reference)! * reference.bagWeightKg)} el saco de {fmtNum(reference.bagWeightKg)} kg)</>}
        </p>
      )}
      <div className="flex items-end gap-2">
        <TextInput label="Qué buscar" value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1" />
        <Button variant="primary" disabled={busy || query.trim().length < 3} icon={busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} onClick={() => void run()}>
          Buscar
        </Button>
      </div>

      {busy && (
        <div>
          <p className="text-sm text-ink-2" role="status">
            {state.total ? `Leyendo tiendas: ${state.done} de ${state.total}…` : 'Buscando tiendas…'}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className="h-full origin-left rounded-full bg-olive transition-transform duration-300" style={{ transform: `scaleX(${state.total ? state.done / state.total : 0.05})` }} />
          </div>
        </div>
      )}
      {state.k === 'error' && <p className="rounded-xl bg-amber-soft px-3 py-2.5 text-sm text-amber">{state.text}</p>}
      {state.k === 'done' && offers.length === 0 && (
        <p className="rounded-xl bg-sand-soft px-3 py-2.5 text-sm text-ink-2">
          Ninguna tienda de los resultados publica el precio y el peso de forma legible. Prueba con otras palabras (la marca, «saco 15 kg») o mira los resultados tú mismo.
        </p>
      )}

      {offers.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-2xl ring-1 ring-line">
          {offers.map((o) => {
            const diff = refPerKg != null ? (o.perKg - refPerKg) / refPerKg : null;
            const isFollowed = followed.has(o.url);
            return (
              <li key={o.url} className="flex flex-col gap-2 p-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-semibold">{o.store}</span>
                    <span className="line-clamp-2 text-sm text-ink-2">{o.name}</span>
                    {o.available === false && (
                      <Badge tone="amber" >
                        Agotado
                      </Badge>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="num font-bold">{fmtEurKg(o.perKg)}/kg</span>
                    <span className="num text-sm text-ink-2">
                      {fmtEur(o.price)} · {fmtNum(o.weightKg)} kg
                    </span>
                    {diff != null && (
                      <span className={cx('num text-sm font-semibold', diff < -0.005 ? 'text-olive-strong' : diff > 0.005 ? 'text-amber' : 'text-ink-2')}>
                        {Math.abs(diff) < 0.005 ? 'Igual' : `${diff > 0 ? '+' : '−'}${fmtInt(Math.abs(diff) * 100)} %`}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={isFollowed} icon={<Plus className="size-4" />} onClick={() => follow(o)}>
                    {isFollowed ? 'Ya lo sigues' : 'Seguir'}
                  </Button>
                  <Button size="sm" variant="ghost" icon={<ExternalLink className="size-4" />} onClick={() => void openExternal(o.url)}>
                    Abrir
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {state.k === 'done' && offers.length > 0 && refPerKg != null && (
        <p className="text-sm text-ink-2">
          {offers[0].perKg < refPerKg - 0.005
            ? `La más barata (${offers[0].store}) sale ${fmtInt((1 - offers[0].perKg / refPerKg) * 100)} % más barata por kilo que ${refLabel}, sin contar el envío.`
            : `Ninguna tienda encontrada mejora el precio por kilo de ${refLabel}.`}
        </p>
      )}
      <p className="text-[0.8125rem] text-ink-3">
        Abre los primeros resultados del buscador y lee el precio de cada ficha. Algunas tiendas bloquean la lectura y no aparecen. Los precios online no incluyen el envío.
      </p>
      <button
        type="button"
        onClick={() => void openExternal(`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}`)}
        className="flex items-center gap-1.5 self-start text-sm font-semibold text-olive-strong hover:underline"
      >
        <Search className="size-4" /> Ver los resultados en Google Shopping
      </button>
    </div>
  );
}
