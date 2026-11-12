import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Check, Copy, ExternalLink, Loader2, LogOut, RefreshCw, Send, Smartphone, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import schemaSql from '../../../supabase/schema.sql?raw';
import { prettyCode } from '../../data/sync/project';
import { openExternal } from '../../data/web';
import { ConfirmDialog } from '../../ui/Dialog';
import { TextInput } from '../../ui/fields';
import { Button, Card, cx, SectionTitle, Segmented } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import { SyncBadge } from './SyncBadge';
import { useSync } from './SyncProvider';

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const ago = (iso: string | null) => {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

const hoursLeft = (iso: string | null) => (iso ? (new Date(iso).getTime() - Date.now()) / 3_600_000 : null);

function Steps() {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const n = (i: number) => (
    <span className="num grid size-6 shrink-0 place-items-center rounded-full bg-olive-soft text-xs font-bold text-olive-strong">{i}</span>
  );
  return (
    <ol className="flex flex-col gap-3 text-sm text-ink-2">
      <li className="flex gap-3">
        {n(1)}
        <span>
          Crea una cuenta gratuita y un proyecto nuevo en Supabase (mejor desde el ordenador).{' '}
          <button type="button" onClick={() => void openExternal('https://supabase.com/dashboard/new')} className="inline-flex items-center gap-1 font-semibold text-olive-strong hover:underline">
            Abrir supabase.com <ExternalLink className="size-3.5" />
          </button>
        </span>
      </li>
      <li className="flex gap-3">
        {n(2)}
        <span>
          En el proyecto, abre <b>SQL Editor</b>, pega el script y pulsa <b>Run</b>.{' '}
          <button
            type="button"
            onClick={async () => {
              if (await copy(schemaSql)) {
                setCopied(true);
                toast.show({ title: 'Script copiado' });
              } else toast.show({ tone: 'error', title: 'No se pudo copiar', body: 'Está también en supabase/schema.sql del proyecto.' });
            }}
            className="inline-flex items-center gap-1 font-semibold text-olive-strong hover:underline"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Copiar script
          </button>
        </span>
      </li>
      <li className="flex gap-3">
        {n(3)}
        <span>
          En <b>Authentication → Sign In / Providers</b>, activa <b>Allow anonymous sign-ins</b> y guarda.
        </span>
      </li>
      <li className="flex gap-3">
        {n(4)}
        <span>
          Con el botón <b>Connect</b> (o en <b>Project Settings → API Keys</b>), copia la <b>Project URL</b> y la clave <b>publishable / anon</b> y pégalas aquí.
        </span>
      </li>
    </ol>
  );
}

/** Campo grande para los 6 dígitos. También acepta pegar el código con espacios o la invitación larga antigua. */
function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="pc-join-code" className="text-sm font-semibold">
        Código de invitación
      </label>
      <input
        id="pc-join-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        enterKeyHint="go"
        placeholder="000 000"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (/PC1:/i.test(v)) return onChange(v.trim());
          const d = v.replace(/\D/g, '').slice(0, 6);
          onChange(d.length > 3 ? `${d.slice(0, 3)} ${d.slice(3)}` : d);
        }}
        className="num h-16 w-full rounded-2xl bg-surface text-center text-[2rem] font-bold tracking-[0.25em] text-ink ring-1 ring-line ring-inset placeholder:text-line focus:outline-none focus:ring-2 focus:ring-olive"
      />
      <p className="text-[0.8125rem] text-ink-3">Te lo envía quien creó el hogar. Vale 24 horas y una sola vez.</p>
    </div>
  );
}

export function HouseholdCard() {
  const sync = useSync();
  const toast = useToast();
  const [mode, setMode] = useState<'crear' | 'unirse'>('unirse');
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [name, setName] = useState('Mi casa');
  const [device, setDevice] = useState('');
  const [code, setCode] = useState('');
  const [advanced, setAdvanced] = useState(!sync.hasBuiltinProject);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [members, setMembers] = useState<{ device: string; joinedAt: string; me: boolean }[]>([]);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmJoin, setConfirmJoin] = useState(false);

  const cfg = sync.config;
  useEffect(() => {
    if (cfg && sync.status === 'online') void sync.members().then(setMembers).catch(() => {});
  }, [cfg?.householdId, sync.status, cfg?.inviteCode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    setErr('');
    try {
      await fn();
      toast.show({ title: ok });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function shareInvite() {
    const text = sync.inviteMessage;
    if (!text) return;
    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({ title: 'Invitación a Pellet Control', text, dialogTitle: 'Enviar código' });
      } catch {
        /* cancelado */
      }
    } else if (await copy(text)) toast.show({ title: 'Mensaje copiado', body: 'Pégalo en WhatsApp o en un correo.' });
  }

  const left = hoursLeft(sync.invite?.expiresAt ?? null);
  const expired = left != null && left <= 0;
  const isShortCode = !!sync.invite && /^\d{6}$/.test(sync.invite.code);
  const codeReady = /PC1:/i.test(code) || code.replace(/\D/g, '').length === 6;
  const override = url.trim() && key.trim() ? { url: url.trim(), key: key.trim() } : undefined;

  return (
    <Card>
      <SectionTitle aside={cfg ? <SyncBadge withLabel /> : undefined}>
        <span className="flex items-center gap-2">
          <Users className="size-4 text-olive" aria-hidden /> Hogar compartido
        </span>
      </SectionTitle>

      {!cfg ? (
        <>
          <p className="text-sm text-ink-2 text-pretty">
            Comparte los datos con quien viva contigo: lo que registre uno aparece en el móvil del otro al momento. También funciona sin conexión y se pone al día al volver.
          </p>
          <div className="mt-4 max-w-sm">
            <Segmented
              label="Opción"
              value={mode}
              onChange={(m) => {
                setMode(m);
                setErr('');
              }}
              options={[
                { value: 'unirse', label: 'Unirme con código' },
                { value: 'crear', label: 'Crear un hogar' },
              ]}
            />
          </div>

          {mode === 'unirse' ? (
            <form
              className="mt-5 flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                setConfirmJoin(true);
              }}
            >
              <CodeInput value={code} onChange={setCode} />
              <TextInput label="Nombre de este móvil" placeholder="Móvil de…" value={device} onChange={(e) => setDevice(e.target.value)} />
              {!sync.hasBuiltinProject && (
                <div className="flex flex-col gap-3 rounded-2xl bg-sand-soft/60 p-4">
                  <p className="text-sm text-ink-2">
                    Esta versión de la app no trae el proyecto del hogar: indica su dirección y clave pública, o pega la invitación larga (PC1) en el campo del código.
                  </p>
                  <TextInput label="Project URL" type="url" inputMode="url" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" spellCheck={false} />
                  <TextInput label="Clave publishable / anon" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} />
                </div>
              )}
              {err && <p className="rounded-xl bg-rust-soft px-3 py-2.5 text-sm text-rust">{err}</p>}
              <Button type="submit" variant="primary" className="self-start" disabled={!codeReady || busy} icon={busy ? <Loader2 className="size-4 animate-spin" /> : undefined}>
                Unirme al hogar
              </Button>
            </form>
          ) : (
            <form
              className="mt-5 flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void act(() => sync.createHousehold({ name, device, url, key }), 'Hogar creado: tus datos se están subiendo');
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput label="Nombre del hogar" value={name} onChange={(e) => setName(e.target.value)} />
                <TextInput label="Nombre de este móvil" placeholder="Móvil de Ale" value={device} onChange={(e) => setDevice(e.target.value)} />
              </div>
              {sync.hasBuiltinProject && (
                <button type="button" onClick={() => setAdvanced((a) => !a)} className="self-start text-sm font-semibold text-ink-2 hover:text-ink">
                  {advanced ? 'Ocultar opciones avanzadas' : 'Usar otro proyecto de Supabase (avanzado)'}
                </button>
              )}
              {advanced && (
                <div className="flex flex-col gap-4 rounded-2xl bg-sand-soft/60 p-4">
                  <Steps />
                  <TextInput label="Project URL" type="url" inputMode="url" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" spellCheck={false} />
                  <TextInput
                    label="Clave publishable / anon"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    hint="La clave pública del proyecto; la seguridad la dan las reglas del script."
                  />
                </div>
              )}
              {err && <p className="rounded-xl bg-rust-soft px-3 py-2.5 text-sm text-rust">{err}</p>}
              <Button
                type="submit"
                variant="primary"
                className="self-start"
                disabled={busy || (!sync.hasBuiltinProject && (!url.trim() || !key.trim()))}
                icon={busy ? <Loader2 className="size-4 animate-spin" /> : undefined}
              >
                Crear hogar y subir mis datos
              </Button>
            </form>
          )}
        </>
      ) : (
        <>
          <p className="text-lg font-bold">{cfg.householdName}</p>
          <p className="mt-0.5 text-sm text-ink-2">
            {sync.status === 'online' && `Sincronizado ${ago(sync.lastSync)}${sync.live ? ' · cambios al instante' : ''}.`}
            {sync.status === 'syncing' && 'Sincronizando…'}
            {sync.status === 'offline' && `Sin conexión. ${sync.pending ? `${sync.pending} cambios esperan para subir.` : 'Se pondrá al día al volver la red.'}`}
            {sync.status === 'error' && 'No se pudo sincronizar.'}
          </p>
          {sync.error && <p className="mt-2 rounded-xl bg-rust-soft px-3 py-2.5 text-sm text-rust">{sync.error}</p>}

          <div className="mt-5 rounded-2xl bg-sand-soft/70 p-4">
            <p className="text-sm font-semibold text-ink-2">Código para invitar</p>
            {isShortCode ? (
              <>
                <p className={cx('num mt-1 text-[2.25rem] leading-tight font-bold tracking-[0.12em]', expired && 'text-ink-3 line-through')}>{prettyCode(sync.invite!.code)}</p>
                <p className={cx('text-[0.8125rem]', expired ? 'text-rust' : 'text-ink-3')}>
                  {expired
                    ? 'Caducado: crea uno nuevo.'
                    : left != null
                      ? `Vale ${left >= 1 ? `${Math.floor(left)} h` : `${Math.max(1, Math.round(left * 60))} min`} más y una sola vez.`
                      : 'Vale 24 horas y una sola vez.'}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-ink-2">Vuelve a ejecutar el script de Supabase para usar códigos de 6 dígitos. Mientras, se envía la invitación larga.</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" icon={<Send className="size-4" />} onClick={() => void shareInvite()} disabled={expired}>
                Compartir código
              </Button>
              <Button icon={<RefreshCw className="size-4" />} onClick={() => void act(() => sync.rotateInvite(), 'Código nuevo creado')} disabled={busy}>
                Código nuevo
              </Button>
            </div>
          </div>

          {members.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1.5">
              {members.map((m, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <Smartphone className="size-4 text-olive" aria-hidden />
                  <span className="font-semibold">{m.device || 'Móvil sin nombre'}</span>
                  {m.me && <span className="text-ink-3">· este móvil</span>}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => void sync.syncNow()}
              className="flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink"
              disabled={sync.status === 'syncing'}
            >
              {sync.status === 'syncing' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Sincronizar ahora
            </button>
            <button type="button" onClick={() => setConfirmLeave(true)} className="flex items-center gap-1.5 text-sm font-semibold text-rust">
              <LogOut className="size-4" /> Salir del hogar
            </button>
          </div>
          {err && <p className="mt-2 text-sm text-rust">{err}</p>}
        </>
      )}

      <ConfirmDialog
        open={confirmJoin}
        onClose={() => setConfirmJoin(false)}
        title="¿Unirte al hogar?"
        body="Los datos de este móvil se sustituirán por los del hogar compartido. Si tienes algo que quieras conservar, descarga antes una copia."
        confirmLabel="Unirme"
        onConfirm={() => void act(() => sync.joinHousehold(code, device, override), 'Te has unido al hogar')}
      />
      <ConfirmDialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="¿Salir del hogar?"
        body="Este móvil dejará de sincronizar. Sus datos actuales se quedan en el móvil y el hogar sigue igual para los demás."
        confirmLabel="Salir"
        onConfirm={() => void act(() => sync.leave(), 'Has salido del hogar')}
      />
    </Card>
  );
}
