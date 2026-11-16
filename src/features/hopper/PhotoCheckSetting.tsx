import { BellRing } from 'lucide-react';
import { backgroundAvailable, requestNotifications, testPhotoNotification } from '../../data/background';
import { setPhotoNotify, usePhotoNotify } from '../../data/photoCheck';
import { CHECK_AFTER_POINTS } from '../../domain/hopperModel';
import { Button, cx, SectionTitle } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

/** Notificación del móvil cuando toca comprobar la tolva con una foto. */
export function PhotoCheckSetting() {
  const on = usePhotoNotify();
  const toast = useToast();

  async function toggle() {
    if (on) {
      setPhotoNotify(false);
      return;
    }
    if (!(await requestNotifications())) {
      toast.show({ tone: 'error', title: 'Sin permiso para notificaciones', body: 'Actívalo en Ajustes de Android → Aplicaciones → Pellet Control → Notificaciones.' });
      return;
    }
    setPhotoNotify(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle>Aviso de foto de la tolva</SectionTitle>
      <p className="text-sm text-ink-2">
        Cuando el nivel calculado baja {CHECK_AFTER_POINTS} puntos desde tu última lectura, la app te pide comprobarlo con una foto.
        {backgroundAvailable() ? ' Puede avisarte también con la app cerrada.' : ''}
      </p>
      {backgroundAvailable() ? (
        <>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => void toggle()}
            className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3.5 py-3 text-left ring-1 ring-line transition-transform duration-150 active:scale-[0.99]"
          >
            <span className="font-semibold">Notificarme en el móvil</span>
            <span className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200', on ? 'bg-olive' : 'bg-line')}>
              <span className={cx('absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow-soft transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]', on && 'translate-x-5')} />
            </span>
          </button>
          {on && (
            <Button size="sm" className="self-start" icon={<BellRing className="size-4" />} onClick={() => void testPhotoNotification()}>
              Enviar aviso de prueba
            </Button>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-3">La notificación con la app cerrada está disponible en la app Android.</p>
      )}
    </div>
  );
}
