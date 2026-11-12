import { BarChart3, BadgeEuro, Flame, History, House, Package, Settings, ShoppingBag, Thermometer, Users, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

export type Route = 'inicio' | 'inventario' | 'compras' | 'consumo' | 'precios' | 'clima' | 'hogar' | 'estadisticas' | 'historial' | 'configuracion';

export const ROUTES: { id: Route; label: string; icon: LucideIcon }[] = [
  { id: 'inicio', label: 'Inicio', icon: House },
  { id: 'inventario', label: 'Inventario', icon: Package },
  { id: 'compras', label: 'Compras', icon: ShoppingBag },
  { id: 'consumo', label: 'Consumo', icon: Flame },
  { id: 'precios', label: 'Precios', icon: BadgeEuro },
  { id: 'clima', label: 'Clima', icon: Thermometer },
  { id: 'hogar', label: 'Hogar', icon: Users },
  { id: 'estadisticas', label: 'Estadísticas', icon: BarChart3 },
  { id: 'historial', label: 'Historial', icon: History },
  { id: 'configuracion', label: 'Configuración', icon: Settings },
];

function read(): Route {
  const h = window.location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.some((r) => r.id === h) ? h : 'inicio';
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [route, (r) => (window.location.hash = `/${r}`)];
}
