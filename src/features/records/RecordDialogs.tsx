import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { PelletRecord, RecordKind } from '../../domain/types';
import { useStore } from '../../store/store';
import { ConfirmDialog, Dialog } from '../../ui/Dialog';
import { haptic } from '../../ui/haptics';
import { useToast } from '../../ui/Toast';
import { describeRecord, done, KIND_META } from './meta';
import { RecordForm } from './RecordForm';

interface Api {
  openAdd: (kind?: RecordKind) => void;
  openEdit: (r: PelletRecord) => void;
  confirmDelete: (r: PelletRecord) => void;
}

const Ctx = createContext<Api | null>(null);

const QUICK: RecordKind[] = ['purchase', 'refill', 'consumption', 'level'];

const DESCRIPTIONS: Record<RecordKind, string> = {
  purchase: 'Suma sacos al almacén y al gasto.',
  refill: 'Pasa sacos del almacén a la tolva.',
  consumption: 'Pellet realmente quemado por la caldera.',
  level: 'Cómo está la tolva ahora mismo.',
  inventory: 'Cuenta los sacos que tienes almacenados.',
  adjustment: 'Corrige el stock por roturas o errores.',
  spend: 'Pone el contador de gasto a una cifra o a cero.',
  counter: 'Fija un indicador de Inicio sin tocar los datos reales.',
};

export function RecordDialogsProvider({ children }: { children: ReactNode }) {
  const { data, deleteRecord, restoreRecord } = useStore();
  const toast = useToast();
  const [mode, setMode] = useState<{ type: 'add'; kind: RecordKind; quick: boolean } | { type: 'edit'; record: PelletRecord } | null>(null);
  const [toDelete, setToDelete] = useState<PelletRecord | null>(null);
  const [formKey, setFormKey] = useState(0);

  const doDelete = useCallback(
    (r: PelletRecord) => {
      haptic.warning();
      const removed = deleteRecord(r.id);
      setMode(null);
      if (removed)
        toast.show({
          title: done(r.kind, 'eliminad'),
          body: 'Los totales se han recalculado.',
          action: { label: 'Deshacer', onClick: () => restoreRecord(removed) },
        });
    },
    [deleteRecord, restoreRecord, toast],
  );

  const api = useMemo<Api>(
    () => ({
      openAdd: (kind = 'purchase') => {
        setFormKey((k) => k + 1);
        setMode({ type: 'add', kind, quick: QUICK.includes(kind) });
      },
      openEdit: (record) => {
        setFormKey((k) => k + 1);
        setMode({ type: 'edit', record });
      },
      confirmDelete: (r) => setToDelete(r),
    }),
    [],
  );

  const kind = mode?.type === 'add' ? mode.kind : mode?.record.kind;
  const title = mode?.type === 'edit' ? `Editar ${KIND_META[mode.record.kind].label.toLowerCase()}` : mode?.quick ? 'Añadir movimiento' : kind ? KIND_META[kind].label : '';

  return (
    <Ctx.Provider value={api}>
      {children}
      <Dialog open={!!mode} onClose={() => setMode(null)} title={title} description={kind ? DESCRIPTIONS[kind] : undefined}>
        {mode && kind && (
          <div className="flex flex-col gap-5">
            {mode.type === 'add' && mode.quick && (
              <div role="radiogroup" aria-label="Tipo de movimiento" className="grid grid-cols-4 gap-1 rounded-2xl bg-sand-soft p-1 ring-1 ring-line/60 ring-inset">
                {QUICK.map((k) => {
                  const Icon = KIND_META[k].icon;
                  const on = mode.kind === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => {
                        if (on) return;
                        haptic.tap();
                        setFormKey((x) => x + 1);
                        setMode({ type: 'add', kind: k, quick: true });
                      }}
                      className={`flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold transition-[background-color,color,box-shadow,transform] duration-200 active:scale-95 ${
                        on ? 'bg-surface text-ink shadow-soft' : 'text-ink-2 hover:text-ink'
                      }`}
                    >
                      <Icon className={`size-[1.125rem] ${on ? 'text-olive' : ''}`} aria-hidden />
                      {KIND_META[k].short}
                    </button>
                  );
                })}
              </div>
            )}
            <RecordForm
              key={formKey}
              kind={kind}
              initial={mode.type === 'edit' ? mode.record : undefined}
              onDelete={mode.type === 'edit' ? () => setToDelete(mode.record) : undefined}
              onDone={(saved) => {
                setMode(null);
                if (saved) haptic.success();
                if (saved)
                  toast.show({
                    title: mode.type === 'edit' ? 'Cambios guardados' : done(saved.kind, 'registrad'),
                    body: describeRecord(saved, data.settings).title,
                  });
              }}
            />
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="¿Eliminar este registro?"
        body={
          toDelete && (
            <>
              <p className="font-semibold text-ink">{describeRecord(toDelete, data.settings).title}</p>
              <p className="mt-2">El inventario, el gasto y las estadísticas se recalcularán sin él. Podrás deshacerlo durante unos segundos.</p>
            </>
          )
        }
        confirmLabel="Eliminar"
        onConfirm={() => toDelete && doDelete(toDelete)}
      />
    </Ctx.Provider>
  );
}

export function useRecordActions() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useRecordActions fuera del proveedor');
  return c;
}
