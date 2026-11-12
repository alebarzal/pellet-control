import { ArrowDownToLine, BarChart3, Flame, LineChart as LineIcon, PieChart, Telescope } from 'lucide-react';
import { StatsResetBanner, StatsResetButton } from '../features/records/StatsReset';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PageProps } from '../app/App';
import { axisProps, C, ChartCard, ChartTooltip, gridProps, Legend, ProjectedPattern } from '../features/charts/chartKit';
import { useRecordActions } from '../features/records/RecordDialogs';
import { ExportExcelButton } from '../features/export/ExportExcelButton';
import {
  consumptionStats,
  MIN_DAYS_FOR_AVERAGE,
  priceEvolution,
  seasonProjection,
  spendByMonth,
  spendBySupplierOrBrand,
  statsData,
  refillStats,
} from '../domain/calc';
import { monthKey, todayIso } from '../domain/dates';
import { fmtBags, fmtDate, fmtDateShort, fmtEur, fmtEurKg, fmtInt, fmtKg, fmtMonth, fmtNum } from '../domain/format';
import { useStore } from '../store/store';
import { Button, EmptyState, PageHeader, cx } from '../ui/primitives';

const H = 'h-60';

function Delta({ cur, prev, unit }: { cur: number; prev: number; unit: 'eur' | 'kg' }) {
  if (prev === 0) return <span className="text-ink-3">—</span>;
  const pct = ((cur - prev) / prev) * 100;
  return (
    <span className={cx('num font-semibold', pct > 0 ? 'text-amber' : 'text-olive-strong')}>
      {pct > 0 ? '+' : ''}
      {fmtInt(pct)} %<span className="sr-only"> respecto al mes anterior ({unit === 'eur' ? fmtEur(prev) : fmtKg(prev)})</span>
    </span>
  );
}

export function StatsPage({ go }: PageProps) {
  const { data } = useStore();
  // Estadísticas desde el último reinicio (el stock y la tolva usan siempre todos los datos)
  const sdata = statsData(data);
  const { openAdd } = useRecordActions();
  const today = todayIso();
  const months = spendByMonth(sdata);
  const cons = consumptionStats(sdata, today);
  const prices = priceEvolution(sdata);
  const dist = spendBySupplierOrBrand(sdata);
  const proj = seasonProjection(data, today);
  const distTotal = dist.reduce((s, d) => s + d.spent, 0);
  const refills = refillStats(sdata);

  // Comparativa: mes actual vs anterior
  const cm = monthKey(today);
  const pmDate = new Date(Number(cm.slice(0, 4)), Number(cm.slice(5)) - 2, 1);
  const pm = `${pmDate.getFullYear()}-${String(pmDate.getMonth() + 1).padStart(2, '0')}`;
  const spendOf = (m: string) => months.find((x) => x.month === m)?.spent ?? 0;
  const kgOf = (m: string) => cons.byMonth.find((x) => x.month === m)?.kg ?? 0;

  const noConsumption = (
    <EmptyState
      icon={<Flame className="size-5" />}
      title="Faltan datos de consumo"
      action={
        <Button size="sm" onClick={() => openAdd('consumption')}>
          Registrar consumo
        </Button>
      }
    >
      Se necesita consumo real registrado (al menos {MIN_DAYS_FOR_AVERAGE} días) o dos lecturas de nivel en porcentaje. Las recargas no cuentan.
    </EmptyState>
  );

  return (
    <>
      <PageHeader
        title="Estadísticas"
        description="Solo datos reales. Las proyecciones aparecen rayadas y se calculan a partir de tu consumo medio."
        actions={
          <>
            <StatsResetButton />
            <ExportExcelButton />
          </>
        }
      />
      <StatsResetBanner />

      <div className="mb-4">
        <ChartCard
          title="Recargas de la tolva"
          subtitle="Sacos que vais metiendo en la caldera"
          legend={refills.byWeek.length ? <Legend items={[{ label: 'Sacos por semana', color: C.forest }]} /> : undefined}
        >
          {refills.count ? (
            <>
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                {[
                  ['Sacos recargados', fmtInt(refills.bags), `${fmtKg(Math.round(refills.kg))}`],
                  ['Recargas', fmtInt(refills.count), refills.unknown ? `${refills.unknown} sin cantidad` : 'todas con cantidad'],
                  ['Media por recarga', refills.avgBagsPerRefill != null ? `${fmtNum(refills.avgBagsPerRefill)} sacos` : '—', refills.avgBagsPerRefill != null ? fmtKg(Math.round(refills.avgBagsPerRefill * data.settings.bagWeightKg)) : 'falta la cantidad'],
                  ['Cada cuánto', refills.avgDaysBetween != null ? `${fmtNum(refills.avgDaysBetween)} días` : '—', refills.last ? `Última: ${fmtDate(refills.last)}` : ''],
                ].map(([label, value, hint]) => (
                  <div key={label} className="min-w-0">
                    <p className="text-sm text-ink-2">{label}</p>
                    <p className="num mt-1 text-[1.375rem] font-bold tracking-[-0.02em]">{value}</p>
                    <p className="mt-0.5 text-[0.8125rem] text-ink-3">{hint}</p>
                  </div>
                ))}
              </div>
              {refills.byWeek.length > 0 && (
                <div className="mt-5 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={refills.byWeek} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="week" tickFormatter={fmtDateShort} {...axisProps} />
                      <YAxis {...axisProps} width={40} allowDecimals={false} />
                      <Tooltip cursor={{ fill: '#f1ecdf' }} content={<ChartTooltip labelFormat={(w) => `Semana del ${fmtDate(w)}`} valueFormat={(v) => `${fmtNum(v)} sacos`} />} />
                      <Bar dataKey="bags" name="Recargado" fill={C.forest} radius={[6, 6, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon={<ArrowDownToLine className="size-5" />}
              title="Sin recargas todavía"
              action={
                <Button size="sm" onClick={() => openAdd('refill')}>
                  Registrar recarga
                </Button>
              }
            >
              Cada vez que metáis sacos en la tolva, regístralo desde el botón +. Aquí verás cuántos sacos lleváis y cada cuánto recargáis.
            </EmptyState>
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Gasto mensual" subtitle="Dinero invertido en compras de pellet" legend={<Legend items={[{ label: 'Gasto real', color: C.olive }]} />}>
          {months.length ? (
            <div className={H}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="month" tickFormatter={(m: string) => fmtMonth(m)} {...axisProps} />
                  <YAxis {...axisProps} width={56} tickFormatter={(v: number) => `${fmtInt(v)} €`} />
                  <Tooltip cursor={{ fill: '#f1ecdf' }} content={<ChartTooltip labelFormat={(m) => fmtMonth(m, true)} valueFormat={(v) => fmtEur(v)} />} />
                  <Bar dataKey="spent" name="Gasto" fill={C.olive} radius={[6, 6, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon={<BarChart3 className="size-5" />} title="Sin compras">Registra compras para ver el gasto mensual.</EmptyState>
          )}
        </ChartCard>

        <ChartCard title="Consumo por mes" subtitle="Kilogramos quemados confirmados" legend={cons.byMonth.length ? <Legend items={[{ label: 'kg reales', color: C.forest }]} /> : undefined}>
          {cons.byMonth.length ? (
            <div className={H}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cons.byMonth} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="month" tickFormatter={(m: string) => fmtMonth(m)} {...axisProps} />
                  <YAxis {...axisProps} width={56} tickFormatter={(v: number) => `${fmtInt(v)} kg`} />
                  <Tooltip cursor={{ fill: '#f1ecdf' }} content={<ChartTooltip labelFormat={(m) => fmtMonth(m, true)} valueFormat={(v) => fmtKg(v)} />} />
                  <Bar dataKey="kg" name="Consumo" fill={C.forest} radius={[6, 6, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            noConsumption
          )}
        </ChartCard>

        <ChartCard title="Precio del pellet" subtitle="€/kg en cada compra">
          {prices.length >= 2 ? (
            <div className={H}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={prices} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" tickFormatter={fmtDateShort} {...axisProps} />
                  <YAxis {...axisProps} width={64} tickFormatter={(v: number) => fmtEurKg(v)} domain={['dataMin - 0.02', 'dataMax + 0.02']} />
                  <Tooltip content={<ChartTooltip labelFormat={fmtDate} valueFormat={(v) => `${fmtEurKg(v)}/kg`} />} />
                  <Line dataKey="pricePerKg" name="Precio" stroke={C.olive} strokeWidth={2.5} dot={{ r: 4, fill: C.olive }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon={<LineIcon className="size-5" />} title={prices.length === 1 ? `Un único precio: ${fmtEurKg(prices[0].pricePerKg)}/kg` : 'Sin compras'}>
              La evolución aparece con dos compras o más.
            </EmptyState>
          )}
        </ChartCard>

        <ChartCard title="Consumo medio diario" subtitle="kg/día por semana con datos">
          {cons.byWeek.length && cons.avgDailyKg != null ? (
            <>
              <p className="num -mt-1 mb-3 text-[1.375rem] font-bold tracking-[-0.02em]">
                {fmtKg(cons.avgDailyKg)}
                <span className="ml-1.5 text-sm font-semibold text-ink-2">de media</span>
              </p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cons.byWeek.map((w) => ({ ...w, perDay: w.kg / w.days }))} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="week" tickFormatter={fmtDateShort} {...axisProps} />
                    <YAxis {...axisProps} width={48} tickFormatter={(v: number) => fmtNum(v)} />
                    <Tooltip cursor={{ fill: '#f1ecdf' }} content={<ChartTooltip labelFormat={(w) => `Semana del ${fmtDate(w)}`} valueFormat={(v) => `${fmtNum(v)} kg/día`} />} />
                    <Bar dataKey="perDay" name="Media" fill={C.forest} radius={[6, 6, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            noConsumption
          )}
        </ChartCard>

        <ChartCard title="Comparativa entre meses" subtitle={`${fmtMonth(cm, true)} frente a ${fmtMonth(pm, true)}`}>
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-5 gap-y-3 text-sm">
            <span className="text-ink-3" />
            <span className="text-right text-ink-3 first-letter:uppercase">{fmtMonth(pm)}</span>
            <span className="text-right text-ink-3 first-letter:uppercase">{fmtMonth(cm)}</span>
            <span className="text-right text-ink-3">Variación</span>
            <span className="font-semibold">Gasto en compras</span>
            <span className="num text-right">{fmtEur(spendOf(pm))}</span>
            <span className="num text-right font-semibold">{fmtEur(spendOf(cm))}</span>
            <span className="text-right">
              <Delta cur={spendOf(cm)} prev={spendOf(pm)} unit="eur" />
            </span>
            <span className="font-semibold">Consumo</span>
            <span className="num text-right">{cons.byMonth.length ? fmtKg(kgOf(pm)) : '—'}</span>
            <span className="num text-right font-semibold">{cons.byMonth.length ? fmtKg(kgOf(cm)) : '—'}</span>
            <span className="text-right">{cons.byMonth.length ? <Delta cur={kgOf(cm)} prev={kgOf(pm)} unit="kg" /> : <span className="text-ink-3">—</span>}</span>
          </div>
          <p className="mt-4 text-[0.8125rem] text-ink-3">
            El gasto refleja cuándo compras; el consumo, cuándo quemas. Un mes puede tener gasto sin consumo y al revés.
          </p>
        </ChartCard>

        <ChartCard title="Distribución del gasto" subtitle="Por marca y proveedor">
          {dist.length ? (
            <ul className="flex flex-col gap-3">
              {dist.map((d) => (
                <li key={d.name}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="line-clamp-2 font-semibold">{d.name}</span>
                    <span className="num shrink-0 text-ink-2">
                      {fmtEur(d.spent)} · {fmtInt((d.spent / distTotal) * 100)} %
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-sand-soft">
                    <div className="h-full rounded-full bg-olive" style={{ width: `${(d.spent / distTotal) * 100}%` }} />
                  </div>
                </li>
              ))}
              {dist.length === 1 && (
                <li className="text-[0.8125rem] text-ink-3">Todo el gasto corresponde a una sola marca. Añade el proveedor en las compras para desglosarlo.</li>
              )}
            </ul>
          ) : (
            <EmptyState icon={<PieChart className="size-5" />} title="Sin compras">La distribución aparece con la primera compra.</EmptyState>
          )}
        </ChartCard>
      </div>

      <div className="mt-4">
        <ChartCard
          title="Proyección de la temporada"
          subtitle={`Hasta el ${fmtDate(data.settings.seasonEnd)}, al ritmo de consumo actual`}
          legend={
            proj ? (
              <Legend
                items={[
                  { label: 'Gasto real en compras', color: C.olive },
                  { label: 'Coste proyectado del consumo', color: C.projected, dashed: true },
                ]}
              />
            ) : undefined
          }
        >
          {proj ? (
            <>
              <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  ['Días restantes', fmtInt(proj.remainingDays)],
                  ['Consumo previsto', fmtKg(Math.round(proj.projectedKg))],
                  ['Coste previsto', fmtEur(proj.projectedCost)],
                  ['Sacos por comprar', fmtBags(proj.bagsToBuy)],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-2xl bg-[repeating-linear-gradient(135deg,#f1ecdf_0_6px,#f6f2e8_6px_12px)] p-3.5">
                    <p className="text-[0.8125rem] text-ink-2">{l}</p>
                    <p className="num mt-0.5 text-lg font-bold">{v}</p>
                  </div>
                ))}
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={proj.monthly} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                    <defs>
                      <ProjectedPattern />
                    </defs>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="month" tickFormatter={(m: string) => fmtMonth(m)} {...axisProps} />
                    <YAxis {...axisProps} width={56} tickFormatter={(v: number) => `${fmtInt(v)} €`} />
                    <Tooltip cursor={{ fill: '#f1ecdf' }} content={<ChartTooltip labelFormat={(m) => fmtMonth(m, true)} valueFormat={(v) => fmtEur(v)} />} />
                    <Bar dataKey="realSpent" name="Real" fill={C.olive} radius={[6, 6, 0, 0]} maxBarSize={32} />
                    <Bar dataKey="projectedSpent" name="Proyectado" fill="url(#proj)" stroke={C.projected} radius={[6, 6, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <EmptyState
              icon={<Telescope className="size-5" />}
              title="Aún no se puede proyectar"
              action={
                <Button size="sm" onClick={() => go('consumo')}>
                  Ver qué falta
                </Button>
              }
            >
              La proyección necesita un consumo medio diario real (al menos {MIN_DAYS_FOR_AVERAGE} días registrados) y una compra para conocer el precio. No se estima a partir de niveles aproximados.
            </EmptyState>
          )}
        </ChartCard>
      </div>
    </>
  );
}
