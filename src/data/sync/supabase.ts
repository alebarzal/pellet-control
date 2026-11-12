import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { SyncBackend, SyncState } from './engine';
import type { Collection, SyncItem } from './model';

/** Configuración de conexión guardada en el móvil (no va en las copias de seguridad). */
export interface SyncConfig extends SyncState {
  url: string;
  key: string;
  householdName: string;
  inviteCode: string;
  /** Hasta cuándo vale el código (ISO). */
  inviteExpiresAt?: string;
}

const CONFIG_KEY = 'pellet-control:sync';

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? (JSON.parse(raw) as SyncConfig) : null;
  } catch {
    return null;
  }
}

export function saveSyncConfig(c: SyncConfig | null) {
  try {
    if (c) localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
    else localStorage.removeItem(CONFIG_KEY);
  } catch {
    /* almacenamiento bloqueado: la sincronización seguirá en memoria */
  }
}

/* ───────────── Invitaciones ───────────── */

export interface Invitation {
  url: string;
  key: string;
  code: string;
  name: string;
}

const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export function encodeInvitation(i: Invitation): string {
  return `PC1:${b64url(JSON.stringify({ u: i.url, k: i.key, c: i.code, n: i.name }))}`;
}

export function decodeInvitation(text: string): Invitation | null {
  const m = text.match(/PC1:([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const o = JSON.parse(unb64url(m[1]));
    if (typeof o.u !== 'string' || typeof o.k !== 'string' || typeof o.c !== 'string') return null;
    return { url: o.u, key: o.k, code: o.c, name: typeof o.n === 'string' ? o.n : 'Hogar' };
  } catch {
    return null;
  }
}

/* ───────────── Cliente ───────────── */

export class SyncError extends Error {}

const explain = (e: unknown): string => {
  const msg = String((e as { message?: string })?.message ?? e);
  if (/Anonymous sign-ins are disabled/i.test(msg)) return 'Activa «Allow anonymous sign-ins» en Supabase → Authentication → Sign In / Providers.';
  if (/Invalid API key|No API key|apikey/i.test(msg)) return 'La clave del proyecto no es válida. Copia de nuevo la «anon / publishable key».';
  if (/no válido/i.test(msg)) return 'El código no es válido o ha caducado. Pide uno nuevo.';
  if (/Demasiados intentos/i.test(msg)) return 'Demasiados intentos. Espera una hora y vuelve a probar.';
  if (/function .* does not exist|relation .* does not exist|Could not find the function/i.test(msg))
    return 'Falta preparar la base de datos: ejecuta el script en Supabase → SQL Editor.';
  if (/Failed to fetch|NetworkError|fetch failed|Load failed/i.test(msg)) return 'Sin conexión con Supabase. Revisa internet y la dirección del proyecto.';
  return msg;
};

export class SupabaseSync implements SyncBackend {
  readonly client: SupabaseClient;
  private channel: RealtimeChannel | null = null;

  constructor(url: string, key: string) {
    let u: URL;
    try {
      u = new URL(url.trim());
    } catch {
      throw new SyncError('La dirección del proyecto no es válida (debe ser https://xxxx.supabase.co).');
    }
    this.client = createClient(u.origin, key.trim(), {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'pellet-control:auth' },
    });
  }

  /** Sesión anónima persistente: identifica a este móvil sin email ni contraseña. */
  async ensureSession(): Promise<void> {
    const { data } = await this.client.auth.getSession();
    if (data.session) return;
    const { error } = await this.client.auth.signInAnonymously();
    if (error) throw new SyncError(explain(error));
  }

  async createHousehold(name: string, device: string) {
    await this.ensureSession();
    const { data, error } = await this.client.rpc('create_household', { p_name: name, p_device: device });
    if (error) throw new SyncError(explain(error));
    return data as { id: string; name: string; invite_code: string; invite_expires_at: string };
  }

  async joinHousehold(code: string, device: string) {
    await this.ensureSession();
    const { data, error } = await this.client.rpc('join_household', { p_code: code, p_device: device });
    if (error) throw new SyncError(explain(error));
    // La función devuelve vacío (sin error) cuando el código no vale, para que el intento cuente.
    const h = data as { id: string | null; name: string; invite_code: string } | null;
    if (!h?.id) throw new SyncError('El código no es válido o ha caducado. Pide uno nuevo.');
    return h as { id: string; name: string; invite_code: string };
  }

  /** Nombre, código vigente y caducidad del hogar. */
  async household(householdId: string) {
    const { data, error } = await this.client.from('households').select('name,invite_code,invite_expires_at').eq('id', householdId).single();
    if (error) throw new SyncError(explain(error));
    return { name: data.name as string, code: data.invite_code as string, expiresAt: data.invite_expires_at as string };
  }

  async rotateInvite(householdId: string): Promise<string> {
    const { data, error } = await this.client.rpc('rotate_invite', { p_household: householdId });
    if (error) throw new SyncError(explain(error));
    return data as string;
  }

  async members(householdId: string): Promise<{ device: string; joinedAt: string; me: boolean }[]> {
    const { data: s } = await this.client.auth.getSession();
    const { data, error } = await this.client.from('members').select('user_id,device_name,joined_at').eq('household_id', householdId).order('joined_at');
    if (error) throw new SyncError(explain(error));
    return (data ?? []).map((m) => ({ device: m.device_name as string, joinedAt: m.joined_at as string, me: m.user_id === s.session?.user.id }));
  }

  async leave(householdId: string) {
    const { data: s } = await this.client.auth.getSession();
    if (!s.session) return;
    await this.client.from('members').delete().eq('household_id', householdId).eq('user_id', s.session.user.id);
  }

  async upsert(householdId: string, items: SyncItem[]) {
    await this.ensureSession();
    const { error } = await this.client.from('items').upsert(
      items.map((i) => ({ household_id: householdId, collection: i.collection, id: i.id, data: i.deleted ? null : i.data, deleted: i.deleted })),
      { onConflict: 'household_id,collection,id' },
    );
    if (error) throw new SyncError(explain(error));
  }

  async since(householdId: string, cursor: string | null, limit: number): Promise<SyncItem[]> {
    await this.ensureSession();
    let q = this.client.from('items').select('collection,id,data,deleted,updated_at').eq('household_id', householdId).order('updated_at').limit(limit);
    if (cursor) q = q.gt('updated_at', cursor);
    const { data, error } = await q;
    if (error) throw new SyncError(explain(error));
    return (data ?? []).map((r) => ({
      collection: r.collection as Collection,
      id: r.id as string,
      data: r.data,
      deleted: r.deleted as boolean,
      updated_at: r.updated_at as string,
    }));
  }

  /** Cambios en tiempo real del hogar (los mismos que bajaría `since`). */
  subscribe(householdId: string, onItem: (i: SyncItem) => void, onStatus: (ok: boolean) => void) {
    this.unsubscribe();
    this.channel = this.client
      .channel(`items-${householdId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `household_id=eq.${householdId}` }, (p) => {
        const r = p.new as Record<string, unknown> | null;
        if (!r || !r.id) return;
        onItem({ collection: r.collection as Collection, id: r.id as string, data: r.data, deleted: !!r.deleted, updated_at: r.updated_at as string });
      })
      .subscribe((status) => onStatus(status === 'SUBSCRIBED'));
  }

  unsubscribe() {
    if (this.channel) void this.client.removeChannel(this.channel);
    this.channel = null;
  }
}
