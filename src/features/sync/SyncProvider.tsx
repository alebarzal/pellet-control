import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SyncEngine } from '../../data/sync/engine';
import { allItems, applyRemote, diff, emptyFrom, type SyncItem } from '../../data/sync/model';
import {
  decodeInvitation,
  encodeInvitation,
  loadSyncConfig,
  saveSyncConfig,
  SupabaseSync,
  SyncError,
  type SyncConfig,
} from '../../data/sync/supabase';
import { builtinProject, isShortCode, parseShortCode, prettyCode } from '../../data/sync/project';
import { onLocalChange, useStore } from '../../store/store';

export type SyncStatus = 'off' | 'syncing' | 'online' | 'offline' | 'error';

interface SyncApi {
  config: SyncConfig | null;
  status: SyncStatus;
  /** Escucha de cambios al instante activa. */
  live: boolean;
  error: string | null;
  lastSync: string | null;
  pending: number;
  /** Código de invitación vigente y su caducidad. */
  invite: { code: string; expiresAt: string | null } | null;
  /** Mensaje listo para enviar por WhatsApp. */
  inviteMessage: string | null;
  /** La app trae un proyecto de Supabase de serie (unirse solo pide 6 dígitos). */
  hasBuiltinProject: boolean;
  createHousehold: (o: { name: string; device: string; url?: string; key?: string }) => Promise<void>;
  joinHousehold: (codeOrInvitation: string, device: string, project?: { url: string; key: string }) => Promise<void>;
  syncNow: () => Promise<void>;
  rotateInvite: () => Promise<void>;
  members: () => Promise<{ device: string; joinedAt: string; me: boolean }[]>;
  leave: () => Promise<void>;
}

const Ctx = createContext<SyncApi | null>(null);
const POLL_MS = 60_000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const { data, applyRemote: applyToStore } = useStore();
  const dataRef = useRef(data);
  dataRef.current = data;

  const [config, setConfig] = useState<SyncConfig | null>(() => loadSyncConfig());
  const [status, setStatus] = useState<SyncStatus>(config ? 'syncing' : 'off');
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pending, setPending] = useState(config?.pending.length ?? 0);

  const backendRef = useRef<SupabaseSync | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);
  const running = useRef(false);
  const again = useRef(false);

  const persist = useCallback((s: SyncConfig) => {
    saveSyncConfig(s);
    setPending(s.pending.length);
  }, []);

  const apply = useCallback(
    (items: SyncItem[]) => {
      if (items.length) applyToStore((d) => applyRemote(d, items));
    },
    [applyToStore],
  );

  // Motor y cliente para la configuración actual.
  useEffect(() => {
    if (!config) {
      backendRef.current?.unsubscribe();
      backendRef.current = null;
      engineRef.current = null;
      setStatus('off');
      setLive(false);
      return;
    }
    let backend: SupabaseSync;
    try {
      backend = new SupabaseSync(config.url, config.key);
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    backendRef.current = backend;
    engineRef.current = new SyncEngine(
      backend,
      { householdId: config.householdId, cursor: config.cursor, pending: config.pending },
      // Solo actualiza cursor y cola: el resto de la configuración (p. ej. un código nuevo) se conserva.
      (s) => {
        const cur = loadSyncConfig();
        if (cur && cur.householdId === s.householdId) persist({ ...cur, cursor: s.cursor, pending: s.pending });
      },
    );
    void backend
      .ensureSession()
      .then(() =>
        backend.subscribe(
          config.householdId,
          (item) => apply(engineRef.current?.filterPending([item]) ?? []),
          (ok) => setLive(ok),
        ),
      )
      .catch(() => setLive(false));
    return () => {
      backend.unsubscribe();
      setLive(false);
    };
    // Solo cambia al entrar o salir de un hogar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.householdId, config?.url, config?.key]);

  const run = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setStatus('syncing');
    try {
      do {
        again.current = false;
        apply(await engine.sync());
      } while (again.current);
      // El código cambia cuando alguien se une o se renueva desde otro móvil: mantenerlo al día.
      const b = backendRef.current;
      const cur = loadSyncConfig();
      if (b && cur) {
        const h = await b.household(cur.householdId).catch(() => null);
        if (h && (h.code !== cur.inviteCode || h.expiresAt !== cur.inviteExpiresAt || h.name !== cur.householdName)) {
          const next = { ...cur, inviteCode: h.code, inviteExpiresAt: h.expiresAt, householdName: h.name };
          saveSyncConfig(next);
          setConfig(next);
        }
      }
      setStatus('online');
      setError(null);
      setLastSync(new Date().toISOString());
    } catch (e) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setStatus(offline ? 'offline' : 'error');
      setError(offline ? null : e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
    }
  }, [apply]);

  // Cambios locales → cola → subida (agrupando los cambios seguidos).
  const timer = useRef<number | undefined>(undefined);
  useEffect(
    () =>
      onLocalChange((prev, next) => {
        const engine = engineRef.current;
        if (!engine) return;
        engine.enqueue(diff(prev, next));
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void run(), 1200);
      }),
    [run],
  );

  // Sincroniza al abrir, cada minuto, al recuperar la red y al volver a la app.
  useEffect(() => {
    if (!config) return;
    void run();
    const iv = window.setInterval(() => void run(), POLL_MS);
    const onOnline = () => void run();
    const onVis = () => document.visibilityState === 'visible' && void run();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [config?.householdId, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const api = useMemo<SyncApi>(
    () => ({
      config,
      status,
      live,
      error,
      lastSync,
      pending,
      invite: config ? { code: config.inviteCode, expiresAt: config.inviteExpiresAt ?? null } : null,
      inviteMessage: config
        ? isShortCode(config.inviteCode)
          ? `Únete a «${config.householdName}» en Pellet Control: abre Más → Hogar → Unirme y escribe el código ${prettyCode(config.inviteCode)} (vale 24 horas y una sola vez).`
          : `Únete a «${config.householdName}» en Pellet Control: abre Más → Hogar → Unirme y pega esta invitación:

${encodeInvitation({ url: config.url, key: config.key, code: config.inviteCode, name: config.householdName })}`
        : null,
      hasBuiltinProject: !!builtinProject(),

      // Crea el hogar y sube todos los datos de este móvil.
      createHousehold: async ({ name, device, url, key }) => {
        const project = url?.trim() && key?.trim() ? { url: url.trim(), key: key.trim() } : builtinProject();
        if (!project) throw new SyncError('Falta la dirección y la clave del proyecto de Supabase.');
        const backend = new SupabaseSync(project.url, project.key);
        const h = await backend.createHousehold(name, device);
        const cfg: SyncConfig = {
          url: project.url,
          key: project.key,
          householdId: h.id,
          householdName: h.name,
          inviteCode: h.invite_code,
          inviteExpiresAt: h.invite_expires_at,
          cursor: null,
          pending: allItems(dataRef.current),
        };
        saveSyncConfig(cfg);
        setPending(cfg.pending.length);
        setConfig(cfg);
      },

      // Se une con la invitación: los datos de este móvil se sustituyen por los del hogar.
      joinHousehold: async (input, device, override) => {
        // Acepta el código de 6 dígitos o, por compatibilidad, la invitación larga «PC1:…».
        const legacy = decodeInvitation(input);
        let inv: { url: string; key: string; code: string };
        if (legacy) inv = legacy;
        else {
          const code = parseShortCode(input);
          if (!code) throw new SyncError('Escribe los 6 dígitos del código.');
          const project = override ?? builtinProject();
          if (!project) throw new SyncError('Esta versión de la app no trae el proyecto del hogar. Pide la invitación larga (PC1) o indica el proyecto en «Opciones avanzadas».');
          inv = { ...project, code };
        }
        const backend = new SupabaseSync(inv.url, inv.key);
        const h = await backend.joinHousehold(inv.code, device);
        const engine = new SyncEngine(backend, { householdId: h.id, cursor: null, pending: [] }, () => {});
        const items = await engine.pull();
        applyToStore((d) => applyRemote(emptyFrom(d), items));
        const cfg: SyncConfig = {
          url: inv.url,
          key: inv.key,
          householdId: h.id,
          householdName: h.name,
          inviteCode: h.invite_code,
          cursor: engine.state.cursor,
          pending: [],
        };
        saveSyncConfig(cfg);
        setPending(0);
        setConfig(cfg);
      },

      syncNow: run,

      rotateInvite: async () => {
        const b = backendRef.current;
        if (!b || !config) return;
        const code = await b.rotateInvite(config.householdId);
        const h = await b.household(config.householdId).catch(() => null);
        const cfg = { ...(loadSyncConfig() ?? config), inviteCode: code, inviteExpiresAt: h?.expiresAt ?? config.inviteExpiresAt };
        saveSyncConfig(cfg);
        setConfig(cfg);
      },

      members: async () => (backendRef.current && config ? backendRef.current.members(config.householdId) : []),

      // Deja de sincronizar; los datos se quedan en el móvil.
      leave: async () => {
        const b = backendRef.current;
        if (b && config) await b.leave(config.householdId).catch(() => {});
        saveSyncConfig(null);
        setConfig(null);
        setPending(0);
        setError(null);
      },
    }),
    [config, status, live, error, lastSync, pending, run, applyToStore],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useSync() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSync fuera de SyncProvider');
  return c;
}
