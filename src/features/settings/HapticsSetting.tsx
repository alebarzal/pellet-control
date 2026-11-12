import { LogOut, Vibrate, type LucideIcon } from 'lucide-react';
import { setAskExit, useAskExit } from '../back/BackButton';
import { haptic, setHapticsEnabled, useHapticsEnabled } from '../../ui/haptics';
import { cx, SectionTitle } from '../../ui/primitives';

function Switch({ on, onToggle, icon: Icon, title, text }: { on: boolean; onToggle: () => void; icon: LucideIcon; title: string; text: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-3 rounded-xl bg-sand-soft/60 px-3.5 py-3 text-left transition-transform duration-150 active:scale-[0.99]"
    >
      <span className="flex items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-olive" aria-hidden />
        <span>
          <span className="block font-semibold">{title}</span>
          <span className="block text-sm text-ink-2">{text}</span>
        </span>
      </span>
      <span className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200', on ? 'bg-olive' : 'bg-line')}>
        <span
          className={cx(
            'absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow-soft transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
            on && 'translate-x-5',
          )}
        />
      </span>
    </button>
  );
}

/** Preferencias que solo afectan a este móvil: vibración y aviso al salir. */
export function HapticsSetting() {
  const vibrate = useHapticsEnabled();
  const ask = useAskExit();
  return (
    <>
      <SectionTitle>Este móvil</SectionTitle>
      <div className="flex flex-col gap-2">
        <Switch
          on={vibrate}
          onToggle={() => {
            setHapticsEnabled(!vibrate);
            if (!vibrate) haptic.tap();
          }}
          icon={Vibrate}
          title="Vibración al pulsar"
          text="Pequeña vibración en botones, teclas − / + y al guardar."
        />
        <Switch
          on={ask}
          onToggle={() => {
            setAskExit(!ask);
            haptic.tap();
          }}
          icon={LogOut}
          title="Preguntar antes de salir"
          text="Con el gesto atrás en Inicio, confirma antes de cerrar la app. En otras pantallas, atrás cierra menús o vuelve a Inicio."
        />
      </div>
    </>
  );
}
