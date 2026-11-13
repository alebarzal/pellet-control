import { Check, Loader2, Plug, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { listDevices, SwitchBotError } from '../../data/switchbot';
import { autoKgPerBurnerHour, plugSummary } from '../../domain/plug';
import { useStore } from '../../store/store';
import { decimalToInput, parseDecimal, StepperInput } from '../../ui/fields';
import { cx } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import { useClimateSync } from './ClimateSync';

/** Ajustes del enchufe con medidor en el que está la caldera (SwitchBot Plug Mini). */
export function PlugSettings() {
  const { data, updateClimateSettings } = useStore();
  const { syncNow, plugError } = useClimateSync();
  const toast = useToast();
  const c = data.settings.climate;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [threshold, setThreshold] = useState(decimalToInput(c.plugThresholdW));
  const auto = c.plugId ? autoKgPerBurnerHour(data) : null;
  const [kgh, setKgh] = useState(c.kgPerBurnerHour != null ? decimalToInput(c.kgPerBurnerHour) : '');
  const s = plugSummary(data.climate.plug, c);

  async function search() {
    setBusy(true);
    setErr('');
    try {
      const { plugs } = await listDevices(c.switchbotToken, c.switchbotSecret);
      updateClimateSettings({ plugs, plugId: c.plugId && plugs.some((p) => p.id === c.plugId) ? c.plugId : null });
      if (!plugs.length) setErr('No hay enchufes en la cuenta de SwitchBot. Añade el Plug Mini en la app de SwitchBot y vuelve a buscar.');
      else toast.show({ title: plugs.length === 1 ? 'Enchufe encontrado' : `${plugs.length} enchufes encontrados` });
    } catch (e) {
      setErr(e instanceof SwitchBotError ? e.message : 'No se pudo buscar en SwitchBot.');
    } finally {
      setBusy(false);
    }
  }

  function choose(id: string) {
    const next = c.plugId === id ? null : id;
    updateClimateSettings({ plugId: next });
    if (next) {
      toast.show({ title: 'Enchufe de la caldera elegido', body: 'Se leerá cada 15 minutos, también con la app cerrada.' });
      window.setTimeout(() => void syncNow(), 50);
    }
  }

  function saveThreshold(v: string) {
    setThreshold(v);
    const n = parseDecimal(v);
    if (Number.isFinite(n) && n > 0) updateClimateSettings({ plugThresholdW: Math.round(n) });
  }

  function saveKgh(v: string) {
    setKgh(v);
    if (!v.trim()) return updateClimateSettings({ kgPerBurnerHour: null });
    const n = parseDecimal(v);
    if (Number.isFinite(n) && n > 0) updateClimateSettings({ kgPerBurnerHour: Math.round(n * 100) / 100 });
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-sand-soft/60 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Plug className="size-4 text-olive" aria-hidden /> Enchufe de la caldera
      </p>
      <p className="text-sm text-ink-2">
        Con un enchufe SwitchBot con medidor (Plug Mini) la app sabe cuándo funciona el quemador por lo que consume: el aviso de arranque es más fiable y se
        estiman las horas y los kg quemados cada día.
      </p>

      {c.plugs.length === 0 ? (
        <button
          type="button"
          onClick={() => void search()}
          disabled={busy}
          className="flex items-center gap-2 self-start rounded-full px-3.5 py-2 text-sm font-semibold ring-1 ring-line transition-transform duration-150 active:scale-95"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Buscar enchufes
        </button>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {c.plugs.map((p) => {
              const on = c.plugId === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => choose(p.id)}
                    className={cx(
                      'flex w-full items-center justify-between gap-3 rounded-xl bg-surface px-3.5 py-3 text-left ring-1 transition-transform duration-150 active:scale-[0.99]',
                      on ? 'ring-olive/40' : 'ring-line',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{p.name}</span>
                      <span className="block text-sm text-ink-2">
                        {on && s.last ? `Ahora ${decimalToInput(s.last.watts)} W` : p.type}
                      </span>
                    </span>
                    <span
                      className={cx(
                        'flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold ring-1 ring-inset',
                        on ? 'bg-olive-soft text-olive-strong ring-olive/30' : 'text-ink-2 ring-line',
                      )}
                    >
                      {on && <Check className="size-3.5" aria-hidden />} {on ? 'Caldera' : 'Usar'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={() => void search()} disabled={busy} className="self-start text-sm font-semibold text-olive-strong hover:underline">
            {busy ? 'Buscando…' : 'Volver a buscar'}
          </button>
        </>
      )}

      {c.plugId && (
        <>
          <StepperInput
            label="Encendida a partir de"
            value={threshold}
            onChange={saveThreshold}
            step={5}
            unit="W"
            hint={
              s.avgOnW != null || s.avgOffW != null
                ? `Visto hasta ahora: en reposo ~${s.avgOffW ?? '—'} W, encendida ~${s.avgOnW ?? '—'} W. Pon un valor entre los dos.`
                : 'Mira en la app de SwitchBot cuánto marca en reposo y con el quemador funcionando, y pon un valor entre los dos.'
            }
          />
          <StepperInput
            label="Pellet por hora de quemador"
            value={kgh}
            onChange={saveKgh}
            step={0.1}
            unit="kg/h"
            placeholder={auto ? `Auto: ${decimalToInput(auto.value)}` : 'Automático'}
            hint={
              auto
                ? `Vacío = automático: ahora ${decimalToInput(auto.value)} kg/h, sacado de ${auto.days} días con consumo y enchufe. Pon un valor solo si lo sabes mejor.`
                : 'Vacío = automático: se calcula solo cruzando tus consumos apuntados con las horas de quemador del enchufe (hacen falta unos días completos).'
            }
          />
        </>
      )}
      {(err || (c.plugId && plugError)) && <p className="text-sm text-rust">{err || plugError}</p>}
    </div>
  );
}
