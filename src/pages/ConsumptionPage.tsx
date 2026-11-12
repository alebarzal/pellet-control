import { Check, CircleDashed, Flame, Gauge, Pencil, Plus } from 'lucide-react';
import type { PageProps } from '../app/App';
import { useRecordActions } from '../features/records/RecordDialogs';
import { consumptionPeriods, consumptionStats, inventoryMethod, MIN_DAYS_FOR_AVERAGE, statsData } from '../domain/calc';
import { fmtDate, fmtEur, fmtKg, fmtMonth, fmtNum } from '../domain/format';
import { useStore } from '../store/store';
import { Badge, Button, Card, EmptyState, PageHeader, SectionTitle, Stat, cx } from '../ui/primitives';

export function ConsumptionPage({ go }: PageProps) {
  const { data } = useStore();
  // Estadísticas desde el último reinicio (el stock y la tolva usan siempre todos los datos)
  const sdata = statsData(data);
  const { openAdd, openEdit } = useRecordActions();
  const stats = consumptionStats(sdata);
  const periods = consumptionPeriods(data).slice().reverse();
  const inv = inventoryMethod(sdata);
  const has = stats.avgDailyKg != null;
  const pending = has ? null : stats.coveredDays === 0 ? 'Sin datos' : `${stats.coveredDays} de ${MIN_DAYS_FOR_AVERAGE} días`;
  const lastMonth = stats.byMonth.at(-1);
  const unknownRefill = data.records.find((r) => r.kind === 'refill' && r.bags == null && r.kg == null);

  const checks = [
    { ok: !!data.settings.hopperCapacityKg, label: data.settings.hopperCapacityKg ? `Capacidad de tolva: ${fmtKg(data.settings.hopperCapacityKg)}` : 'Capacidad de tolva configurada' },
    { ok: data.records.filter((r) => r.kind === 'level' && !r.approximate).length >= 1, label: 'Lectura de nivel inicial en %' },
    { ok: data.records.filter((r) => r.kind === 'level' && !r.approximate).length >= 2, label: 'Lectura de nivel final en %' },
    { ok: inv.periods.length > 0, label: 'Recargas intermedias con cantidad conocida' },
  ];

  return (
    <>
      <PageHeader
        title="Consumo"
        description="Solo cuenta el pellet que la caldera ha quemado de verdad. Nada se deduce de recargas ni de niveles aproximados."
        actions={
          <>
            <Button icon={<Gauge className="size-4" />} onClick={() => openAdd('level')}>
              Lectura de nivel
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openAdd('consumption')}>
              Registrar consumo
            </Button>
          </>
        }
      />

      <Card>
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Consumo diario" value={has ? fmtKg(stats.avgDailyKg!) : '—'} hint={pending ?? 'Media de días con datos'} tone={has ? undefined : 'muted'} />
          <Stat label="Consumo semanal" value={has ? fmtKg(stats.avgWeeklyKg!) : '—'} hint={has ? 'Media × 7' : pending!} tone={has ? undefined : 'muted'} />
          <Stat
            label="Consumo mensual"
            value={lastMonth ? fmtKg(lastMonth.kg) : '—'}
            hint={lastMonth ? <span className="first-letter:uppercase">{fmtMonth(lastMonth.month, true)}</span> : 'Sin datos'}
            tone={lastMonth ? undefined : 'muted'}
          />
          <Stat label="Esta temporada" value={stats.seasonKg > 0 ? fmtKg(stats.seasonKg) : '—'} hint={`Desde ${fmtDate(data.settings.seasonStart)}`} tone={stats.seasonKg > 0 ? undefined : 'muted'} />
          <Stat
            label="Coste diario"
            value={stats.avgDailyCost != null ? fmtEur(stats.avgDailyCost) : '—'}
            hint={stats.pricePerKg == null ? 'Falta una compra' : has ? 'A precio medio' : pending!}
            tone={stats.avgDailyCost != null ? undefined : 'muted'}
          />
          <Stat
            label="Coste mensual"
            value={lastMonth?.cost != null ? fmtEur(lastMonth.cost) : '—'}
            hint={lastMonth ? 'Último mes con datos' : 'Sin datos'}
            tone={lastMonth?.cost != null ? undefined : 'muted'}
          />
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <h2 className="flex items-center gap-2 text-[1.0625rem] font-bold tracking-[-0.01em]">
              <Pencil className="size-4 text-olive" aria-hidden /> Método manual
            </h2>
            <Badge tone="olive">Recomendado</Badge>
          </div>
          <p className="mt-2 text-[0.9375rem] text-ink-2">
            Anota kilos o sacos consumidos en un día o en un periodo. Lo más fiable: contar los sacos que vacías en la tolva cuando el nivel vuelve al mismo punto.
          </p>
          <Button className="mt-4" icon={<Plus className="size-4" />} onClick={() => openAdd('consumption')}>
            Registrar consumo
          </Button>
        </Card>
        <Card>
          <h2 className="flex items-center gap-2 text-[1.0625rem] font-bold tracking-[-0.01em]">
            <Gauge className="size-4 text-olive" aria-hidden /> Método por inventario
          </h2>
          <p className="mt-2 text-[0.9375rem] text-ink-2">
            Nivel inicial en % → recargas con cantidad → nivel final en %. El consumo sale de la diferencia × capacidad + lo recargado.
          </p>
          <ul className="mt-4 flex flex-col gap-2 text-sm">
            {checks.map((c) => (
              <li key={c.label} className={cx('flex items-center gap-2', c.ok ? 'text-ink' : 'text-ink-2')}>
                {c.ok ? <Check className="size-4 text-olive" aria-hidden /> : <CircleDashed className="size-4 text-ink-3" aria-hidden />}
                {c.label}
              </li>
            ))}
          </ul>
          {inv.blockers.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 rounded-xl bg-sand-soft px-3 py-2.5 text-[0.8125rem] text-ink-2">
              {inv.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <SectionTitle aside={stats.totalKg > 0 ? <span className="num text-sm text-ink-2">Total {fmtKg(stats.totalKg)}</span> : undefined}>
          Periodos de consumo
        </SectionTitle>
        {periods.length ? (
          <ul className="-mx-2 flex flex-col">
            {periods.map((p) => {
              const rec = data.records.find((r) => r.id === p.id);
              const days = Math.max(1, Math.round((new Date(p.end).getTime() - new Date(p.start).getTime()) / 86_400_000) + (p.source === 'manual' ? 1 : 0));
              return (
                <li key={p.id}>
                  <button
                    disabled={!rec}
                    onClick={() => rec && openEdit(rec)}
                    className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left enabled:hover:bg-sand-soft/70"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-soft text-amber">
                      <Flame className="size-[1.125rem]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">
                        {p.start === p.end ? fmtDate(p.start) : `${fmtDate(p.start)} – ${fmtDate(p.end)}`}
                      </span>
                      <span className="line-clamp-2 text-sm text-ink-2">
                        {p.source === 'manual' ? 'Registro manual' : 'Calculado por inventario'}
                        {p.detail && ` · ${p.detail}`}
                      </span>
                    </span>
                    <span className="flex flex-col items-end">
                      <span className="num font-semibold">{fmtKg(p.kg)}</span>
                      <span className="num text-sm text-ink-3">{fmtNum(p.kg / days)} kg/día</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={<Flame className="size-5" />}
            title="Todavía no hay consumo confirmado"
            action={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => openAdd('consumption')}>
                  Registrar consumo
                </Button>
                <Button size="sm" onClick={() => go('configuracion')}>
                  Revisar configuración
                </Button>
              </div>
            }
          >
            {unknownRefill ? `El ${fmtDate(unknownRefill.date)} se introdujeron pellets en la tolva sin anotar la cantidad, así que no se puede saber cuánto se ha quemado. ` : ''}Registra cuántos sacos consumes o haz dos lecturas de nivel en porcentaje con las recargas anotadas.
          </EmptyState>
        )}
      </Card>
    </>
  );
}
