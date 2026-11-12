import { CalendarDays, Check, Loader2 } from 'lucide-react';
import { useState } from 'react';
import {
  calendarAvailable,
  clearCalendar,
  listPhoneCalendars,
  requestCalendarAccess,
  setCalendarPrefs,
  syncCalendar,
  useCalendarPrefs,
  type PhoneCalendar,
} from '../../data/calendar';
import { calendarPlan } from '../../domain/calendar';
import { fmtDate } from '../../domain/format';
import { useStore } from '../../store/store';
import { StepperInput } from '../../ui/fields';
import { haptic } from '../../ui/haptics';
import { Button, cx, SectionTitle } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

/** Ajuste «Añadir al calendario del móvil»: fechas previstas de compra y recarga. */
export function CalendarSettings() {
  const { data } = useStore();
  const prefs = useCalendarPrefs();
  const toast = useToast();
  const [calendars, setCalendars] = useState<PhoneCalendar[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const plan = calendarPlan(data, prefs.leadDays);

  async function enable() {
    setBusy(true);
    setErr('');
    try {
      if (!(await requestCalendarAccess())) {
        setErr('Sin permiso para el calendario. Puedes darlo en Ajustes del móvil › Aplicaciones › Pellet Control › Permisos.');
        return;
      }
      const list = await listPhoneCalendars();
      if (!list.length) {
        setErr('No hay calendarios en los que escribir. Añade una cuenta de Google en el móvil.');
        return;
      }
      setCalendars(list);
      const pick = list.find((c) => c.id === prefs.calendarId) ?? list.find((c) => c.primary) ?? list[0];
      choose(pick);
    } catch {
      setErr('No se pudo acceder al calendario.');
    } finally {
      setBusy(false);
    }
  }

  function choose(c: PhoneCalendar) {
    setCalendarPrefs({ enabled: true, calendarId: c.id, calendarName: c.name || c.account });
    haptic.success();
    void syncCalendar(c.id, plan).catch(() => {});
    toast.show({ title: 'Calendario activado', body: plan.length ? `Eventos en «${c.name || c.account}»` : 'Se añadirán en cuanto haya datos de consumo.' });
  }

  async function disable() {
    await clearCalendar();
    setCalendarPrefs({ enabled: false });
    setCalendars(null);
    toast.show({ title: 'Calendario desactivado', body: 'Se han quitado los eventos de Pellet Control.' });
  }

  return (
    <>
      <SectionTitle>Calendario</SectionTitle>
      {!calendarAvailable() ? (
        <p className="text-sm text-ink-2">Disponible en la app Android: añade al calendario del móvil cuándo toca comprar pellet y recargar la tolva.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">
            Añade al calendario del móvil cuándo toca <span className="font-semibold text-ink">comprar pellet</span> y{' '}
            <span className="font-semibold text-ink">recargar la tolva</span>, con aviso el día antes. Las fechas se mueven solas cuando cambian tus datos.
          </p>

          {prefs.enabled ? (
            <>
              <div className="rounded-xl bg-sand-soft/60 px-3.5 py-3 text-sm">
                <p className="flex items-center gap-2 font-semibold">
                  <CalendarDays className="size-4 text-olive" aria-hidden /> En «{prefs.calendarName}»
                </p>
                {plan.length ? (
                  <ul className="mt-1.5 flex flex-col gap-0.5 text-ink-2">
                    {plan
                      .slice()
                      .sort((a, b) => (a.date < b.date ? -1 : 1))
                      .map((e) => (
                        <li key={e.key}>
                          {fmtDate(e.date)} · {e.title}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-ink-2">Aún no hay fechas: hacen falta unos días de consumo registrado para calcularlas.</p>
                )}
              </div>
              <StepperInput
                label="Días de margen para comprar"
                value={String(prefs.leadDays)}
                onChange={(v) => {
                  const n = Math.round(Number(v.replace(',', '.')));
                  if (Number.isFinite(n)) setCalendarPrefs({ leadDays: Math.max(0, Math.min(30, n)) });
                }}
                step={1}
                unit="días"
                hint="Antes de que se acabe el pellet, para que dé tiempo a que llegue."
              />
              {calendars && calendars.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {calendars.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => choose(c)}
                      aria-pressed={c.id === prefs.calendarId}
                      className={cx(
                        'flex h-8 max-w-full items-center gap-1 truncate rounded-full px-3 text-xs font-semibold ring-1 ring-inset transition-transform duration-150 active:scale-95',
                        c.id === prefs.calendarId ? 'bg-olive-soft text-olive-strong ring-olive/30' : 'text-ink-2 ring-line',
                      )}
                    >
                      {c.id === prefs.calendarId && <Check className="size-3.5 shrink-0" aria-hidden />}
                      <span className="truncate">{c.name || c.account}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {!calendars && (
                  <Button size="sm" onClick={() => void enable()} disabled={busy}>
                    Cambiar calendario
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-rust hover:text-rust" onClick={() => void disable()}>
                  Quitar del calendario
                </Button>
              </div>
            </>
          ) : (
            <Button
              className="self-start"
              icon={busy ? <Loader2 className="size-4 animate-spin" /> : <CalendarDays className="size-4" />}
              onClick={() => void enable()}
              disabled={busy}
            >
              Añadir al calendario
            </Button>
          )}
          {err && <p className="text-sm text-rust">{err}</p>}
        </div>
      )}
    </>
  );
}
