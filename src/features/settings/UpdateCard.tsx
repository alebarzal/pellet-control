import { CloudDownload } from 'lucide-react';
import { useState } from 'react';
import { BUILD_SHA, BUILD_TIME, checkUpdate, installUpdate, updaterAvailable, type PublishedBuild } from '../../data/update';
import { Button, SectionTitle } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

type Phase = { k: 'idle' } | { k: 'checking' } | { k: 'downloading'; percent: number } | { k: 'done'; text: string };

/** Actualiza la app con el APK que GitHub compila en cada push. Solo en Android. */
export function UpdateCard() {
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const [found, setFound] = useState<PublishedBuild | null>(null);
  if (!updaterAvailable()) return null;

  async function run() {
    try {
      setPhase({ k: 'checking' });
      const c = await checkUpdate();
      if (c.state === 'current') {
        setFound(null);
        setPhase({ k: 'done', text: 'Ya tienes la última versión.' });
        return;
      }
      if (c.state === 'building') {
        setFound(null);
        setPhase({ k: 'done', text: 'Hay un cambio nuevo en GitHub que todavía se está compilando. Vuelve a probar en unos 5 minutos.' });
        return;
      }
      setFound(c.build);
      setPhase({ k: 'downloading', percent: 0 });
      const status = await installUpdate(c.build, (percent) => setPhase({ k: 'downloading', percent }));
      setPhase({
        k: 'done',
        text:
          status === 'permission'
            ? 'Activa «Permitir de esta fuente» en la pantalla que se ha abierto, vuelve aquí y pulsa otra vez.'
            : 'Descargada. Pulsa «Actualizar» en el aviso de Android; tus datos se conservan.',
      });
    } catch (e) {
      setPhase({ k: 'idle' });
      toast.show({ tone: 'error', title: 'No se pudo actualizar', body: e instanceof Error ? e.message : undefined });
    }
  }

  const busy = phase.k === 'checking' || phase.k === 'downloading';
  return (
    <>
      <SectionTitle>Actualizaciones</SectionTitle>
      <p className="text-sm text-ink-2">
        Versión instalada: <span className="font-semibold tabular-nums">{BUILD_SHA ? BUILD_SHA.slice(0, 7) : 'desconocida'}</span>
        {BUILD_TIME && ` · ${when(BUILD_TIME)}`}
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <Button variant="primary" icon={<CloudDownload className="size-4" />} loading={busy} onClick={() => void run()} className="self-start">
          {phase.k === 'checking' ? 'Buscando…' : phase.k === 'downloading' ? (phase.percent >= 0 ? `Descargando ${phase.percent} %` : 'Descargando…') : 'Actualizar desde GitHub'}
        </Button>
        {phase.k === 'downloading' && (
          <div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, phase.percent)}>
            <div className="h-full origin-left rounded-full bg-olive transition-transform duration-200" style={{ transform: `scaleX(${Math.max(0, phase.percent) / 100})` }} />
          </div>
        )}
        {found && (
          <p className="text-sm text-ink-2">
            Nueva: <span className="font-semibold">{found.title || found.sha.slice(0, 7)}</span>
            {found.at && ` · ${when(found.at)}`}
            {found.sizeMb > 0 && ` · ${found.sizeMb.toLocaleString('es-ES')} MB`}
          </p>
        )}
        {phase.k === 'done' && (
          <p className="text-sm text-ink-2" role="status">
            {phase.text}
          </p>
        )}
        <p className="text-[0.8125rem] text-ink-3">Descarga la versión del último cambio subido a GitHub y abre el instalador de Android.</p>
      </div>
    </>
  );
}
