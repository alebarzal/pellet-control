import { CloudDownload } from 'lucide-react';
import type { Route } from '../../app/router';
import { dismissUpdatePrompt, requestAutoInstall, useAvailableUpdate, useUpdatePromptDismissed } from '../../data/update';
import { Dialog } from '../../ui/Dialog';
import { Button } from '../../ui/primitives';
import { useWhatsNewBusy } from './WhatsNew';

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
};

/**
 * Aviso al entrar en la app cuando hay una versión nueva lista en GitHub. Sale una vez cada vez que
 * se abre la app; con «Más tarde» se queda el aviso pequeño de Inicio.
 */
export function UpdatePrompt({ go }: { go: (r: Route) => void }) {
  const build = useAvailableUpdate();
  const dismissed = useUpdatePromptDismissed();
  // Las novedades de la versión recién instalada van primero; este aviso espera a que se cierren.
  const whatsNew = useWhatsNewBusy();
  const open = !!build && dismissed !== build.sha && !whatsNew;
  const later = () => build && dismissUpdatePrompt(build.sha);

  return (
    <Dialog open={open} onClose={later} title="Hay una versión nueva">
      {build && (
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-3 rounded-2xl bg-olive-soft px-4 py-3 text-forest">
            <CloudDownload className="mt-0.5 size-5 shrink-0" aria-hidden />
            <p className="min-w-0 text-sm">
              <span className="block font-semibold text-pretty">{build.title || 'Actualización de Pellet Control'}</span>
              <span className="block text-forest/80">
                {[when(build.at), build.sizeMb > 0 ? `${build.sizeMb.toLocaleString('es-ES')} MB` : ''].filter(Boolean).join(' · ')}
              </span>
            </p>
          </div>
          <p className="text-[0.9375rem] text-ink-2 text-pretty">Se descarga desde GitHub y se abre el instalador de Android. Tus datos se conservan.</p>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              variant="primary"
              icon={<CloudDownload className="size-4" />}
              className="w-full"
              onClick={() => {
                dismissUpdatePrompt(build.sha);
                requestAutoInstall();
                go('configuracion');
              }}
            >
              Actualizar ahora
            </Button>
            <Button onClick={later} className="w-full">
              Más tarde
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
