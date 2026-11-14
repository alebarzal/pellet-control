import {
  Award,
  CircleAlert,
  ExternalLink,
  Globe,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Store,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Camera as CameraIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PageProps } from '../app/App';
import { FetchError, fetchPage, isNative, openExternal } from '../data/web';
import { axisProps, C, ChartTooltip, gridProps } from '../features/charts/chartKit';
import { ProductForm } from '../features/market/ProductForm';
import { WebCompare } from '../features/market/WebCompare';
import { effectivePricePerKg, seasonProjection } from '../domain/calc';
import {
  A1_LIMITS,
  assessQuality,
  CERT_LABEL,
  lastChange,
  marketRows,
  parseProductPage,
  sortedPrices,
  sortRows,
  type MarketRow,
  type MarketSort,
} from '../domain/market';
import { fmtDate, fmtEur, fmtEurKg, fmtInt, fmtKg, fmtNum } from '../domain/format';
import type { MarketProduct } from '../domain/types';
import { useStore } from '../store/store';
import { ConfirmDialog, Dialog } from '../ui/Dialog';
import { decimalToInput, parseDecimal, TextInput } from '../ui/fields';
import { Badge, Button, Card, EmptyState, PageHeader, SectionTitle, Segmented, Stat, cx } from '../ui/primitives';
import { useToast } from '../ui/Toast';

const STALE_MS = 12 * 3600 * 1000;

/** Sugerencias de fichas comprobadas que publican datos legibles o son de tu marca habitual. */
const SUGGESTIONS = [
  { label: 'El Corte Inglés · Saco 15 kg ENplus A1', url: 'https://www.elcorteingles.es/bricor/A36688789-saco-pellets-15-kg-en-plus-a-1' },
  { label: 'Obramat · Huella Verde 15 kg', url: 'https://www.obramat.es/productos/pellet-huella-verde-15kg-25029162.html' },
];

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function QualityBar({ score }: { score: number | null }) {
  if (score == null) return <span className="text-sm text-ink-3">Sin datos</span>;
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-sand">
        <span className={cx('block h-full rounded-full', score >= 72 ? 'bg-olive' : score >= 55 ? 'bg-amber' : 'bg-rust')} style={{ width: `${score}%` }} />
      </span>
      <span className="num text-sm font-semibold">{score}</span>
    </span>
  );
}

function useRefresher() {
  const { patchProduct } = useStore();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const refresh = useCallback(
    async (p: MarketProduct): Promise<boolean> => {
      if (!p.url) return false;
      setBusy((s) => new Set(s).add(p.id));
      const at = new Date().toISOString();
      try {
        const parsed = parseProductPage(await fetchPage(p.url));
        if (parsed.price == null) {
          patchProduct(p.id, (x) => ({ ...x, lastCheck: { at, ok: false, message: 'La página no publica el precio en un formato legible.' } }));
          return false;
        }
        patchProduct(p.id, (x) => ({
          ...x,
          prices: [...x.prices, { at, price: parsed.price!, source: 'online', available: parsed.available }],
          lastCheck: { at, ok: true, message: parsed.available === false ? 'Agotado en la tienda' : 'Precio actualizado' },
        }));
        return true;
      } catch (e) {
        patchProduct(p.id, (x) => ({ ...x, lastCheck: { at, ok: false, message: e instanceof FetchError ? e.message : 'No se pudo consultar.' } }));
        return false;
      } finally {
        setBusy((s) => {
          const n = new Set(s);
          n.delete(p.id);
          return n;
        });
      }
    },
    [patchProduct],
  );
  return { busy, refresh };
}

function ProductRow({ row, yourPerKg, busy, onOpen }: { row: MarketRow; yourPerKg: number | null; busy: boolean; onOpen: () => void }) {
  const p = row.product;
  const change = lastChange(p);
  const diff = row.perKg != null && yourPerKg != null ? (row.perKg - yourPerKg) / yourPerKg : null;
  return (
    <li>
      <button onClick={onOpen} className="group grid w-full grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-2xl px-3 py-3 text-left transition-[transform,background-color] duration-150 hover:bg-sand-soft/70 active:scale-[0.985] active:bg-sand-soft sm:grid-cols-[1fr_8rem_7rem_6.5rem]">
        <span className="flex min-w-0 items-start gap-3">
          {p.photo && <img src={p.photo} alt="" className="size-11 shrink-0 rounded-lg object-cover ring-1 ring-line" />}
          <span className="min-w-0">
          <span className="line-clamp-2 font-semibold">{p.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
            {[p.brand, p.store].filter(Boolean).join(' · ') || 'Sin tienda'}
            <Badge tone={p.quality.certification === 'enplus-a1' || p.quality.certification === 'dinplus' ? 'olive' : p.quality.certification === 'none' ? 'rust' : 'neutral'}>
              {CERT_LABEL[p.quality.certification]}
            </Badge>
            {row.price?.available === false && <Badge tone="amber">Agotado</Badge>}
          </span>
          {p.lastCheck && !p.lastCheck.ok && (
            <span className="mt-1 flex items-start gap-1 text-[0.8125rem] text-amber">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {p.lastCheck.message}
            </span>
          )}
          </span>
        </span>
        <span className="flex flex-col items-end sm:order-none">
          <span className="num font-bold">{row.perKg != null ? `${fmtEurKg(row.perKg)}/kg` : '—'}</span>
          <span className="num text-sm text-ink-2">
            {row.price ? `${fmtEur(row.price.price)} · ${fmtNum(p.bagWeightKg)} kg` : 'Sin precio'}
          </span>
        </span>
        <span className="hidden flex-col items-end sm:flex">
          {diff != null ? (
            <span className={cx('num text-sm font-semibold', diff < -0.005 ? 'text-olive-strong' : diff > 0.005 ? 'text-amber' : 'text-ink-2')}>
              {diff > 0 ? '+' : ''}
              {fmtInt(diff * 100)} %
            </span>
          ) : (
            <span className="text-sm text-ink-3">—</span>
          )}
          {change != null && (
            <span className={cx('num flex items-center gap-1 text-[0.8125rem]', change < 0 ? 'text-olive-strong' : 'text-amber')}>
              {change < 0 ? <TrendingDown className="size-3.5" /> : <TrendingUp className="size-3.5" />}
              {change > 0 ? '+' : ''}
              {fmtEur(change)}
            </span>
          )}
        </span>
        <span className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end sm:justify-start">
          <QualityBar score={row.quality.score} />
          <span className="text-[0.8125rem] text-ink-3">
            {busy ? (
              <span className="flex items-center gap-1">
                <Loader2 className="size-3.5 animate-spin" /> Consultando
              </span>
            ) : p.lastCheck ? (
              fmtWhen(p.lastCheck.at)
            ) : (
              'Manual'
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

function ProductDetail({
  product,
  yourPerKg,
  busy,
  onRefresh,
  onEdit,
  onDelete,
  onCompare,
}: {
  onCompare: () => void;
  product: MarketProduct;
  yourPerKg: number | null;
  busy: boolean;
  onRefresh: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { patchProduct } = useStore();
  const toast = useToast();
  const [manual, setManual] = useState('');
  const [err, setErr] = useState('');
  const q = assessQuality(product.quality);
  const history = sortedPrices(product).map((o) => ({ ...o, perKg: o.price / product.bagWeightKg }));
  const last = history.at(-1);

  function addManual() {
    const n = parseDecimal(manual);
    if (!Number.isFinite(n) || n <= 0) {
      setErr('Indica el precio del formato en €.');
      return;
    }
    setErr('');
    patchProduct(product.id, (x) => ({ ...x, prices: [...x.prices, { at: new Date().toISOString(), price: n, source: 'manual', available: null }] }));
    setManual('');
    toast.show({ title: 'Precio anotado', body: `${fmtEur(n)} en ${product.store || product.name}` });
  }

  return (
    <div className="flex flex-col gap-5">
      {product.photo && <img src={product.photo} alt={`Foto de ${product.name}`} className="max-h-48 self-start rounded-2xl object-contain ring-1 ring-line" />}
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Precio actual" value={last ? fmtEur(last.price) : '—'} hint={last ? `${fmtNum(product.bagWeightKg)} kg · ${last.source === 'online' ? 'leído online' : 'anotado a mano'}` : undefined} />
        <Stat
          label="Precio por kg"
          value={last ? fmtEurKg(last.perKg) : '—'}
          hint={last && yourPerKg ? `Tu media: ${fmtEurKg(yourPerKg)}` : undefined}
        />
      </div>

      {history.length >= 2 ? (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ top: 6, right: 6, left: -8, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="at" tickFormatter={(v: string) => fmtDate(v.slice(0, 10)).replace(/ \d{4}$/, '')} {...axisProps} />
              <YAxis {...axisProps} width={52} tickFormatter={(v: number) => fmtEur(v)} domain={['dataMin - 0.2', 'dataMax + 0.2']} />
              <Tooltip content={<ChartTooltip labelFormat={(v) => fmtWhen(v)} valueFormat={(v) => fmtEur(v)} />} />
              <Line type="stepAfter" dataKey="price" name="Precio" stroke={C.olive} strokeWidth={2.5} dot={{ r: 3, fill: C.olive }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="rounded-xl bg-sand-soft px-3 py-2.5 text-[0.8125rem] text-ink-2">
          El historial de precios aparece cuando haya dos lecturas. Actualiza este producto de vez en cuando.
        </p>
      )}

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-sm font-bold">Calidad · {q.label}</p>
          <QualityBar score={q.score} />
        </div>
        <ul className="divide-y divide-line rounded-2xl ring-1 ring-line">
          <li className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="text-ink-2">Certificación</span>
            <span className="font-semibold">{CERT_LABEL[product.quality.certification]}</span>
          </li>
          {q.checks.map((c) => (
            <li key={c.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2 text-sm">
              <span className="text-ink-2">{c.label}</span>
              <span className={cx('num font-semibold', c.ok === false && 'text-rust')}>{c.value}</span>
              <span className="num w-24 text-right text-[0.8125rem] text-ink-3">A1 {c.limit}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-end gap-2">
        <TextInput label="Anotar precio a mano" inputMode="decimal" suffix="€" value={manual} onChange={(e) => setManual(e.target.value)} error={err} className="flex-1" placeholder={last ? decimalToInput(last.price) : ''} />
        <Button onClick={addManual} className={err ? 'mb-6' : ''}>
          Anotar
        </Button>
      </div>

      {product.lastCheck && (
        <p className={cx('text-[0.8125rem]', product.lastCheck.ok ? 'text-ink-3' : 'text-amber')}>
          Última consulta {fmtWhen(product.lastCheck.at)}: {product.lastCheck.message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {product.url && (
          <>
            <Button variant="primary" icon={busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} onClick={onRefresh} disabled={busy}>
              Actualizar precio
            </Button>
            <Button icon={<ExternalLink className="size-4" />} onClick={() => openExternal(product.url)}>
              Abrir tienda
            </Button>
          </>
        )}
        <Button variant={product.url ? 'secondary' : 'primary'} icon={<Globe className="size-4" />} onClick={onCompare}>
          Comparar en la web
        </Button>
        <Button variant="ghost" icon={<Pencil className="size-4" />} onClick={onEdit}>
          Editar
        </Button>
        <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={onDelete} className="text-rust hover:text-rust">
          Dejar de seguir
        </Button>
      </div>
    </div>
  );
}

export function MarketPage(_: PageProps) {
  const { data, deleteProduct, restoreProduct } = useStore();
  const toast = useToast();
  const { busy, refresh } = useRefresher();
  const [sort, setSort] = useState<MarketSort>('valor');
  const [dialog, setDialog] = useState<{ type: 'add'; url?: string; store?: boolean } | { type: 'edit'; id: string } | { type: 'detail'; id: string } | { type: 'compare'; id?: string } | null>(null);
  const [toDelete, setToDelete] = useState<MarketProduct | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const autoDone = useRef(false);

  const yourPerKg = effectivePricePerKg(data);
  const rows = sortRows(marketRows(data.market), sort);
  const priced = rows.filter((r) => r.perKg != null);
  const cheapest = [...priced].sort((a, b) => a.perKg! - b.perKg!)[0];
  const bestValue = sortRows(rows.filter((r) => r.value != null), 'valor')[0];
  const proj = seasonProjection(data);
  const savingsPerKg = cheapest && yourPerKg != null ? yourPerKg - cheapest.perKg! : null;

  const refreshAll = useCallback(
    async (only?: MarketProduct[]) => {
      const list = (only ?? data.market).filter((p) => p.url);
      if (!list.length) return;
      setRefreshingAll(true);
      let ok = 0;
      for (const p of list) if (await refresh(p)) ok++;
      setRefreshingAll(false);
      if (!only)
        toast.show({
          tone: ok === list.length ? 'success' : 'error',
          title: `${ok} de ${list.length} precios actualizados`,
          body: ok < list.length ? 'Algunas tiendas no permiten la consulta. Revisa los avisos.' : undefined,
        });
    },
    [data.market, refresh, toast],
  );

  // En la app, actualiza en segundo plano los productos que llevan más de 12 h sin consultarse.
  useEffect(() => {
    if (autoDone.current || !isNative()) return;
    autoDone.current = true;
    const stale = data.market.filter((p) => p.url && (!p.lastCheck || Date.now() - new Date(p.lastCheck.at).getTime() > STALE_MS));
    if (stale.length) void refreshAll(stale);
  }, [data.market, refreshAll]);

  const current = dialog && dialog.type !== 'add' && dialog.id ? data.market.find((p) => p.id === dialog.id) : undefined;
  const searchUrl = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent('saco pellet 15 kg ENplus A1')}`;

  return (
    <>
      <PageHeader
        title="Precios y calidad"
        description="Sigue fichas de pellet en tiendas online, compara €/kg y calidad, y mira cuánto ahorrarías."
        actions={
          <>
            <Button icon={<CameraIcon className="size-4" />} onClick={() => setDialog({ type: 'add', store: true })}>
              Saco en tienda
            </Button>
            <Button icon={<Plus className="size-4" />} onClick={() => setDialog({ type: 'add' })}>
              Añadir producto
            </Button>
            <Button
              variant="primary"
              icon={refreshingAll ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              disabled={refreshingAll || !data.market.some((p) => p.url)}
              onClick={() => refreshAll()}
            >
              Actualizar precios
            </Button>
          </>
        }
      />

      <Card>
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
          <Stat label="Tu precio medio" value={yourPerKg != null ? `${fmtEurKg(yourPerKg)}/kg` : '—'} hint="Según tus compras" tone={yourPerKg == null ? 'muted' : undefined} />
          <Stat
            label="Más barato seguido"
            value={cheapest ? `${fmtEurKg(cheapest.perKg!)}/kg` : '—'}
            hint={cheapest ? cheapest.product.store || cheapest.product.name : 'Añade productos'}
            tone={cheapest ? undefined : 'muted'}
          />
          <Stat
            label="Mejor calidad/precio"
            value={bestValue ? bestValue.product.brand || bestValue.product.name : '—'}
            hint={bestValue ? `${bestValue.quality.label} · ${fmtEurKg(bestValue.perKg!)}/kg` : 'Necesita precio y datos de calidad'}
            tone={bestValue ? undefined : 'muted'}
          />
          <Stat
            label={proj ? 'Ahorro en la temporada' : 'Ahorro por 100 kg'}
            value={
              savingsPerKg != null
                ? savingsPerKg > 0
                  ? fmtEur(savingsPerKg * (proj ? proj.projectedKg : 100))
                  : 'Ya pagas el mínimo'
                : '—'
            }
            hint={
              savingsPerKg != null && savingsPerKg > 0
                ? proj
                  ? `Comprando lo previsto (${fmtKg(Math.round(proj.projectedKg))}) al precio más bajo`
                  : 'Frente a tu precio medio'
                : undefined
            }
            tone={savingsPerKg == null ? 'muted' : undefined}
          />
        </div>
      </Card>

      <Card className="mt-4">
        <SectionTitle
          aside={
            <span className="hidden text-sm text-ink-3 sm:block">
              {isNative() ? 'Se actualiza al abrir si pasaron más de 12 h' : 'En el PC, la consulta usa el servidor de desarrollo'}
            </span>
          }
        >
          Comparativa
        </SectionTitle>
        {rows.length ? (
          <>
            <div className="mb-3 max-w-md">
              <Segmented
                size="sm"
                label="Ordenar por"
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'valor', label: 'Calidad/precio' },
                  { value: 'precio', label: 'Precio por kg' },
                  { value: 'calidad', label: 'Calidad' },
                ]}
              />
            </div>
            <div className="hidden grid-cols-[1fr_8rem_7rem_6.5rem] gap-x-4 px-3 pb-1 text-xs font-semibold text-ink-3 sm:grid">
              <span>Producto</span>
              <span className="text-right">Precio</span>
              <span className="text-right">Vs tu precio</span>
              <span className="text-right">Calidad</span>
            </div>
            <ul className="-mx-3 flex flex-col">
              {rows.map((r) => (
                <ProductRow key={r.product.id} row={r} yourPerKg={yourPerKg} busy={busy.has(r.product.id)} onOpen={() => setDialog({ type: 'detail', id: r.product.id })} />
              ))}
            </ul>
          </>
        ) : (
          <EmptyState
            icon={<Store className="size-5" />}
            title="Aún no sigues ningún producto"
            action={
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setDialog({ type: 'add' })}>
                    Añadir producto
                  </Button>
                  <Button size="sm" icon={<CameraIcon className="size-4" />} onClick={() => setDialog({ type: 'add', store: true })}>
                    Saco en tienda
                  </Button>
                  <Button size="sm" icon={<Search className="size-4" />} onClick={() => openExternal(searchUrl)}>
                    Buscar ofertas
                  </Button>
                </div>
                <p className="mt-2 text-[0.8125rem] font-semibold text-ink-2">Para empezar:</p>
                {SUGGESTIONS.map((s) => (
                  <button key={s.url} onClick={() => setDialog({ type: 'add', url: s.url })} className="text-left text-sm font-semibold text-olive-strong hover:underline">
                    + {s.label}
                  </button>
                ))}
              </div>
            }
          >
            Pega el enlace de un saco de pellet de cualquier tienda. La app lee el precio, el peso y los datos de calidad que publique la ficha, y guarda la evolución del precio. Si la tienda bloquea la lectura, puedes anotar el precio a mano.
          </EmptyState>
        )}
        {rows.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <button onClick={() => setDialog({ type: 'compare' })} className="flex items-center gap-1.5 text-sm font-semibold text-olive-strong hover:underline">
              <Search className="size-4" /> Buscar ofertas en la web
            </button>
            {SUGGESTIONS.filter((s) => !data.market.some((p) => p.url === s.url)).map((s) => (
              <button key={s.url} onClick={() => setDialog({ type: 'add', url: s.url })} className="text-sm font-semibold text-olive-strong hover:underline">
                + {s.label}
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <SectionTitle>
          <span className="flex items-center gap-2">
            <Award className="size-4 text-olive" aria-hidden /> Cómo se mide la calidad
          </span>
        </SectionTitle>
        <div className="grid gap-4 text-[0.9375rem] text-ink-2 md:grid-cols-2">
          <p className="text-pretty">
            La puntuación (0–100) parte de la certificación (ENplus A1 y DINplus puntúan más) y se ajusta con los datos que publica la ficha. Cuanto menos ceniza y humedad, menos limpieza de la caldera y más calor por kilo. Sin datos, no se puntúa.
          </p>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {[
              ['Cenizas', `≤ ${decimalToInput(A1_LIMITS.ashPct)} %`],
              ['Humedad', `≤ ${A1_LIMITS.moisturePct} %`],
              ['Poder calorífico', `≥ ${decimalToInput(A1_LIMITS.ncvKwhKg)} kWh/kg`],
              ['Durabilidad', `≥ ${A1_LIMITS.durabilityPct} %`],
            ].map(([k, v]) => (
              <li key={k} className="rounded-xl bg-sand-soft px-3 py-2">
                <span className="block text-ink-3">{k}</span>
                <span className="num font-semibold text-ink">A1 {v}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-3 text-[0.8125rem] text-ink-3">Límites de referencia de la clase A1 (ISO 17225-2 y esquema ENplus).</p>
      </Card>

      <Dialog
        open={!!dialog}
        onClose={() => setDialog(null)}
        title={dialog?.type === 'add' ? (dialog.store ? 'Saco visto en tienda' : 'Seguir un producto') : dialog?.type === 'edit' ? 'Editar producto' : dialog?.type === 'compare' ? 'Comparar en la web' : (current?.name ?? '')}
        description={
          dialog?.type === 'detail' && current
            ? [current.brand, current.store].filter(Boolean).join(' · ')
            : dialog?.type === 'compare'
              ? 'Busca el mismo pellet en tiendas online y compara el precio por kilo.'
              : dialog?.type === 'add' && dialog.store
                ? 'Haz una foto al saco o a la etiqueta del precio. La app rellena lo que lea y te señala lo que falta.'
                : undefined
        }
      >
        {dialog?.type === 'add' && (
          <ProductForm
            key={dialog.store ? 'store' : (dialog.url ?? 'new')}
            initialUrl={dialog.url}
            mode={dialog.store ? 'store' : undefined}
            onDone={(p) => {
              setDialog(p ? { type: 'detail', id: p.id } : null);
              if (p) toast.show({ title: 'Producto añadido', body: p.name });
            }}
          />
        )}
        {dialog?.type === 'edit' && current && (
          <ProductForm
            initial={current}
            onDone={(p) => {
              setDialog({ type: 'detail', id: current.id });
              if (p) toast.show({ title: 'Cambios guardados' });
            }}
          />
        )}
        {dialog?.type === 'detail' && current && (
          <ProductDetail
            product={current}
            yourPerKg={yourPerKg}
            busy={busy.has(current.id)}
            onRefresh={() => refresh(current)}
            onCompare={() => setDialog({ type: 'compare', id: current.id })}
            onEdit={() => setDialog({ type: 'edit', id: current.id })}
            onDelete={() => setToDelete(current)}
          />
        )}
        {dialog?.type === 'compare' && <WebCompare key={dialog.id ?? 'general'} reference={current} yourPerKg={yourPerKg} />}
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="¿Dejar de seguir este producto?"
        body={toDelete ? `Se borrará «${toDelete.name}» y su historial de ${toDelete.prices.length} precios.` : ''}
        confirmLabel="Dejar de seguir"
        onConfirm={() => {
          if (!toDelete) return;
          const removed = deleteProduct(toDelete.id);
          setDialog(null);
          if (removed) toast.show({ title: 'Producto eliminado', action: { label: 'Deshacer', onClick: () => restoreProduct(removed) } });
        }}
      />
    </>
  );
}
