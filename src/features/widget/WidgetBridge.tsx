import { useEffect, useRef } from 'react';
import { onWidgetAction, updateWidget } from '../../data/widget';
import { useStore } from '../../store/store';
import { useRecordActions } from '../records/RecordDialogs';

/** Mantiene al día el widget de la pantalla de inicio y abre el formulario que se pulsa en él. */
export function WidgetBridge() {
  const { data } = useStore();
  const { openAdd } = useRecordActions();
  const openRef = useRef(openAdd);
  openRef.current = openAdd;

  // Cada cambio de datos (también los que llegan del hogar compartido) repinta el widget.
  useEffect(() => {
    const t = setTimeout(() => void updateWidget(data), 400);
    return () => clearTimeout(t);
  }, [data]);

  useEffect(() => onWidgetAction((a) => openRef.current(a)), []);

  return null;
}
