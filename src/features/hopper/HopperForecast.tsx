import { Camera, Check, Flame, Hourglass, Info, TriangleAlert } from 'lucide-react';
import { fmtKg, fmtNum } from '../../domain/format';
import type { HopperEstimate, HopperModel, TrackPoint } from '../../domain/hopperModel';
import { cx } from '../../ui/primitives';

const DAY = 86_400_000;

export const fmtWhen = (ms: number) =>
  new Date(ms).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

/** «3 días», «día y medio», «unas 14 h». */
export function fmtSpan(ms: number): string {
  const h = ms / 3600_000;
  if (h < 1) return 'menos de una hora';
  if (h < 36) return `unas ${Math.round(h)} h`;
  const d = h / 24;
  return `${fmtNum(Math.round(d * 2) / 2)} días`;
}

/* ───────────── Gráfico ───────────── */

const W = 340;
const HT = 190;
const M = { l: 30, r: 10, t: 10, b: 24 };

function LevelChart({ m, now }: { m: HopperModel; now: number }) {
  const first = m.past[0]?.[0]?.at ?? m.anchor.at;
  const lastPoint = m.track.at(-1)!.at;
  // Hacia atrás como mucho 10 días, para que la previsión no quede aplastada.
  const x0 = Math.max(first, now - 10 * DAY);
  const x1 = Math.max(lastPoint, now + DAY);
  const sx = (t: number) => M.l + ((Math.max(x0, t) - x0) / (x1 - x0)) * (W - M.l - M.r);
  const sy = (p: number) => M.t + (1 - p / 100) * (HT - M.t - M.b);
  const line = (pts: TrackPoint[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.at).toFixed(1)},${sy(p.percent).toFixed(1)}`).join(' ');

  const nowIdx = m.track.findIndex((p) => p.future);
  const done = nowIdx < 0 ? m.track : m.track.slice(0, nowIdx);
  const ahead = nowIdx < 0 ? [] : [done.at(-1)!, ...m.track.slice(nowIdx)];
  const band = `${m.track.map((p, i) => `${i ? 'L' : 'M'}${sx(p.at).toFixed(1)},${sy(p.high).toFixed(1)}`).join(' ')} ${[...m.track]
    .reverse()
    .map((p) => `L${sx(p.at).toFixed(1)},${sy(p.low).toFixed(1)}`)
    .join(' ')} Z`;

  // Una marca por día (o cada varios si son muchos).
  const days: number[] = [];
  const d = new Date(x0);
  d.setHours(24, 0, 0, 0);
  for (let t = d.getTime(); t < x1; t += DAY) days.push(t);
  const every = Math.max(1, Math.ceil(days.length / 6));
  const readings = m.checks.filter((c) => c.at >= x0);

  return (
    <svg viewBox={`0 0 ${W} ${HT}`} className="w-full" role="img" aria-label="Nivel de la tolva: lo calculado hasta ahora, la previsión y tus lecturas">
      {[0, 25, 50, 75, 100].map((p) => (
        <g key={p}>
          <line x1={M.l} x2={W - M.r} y1={sy(p)} y2={sy(p)} className={p === 0 ? 'stroke-ink-3/50' : 'stroke-line'} strokeWidth={1} />
          <text x={M.l - 6} y={sy(p) + 3.5} textAnchor="end" className="fill-ink-3 text-[9px]">
            {p}
          </text>
        </g>
      ))}
      {days.map((t, i) =>
        i % every === 0 ? (
          <text key={t} x={sx(t)} y={HT - 7} textAnchor="middle" className="fill-ink-3 text-[9px]">
            {fmtDay(t)}
          </text>
        ) : null,
      )}
      {/* Zona de «por debajo del 25 %: toca recargar» */}
      <rect x={M.l} y={sy(25)} width={W - M.l - M.r} height={sy(0) - sy(25)} className="fill-amber-soft/50" />

      <path d={band} className="fill-olive/15" />
      {m.past.map((seg, i) => (
        <path key={i} d={line(seg)} fill="none" className="stroke-olive/45" strokeWidth={1.75} strokeLinejoin="round" />
      ))}
      <path d={line(done)} fill="none" className="stroke-olive" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
      {ahead.length > 1 && <path d={line(ahead)} fill="none" className="stroke-olive" strokeWidth={2} strokeDasharray="4 4" strokeLinecap="round" />}

      {/* Ahora */}
      <line x1={sx(now)} x2={sx(now)} y1={M.t} y2={sy(0)} className="stroke-forest/50" strokeWidth={1} strokeDasharray="2 3" />
      <text x={sx(now)} y={M.t + 7} textAnchor={sx(now) > W - 50 ? 'end' : 'start'} dx={sx(now) > W - 50 ? -4 : 4} className="fill-forest text-[9px] font-semibold">
        ahora
      </text>
      <circle cx={sx(now)} cy={sy(m.percent)} r={4} className="fill-olive stroke-surface" strokeWidth={2} />

      {/* Lecturas: lo medido (punto) y, si lo había, lo que decía el cálculo (aro) */}
      {readings.map((c) => (
        <g key={c.id}>
          {c.predicted != null && Math.abs(c.predicted - c.percent) >= 2 && (
            <>
              <line x1={sx(c.at)} x2={sx(c.at)} y1={sy(c.predicted)} y2={sy(c.percent)} className="stroke-forest/40" strokeWidth={1} />
              <circle cx={sx(c.at)} cy={sy(c.predicted)} r={3} className="fill-surface stroke-olive" strokeWidth={1.5} />
            </>
          )}
          <circle cx={sx(c.at)} cy={sy(c.percent)} r={c.exact ? 4 : 3.5} className={cx('stroke-surface', c.exact ? 'fill-forest' : 'fill-ink-3')} strokeWidth={1.5} />
        </g>
      ))}
    </svg>
  );
}

const Key = ({ className, children, dashed }: { className: string; children: string; dashed?: boolean }) => (
  <span className="flex items-center gap-1.5">
    <span className={cx('inline-block', dashed ? 'h-0 w-4 border-t-2 border-dashed' : 'size-2.5 rounded-full', className)} aria-hidden />
    {children}
  </span>
);

/* ───────────── Panel ───────────── */

function Fact({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-sand-soft/60 p-3.5">
      <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-ink-2">
        {icon}
        {label}
      </p>
      <p className="num mt-1 text-lg leading-tight font-bold tracking-[-0.01em]">{value}</p>
      {sub && <p className="num mt-0.5 text-[0.8125rem] text-ink-2">{sub}</p>}
    </div>
  );
}

const RATE_SOURCE: Record<NonNullable<HopperModel['rate']>['source'], string> = {
  manual: 'puesto a mano en Clima',
  lecturas: 'sacado de tus lecturas de nivel',
  consumos: 'sacado de tus consumos apuntados',
};

/** Previsión de la tolva: gráfico, ritmo, cuándo se vacía y cómo va cuadrando el cálculo con las lecturas. */
export function HopperForecast({ h, now }: { h: HopperEstimate; now: number }) {
  const m = h.model;
  if (!m)
    return <p className="text-ink-2">Configura la capacidad de la tolva en Configuración para poder calcular cuánto pellet queda.</p>;

  const checks = m.checks.filter((c) => c.predicted != null);
  const hasPlug = m.method === 'quemador';
  const tips: string[] = [];
  if (m.method === 'lectura') tips.push('Todavía no hay datos de quemado: conecta el enchufe de la caldera en Clima o apunta algún consumo, y el nivel empezará a bajar solo.');
  else if (!hasPlug) tips.push('Ahora se usa tu consumo medio diario. Con el enchufe de la caldera conectado en Clima se descuenta lo que quema de verdad cada hora.');
  if (hasPlug && m.rate && m.rate.source !== 'lecturas' && m.rate.source !== 'manual')
    tips.push('Haz dos lecturas con foto separadas por un día o más: con ellas la app ajusta los kg por hora a tu caldera.');
  if (hasPlug && m.coverage < 0.8) tips.push(`El enchufe solo ha medido el ${Math.round(m.coverage * 100)} % del tiempo desde la última lectura; el resto se ha rellenado con el ritmo medio.`);
  if (!m.anchor.exact) tips.push('La última lectura fue a ojo. Una foto del visor reduce el margen de la estimación.');

  return (
    <div className="flex flex-col gap-5">
      <div>
        <LevelChart m={m} now={now} />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-ink-2">
          <Key className="bg-olive">Calculado</Key>
          <Key className="border-olive" dashed>
            Previsión
          </Key>
          <Key className="bg-forest">Lectura</Key>
          <Key className="bg-olive/25">Margen</Key>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Fact
          icon={<Check className="size-3.5 text-olive" aria-hidden />}
          label="Ahora"
          value={`${h.live ? '~' : ''}${Math.round(h.percent)} %`}
          sub={`${fmtKg(Math.round(m.kg))} ± ${fmtKg(Math.round(m.marginKg))}`}
        />
        <Fact
          icon={<Hourglass className="size-3.5 text-olive" aria-hidden />}
          label="Se vacía"
          value={m.emptyAt ? `en ${fmtSpan(m.emptyAt - now)}` : '—'}
          sub={m.emptyAt ? fmtWhen(m.emptyAt) : 'Sin datos para preverlo'}
        />
        <Fact
          icon={<Flame className="size-3.5 text-olive" aria-hidden />}
          label="Quemado desde la lectura"
          value={fmtKg(Math.round(m.burnedKg * 10) / 10)}
          sub={hasPlug ? `${fmtNum(Math.round(m.burnerHours * 10) / 10)} h de quemador` : m.method === 'media' ? 'según el consumo medio' : undefined}
        />
        <Fact
          icon={<Flame className="size-3.5 text-olive" aria-hidden />}
          label="Ritmo"
          value={m.rate && hasPlug ? `${fmtNum(m.rate.kgPerHour)} kg/h` : m.dailyKg != null ? `${fmtNum(Math.round(m.dailyKg * 10) / 10)} kg/día` : '—'}
          sub={m.rate && hasPlug && m.dailyKg != null ? `≈ ${fmtNum(Math.round(m.dailyKg * 10) / 10)} kg/día` : undefined}
        />
      </div>

      <section>
        <p className="mb-2 text-sm font-bold">Cuadre con tus lecturas</p>
        {checks.length ? (
          <>
            <ul className="flex flex-col divide-y divide-line/70 rounded-2xl ring-1 ring-line">
              {checks.slice(0, 5).map((c) => {
                const diff = Math.round(c.predicted! - c.percent);
                const abs = Math.abs(diff);
                return (
                  <li key={c.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sand-soft text-ink-2">
                      {c.photo ? <Camera className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="num block text-[0.9375rem] font-semibold">
                        Medido {Math.round(c.percent)} %{!c.exact && <span className="font-normal text-ink-3"> a ojo</span>}
                      </span>
                      <span className="num block text-[0.8125rem] text-ink-2">
                        {fmtWhen(c.at)} · el cálculo decía {Math.round(c.predicted!)} %
                      </span>
                    </span>
                    <span
                      className={cx(
                        'num shrink-0 rounded-full px-2.5 py-1 text-[0.8125rem] font-semibold',
                        abs <= 5 ? 'bg-olive-soft text-olive-strong' : abs <= 12 ? 'bg-amber-soft text-amber' : 'bg-rust-soft text-rust',
                      )}
                    >
                      {diff === 0 ? 'clavado' : `${diff > 0 ? '+' : '−'}${abs}`}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[0.8125rem] text-ink-3 text-pretty">
              {m.meanError != null
                ? `De media, el cálculo se desvía ${fmtNum(Math.round(m.meanError * 10) / 10)} puntos de lo que mides. `
                : ''}
              El número es lo que el cálculo marcaba de más (+) o de menos (−). Cada lectura nueva corrige el nivel y afina el ritmo.
            </p>
          </>
        ) : (
          <p className="rounded-2xl bg-sand-soft/60 p-3.5 text-sm text-ink-2 text-pretty">
            Aún no hay con qué comparar. Cuando subas la siguiente foto o lectura, aquí verás lo que decía el cálculo frente a lo que has medido.
          </p>
        )}
      </section>

      <section className="rounded-2xl bg-sand-soft/60 p-4">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Info className="size-4 text-olive" aria-hidden />
          Cómo se calcula
        </p>
        <p className="mt-1.5 text-[0.8125rem] text-ink-2 text-pretty">
          Se parte de la última lectura ({Math.round(m.anchor.percent)} % el {fmtWhen(m.anchor.at)}), se suman las recargas posteriores y se resta lo quemado
          {hasPlug && m.rate
            ? `: las horas de quemador que mide el enchufe por ${fmtNum(m.rate.kgPerHour)} kg/h (${RATE_SOURCE[m.rate.source]}${
                m.rate.source === 'lecturas' ? `, ${m.rate.samples} ${m.rate.samples === 1 ? 'tramo' : 'tramos'}` : ''
              }).`
            : m.method === 'media'
              ? ' según tu consumo medio diario.'
              : '.'}{' '}
          La previsión usa el ritmo de los últimos días{m.dailyKg != null ? ' y, si hay datos del tiempo, el frío previsto' : ''}.
        </p>
        {tips.length > 0 && (
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {tips.map((t) => (
              <li key={t} className="flex gap-2 text-[0.8125rem] text-amber text-pretty">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
