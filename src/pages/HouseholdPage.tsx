import type { PageProps } from '../app/App';
import { HouseholdCard } from '../features/sync/HouseholdCard';
import { PageHeader } from '../ui/primitives';

export function HouseholdPage(_: PageProps) {
  return (
    <>
      <PageHeader title="Hogar" description="Comparte los datos con quien viva contigo: compras, recargas, nivel, consumo y precios, en todos los móviles a la vez." />
      <div className="max-w-2xl">
        <HouseholdCard />
      </div>
    </>
  );
}
