import { ArrowRight, CalendarClock, CloudSun, Flame, Home, Package, Pencil, Plus, Tag, Wallet } from 'lucide-react';
import { climateForecast, currentIndoor, currentOutdoor, efficiencyModel, MIN_DAYS_FOR_MODEL } from '../domain/climate';
import type { ReactNode } from 'react';
import type { PageProps } from '../app/App';
import { HopperStatus } from '../features/hopper/HopperStatus';
import { useRecordActions } from '../features/records/RecordDialogs';
import { HeatingPill, useHeating } from '../features/climate/HeatingCard';
import { QuickEditDialog, type QuickEditTarget } from '../features/records/QuickEditDialog';
import { useState } from 'react';
import { RecordList } from '../features/records/RecordList';
import { SceneFrame } from '../features/scene/SceneFrame';
import {
  autonomy,
  consumptionStats,
  hopperEstimate,
  MIN_DAYS_FOR_AVERAGE,
  purchaseSummary,
  spendCounter,
  seasonSpend,
  monthConsumption,
  effectivePricePerBag,
  sortRecords,
  storedStock,
  statsData,
  statsReset,
} from '../domain/calc';
import { monthKey, todayIso } from '../domain/dates';
import { fmtBags, fmtDate, fmtDateLong, fmtEur, fmtEurKg, fmtInt, fmtKg, fmtMonth } from '../domain/format';
import { useStore } from '../store/store';
import { Button, Card, cx } from '../ui/primitives';

function Metric({
  icon,
  label,
  children,
  footer,
  className,
  onEdit,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Muestra un botón de edición directa (lápiz) en la esquina. */
  onEdit?: () => void;
}) {
  return (
    <Card as="article" className={cx('flex flex-col', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink-2">
          <span className="text-olive">{icon}</span>
          {label}
        </p>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Editar ${label.toLowerCase()}`}
            className="-mt-1.5 -mr-1.5 grid size-9 shrink-0 place-items-center rounded-xl text-ink-3 transition-[transform,background-color,color] duration-150 hover:bg-sand-soft hover:text-ink active:scale-90"
          >
            <Pencil className="size-4" aria-hidden />
          </button>
        )}
      </div>
      <div className="mt-3 flex-1">{children}</div>
      {footer && <div className="mt-4 text-[0.8125rem] text-ink-3">{footer}</div>}
    </Card>
  );
}

function Big({ children, unit }: { children: ReactNode; unit?: string }) {
  return (
    <p className="num text-[2rem] leading-none font-bold tracking-[-0.03em]">
      {children}
      {unit && <span className="ml-1.5 text-base font-semibold tracking-normal text-ink-2">{unit}</span>}
    </p>
  );
}

function Missing({ children, onClick, cta }: { children: ReactNode; onClick?: () => void; cta?: string }) {
  return (
    <div>
      <p className="text-[1.0625rem] font-semibold text-ink-3">Sin datos suficientes</p>
      <p className="mt-1 text-[0.8125rem] text-ink-2 text-pretty">{children}</p>
      {onClick && cta && (
        <button onClick={onClick} className="mt-2 text-[0.8125rem] font-semibold text-olive-strong hover:underline">
          {cta}
        </button>
      )}
    </div>
  );
}

/** Sacos almacenados representados como piezas. */
function BagPips({ count }: { count: number }) {
  const n = Math.max(0, Math.min(count, 24));
  return (
    <div className="flex flex-wrap gap-1.5" aria-hidden>
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className="h-7 w-5 rounded-[6px] bg-[#4f6b37] shadow-[inset_0_-6px_0_rgb(0_0_0/0.12)]" style={{ animationDelay: `${i * 30}ms` }} />
      ))}
      {count > 24 && <span className="self-center text-sm font-semibold text-ink-2">+{count - 24}</span>}
    </div>
  );
}

export function DashboardPage({ go }: PageProps) {
  const { data } = useStore();
  // Estadísticas desde el último reinicio (el stock y la tolva usan siempre todos los datos)
  const sdata = statsData(data);
  const { openAdd } = useRecordActions();
  const today = todayIso();
  const stock = storedStock(data);
  const hopper = hopperEstimate(data);
  const spend = purchaseSummary(sdata);
  const counter = spendCounter(data);
  const [quickEdit, setQuickEdit] = useState<QuickEditTarget | null>(null);
  // «Esta temporada» respeta la puesta a cero del gasto; las estadísticas siguen con lo gastado de verdad.
  const season = { totalSpent: seasonSpend(data).amount };
  const monthCons = monthConsumption(data, today);
  const price = effectivePricePerBag(data);
  const cons = consumptionStats(sdata, today);
  const auto = autonomy(data, today);
  const recent = sortRecords(data.records).reverse().slice(0, 5);
  const budget = data.settings.seasonBudget;
  const heating = useHeating();
  const inT = currentIndoor(data);
  const outT = currentOutdoor(data);
  const model = efficiencyModel(data, today);
  const fc = climateForecast(data, 7, today);
  const climateOn = data.settings.climate.lat != null || data.settings.climate.devices.length > 0;
  const fmtC = (v: number) => `${v.toLocaleString('es-ES', { maximumFractionDigits: 1 })}°`;

  return (
    <>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between lg:mb-8">
        <div>
          <p className="text-sm font-medium text-ink-2 first-letter:uppercase">{fmtDateLong(today)}</p>
          <h1 className="mt-1 text-[1.75rem] leading-tight font-bold tracking-[-0.025em] sm:text-[2rem]">Tu calefacción, al día</h1>
        </div>
        <Button variant="primary" icon={<Plus className="size-[1.125rem]" />} onClick={() => openAdd()} className="h-12 px-5">
          Añadir movimiento
        </Button>
      </header>

      {/* Instalación */}
      <section aria-label="Instalación" className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <SceneFrame level={(hopper?.percent ?? 0) / 100} storedBags={Math.max(0, stock.bags)}>
            {/* Un único contenedor reparte el espacio: las etiquetas nunca se pisan, se encogen o bajan de línea. */}
            <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2 sm:inset-x-4 sm:top-4">
            <div className="min-w-0 rounded-2xl bg-surface/85 px-3.5 py-2.5 shadow-soft backdrop-blur-sm">
              <p className="truncate text-[0.8125rem] font-semibold">{data.settings.boilerModel}</p>
              <p className="text-xs text-ink-2 text-pretty">
                Tolva {data.settings.hopperCapacityKg ? `${fmtInt(data.settings.hopperCapacityKg)} kg` : 'sin capacidad configurada'} · {fmtBags(Math.max(0, stock.bags))} al lado
              </p>
              {heating.ongoing && <HeatingPill since={heating.ongoing.start} className="mt-2" />}
            </div>
            {(inT || outT) && (
              <button
                onClick={() => go('clima')}
                className="pointer-events-auto flex shrink-0 flex-col items-end gap-1 rounded-2xl bg-surface/85 px-3 py-2.5 text-[0.8125rem] font-semibold shadow-soft backdrop-blur-sm transition-transform duration-150 active:scale-95 sm:flex-row sm:items-center sm:gap-3 sm:px-3.5"
                aria-label="Ver clima"
              >
                {inT && (
                  <span className="num flex items-center gap-1">
                    <Home className="size-3.5 text-olive" aria-hidden />
                    {fmtC(inT.temperature)}
                  </span>
                )}
                {outT && (
                  <span className="num flex items-center gap-1">
                    <CloudSun className="size-3.5 text-olive" aria-hidden />
                    {fmtC(outT.temperature)}
                  </span>
                )}
              </button>
            )}
            </div>
          </SceneFrame>
        </div>
        <Card className="lg:col-span-4">
          <HopperStatus />
        </Card>
      </section>

      {/* Indicadores */}
      <section aria-label="Indicadores" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Metric
          icon={<Package className="size-4" />}
          label="Pellet disponible"
          className="sm:col-span-2"
          onEdit={() => setQuickEdit('bags')}
          footer={
            <>
              Almacenado fuera de la tolva
              {stock.lastCountDate && <> · último recuento el {fmtDate(stock.lastCountDate)}</>}
            </>
          }
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Big unit={Math.abs(stock.bags) === 1 ? 'saco' : 'sacos'}>{fmtInt(stock.bags)}</Big>
              <p className="num mt-2 text-[0.9375rem] text-ink-2">
                {fmtKg(stock.kg)} · {data.settings.bagWeightKg} kg/saco
              </p>
            </div>
            <BagPips count={stock.bags} />
          </div>
          {stock.wentNegative && (
            <p className="mt-3 text-[0.8125rem] font-medium text-amber">
              Hay más sacos recargados que comprados. Registra un recuento en Inventario para corregirlo.
            </p>
          )}
        </Metric>

        <Metric
          icon={<Wallet className="size-4" />}
          label="Gasto acumulado"
          onEdit={() => setQuickEdit('spend')}
          footer={
            counter.since
              ? `Contando desde el ${fmtDate(counter.since)} · total real ${fmtEur(spend.totalSpent)}`
              : spend.count
                ? `${spend.count} ${spend.count === 1 ? 'compra' : 'compras'}`
                : statsReset(data)
                  ? `Contando desde el ${fmtDate(statsReset(data)!.date)}`
                  : undefined
          }
        >
          {spend.count || counter.since || statsReset(data) ? (
            <>
              <Big>{fmtEur(counter.amount)}</Big>
              {counter.bags != null && (
                <p className="num mt-1 text-[0.9375rem] font-semibold text-ink">
                  {fmtBags(counter.bags)}
                  {counter.bags > 0 && <span className="font-normal text-ink-2"> · {fmtEur(counter.amount / counter.bags)}/saco</span>}
                </p>
              )}
              <p className="num mt-2 text-[0.9375rem] text-ink-2">Esta temporada: {fmtEur(season.totalSpent)}</p>
              {budget != null && (
                <div className="mt-3">
                  <div className="h-2 overflow-hidden rounded-full bg-sand">
                    <div
                      className={cx('h-full rounded-full', season.totalSpent > budget ? 'bg-rust' : 'bg-olive')}
                      style={{ width: `${Math.min(100, (season.totalSpent / budget) * 100)}%` }}
                    />
                  </div>
                  <p className="num mt-1.5 text-[0.8125rem] text-ink-2">
                    {fmtInt((season.totalSpent / budget) * 100)} % del objetivo de {fmtEur(budget)}
                  </p>
                </div>
              )}
            </>
          ) : (
            <Missing onClick={() => openAdd('purchase')} cta="Registrar una compra">
              Aún no hay compras registradas.
            </Missing>
          )}
        </Metric>

        <Metric
          icon={<Flame className="size-4" />}
          label={`Consumo en ${fmtMonth(monthKey(today), true).split(' ')[0]}`}
          onEdit={() => setQuickEdit('consumption')}
          footer={monthCons.since ? `Contando desde el ${fmtDate(monthCons.since)}` : undefined}
        >
          {monthCons.kg != null ? (
            <>
              <Big unit="kg">{fmtInt(monthCons.kg)}</Big>
              <p className="num mt-2 text-[0.9375rem] text-ink-2">
                ≈ {fmtBags(Math.round((monthCons.kg / data.settings.bagWeightKg) * 10) / 10)}
                {cons.pricePerKg != null && <> · {fmtEur(monthCons.kg * cons.pricePerKg)}</>}
              </p>
            </>
          ) : (
            <Missing onClick={() => openAdd('consumption')} cta="Registrar consumo">
              No hay consumo confirmado este mes. Las recargas y los niveles aproximados no cuentan como consumo.
            </Missing>
          )}
        </Metric>

        <Metric
          icon={<Tag className="size-4" />}
          label={price.manual ? 'Precio por saco' : 'Precio medio por saco'}
          onEdit={() => setQuickEdit('price')}
          footer={
            price.manual
              ? `Fijado a mano · media de tus compras: ${price.calculated != null ? fmtEur(price.calculated) : '—'}`
              : spend.count > 0
                ? 'Media ponderada de todas las compras'
                : undefined
          }
        >
          {price.value != null ? (
            <>
              <Big>{fmtEur(price.value)}</Big>
              <p className="num mt-2 text-[0.9375rem] text-ink-2">{fmtEurKg(price.value / data.settings.bagWeightKg)} por kg</p>
            </>
          ) : (
            <Missing>Se calcula con la primera compra, o fíjalo con el lápiz.</Missing>
          )}
        </Metric>

        <Metric icon={<CalendarClock className="size-4" />} label="Autonomía estimada">
          {auto ? (
            <>
              <Big unit={Math.round(auto.days) === 1 ? 'día' : 'días'}>{fmtInt(auto.days)}</Big>
              <p className="num mt-2 text-[0.9375rem] text-ink-2">
                Hasta el {fmtDate(auto.runOutDate)} · {fmtKg(Math.round(auto.availableKg))}
                {auto.includesHopper && auto.hopperApproximate && ' (tolva estimada)'}
              </p>
            </>
          ) : (
            <Missing onClick={() => go('consumo')} cta="Cómo registrar consumo">
              Necesita al menos {MIN_DAYS_FOR_AVERAGE} días con consumo real registrado
              {cons.coveredDays > 0 && ` (ahora hay ${cons.coveredDays})`}.
            </Missing>
          )}
        </Metric>
        <Metric
          icon={<CloudSun className="size-4" />}
          label="Próximos 7 días según el tiempo"
          className="sm:col-span-2 lg:col-span-3"
        >
          {!climateOn ? (
            <Missing onClick={() => go('configuracion')} cta="Elegir localidad y sensores">
              Añade tu localidad (y tus sensores SwitchBot) para prever el consumo según el frío.
            </Missing>
          ) : fc ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {model && fc.totalKg != null ? (
                  <>
                    <Big unit="kg">{fmtInt(fc.totalKg)}</Big>
                    <p className="num mt-2 text-[0.9375rem] text-ink-2">
                      {fc.totalCost != null && <>≈ {fmtEur(fc.totalCost)} · </>}
                      {model.kgPerHdd.toLocaleString('es-ES', { maximumFractionDigits: 2 })} kg por grado-día
                      {model.baseKgPerDay > 0 && <> + {model.baseKgPerDay.toLocaleString('es-ES', { maximumFractionDigits: 1 })} kg/día de agua caliente</>}
                    </p>
                  </>
                ) : (
                  <Missing onClick={() => openAdd('consumption')} cta="Registrar consumo">
                    Ya tienes la previsión de temperatura. Para convertirla en kg faltan {MIN_DAYS_FOR_MODEL} días de consumo real.
                  </Missing>
                )}
              </div>
              <ul className="grid w-full grid-cols-7 gap-1.5 sm:w-auto" aria-label="Temperatura media prevista">
                {fc.days.map((d) => (
                  <li key={d.date} className="flex min-w-0 flex-col items-center gap-1 rounded-xl bg-sand-soft py-2 sm:w-12">
                    <span className="text-[0.6875rem] font-semibold text-ink-3 uppercase">
                      {new Date(d.date + 'T12:00').toLocaleDateString('es-ES', { weekday: 'narrow' })}
                    </span>
                    <span className="num text-sm font-bold">{fmtC(d.mean)}</span>
                    {d.kg != null && <span className="num text-[0.6875rem] text-ink-2">{fmtInt(d.kg)} kg</span>}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Missing onClick={() => go('clima')} cta="Ver clima">
              Descargando el tiempo de tu zona…
            </Missing>
          )}
        </Metric>
      </section>

      <QuickEditDialog target={quickEdit} onClose={() => setQuickEdit(null)} />

      {/* Actividad */}
      <Card className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[1.0625rem] font-bold tracking-[-0.01em]">Actividad reciente</h2>
          <Button size="sm" variant="ghost" onClick={() => go('historial')} className="-mr-2">
            Ver historial
            <ArrowRight className="size-4" />
          </Button>
        </div>
        <RecordList records={recent} />
      </Card>
    </>
  );
}
