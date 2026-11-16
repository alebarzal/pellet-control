import { useEffect } from 'react';
import { setPhotoCheckBackground } from '../../data/background';
import { useCheckSnooze, usePhotoNotify } from '../../data/photoCheck';
import { hopperModel, photoCheckPlan } from '../../domain/hopperModel';
import { useStore } from '../../store/store';

/**
 * Mantiene al día el aviso de «toca comprobar la tolva con una foto» para cuando la app está cerrada:
 * le deja dicho al móvil cuánto pellet falta por quemar, con los datos de este momento.
 */
export function PhotoCheckSync() {
  const { data } = useStore();
  const on = usePhotoNotify();
  const snooze = useCheckSnooze();
  useEffect(() => {
    const push = () => {
      const plan = on ? photoCheckPlan(hopperModel(data, Date.now()), snooze) : null;
      void setPhotoCheckBackground(plan).catch(() => {});
    };
    push();
    // Al salir de la app, se vuelve a calcular con lo quemado hasta ese momento.
    const onVis = () => {
      if (document.visibilityState === 'hidden') push();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [data, on, snooze]);
  return null;
}
