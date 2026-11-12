import { ArrowDownToLine, ClipboardCheck, Flame, Package, Pencil, Plus, SlidersHorizontal, Warehouse } from 'lucide-react';
import { useState } from 'react';
import type { PageProps } from '../app/App';
import { HopperStatus } from '../features/hopper/HopperStatus';
import { useRecordActions } from '../features/records/RecordDialogs';
import { RecordList } from '../features/records/RecordList';
import { consumedTotal, consumptionStats, purchaseSummary, refillKg, sortRecords, stockLedger, storedStock, statsData } from '../domain/calc';
import { QuickEditDialog, type QuickEditTarget } from '../features/records/QuickEditDialog';
import { fmtBags, fmtDate, fmtInt, fmtKg } from '../domain/format';
import type { RecordKind, RefillRecord } from '../domain/types';
import { useStore } from '../store/store';
import { Button, Card, EmptyState, PageHeader, SectionTitle, Segmented } from '../ui/primitives';

type Filter = 'todos' | 'entradas' | 'tolva' | 'ajustes';
const FILTER_KINDS: Record<Filter, RecordKind[]> = {
  todos: ['purchase', 'refill', 'inventory', 'adjustment', 'level', 'consumption'],
  entradas: ['purchase'],
  tolva: ['refill', 'level'],
  ajustes: ['inventory', 'adjustment'],
};

export function InventoryPage({ go }: PageProps) {
  const { data } = useStore();
  // Estadísticas desde el último reinicio (el stock y la tolva usan siempre todos los datos)
  const sdata = statsData(data);
  const { openAdd } = useRecordActions();
  const [filter, setFilter] = useState<Filter>('todos');
  const stock = storedStock(data);
  const ledger = stockLedger(data);
  const bought = purchaseSummary(sdata);
  const cons = consumptionStats(sdata);
  const consumed = consumedTotal(data);
  const [quickEdit, setQuickEdit] = useState<QuickEditTarget | null>(null);
  const refills = sdata.records.filter((r): r is RefillRecord => r.kind === 'refill');
  const knownRefillKg = refills.reduce((s, r) => s + (refillKg(r, data.settings) ?? 0), 0);
  const unknownRefills = refills.filter((r) => refillKg(r, data.settings) == null).length;
  const list = sortRecords(data.records.filter((r) => FILTER_KINDS[filter].includes(r.kind))).reverse();

  return (
    <>
      <PageHeader
        title="Inventario"
        description="Tres cosas distintas: lo que tienes almacenado, lo que hay en la tolva y lo que la caldera ha quemado."
        actions={
          <>
            <Button icon={<ClipboardCheck className="size-4" />} onClick={() => openAdd('inventory')}>
              Recuento
            </Button>
            <Button icon={<SlidersHorizontal className="size-4" />} onClick={() => openAdd('adjustment')}>
              Ajuste
            </Button>
            <Button variant="primary" icon={<ArrowDownToLine className="size-4" />} onClick={() => openAdd('refill')}>
              Recargar tolva
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <p className="flex items-center gap-2 text-sm font-semibold text-ink-2">
            <Warehouse className="size-4 text-olive" aria-hidden /> Almacenado
          </p>
          <p className="num mt-3 text-[2rem] leading-none font-bold tracking-[-0.03em]">
            {fmtInt(stock.bags)}
            <span className="ml-1.5 text-base font-semibold tracking-normal text-ink-2">{Math.abs(stock.bags) === 1 ? 'saco' : 'sacos'}</span>
          </p>
          <p className="num mt-2 text-[0.9375rem] text-ink-2">{fmtKg(stock.kg)} disponibles fuera de la caldera</p>
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
            <div>
              <dt className="text-ink-3">Comprado</dt>
              <dd className="num font-semibold">{fmtBags(bought.totalBags)}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Último recuento</dt>
              <dd className="font-semibold">{stock.lastCountDate ? fmtDate(stock.lastCountDate) : '—'}</dd>
            </div>
          </dl>
          {stock.wentNegative && (
            <p className="mt-3 text-[0.8125rem] font-medium text-amber">El saldo llegó a ser negativo: revisa recargas o registra un recuento.</p>
          )}
        </Card>

        <Card>
          <HopperStatus
            footer={
              <p className="mt-4 border-t border-line pt-4 text-sm text-ink-2">
                Introducido en total: <span className="num font-semibold text-ink">{fmtKg(knownRefillKg)}</span>
                {unknownRefills > 0 && ` + ${unknownRefills} ${unknownRefills === 1 ? 'recarga' : 'recargas'} sin cantidad`}
              </p>
            }
          />
        </Card>

        <Card>
          <p className="flex items-center gap-2 text-sm font-semibold text-ink-2">
            <Flame className="size-4 text-olive" aria-hidden /> Consumido
            <button
              type="button"
              onClick={() => setQuickEdit('consumed')}
              aria-label="Editar consumido"
              className="-mt-1.5 -mr-1.5 ml-auto grid size-9 shrink-0 place-items-center rounded-xl text-ink-3 transition-[transform,background-color,color] duration-150 hover:bg-sand-soft hover:text-ink active:scale-90"
            >
              <Pencil className="size-4" aria-hidden />
            </button>
          </p>
          {cons.totalKg > 0 || consumed.since ? (
            <>
              <p className="num mt-3 text-[2rem] leading-none font-bold tracking-[-0.03em]">
                {fmtInt(consumed.kg)}
                <span className="ml-1.5 text-base font-semibold tracking-normal text-ink-2">kg</span>
              </p>
              <p className="num mt-2 text-[0.9375rem] text-ink-2">
                {consumed.since
                  ? `Contando desde el ${fmtDate(consumed.since)} · total real ${fmtKg(Math.round(cons.totalKg))}`
                  : `Confirmado en ${cons.coveredDays} ${cons.coveredDays === 1 ? 'día' : 'días'}`}
              </p>
            </>
          ) : (
            <div className="mt-3">
              <EmptyState compact icon={<Flame className="size-5" />} title="Sin consumo confirmado" action={
                <Button size="sm" onClick={() => go('consumo')}>Ir a Consumo</Button>
              }>
                Introducir sacos en la tolva no es consumir. Registra el consumo real o dos lecturas de nivel en porcentaje.
              </EmptyState>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <SectionTitle aside={<span className="text-sm text-ink-3">Saldo de sacos tras cada movimiento</span>}>Movimientos</SectionTitle>
        <div className="mb-4 max-w-md">
          <Segmented
            size="sm"
            label="Filtrar movimientos"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'entradas', label: 'Compras' },
              { value: 'tolva', label: 'Tolva' },
              { value: 'ajustes', label: 'Ajustes' },
            ]}
          />
        </div>
        {list.length ? (
          <RecordList records={list} balance={ledger} />
        ) : (
          <EmptyState icon={<Package className="size-5" />} title="Nada en este filtro" action={
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => openAdd('purchase')}>Añadir compra</Button>
          }>
            Los movimientos aparecerán aquí a medida que los registres.
          </EmptyState>
        )}
      </Card>
      <QuickEditDialog target={quickEdit} onClose={() => setQuickEdit(null)} />
    </>
  );
}
