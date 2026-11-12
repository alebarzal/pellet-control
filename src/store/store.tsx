import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRepository, type Repository } from '../data/repository';
import { createInitialData } from '../data/seed';
import type { AppData, ClimateData, ClimateSettings, MarketProduct, NewRecord, PelletRecord, Settings } from '../domain/types';
import { useToast } from '../ui/Toast';

type Status = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready' };

interface StoreValue {
  data: AppData;
  addRecord: (r: NewRecord) => PelletRecord;
  updateRecord: (r: PelletRecord) => void;
  deleteRecord: (id: string) => PelletRecord | undefined;
  restoreRecord: (r: PelletRecord) => void;
  updateSettings: (s: Partial<Settings>) => void;
  replaceData: (d: AppData) => void;
  /** Aplica datos llegados del hogar compartido (no se vuelven a subir). */
  applyRemote: (fn: (d: AppData) => AppData) => void;
  resetData: () => void;
  addProduct: (p: Omit<MarketProduct, 'id' | 'createdAt'>) => MarketProduct;
  /** Actualiza un producto a partir de su estado más reciente (seguro para operaciones asíncronas). */
  patchProduct: (id: string, fn: (p: MarketProduct) => MarketProduct) => void;
  deleteProduct: (id: string) => MarketProduct | undefined;
  restoreProduct: (p: MarketProduct) => void;
  /** Actualiza las lecturas y el tiempo exterior a partir del estado más reciente. */
  patchClimate: (fn: (c: ClimateData) => ClimateData) => void;
  updateClimateSettings: (c: Partial<ClimateSettings>) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

/** Avisos de cambios hechos en este móvil (la sincronización los sube al hogar). */
type ChangeListener = (prev: AppData, next: AppData) => void;
const listeners = new Set<ChangeListener>();
export function onLocalChange(l: ChangeListener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function StoreProvider({ children, fallback }: { children: ReactNode; fallback: (s: Status) => ReactNode }) {
  const repo = useRef<Repository>(createRepository());
  const [data, setData] = useState<AppData | null>(null);
  const [status, setStatus] = useState<Status>({ state: 'loading' });
  const toast = useToast();

  useEffect(() => {
    repo.current
      .load()
      .then((d) => {
        setData(d);
        setStatus({ state: 'ready' });
      })
      .catch((e: unknown) => setStatus({ state: 'error', message: e instanceof Error ? e.message : String(e) }));
  }, []);

  const commit = useCallback(
    (updater: (d: AppData) => AppData, remote = false) => {
      setData((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        if (next === prev) return prev;
        if (!remote) for (const l of listeners) l(prev, next);
        repo.current.save(next).catch((e: unknown) =>
          toast.show({ tone: 'error', title: 'No se ha guardado', body: e instanceof Error ? e.message : String(e) }),
        );
        return next;
      });
    },
    [toast],
  );

  const value = useMemo<StoreValue | null>(() => {
    if (!data) return null;
    return {
      data,
      addRecord: (r) => {
        const rec = { ...r, id: newId(), createdAt: Date.now() } as PelletRecord;
        commit((d) => ({ ...d, records: [...d.records, rec] }));
        return rec;
      },
      updateRecord: (r) => commit((d) => ({ ...d, records: d.records.map((x) => (x.id === r.id ? r : x)) })),
      deleteRecord: (id) => {
        const found = data.records.find((x) => x.id === id);
        commit((d) => ({ ...d, records: d.records.filter((x) => x.id !== id) }));
        return found;
      },
      restoreRecord: (r) => commit((d) => ({ ...d, records: [...d.records, r] })),
      updateSettings: (s) => commit((d) => ({ ...d, settings: { ...d.settings, ...s } })),
      replaceData: (nd) => commit(() => nd),
      applyRemote: (fn) => commit(fn, true),
      resetData: () => commit(() => createInitialData()),
      addProduct: (p) => {
        const prod = { ...p, id: newId(), createdAt: Date.now() };
        commit((d) => ({ ...d, market: [...d.market, prod] }));
        return prod;
      },
      patchProduct: (id, fn) => commit((d) => ({ ...d, market: d.market.map((x) => (x.id === id ? fn(x) : x)) })),
      deleteProduct: (id) => {
        const found = data.market.find((x) => x.id === id);
        commit((d) => ({ ...d, market: d.market.filter((x) => x.id !== id) }));
        return found;
      },
      restoreProduct: (p) => commit((d) => ({ ...d, market: [...d.market, p] })),
      patchClimate: (fn) => commit((d) => ({ ...d, climate: fn(d.climate) })),
      updateClimateSettings: (c) => commit((d) => ({ ...d, settings: { ...d.settings, climate: { ...d.settings.climate, ...c } } })),
    };
  }, [data, commit]);

  if (status.state !== 'ready' || !value) return <>{fallback(status)}</>;
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore fuera de StoreProvider');
  return ctx;
}
