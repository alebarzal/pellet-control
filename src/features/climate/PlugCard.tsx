import { Plug, Plus } from 'lucide-react';
import { addDays, todayIso } from '../../domain/dates';
import { fmtDateShort, fmtKg } from '../../domain/format';
import { plugSummary } from '../../domain/plug';
import { useStore } from '../../store/store';
import { Badge, Card, cx, SectionTitle } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

const hm = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`);

/** Estado del quemador según el enchufe con medidor, y horas/kg de los últimos días. */
export function PlugCard() {
  const { data, addRecord, deleteRecord } = useStore();
  const toast = useToast();
  const c = data.settings.climate;
  if (!c.plugId) return null;
  const s = plugSummary(data.climate.plug, c);
  const name = c.plugs.find((p) => p.id === c.plugId)?.name ?? 'Enchufe';
  const max = Math.max(60, ...s.week.map((d) => d.minutes));
  const yesterday = addDays(todayIso(), -1);
  const y = s.week.find((d) => d.date === yesterday);
  const yRecorded = data.records.some((r) => r.kind === 'consumption' && r.date <= yesterday && r.endDate >= yesterday);

  function recordYesterday() {
    if (!y?.kg) return;
    const rec = addRecord({ kind: 'consumption', date: yesterday, endDate: yesterday, kg: y.kg, bags: null, notes: `Estimado por el enchufe: ${hm(y.minutes)} de quemador` });
    toast.show({ title: `Consumo de ayer: ${fmtKg(y.kg)}`, action: { label: 'Deshacer', onClick: () => deleteRecord(rec.id) } });
  }

  return (
    <Card>
      <SectionTitle
        aside={
          s.fresh ? (
            <Badge tone={s.on ? 'amber' : 'olive'}>{s.on ? 'Quemador encendido' : 'En reposo'}</Badge>
          ) : (
            <Badge>Sin lecturas recientes</Badge>
          )
        }
      >
        <span className="flex items-center gap-2">
          <Plug className="size-4 text-olive" aria-hidden /> Caldera por el enchufe
        </span>
      </SectionTitle>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-ink-2">Ahora</p>
          <p className="num text-2xl font-semibold">{s.last ? `${Math.round(s.last.watts)} W` : '—'}</p>
          <p className="text-[0.8125rem] text-ink-3">{name}</p>
        </div>
        <div>
          <p className="text-sm text-ink-2">Quemador hoy</p>
          <p className="num text-2xl font-semibold">≈ {hm(s.today.minutes)}</p>
          <p className="text-[0.8125rem] text-ink-3">{s.today.kg != null ? `≈ ${fmtKg(s.today.kg)} de pellet` : 'Calibra los kg/h para ver kg'}</p>
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {s.week
          .slice()
          .reverse()
          .map((d) => (
            <li key={d.date} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 text-sm">
              <span className="text-ink-2">{d.date === s.today.date ? 'Hoy' : fmtDateShort(d.date)}</span>
              <span className="h-2 overflow-hidden rounded-full bg-sand-soft">
                <span className={cx('block h-full rounded-full', d.samples ? 'bg-olive' : 'bg-transparent')} style={{ width: `${(d.minutes / max) * 100}%` }} />
              </span>
              <span className="num w-28 text-right font-semibold">
                {d.samples ? (d.kg != null ? `${hm(d.minutes)} · ${fmtKg(d.kg)}` : hm(d.minutes)) : <span className="font-normal text-ink-3">sin datos</span>}
              </span>
            </li>
          ))}
      </ul>

      {y?.kg != null && y.kg > 0 && !yRecorded && (
        <button
          type="button"
          onClick={recordYesterday}
          className="mt-4 flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold ring-1 ring-line transition-transform duration-150 active:scale-95"
        >
          <Plus className="size-4" /> Apuntar ayer como consumo ({fmtKg(y.kg)})
        </button>
      )}
      <p className="mt-3 text-[0.8125rem] text-ink-3">Estimación con una lectura cada 15 minutos: los arranques cortos pueden no verse.</p>
    </Card>
  );
}
