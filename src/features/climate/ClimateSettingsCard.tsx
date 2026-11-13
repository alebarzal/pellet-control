import { Bell, BellRing, Check, Loader2, MapPin, Search, Thermometer, Unplug } from 'lucide-react';
import { backgroundAvailable, requestNotifications, testNotification } from '../../data/background';
import { useState } from 'react';
import { listDevices, SwitchBotError, TYPE_LABEL } from '../../data/switchbot';
import { PlugSettings } from './PlugSettings';
import { searchPlaces, WeatherError, type Place } from '../../data/weather';
import { latestReadings } from '../../domain/climate';
import { useStore } from '../../store/store';
import { decimalToInput, parseDecimal, StepperInput, TextInput } from '../../ui/fields';
import { Button, Card, cx, SectionTitle, Segmented } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import { useClimateSync } from './ClimateSync';
import { useSync } from '../sync/SyncProvider';

export function ClimateSettingsCard() {
  const { data, updateClimateSettings } = useStore();
  const { syncNow } = useClimateSync();
  const toast = useToast();
  const c = data.settings.climate;

  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [placeErr, setPlaceErr] = useState('');

  const [baseStr, setBaseStr] = useState(decimalToInput(c.baseTempC));
  const [token, setToken] = useState(c.switchbotToken);
  const [secret, setSecret] = useState(c.switchbotSecret);
  const [connecting, setConnecting] = useState(false);
  const [sbErr, setSbErr] = useState('');
  const latest = latestReadings(data.climate.readings);
  const connected = !!c.switchbotToken && c.devices.length > 0;
  const { config: household } = useSync();
  // En un hogar compartido, otro móvil ya lee SwitchBot y sus lecturas llegan aquí.
  const fromHousehold = !connected && !!household && (c.devices.length > 0 || !!c.plugId);
  const [ownKeys, setOwnKeys] = useState(false);
  const askKeys = !connected && (!fromHousehold || ownKeys);

  async function search() {
    setSearching(true);
    setPlaceErr('');
    try {
      const r = await searchPlaces(query);
      setPlaces(r);
      if (!r.length) setPlaceErr('No se ha encontrado esa localidad.');
    } catch (e) {
      setPlaceErr(e instanceof WeatherError ? e.message : 'No se pudo buscar.');
    } finally {
      setSearching(false);
    }
  }

  function choosePlace(p: Place) {
    updateClimateSettings({ placeName: p.detail ? `${p.name} (${p.detail})` : p.name, lat: p.lat, lon: p.lon });
    setPlaces(null);
    setQuery('');
    toast.show({ title: 'Ubicación guardada', body: 'Descargando el tiempo de tu zona…' });
    window.setTimeout(() => void syncNow(), 50);
  }

  async function connect() {
    setConnecting(true);
    setSbErr('');
    try {
      const { thermo: devices, plugs } = await listDevices(token, secret);
      if (!devices.length && !plugs.length) {
        setSbErr('La cuenta no tiene termómetros conectados a un Hub. Revisa en la app de SwitchBot que el Hub tenga activado el servicio en la nube.');
        return;
      }
      const ids = new Set(devices.map((d) => d.id));
      updateClimateSettings({
        switchbotToken: token.trim(),
        switchbotSecret: secret.trim(),
        devices,
        plugs,
        plugId: c.plugId && plugs.some((p) => p.id === c.plugId) ? c.plugId : null,
        indoorIds: c.indoorIds.filter((id) => ids.has(id)).length ? c.indoorIds.filter((id) => ids.has(id)) : devices.filter((d) => !/iosensor/i.test(d.type)).map((d) => d.id),
        outdoorId: c.outdoorId && ids.has(c.outdoorId) ? c.outdoorId : (devices.find((d) => /iosensor/i.test(d.type))?.id ?? null),
      });
      toast.show({ title: 'SwitchBot conectado', body: `${devices.length} ${devices.length === 1 ? 'sensor encontrado' : 'sensores encontrados'}` });
      window.setTimeout(() => void syncNow(), 50);
    } catch (e) {
      setSbErr(e instanceof SwitchBotError ? e.message : 'No se pudo conectar con SwitchBot.');
    } finally {
      setConnecting(false);
    }
  }

  function disconnect() {
    updateClimateSettings({ switchbotToken: '', switchbotSecret: '', devices: [], indoorIds: [], outdoorId: null, plugs: [], plugId: null });
    setToken('');
    setSecret('');
    toast.show({ title: 'SwitchBot desconectado', body: 'Las lecturas guardadas se conservan.' });
  }

  async function toggleNotify() {
    if (c.notifyHeating) {
      updateClimateSettings({ notifyHeating: false });
      return;
    }
    const ok = await requestNotifications();
    if (!ok) {
      toast.show({ tone: 'error', title: 'Sin permiso para notificaciones', body: 'Actívalo en Ajustes de Android → Aplicaciones → Pellet Control → Notificaciones.' });
      return;
    }
    updateClimateSettings({ notifyHeating: true });
    toast.show({ title: 'Aviso activado', body: 'Te avisaremos cuando la casa empiece a calentarse.' });
  }

  function toggleIndoor(id: string) {
    const on = c.indoorIds.includes(id);
    updateClimateSettings({
      indoorIds: on ? c.indoorIds.filter((x) => x !== id) : [...c.indoorIds, id],
      outdoorId: !on && c.outdoorId === id ? null : c.outdoorId,
    });
  }

  function setOutdoor(id: string) {
    const on = c.outdoorId === id;
    updateClimateSettings({ outdoorId: on ? null : id, indoorIds: on ? c.indoorIds : c.indoorIds.filter((x) => x !== id) });
  }

  return (
    <Card>
      <SectionTitle>
        <span className="flex items-center gap-2">
          <Thermometer className="size-4 text-olive" aria-hidden /> Sensores y clima
        </span>
      </SectionTitle>

      {/* Ubicación */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Temperatura exterior</p>
        <p className="text-sm text-ink-2">
          {c.lat != null ? (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4 text-olive" aria-hidden /> {c.placeName}
            </span>
          ) : (
            'Elige tu localidad para descargar el tiempo de tu zona (Open-Meteo, gratis y sin cuenta).'
          )}
        </p>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <TextInput
            label={c.lat != null ? 'Cambiar localidad' : 'Localidad'}
            placeholder="Vitoria, Burgos…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            error={placeErr}
            className="flex-1"
            enterKeyHint="search"
          />
          <Button type="submit" disabled={query.trim().length < 2 || searching} className={placeErr ? 'mb-6' : ''} icon={searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}>
            Buscar
          </Button>
        </form>
        {places && places.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-2xl p-1 ring-1 ring-line">
            {places.map((p) => (
              <li key={`${p.lat},${p.lon}`}>
                <button
                  type="button"
                  onClick={() => choosePlace(p)}
                  className="w-full rounded-xl px-3 py-2 text-left transition-[transform,background-color] duration-150 hover:bg-sand-soft active:scale-[0.985]"
                >
                  <span className="block font-semibold">{p.name}</span>
                  <span className="block text-sm text-ink-2">{p.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <StepperInput
          label="Temperatura base de calefacción"
          unit="°C"
          step={0.5}
          value={baseStr}
          onChange={(v) => {
            setBaseStr(v);
            const n = parseDecimal(v);
            if (Number.isFinite(n) && n >= 5 && n <= 25) updateClimateSettings({ baseTempC: n });
          }}
          hint="Por debajo de esta temperatura exterior media se considera que hace falta calefacción (en España se suele usar 15 °C)."
          className="max-w-xs"
        />
      </div>

      {/* SwitchBot */}
      <div className="mt-8 flex flex-col gap-3 border-t border-line pt-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">SwitchBot</p>
          {connected && (
            <Button size="sm" variant="ghost" icon={<Unplug className="size-4" />} onClick={disconnect} className="-mr-2 text-rust hover:text-rust">
              Desconectar
            </Button>
          )}
        </div>
        {fromHousehold && !ownKeys && (
          <div className="flex flex-col gap-2 rounded-2xl bg-olive-soft/60 p-4 text-sm text-ink-2">
            <p>
              <span className="font-semibold text-ink">Las lecturas llegan del hogar.</span> Otro móvil del hogar tiene SwitchBot conectado y comparte
              las temperaturas{c.plugId ? ' y el enchufe de la caldera' : ''}. No hace falta poner las claves en este móvil.
            </p>
            <p className="text-[0.8125rem] text-ink-3">Los sensores, el enchufe y el umbral se eligen desde ese móvil y se aplican a los dos.</p>
            <button type="button" onClick={() => setOwnKeys(true)} className="self-start text-[0.8125rem] font-semibold text-olive-strong underline underline-offset-2">
              Conectar SwitchBot también en este móvil
            </button>
          </div>
        )}
        {askKeys && (
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
            <li>En la app de SwitchBot: Perfil → Preferencias → Acerca de.</li>
            <li>Pulsa 10 veces sobre la versión de la app: aparecen las Opciones de desarrollador.</li>
            <li>Copia el token y la clave secreta y pégalos aquí.</li>
          </ol>
        )}
        {askKeys && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void connect();
            }}
          >
            <TextInput label="Token" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} />
            <TextInput label="Clave secreta" type="password" autoComplete="off" spellCheck={false} value={secret} onChange={(e) => setSecret(e.target.value)} error={sbErr} />
            <p className="text-[0.8125rem] text-ink-3">Se guardan solo en este dispositivo y no se incluyen en las copias de seguridad.</p>
            <Button type="submit" variant="primary" className="self-start" disabled={!token.trim() || !secret.trim() || connecting} icon={connecting ? <Loader2 className="size-4 animate-spin" /> : undefined}>
              Conectar y buscar sensores
            </Button>
          </form>
        )}
        {connected && (
          <>
            <p className="text-sm text-ink-2">Marca qué sensores están dentro de casa y, si tienes uno fuera, cuál es el exterior.</p>
            <ul className="flex flex-col gap-2">
              {c.devices.map((d) => {
                const r = latest.get(d.id);
                const indoor = c.indoorIds.includes(d.id);
                const outdoor = c.outdoorId === d.id;
                return (
                  <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-3 py-2.5 ring-1 ring-line">
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 font-semibold">{d.name}</span>
                      <span className="block text-sm text-ink-2">
                        {TYPE_LABEL(d.type)}
                        {r && ` · ${decimalToInput(r.temperature)} °C${r.humidity != null ? ` · ${r.humidity} %` : ''}`}
                      </span>
                    </span>
                    <span className="flex gap-1.5">
                      {[
                        { on: indoor, label: 'Interior', fn: () => toggleIndoor(d.id) },
                        { on: outdoor, label: 'Exterior', fn: () => setOutdoor(d.id) },
                      ].map((b) => (
                        <button
                          key={b.label}
                          type="button"
                          aria-pressed={b.on}
                          onClick={b.fn}
                          className={cx(
                            'flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold ring-1 ring-inset transition-[transform,background-color,color] duration-150 active:scale-95',
                            b.on ? 'bg-olive-soft text-olive-strong ring-olive/30' : 'text-ink-2 ring-line hover:bg-sand-soft',
                          )}
                        >
                          {b.on && <Check className="size-3.5" aria-hidden />}
                          {b.label}
                        </button>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>

            <PlugSettings />

            <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-sand-soft/60 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Bell className="size-4 text-olive" aria-hidden /> Aviso de arranque de la caldera
              </p>
              {backgroundAvailable() ? (
                <>
                  <p className="text-sm text-ink-2">
                    Con la app cerrada, el móvil lee los sensores cada 15 minutos y te avisa cuando la casa empieza a subir de temperatura.
                  </p>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={c.notifyHeating}
                    onClick={() => void toggleNotify()}
                    className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3.5 py-3 text-left ring-1 ring-line transition-transform duration-150 active:scale-[0.99]"
                  >
                    <span className="font-semibold">Notificarme en el móvil</span>
                    <span className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200', c.notifyHeating ? 'bg-olive' : 'bg-line')}>
                      <span className={cx('absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow-soft transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]', c.notifyHeating && 'translate-x-5')} />
                    </span>
                  </button>
                  {c.notifyHeating && (
                    <Button size="sm" className="self-start" icon={<BellRing className="size-4" />} onClick={() => void testNotification()}>
                      Enviar aviso de prueba
                    </Button>
                  )}
                </>
              ) : (
                <p className="text-sm text-ink-2">Disponible en la app Android: allí se leen los sensores con la app cerrada y llegan las notificaciones.</p>
              )}
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-semibold">Sensibilidad</p>
                <Segmented
                  size="sm"
                  label="Sensibilidad de detección"
                  value={c.heatSensitivity}
                  onChange={(v) => updateClimateSettings({ heatSensitivity: v })}
                  options={[
                    { value: 'alta', label: 'Alta' },
                    { value: 'media', label: 'Media' },
                    { value: 'baja', label: 'Baja' },
                  ]}
                />
                <p className="text-[0.8125rem] text-ink-3">
                  {c.heatSensitivity === 'alta'
                    ? 'Avisa con subidas de 0,3 °C/h: detecta antes, pero con más falsos avisos.'
                    : c.heatSensitivity === 'media'
                      ? 'Avisa con subidas de 0,5 °C/h. Recomendado.'
                      : 'Avisa solo con subidas de 0,8 °C/h: menos avisos, alguno puede escaparse.'}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
