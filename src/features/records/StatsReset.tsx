import { History, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { statsReset } from '../../domain/calc';
import { todayIso } from '../../domain/dates';
import { fmtDate } from '../../domain/format';
import type { PelletRecord } from '../../domain/types';
import { useStore } from '../../store/store';
import { ConfirmDialog } from '../../ui/Dialog';
import { haptic } from '../../ui/haptics';
import { Button } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

/** Crea un reinicio de estadísticas y devuelve el registro (para poder deshacerlo). */
export function useStatsReset() {
  const { addRecord, deleteRecord } = useStore();
  const toast = useToast();
  return (opts: { silent?: boolean } = {}) => {
    const rec = addRecord({ kind: 'counter', metric: 'stats', date: todayIso(), value: null, notes: 'Reinicio de estadísticas' });
    if (!opts.silent) {
      haptic.success();
      toast.show({
        title: 'Estadísticas reiniciadas',
        body: 'Empiezan a contar desde ahora. Los registros antiguos siguen en Historial.',
        action: { label: 'Deshacer', onClick: () => deleteRecord(rec.id) },
      });
    }
    return rec;
  };
}

export function StatsResetButton() {
  const reset = useStatsReset();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Button icon={<RotateCcw className="size-4" />} onClick={() => setConfirm(true)}>
        Reiniciar estadísticas
      </Button>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="¿Reiniciar las estadísticas?"
        body="Gasto, consumo, medias, previsiones y recargas empezarán a contar desde ahora. No se borra nada: los registros antiguos siguen en Historial y en el Excel, y puedes volver a verlos cuando quieras. El stock de sacos y la tolva no cambian."
        confirmLabel="Reiniciar"
        onConfirm={() => reset()}
      />
    </>
  );
}

/** Aviso «contando desde…» con la opción de volver a ver todo el historial. */
export function StatsResetBanner() {
  const { data, deleteRecord, restoreRecord } = useStore();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const reset = statsReset(data);
  if (!reset) return null;
  const hour = new Date(reset.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-olive-soft px-4 py-3 text-sm text-olive-strong">
      <span className="flex items-center gap-2 font-semibold">
        <RotateCcw className="size-4" aria-hidden />
        Estadísticas contando desde el {fmtDate(reset.date)}, {hour}
      </span>
      <button type="button" onClick={() => setConfirm(true)} className="ml-auto flex items-center gap-1.5 font-semibold hover:underline">
        <History className="size-4" aria-hidden /> Ver todo el historial
      </button>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="¿Quitar el reinicio?"
        body="Las estadísticas volverán a incluir todos los datos desde el principio."
        confirmLabel="Quitar reinicio"
        onConfirm={() => {
          const removed = data.records
            .filter((r) => r.kind === 'counter' && r.metric === 'stats')
            .map((r) => deleteRecord(r.id))
            .filter((r): r is PelletRecord => !!r);
          toast.show({ title: 'Estadísticas con todo el historial', action: { label: 'Deshacer', onClick: () => removed.forEach(restoreRecord) } });
        }}
      />
    </div>
  );
}
