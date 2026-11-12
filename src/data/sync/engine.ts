import type { SyncItem } from './model';

/** Lo que el motor necesita del servidor (Supabase en la app, memoria en los tests). */
export interface SyncBackend {
  upsert(householdId: string, items: SyncItem[]): Promise<void>;
  /** Filas cambiadas después de `cursor` (hora del servidor), ordenadas por updated_at. */
  since(householdId: string, cursor: string | null, limit: number): Promise<SyncItem[]>;
}

export interface SyncState {
  householdId: string;
  /** Última hora de servidor recibida. */
  cursor: string | null;
  /** Cambios locales pendientes de subir (el último de cada fila). */
  pending: SyncItem[];
}

const key = (i: SyncItem) => `${i.collection}:${i.id}`;
const BATCH = 400;

/**
 * Sincronización «local primero»: la app funciona siempre con sus datos locales;
 * los cambios se ponen en cola, se suben cuando hay conexión y los del hogar se bajan por cursor.
 * Conflictos: gana la última escritura que llega al servidor.
 */
export class SyncEngine {
  constructor(
    private backend: SyncBackend,
    public state: SyncState,
    private persist: (s: SyncState) => void,
  ) {}

  enqueue(items: SyncItem[]) {
    if (!items.length) return;
    const m = new Map(this.state.pending.map((i) => [key(i), i]));
    for (const it of items) m.set(key(it), { ...it, updated_at: undefined });
    this.state = { ...this.state, pending: [...m.values()] };
    this.persist(this.state);
  }

  get pendingCount() {
    return this.state.pending.length;
  }

  /** Sube los cambios pendientes por lotes. Si falla, se quedan en la cola. */
  async push(): Promise<number> {
    let sent = 0;
    while (this.state.pending.length) {
      const batch = this.state.pending.slice(0, BATCH);
      await this.backend.upsert(this.state.householdId, batch);
      // Quita solo lo enviado (pudo encolarse algo nuevo mientras tanto para la misma fila).
      const sentKeys = new Map(batch.map((b) => [key(b), b]));
      this.state = {
        ...this.state,
        pending: this.state.pending.filter((p) => sentKeys.get(key(p)) !== p),
      };
      this.persist(this.state);
      sent += batch.length;
    }
    return sent;
  }

  /** Baja lo nuevo del hogar. No devuelve filas con cambios locales pendientes (se impondrá el local al subir). */
  async pull(): Promise<SyncItem[]> {
    const out: SyncItem[] = [];
    for (;;) {
      const rows = await this.backend.since(this.state.householdId, this.state.cursor, 1000);
      if (!rows.length) break;
      out.push(...rows);
      this.state = { ...this.state, cursor: rows.at(-1)!.updated_at ?? this.state.cursor };
      this.persist(this.state);
      if (rows.length < 1000) break;
    }
    return this.filterPending(out);
  }

  /** Filtra cambios remotos (p. ej. en tiempo real) que chocan con pendientes locales. */
  filterPending(items: SyncItem[]): SyncItem[] {
    const pend = new Set(this.state.pending.map(key));
    return items.filter((i) => !pend.has(key(i)));
  }

  /** Subir y luego bajar. */
  async sync(): Promise<SyncItem[]> {
    await this.push();
    return this.pull();
  }
}
