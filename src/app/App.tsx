import { CircleAlert, LayoutGrid, Loader2, Plus, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { RecordDialogsProvider, useRecordActions } from '../features/records/RecordDialogs';
import { ConsumptionPage } from '../pages/ConsumptionPage';
import { DashboardPage } from '../pages/DashboardPage';
import { HistoryPage } from '../pages/HistoryPage';
import { InventoryPage } from '../pages/InventoryPage';
import { MarketPage } from '../pages/MarketPage';
import { ClimatePage } from '../pages/ClimatePage';
import { HouseholdPage } from '../pages/HouseholdPage';
import { ClimateSyncProvider } from '../features/climate/ClimateSync';
import { SyncBadge } from '../features/sync/SyncBadge';
import { SyncProvider } from '../features/sync/SyncProvider';
import { WidgetBridge } from '../features/widget/WidgetBridge';
import { CalendarBridge } from '../features/calendar/CalendarBridge';
import { PurchasesPage } from '../pages/PurchasesPage';
import { SettingsPage } from '../pages/SettingsPage';
import { StatsPage } from '../pages/StatsPage';
import { StoreProvider, useStore } from '../store/store';
import { Dialog } from '../ui/Dialog';
import { cx } from '../ui/primitives';
import { haptic } from '../ui/haptics';
import { ToastProvider } from '../ui/Toast';
import { ROUTES, useRoute, type Route } from './router';
import { BackButtonHandler } from '../features/back/BackButton';
import { WhatsNew } from '../features/settings/WhatsNew';
import { checkUpdateQuietly } from '../data/update';
import { useEffect } from 'react';

function Logo({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="9" fill={light ? '#e3e7cb' : '#2c3a29'} />
        <path d="M16 6c4 5 7 8.5 7 12.5A7 7 0 0 1 9 18.5C9 14.5 12 11 16 6Z" fill={light ? '#55622a' : '#a9b86a'} />
        <rect x="13" y="16" width="6" height="9" rx="3" fill={light ? '#fffdf8' : '#e9dfc9'} />
      </svg>
      <span className={cx('text-[1.0625rem] font-bold tracking-[-0.02em]', light ? 'text-paper' : 'text-ink')}>Pellet Control</span>
    </div>
  );
}

function Sidebar({ route, go }: { route: Route; go: (r: Route) => void }) {
  const { data } = useStore();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-forest px-4 py-6 text-paper lg:flex">
      <div className="px-2">
        <Logo light />
      </div>
      <nav aria-label="Secciones" className="mt-10 flex flex-col gap-1">
        {ROUTES.map((r) => {
          const Icon = r.icon;
          const active = r.id === route;
          return (
            <a
              key={r.id}
              href={`#/${r.id}`}
              onClick={(e) => {
                e.preventDefault();
                go(r.id);
              }}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'flex h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-semibold transition-colors duration-150',
                active ? 'bg-paper/12 text-paper' : 'text-paper/70 hover:bg-paper/6 hover:text-paper',
              )}
            >
              <Icon className={cx('size-[1.125rem]', active && 'text-[#c5d28e]')} aria-hidden />
              {r.label}
            </a>
          );
        })}
      </nav>
      <div className="mt-auto rounded-2xl bg-paper/6 p-4 text-[0.8125rem] text-paper/75">
        <p className="font-semibold text-paper">{data.settings.boilerModel}</p>
        <p className="mt-0.5">
          Tolva de {data.settings.hopperCapacityKg ? `${data.settings.hopperCapacityKg} kg` : 'capacidad sin configurar'}
        </p>
        <SyncBadge withLabel light className="mt-2" />
      </div>
    </aside>
  );
}

/** Barra inferior: dos secciones, botón +, una sección y «Más» (cinco huecos iguales, + en el centro). */
const MOBILE_MAIN: Route[] = ['inicio', 'clima', 'precios'];

function NavTab({ active, label, icon: Icon, onClick, popup }: { active: boolean; label: string; icon: LucideIcon; onClick: () => void; popup?: boolean }
) {
  return (
    <button
      onClick={() => {
        haptic.tap();
        onClick();
      }}
      aria-current={active && !popup ? 'page' : undefined}
      aria-haspopup={popup ? 'dialog' : undefined}
      className={cx(
        'group flex flex-col items-center justify-center gap-1 text-[0.6875rem] font-semibold transition-colors duration-200 select-none',
        active ? 'text-forest' : 'text-ink-3',
      )}
    >
      <span className="relative grid h-8 w-14 place-items-center">
        {/* Indicador de sección activa: se expande desde el centro */}
        <span
          aria-hidden
          className={cx(
            'absolute inset-0 rounded-full bg-olive-soft transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
            active ? 'scale-x-100 opacity-100' : 'scale-x-50 opacity-0',
          )}
        />
        <Icon
          className="relative size-5 transition-transform duration-150 group-active:scale-90"
          strokeWidth={active ? 2.25 : 2}
          aria-hidden
        />
      </span>
      {label}
    </button>
  );
}

function MobileNav({ route, go }: { route: Route; go: (r: Route) => void }) {
  const { openAdd } = useRecordActions();
  const [more, setMore] = useState(false);
  // En el orden de MOBILE_MAIN (no en el del menú lateral).
  const items = MOBILE_MAIN.map((id) => ROUTES.find((r) => r.id === id)!);
  const moreActive = !MOBILE_MAIN.includes(route);

  return (
    <>
      <nav
        aria-label="Secciones"
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 rounded-[1.75rem] bg-surface/95 shadow-[0_8px_30px_-8px_rgb(38_42_37/0.28)] ring-1 ring-line/80 backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto grid h-[4.25rem] max-w-lg grid-cols-5 items-center px-1">
          <NavTab active={route === items[0].id} label={items[0].label} icon={items[0].icon} onClick={() => go(items[0].id)} />
          <NavTab active={route === items[1].id} label={items[1].label} icon={items[1].icon} onClick={() => go(items[1].id)} />
          <div className="flex justify-center">
            <button
              onClick={() => {
                haptic.press();
                openAdd();
              }}
              aria-label="Añadir movimiento"
              className="grid size-[3.25rem] place-items-center rounded-[1.1rem] bg-forest text-paper shadow-[0_6px_16px_-6px_rgb(44_58_41/0.6)] transition-[transform,background-color] duration-150 ease-out hover:bg-forest-2 active:scale-90 active:duration-75"
            >
              <Plus className="size-6" strokeWidth={2.5} />
            </button>
          </div>
          <NavTab active={route === items[2].id} label={items[2].label} icon={items[2].icon} onClick={() => go(items[2].id)} />
          <NavTab active={moreActive} label="Más" icon={LayoutGrid} onClick={() => setMore(true)} popup />
        </div>
      </nav>
      <Dialog open={more} onClose={() => setMore(false)} title="Más secciones">
        <div className="grid grid-cols-2 gap-2">
          {ROUTES.filter((r) => !MOBILE_MAIN.includes(r.id)).map((r) => (
            <button
              key={r.id}
              onClick={() => {
                haptic.tap();
                setMore(false);
                go(r.id);
              }}
              className={cx(
                'flex h-20 flex-col items-start justify-between rounded-2xl p-3.5 text-left font-semibold ring-1 ring-inset transition-[transform,background-color] duration-150 active:scale-[0.97]',
                route === r.id ? 'bg-olive-soft text-forest ring-olive/25' : 'bg-surface ring-line hover:bg-sand-soft',
              )}
            >
              <r.icon className="size-5 text-olive" aria-hidden />
              {r.label}
            </button>
          ))}
        </div>
      </Dialog>
    </>
  );
}

function Shell() {
  const [route, go] = useRoute();
  // Al abrir (y al volver a la app) se mira si hay versión nueva; la función ya limita la frecuencia.
  useEffect(() => {
    void checkUpdateQuietly();
    const on = () => document.visibilityState === 'visible' && void checkUpdateQuietly();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  const Page = {
    inicio: DashboardPage,
    inventario: InventoryPage,
    compras: PurchasesPage,
    consumo: ConsumptionPage,
    precios: MarketPage,
    clima: ClimatePage,
    hogar: HouseholdPage,
    estadisticas: StatsPage,
    historial: HistoryPage,
    configuracion: SettingsPage,
  }[route];
  return (
    <div className="min-h-dvh">
      <Sidebar route={route} go={go} />
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line/70 bg-paper/90 px-4 backdrop-blur lg:hidden">
          <Logo />
          <button onClick={() => go('hogar')} aria-label="Estado del hogar compartido" className="-mr-2 rounded-xl p-2 transition-transform active:scale-90">
            <SyncBadge />
          </button>
        </header>
        <main key={route} className="page-in mx-auto max-w-[1180px] px-4 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 lg:pt-10 lg:pb-16">
          <Page go={go} />
        </main>
      </div>
      <MobileNav route={route} go={go} />
      <BackButtonHandler route={route} go={go} />
      <WhatsNew />
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <StoreProvider
        fallback={(s) => (
          <div className="grid min-h-dvh place-items-center p-6">
            {s.state === 'error' ? (
              <div className="max-w-sm text-center">
                <CircleAlert className="mx-auto size-8 text-rust" />
                <p className="mt-3 font-semibold">No se pudieron cargar tus datos</p>
                <p className="mt-1 text-sm text-ink-2">{s.message}</p>
              </div>
            ) : (
              <Loader2 className="size-6 animate-spin text-olive" aria-label="Cargando" />
            )}
          </div>
        )}
      >
        <SyncProvider>
          <ClimateSyncProvider>
            <RecordDialogsProvider>
              <WidgetBridge />
              <CalendarBridge />
              <Shell />
            </RecordDialogsProvider>
          </ClimateSyncProvider>
        </SyncProvider>
      </StoreProvider>
    </ToastProvider>
  );
}

export type PageProps = { go: (r: Route) => void };
