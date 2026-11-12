import { Vibrate } from 'lucide-react';
import { haptic, setHapticsEnabled, useHapticsEnabled } from '../../ui/haptics';
import { cx, SectionTitle } from '../../ui/primitives';

/** Interruptor de vibración al pulsar. Se guarda solo en este móvil. */
export function HapticsSetting() {
  const on = useHapticsEnabled();
  return (
    <>
      <SectionTitle>Este móvil</SectionTitle>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => {
          setHapticsEnabled(!on);
          if (!on) haptic.tap();
        }}
        className="flex w-full items-center justify-between gap-3 rounded-xl bg-sand-soft/60 px-3.5 py-3 text-left transition-transform duration-150 active:scale-[0.99]"
      >
        <span className="flex items-start gap-3">
          <Vibrate className="mt-0.5 size-4 shrink-0 text-olive" aria-hidden />
          <span>
            <span className="block font-semibold">Vibración al pulsar</span>
            <span className="block text-sm text-ink-2">Pequeña vibración en botones, teclas − / + y al guardar. Solo en este móvil.</span>
          </span>
        </span>
        <span className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200', on ? 'bg-olive' : 'bg-line')}>
          <span className={cx('absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow-soft transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]', on && 'translate-x-5')} />
        </span>
      </button>
    </>
  );
}
