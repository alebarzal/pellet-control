import { Flame, Info } from 'lucide-react';
import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { detectEpisodes, indoorSeries, SENSITIVITY, summarizeDays } from '../../domain/heating';
import { useStore } from '../../store/store';
import { Card, cx, SectionTitle } from '../../ui/primitives';
import { axisProps, C, ChartTooltip, gridProps } from '../charts/chartKit';

const hhmm = (t: number) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const fmtC = (v: number) => `${v.toLocaleString('es-ES', { maximumFractionDigits: 1 })} °C`;
const fmtH = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toLocaleString('es-ES', { maximumFractionDigits: 1 })} h`);

/** Estado de calefacción deducido de la temperatura interior. */
export function useHeating() {
  const { data } = useStore();
  const c = data.settings.climate;
  return useMemo(() => {
    const series = indoorSeries(data.climate.readings, c.indoorIds);
    const episodes = detectEpisodes(series, { threshold: SENSITIVITY[c.heatSensitivity] });
    const days = summarizeDays(series, episodes);
    const ongoing = episodes.find((e) => e.ongoing) ?? null;
    return { series, episodes, days, ongoing, hasSensors: c.indoorIds.length > 0 };
  }, [data.climate.readings, c.indoorIds, c.heatSensitivity]);
}

/** Indicador pequeño «Calentando» con punto pulsante. */
export function HeatingPill({ since, className }: { since: number; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2 rounded-full bg-amber-soft px-3 py-1 text-[0.8125rem] font-semibold text-amber', className)}>
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-amber" />
      </span>
      Calentando desde las {hhmm(since)}
    </span>
  );
}

export function HeatingCard() {
  const { series, episodes, days, ongoing, hasSensors } = useHeating();
  const now = Date.now();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const from = Math.min(dayStart.getTime(), now - 12 * 3600_000);
  const todaySeries = series.filter((p) => p.at >= from);
  const todayEps = episodes.filter((e) => e.end >= from);
  const last7 = days.slice(-7);
  const today = days.at(-1);

  return (
    <Card>
      <SectionTitle aside={ongoing ? <HeatingPill since={ongoing.start} /> : series.length ? <span className="text-sm text-ink-3">En reposo</span> : undefined}>
        <span className="flex items-center gap-2">
          <Flame className="size-4 text-olive" aria-hidden /> Caldera
        </span>
      </SectionTitle>

      {!hasSensors ? (
        <p className="text-sm text-ink-2">Marca al menos un sensor como Interior en Configuración para estimar cuándo calienta la caldera.</p>
      ) : todaySeries.length < 3 ? (
        <p className="text-sm text-ink-2">
          Aún hay pocas lecturas. En la app Android se toman cada 15 minutos aunque esté cerrada; en unas horas aparecerán aquí los arranques detectados.
        </p>
      ) : (
        <>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={todaySeries} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="indoorFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.amber} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={C.amber} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="at" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={hhmm} {...axisProps} minTickGap={32} />
                <YAxis {...axisProps} width={44} allowDecimals={false}
                  domain={[(min: number) => Math.floor(min - 0.3), (max: number) => Math.ceil(max + 0.3)]}
                  tickFormatter={(v: number) => `${v}°`}
                />
                {todayEps.map((e) => (
                  <ReferenceArea key={e.start} x1={e.start} x2={e.end} fill={C.amber} fillOpacity={0.12} stroke="none" ifOverflow="hidden" />
                ))}
                <Tooltip content={<ChartTooltip labelFormat={(t) => hhmm(Number(t))} valueFormat={(v) => fmtC(v)} />} />
                <Area dataKey="temp" name="Dentro" type="monotone" stroke={C.amber} strokeWidth={2} fill="url(#indoorFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[0.8125rem] text-ink-3">Últimas 12 horas. Las franjas sombreadas son los periodos en que la casa subía: la caldera probablemente estaba funcionando.</p>

          {todayEps.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1.5">
              {todayEps
                .slice()
                .reverse()
                .map((e) => (
                  <li key={e.start} className="flex items-center justify-between gap-3 rounded-xl bg-sand-soft/70 px-3 py-2 text-sm">
                    <span className="num font-semibold">
                      {hhmm(e.start)} – {e.ongoing ? 'ahora' : hhmm(e.end)}
                    </span>
                    <span className="num text-ink-2">
                      {fmtC(e.startTemp)} → {fmtC(e.endTemp)}
                    </span>
                    <span className={cx('text-xs font-semibold', e.confidence === 'alta' ? 'text-olive-strong' : e.confidence === 'media' ? 'text-ink-2' : 'text-amber')}>
                      {e.confidence === 'baja' ? 'Dudoso (sol)' : `Confianza ${e.confidence}`}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </>
      )}

      {last7.some((d) => d.episodes > 0) && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 text-sm font-semibold">Últimos días</p>
          <ul className="grid grid-cols-7 gap-1.5">
            {last7.map((d) => (
              <li key={d.date} className="flex flex-col items-center gap-0.5 rounded-xl bg-sand-soft py-2 text-center">
                <span className="text-[0.6875rem] font-semibold text-ink-3 uppercase">
                  {new Date(d.date + 'T12:00').toLocaleDateString('es-ES', { weekday: 'narrow' })}
                </span>
                <span className="num text-sm font-bold">{d.episodes}</span>
                <span className="num text-[0.6875rem] text-ink-2">{fmtH(d.hours)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.8125rem] text-ink-3">
            Arranques detectados y tiempo calentando por día{today && today.coverageHours < 20 ? ' (con lecturas incompletas el dato es parcial)' : ''}.
          </p>
        </div>
      )}

      <p className="mt-4 flex gap-2 text-[0.8125rem] text-ink-3">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Estimación a partir de la temperatura de casa: llega con algo de retraso y el sol o la cocina pueden dar falsos avisos. Un sensor en la tubería de la caldera sería exacto.
      </p>
    </Card>
  );
}
