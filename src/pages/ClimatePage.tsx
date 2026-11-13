import { CircleAlert, CloudSun, Home, Loader2, RefreshCw, Settings2, Thermometer, TrendingUp } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PageProps } from '../app/App';
import { axisProps, C, ChartCard, ChartTooltip, gridProps, Legend, ProjectedPattern } from '../features/charts/chartKit';
import { useClimateSync } from '../features/climate/ClimateSync';
import { HeatingCard } from '../features/climate/HeatingCard';
import { PlugCard } from '../features/climate/PlugCard';
import { climateForecast, currentIndoor, currentOutdoor, efficiencyModel, hdd, indoorDaily, MIN_DAYS_FOR_MODEL } from '../domain/climate';
import { dailyConsumption, statsData } from '../domain/calc';
import { todayIso } from '../domain/dates';
import { fmtDate, fmtDateShort, fmtEur, fmtInt, fmtKg, fmtNum } from '../domain/format';
import { useStore } from '../store/store';
import { Button, Card, EmptyState, PageHeader, Stat } from '../ui/primitives';

const fmtC = (v: number) => `${v.toLocaleString('es-ES', { maximumFractionDigits: 1 })} °C`;
const fmtTime = (iso: string) => new Date(iso).toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
const weekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
};

export function ClimatePage({ go }: PageProps) {
  const { data } = useStore();
  // Estadísticas desde el último reinicio (el stock y la tolva usan siempre todos los datos)
  const sdata = statsData(data);
  const { syncing, syncNow, sensorError, weatherError } = useClimateSync();
  const today = todayIso();
  const c = data.settings.climate;
  const indoor = currentIndoor(data);
  const outdoor = currentOutdoor(data);
  const model = efficiencyModel(data, today);
  const forecast = climateForecast(data, 16, today);
  const week = forecast?.days.slice(0, 7) ?? [];
  const weekKg = model ? week.reduce((s, d) => s + (d.kg ?? 0), 0) : null;
  const weekCost = model ? week.reduce((s, d) => s + (d.cost ?? 0), 0) : null;
  const configured = c.lat != null || c.devices.length > 0;

  // Historia de la temporada: temperatura exterior/interior y consumo diario
  const cons = dailyConsumption(sdata);
  const ind = indoorDaily(data);
  const history = (data.climate.outdoor?.daily ?? [])
    .filter((d) => d.date >= data.settings.seasonStart && d.date <= today)
    .map((d) => ({ date: d.date, outdoor: d.mean, indoor: ind.get(d.date) ?? null, hdd: hdd(d.mean, c.baseTempC), kg: cons.get(d.date) ?? null }));
  const seasonHdd = history.reduce((s, d) => s + d.hdd, 0);
  const hasIndoorHistory = history.some((h) => h.indoor != null);
  const hasConsumption = history.some((h) => h.kg != null);

  if (!configured)
    return (
      <>
        <PageHeader title="Clima" description="Temperatura de casa y de fuera, y cómo afecta al consumo de pellet." />
        <EmptyState
          icon={<Thermometer className="size-5" />}
          title="Conecta tus sensores y tu localidad"
          action={
            <Button variant="primary" icon={<Settings2 className="size-4" />} onClick={() => go('configuracion')}>
              Ir a Configuración
            </Button>
          }
        >
          Con tu localidad, la app descarga la temperatura exterior y la previsión. Con SwitchBot añade la temperatura de dentro de casa. Al cruzarlas con tu consumo real calcula cuánto pellet gastas por cada grado de frío y prevé el gasto de los próximos días.
        </EmptyState>
      </>
    );

  return (
    <>
      <PageHeader
        title="Clima"
        description="Cuanto más frío hace fuera, más pellet. Aquí se cruza la temperatura con tu consumo real."
        actions={
          <Button icon={syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} onClick={() => void syncNow()} disabled={syncing}>
            Actualizar
          </Button>
        }
      />

      {(sensorError || weatherError) && (
        <p className="mb-4 flex items-start gap-2 rounded-2xl bg-amber-soft px-4 py-3 text-sm text-amber">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {sensorError ?? weatherError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="flex items-center gap-2 text-sm font-semibold text-ink-2">
            <Home className="size-4 text-olive" aria-hidden /> Dentro de casa
          </p>
          {indoor ? (
            <>
              <p className="num mt-3 text-[2.25rem] leading-none font-bold tracking-[-0.03em]">{fmtC(indoor.temperature)}</p>
              <p className="num mt-2 text-[0.9375rem] text-ink-2">
                {indoor.humidity != null && `${fmtInt(indoor.humidity)} % humedad · `}
                {indoor.sensors > 1 ? `media de ${indoor.sensors} sensores` : 'SwitchBot'} · {fmtTime(indoor.at)}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-ink-2">
              {c.devices.length ? 'Sin lecturas recientes. Pulsa Actualizar o revisa el Hub.' : 'Conecta SwitchBot en Configuración para ver la temperatura interior.'}
            </p>
          )}
        </Card>
        <Card>
          <p className="flex items-center gap-2 text-sm font-semibold text-ink-2">
            <CloudSun className="size-4 text-olive" aria-hidden /> Fuera {c.placeName && <span className="truncate font-normal text-ink-3">· {c.placeName.split(' (')[0]}</span>}
          </p>
          {outdoor ? (
            <>
              <p className="num mt-3 text-[2.25rem] leading-none font-bold tracking-[-0.03em]">{fmtC(outdoor.temperature)}</p>
              <p className="num mt-2 text-[0.9375rem] text-ink-2">
                {outdoor.humidity != null && `${fmtInt(outdoor.humidity)} % humedad · `}
                {outdoor.source === 'sensor' ? 'sensor SwitchBot' : 'Open-Meteo'} · {fmtTime(outdoor.at)}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-ink-2">Elige tu localidad en Configuración para ver la temperatura exterior.</p>
          )}
        </Card>
      </div>

      {c.plugId && (
        <div className="mt-4">
          <PlugCard />
        </div>
      )}

      {c.devices.length > 0 && (
        <div className="mt-4">
          <HeatingCard />
        </div>
      )}

      <Card className="mt-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
          <Stat
            label="Pellet por grado-día"
            value={model ? `${fmtNum(model.kgPerHdd)} kg` : '—'}
            hint={
              model
                ? model.baseSource === 'none'
                  ? `Con ${model.days} días de consumo real (incluye el agua caliente)`
                  : `Calefacción. Agua caliente aparte: ≈ ${fmtNum(model.baseKgPerDay)} kg/día${model.baseSource === 'manual' ? ' (puesto a mano)' : ''}`
                : `Necesita ${MIN_DAYS_FOR_MODEL} días con consumo y temperatura`
            }
            tone={model ? undefined : 'muted'}
          />
          <Stat label="Grados-día esta temporada" value={history.length ? fmtInt(seasonHdd) : '—'} hint={`Base ${fmtC(c.baseTempC)} · desde ${fmtDate(data.settings.seasonStart)}`} tone={history.length ? undefined : 'muted'} />
          <Stat
            label="Próximos 7 días"
            value={weekKg != null ? fmtKg(Math.round(weekKg)) : '—'}
            hint={weekCost != null ? `≈ ${fmtEur(weekCost)} según la previsión` : 'Falta la relación consumo/frío'}
            tone={weekKg != null ? undefined : 'muted'}
          />
          <Stat
            label="Pellet hasta"
            value={forecast?.runOutDate ? fmtDate(forecast.runOutDate) : model ? 'Más de 16 días' : '—'}
            hint={model ? `${fmtKg(Math.round(forecast?.availableKg ?? 0))} disponibles` : 'Necesita consumo real'}
            tone={model ? undefined : 'muted'}
          />
        </div>
        <p className="mt-5 border-t border-line pt-4 text-[0.8125rem] text-ink-3 text-pretty">
          Un grado-día es cada grado que la media del día queda por debajo de {fmtC(c.baseTempC)}. Un día a 5 °C suma {fmtInt(Math.max(0, c.baseTempC - 5))} grados-día. Dividir los kg consumidos entre los grados-día da cuánto pellet gasta tu casa por cada grado de frío; con la previsión, se estima el consumo que viene.
        </p>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Previsión de consumo"
          subtitle="Próximos 16 días, según el frío previsto"
          legend={model ? <Legend items={[{ label: 'kg previstos', color: C.projected, dashed: true }]} /> : undefined}
        >
          {forecast ? (
            model ? (
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={forecast.days} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                    <defs>
                      <ProjectedPattern id="proj-climate" />
                    </defs>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="date" tickFormatter={weekday} {...axisProps} interval="preserveStartEnd" />
                    <YAxis {...axisProps} width={48} tickFormatter={(v: number) => `${fmtInt(v)} kg`} />
                    <Tooltip
                      cursor={{ fill: '#f1ecdf' }}
                      content={<ChartTooltip labelFormat={(d) => `${weekday(d)} · media prevista ${fmtC(forecast.days.find((x) => x.date === d)?.mean ?? 0)}`} valueFormat={(v) => fmtKg(v)} />}
                    />
                    <Bar dataKey="kg" name="Previsto" fill="url(#proj-climate)" stroke={C.projected} radius={[6, 6, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <>
                <ul className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {forecast.days.slice(0, 7).map((d) => (
                    <li key={d.date} className="rounded-xl bg-sand-soft px-2 py-2 text-center">
                      <span className="block text-xs text-ink-3 first-letter:uppercase">{weekday(d.date)}</span>
                      <span className="num block font-semibold">{fmtInt(d.mean)}°</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm text-ink-2 text-pretty">
                  Ya está la previsión de temperatura. Para convertirla en kg hace falta tu consumo real de al menos {MIN_DAYS_FOR_MODEL} días: regístralo desde el botón +.
                </p>
              </>
            )
          ) : (
            <EmptyState icon={<CloudSun className="size-5" />} title="Sin previsión">
              {c.lat == null ? 'Elige tu localidad en Configuración.' : 'Pulsa Actualizar para descargar el tiempo.'}
            </EmptyState>
          )}
        </ChartCard>

        <ChartCard
          title="Temperatura de la temporada"
          subtitle="Media diaria"
          legend={
            history.length ? (
              <Legend items={[{ label: 'Fuera', color: C.forest }, ...(hasIndoorHistory ? [{ label: 'Dentro', color: C.amber }] : [])]} />
            ) : undefined
          }
        >
          {history.length ? (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" tickFormatter={fmtDateShort} {...axisProps} minTickGap={24} />
                  <YAxis {...axisProps} width={44} tickFormatter={(v: number) => `${fmtInt(v)}°`} />
                  <Tooltip content={<ChartTooltip labelFormat={fmtDate} valueFormat={(v) => fmtC(v)} />} />
                  <Line dataKey="outdoor" name="Fuera" stroke={C.forest} strokeWidth={2} dot={false} />
                  {hasIndoorHistory && <Line dataKey="indoor" name="Dentro" stroke={C.amber} strokeWidth={2} dot={false} connectNulls />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon={<Thermometer className="size-5" />} title="Sin datos aún">
              Se rellenará al descargar el tiempo de tu localidad.
            </EmptyState>
          )}
          {history.length > 0 && !hasIndoorHistory && c.devices.length > 0 && (
            <p className="mt-3 text-[0.8125rem] text-ink-3">La temperatura interior se guarda mientras la app está abierta; SwitchBot no ofrece historial por su API.</p>
          )}
        </ChartCard>
      </div>

      {hasConsumption && (
        <div className="mt-4">
          <ChartCard title="Frío y consumo" subtitle="Grados-día y kg consumidos cada día con datos" legend={<Legend items={[{ label: 'Grados-día', color: C.sand }, { label: 'kg consumidos', color: C.olive }]} />}>
            <div className="grid gap-4 sm:grid-cols-2">
              {(['hdd', 'kg'] as const).map((k) => (
                <div key={k} className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={history} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="date" tickFormatter={fmtDateShort} {...axisProps} minTickGap={24} />
                      <YAxis {...axisProps} width={44} tickFormatter={(v: number) => fmtInt(v)} />
                      <Tooltip cursor={{ fill: '#f1ecdf' }} content={<ChartTooltip labelFormat={fmtDate} valueFormat={(v) => (k === 'kg' ? fmtKg(v) : `${fmtNum(v)} GD`)} />} />
                      <Bar dataKey={k} name={k === 'kg' ? 'Consumo' : 'Grados-día'} fill={k === 'kg' ? C.olive : C.sand} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[0.8125rem] text-ink-3">
              <TrendingUp className="size-3.5" aria-hidden /> Si las dos gráficas suben y bajan a la vez, la previsión será fiable.
            </p>
          </ChartCard>
        </div>
      )}
    </>
  );
}
