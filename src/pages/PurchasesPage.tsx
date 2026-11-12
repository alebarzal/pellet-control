import { Plus, ShoppingBag, TrendingDown, TrendingUp } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PageProps } from '../app/App';
import { axisProps, C, ChartTooltip, gridProps } from '../features/charts/chartKit';
import { useRecordActions } from '../features/records/RecordDialogs';
import { RecordList } from '../features/records/RecordList';
import { priceEvolution, purchases, purchaseSummary, spendByMonth, spendByYear, statsData } from '../domain/calc';
import { monthKey, todayIso, yearKey } from '../domain/dates';
import { fmtDate, fmtDateShort, fmtEur, fmtEurKg, fmtMonth } from '../domain/format';
import { useStore } from '../store/store';
import { Badge, Button, Card, EmptyState, PageHeader, SectionTitle, Stat } from '../ui/primitives';

export function PurchasesPage(_: PageProps) {
  const { data } = useStore();
  // Estadísticas desde el último reinicio (el stock y la tolva usan siempre todos los datos)
  const sdata = statsData(data);
  const { openAdd } = useRecordActions();
  const today = todayIso();
  const sum = purchaseSummary(sdata);
  const thisMonth = purchaseSummary(sdata, (p) => monthKey(p.date) === monthKey(today));
  const thisYear = purchaseSummary(sdata, (p) => yearKey(p.date) === yearKey(today));
  const prices = priceEvolution(sdata);
  const months = spendByMonth(sdata);
  const years = spendByYear(sdata);
  const list = purchases(data).reverse();
  const last = prices.at(-1);

  return (
    <>
      <PageHeader
        title="Compras"
        description="Cada compra suma sacos al almacén y alimenta el gasto y el precio medio."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openAdd('purchase')}>
            Nueva compra
          </Button>
        }
      />

      <Card>
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-3 lg:grid-cols-5">
          <Stat label="Gasto total" value={fmtEur(sum.totalSpent)} hint={`${sum.count} ${sum.count === 1 ? 'compra' : 'compras'}`} />
          <Stat
            label="Precio medio por saco"
            value={sum.avgPricePerBag != null ? fmtEur(sum.avgPricePerBag) : '—'}
            hint="Ponderado por sacos"
            tone={sum.avgPricePerBag == null ? 'muted' : undefined}
          />
          <Stat
            label="Precio medio por kg"
            value={sum.avgPricePerKg != null ? fmtEurKg(sum.avgPricePerKg) : '—'}
            tone={sum.avgPricePerKg == null ? 'muted' : undefined}
          />
          <Stat label={`Gasto en ${fmtMonth(monthKey(today), true).split(' ')[0]}`} value={fmtEur(thisMonth.totalSpent)} />
          <Stat label={`Gasto en ${yearKey(today)}`} value={fmtEur(thisYear.totalSpent)} />
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <SectionTitle
            aside={
              last?.deltaPerBag != null && last.deltaPerBag !== 0 ? (
                <Badge tone={last.deltaPerBag > 0 ? 'amber' : 'olive'}>
                  {last.deltaPerBag > 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                  {last.deltaPerBag > 0 ? '+' : ''}
                  {fmtEur(last.deltaPerBag)} vs anterior
                </Badge>
              ) : undefined
            }
          >
            Evolución del precio
          </SectionTitle>
          {prices.length >= 2 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={prices} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" tickFormatter={fmtDateShort} {...axisProps} />
                  <YAxis {...axisProps} width={56} tickFormatter={(v: number) => fmtEur(v)} domain={['dataMin - 0.3', 'dataMax + 0.3']} />
                  <Tooltip
                    cursor={{ stroke: C.grid }}
                    content={<ChartTooltip labelFormat={fmtDate} valueFormat={(v) => `${fmtEur(v)}/saco`} />}
                  />
                  <Line type="monotone" dataKey="pricePerBag" name="Precio" stroke={C.olive} strokeWidth={2.5} dot={{ r: 4, fill: C.olive }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon={<TrendingUp className="size-5" />} title={prices.length ? `Una sola compra: ${fmtEur(prices[0].pricePerBag)}/saco` : 'Sin compras'}>
              La evolución del precio aparece a partir de la segunda compra.
            </EmptyState>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle>Gasto por periodo</SectionTitle>
          {months.length ? (
            <>
              <ul className="flex flex-col gap-2.5">
                {months.slice(-6).reverse().map((m) => {
                  const max = Math.max(...months.map((x) => x.spent), 1);
                  return (
                    <li key={m.month} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-sm">
                      <span className="text-ink-2 first-letter:uppercase">{fmtMonth(m.month)}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-sand-soft">
                        <span className="block h-full rounded-full bg-olive" style={{ width: `${(m.spent / max) * 100}%` }} />
                      </span>
                      <span className="num w-20 text-right font-semibold">{fmtEur(m.spent)}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4 text-sm">
                {years.map((y) => (
                  <span key={y.year} className="text-ink-2">
                    Año {y.year}: <span className="num font-semibold text-ink">{fmtEur(y.spent)}</span>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <EmptyState icon={<ShoppingBag className="size-5" />} title="Sin gasto todavía">
              Registra tu primera compra para ver el gasto mensual y anual.
            </EmptyState>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <SectionTitle>Todas las compras</SectionTitle>
        {list.length ? (
          <RecordList records={list} />
        ) : (
          <EmptyState
            icon={<ShoppingBag className="size-5" />}
            title="No hay compras"
            action={
              <Button size="sm" icon={<Plus className="size-4" />} onClick={() => openAdd('purchase')}>
                Nueva compra
              </Button>
            }
          >
            Fecha, sacos y precio bastan; el resto es opcional.
          </EmptyState>
        )}
      </Card>
    </>
  );
}
