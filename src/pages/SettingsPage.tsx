import { Download, RotateCcw, Upload, X } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import type { PageProps } from '../app/App';
import { ClimateSettingsCard } from '../features/climate/ClimateSettingsCard';
import { useSync } from '../features/sync/SyncProvider';
import { ExportExcelButton } from '../features/export/ExportExcelButton';
import { saveFile } from '../data/files';
import { HopperStatus } from '../features/hopper/HopperStatus';
import { HapticsSetting } from '../features/settings/HapticsSetting';
import { UpdateCard } from '../features/settings/UpdateCard';
import { openNavEditor } from '../features/nav/NavEditor';
import { CalendarSettings } from '../features/calendar/CalendarSettings';
import { exportData, parseImport } from '../data/repository';
import { isValidIso, todayIso } from '../domain/dates';
import { useStore } from '../store/store';
import { ConfirmDialog } from '../ui/Dialog';
import { decimalToInput, parseDecimal, TextInput } from '../ui/fields';
import { Button, Card, PageHeader, SectionTitle } from '../ui/primitives';
import { useToast } from '../ui/Toast';

export function SettingsPage(_: PageProps) {
  const { data, updateSettings, replaceData, resetData } = useStore();
  const toast = useToast();
  const s = data.settings;
  const [f, setF] = useState({
    boilerModel: s.boilerModel,
    hopperCapacityKg: decimalToInput(s.hopperCapacityKg),
    bagWeightKg: decimalToInput(s.bagWeightKg),
    usualPricePerBag: decimalToInput(s.usualPricePerBag),
    seasonBudget: decimalToInput(s.seasonBudget),
    monthlyBudget: decimalToInput(s.monthlyBudget),
    seasonStart: s.seasonStart,
    seasonEnd: s.seasonEnd,
  });
  const [brands, setBrands] = useState<string[]>(s.brands);
  const [newBrand, setNewBrand] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const sync = useSync();
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  function save(e: FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    const optional = (v: string, key: string, label: string) => {
      if (v.trim() === '') return null;
      const n = parseDecimal(v);
      if (!Number.isFinite(n) || n <= 0) {
        err[key] = label;
        return null;
      }
      return n;
    };
    const required = (v: string, key: string, label: string) => {
      const n = parseDecimal(v);
      if (!Number.isFinite(n) || n <= 0) {
        err[key] = label;
        return 0;
      }
      return n;
    };
    if (!f.boilerModel.trim()) err.boilerModel = 'Indica el modelo de la caldera.';
    const cap = optional(f.hopperCapacityKg, 'hopperCapacityKg', 'Indica la capacidad en kg o déjalo vacío.');
    const bag = required(f.bagWeightKg, 'bagWeightKg', 'Indica el peso del saco en kg.');
    const price = required(f.usualPricePerBag, 'usualPricePerBag', 'Indica el precio habitual.');
    const sb = optional(f.seasonBudget, 'seasonBudget', 'Indica un importe o déjalo vacío.');
    const mb = optional(f.monthlyBudget, 'monthlyBudget', 'Indica un importe o déjalo vacío.');
    if (!isValidIso(f.seasonStart)) err.seasonStart = 'Fecha no válida.';
    if (!isValidIso(f.seasonEnd)) err.seasonEnd = 'Fecha no válida.';
    else if (f.seasonEnd <= f.seasonStart) err.seasonEnd = 'Debe ser posterior al inicio.';
    setErrors(err);
    if (Object.keys(err).length) {
      toast.show({ tone: 'error', title: 'Revisa los campos marcados' });
      return;
    }
    updateSettings({
      boilerModel: f.boilerModel.trim(),
      hopperCapacityKg: cap,
      bagWeightKg: bag,
      usualPricePerBag: price,
      seasonBudget: sb,
      monthlyBudget: mb,
      seasonStart: f.seasonStart,
      seasonEnd: f.seasonEnd,
      brands,
    });
    toast.show({ title: 'Configuración guardada' });
  }

  async function download() {
    try {
      await saveFile(new Blob([exportData(data)], { type: 'application/json' }), `pellet-control-${todayIso()}.json`, 'Copia de seguridad');
    } catch {
      toast.show({ tone: 'error', title: 'No se pudo guardar la copia' });
    }
  }

  async function importFile(file: File) {
    try {
      const d = parseImport(await file.text());
      // Las copias no llevan las credenciales de SwitchBot: se conservan las de este dispositivo.
      d.settings.climate = {
        ...d.settings.climate,
        switchbotToken: data.settings.climate.switchbotToken,
        switchbotSecret: data.settings.climate.switchbotSecret,
      };
      replaceData(d);
      toast.show({ title: 'Copia restaurada', body: `${d.records.length} registros importados.` });
    } catch (e) {
      toast.show({ tone: 'error', title: 'No se pudo importar', body: e instanceof Error ? e.message : 'Archivo no válido.' });
    }
  }

  return (
    <>
      <PageHeader title="Configuración" description="Datos de tu instalación. Los cambios en el peso del saco recalculan los kilos disponibles." />
      <form onSubmit={save} noValidate className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle>Instalación</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Modelo de caldera" value={f.boilerModel} onChange={set('boilerModel')} error={errors.boilerModel} className="sm:col-span-2" />
            <TextInput
              label="Capacidad de la tolva"
              inputMode="decimal"
              suffix="kg"
              value={f.hopperCapacityKg}
              onChange={set('hopperCapacityKg')}
              error={errors.hopperCapacityKg}
              hint="Necesaria para calcular consumo por nivel."
            />
            <TextInput label="Peso de cada saco" inputMode="decimal" suffix="kg" value={f.bagWeightKg} onChange={set('bagWeightKg')} error={errors.bagWeightKg} />
          </div>

          <SectionTitle>
            <span className="mt-8 block">Compras</span>
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Precio habitual por saco" inputMode="decimal" suffix="€" value={f.usualPricePerBag} onChange={set('usualPricePerBag')} error={errors.usualPricePerBag} />
            <div className="flex flex-col gap-1.5">
              <TextInput
                label="Marcas habituales"
                placeholder="Añadir marca y pulsar Intro"
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const b = newBrand.trim();
                    if (b && !brands.includes(b)) setBrands([...brands, b]);
                    setNewBrand('');
                  }
                }}
              />
              <div className="flex flex-wrap gap-1.5">
                {brands.map((b) => (
                  <span key={b} className="inline-flex items-center gap-1 rounded-full bg-olive-soft py-1 pr-1 pl-3 text-sm font-semibold text-olive-strong">
                    {b}
                    <button type="button" aria-label={`Quitar ${b}`} onClick={() => setBrands(brands.filter((x) => x !== b))} className="rounded-full p-0.5 hover:bg-olive/15">
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <SectionTitle>
            <span className="mt-8 block">Temporada y objetivos</span>
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Inicio de temporada" type="date" value={f.seasonStart} onChange={set('seasonStart')} error={errors.seasonStart} />
            <TextInput label="Fin de temporada" type="date" value={f.seasonEnd} onChange={set('seasonEnd')} error={errors.seasonEnd} hint="Se usa para la proyección de gasto." />
            <TextInput label="Objetivo de gasto por temporada" inputMode="decimal" suffix="€" placeholder="Sin objetivo" value={f.seasonBudget} onChange={set('seasonBudget')} error={errors.seasonBudget} />
            <TextInput label="Objetivo de gasto mensual" inputMode="decimal" suffix="€" placeholder="Sin objetivo" value={f.monthlyBudget} onChange={set('monthlyBudget')} error={errors.monthlyBudget} />
          </div>
          <div className="mt-8 flex justify-end">
            <Button type="submit" variant="primary">
              Guardar configuración
            </Button>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <HopperStatus />
          </Card>
          <Card>
            <CalendarSettings />
          </Card>
          <Card>
            <HapticsSetting />
          </Card>
          <Card>
            <SectionTitle>Menú</SectionTitle>
            <p className="text-sm text-ink-2">Elige qué tres secciones van en la barra de abajo y en qué orden salen las demás en «Más».</p>
            <Button size="sm" onClick={openNavEditor} className="mt-3">
              Personalizar el menú
            </Button>
          </Card>
          <Card>
            <UpdateCard />
          </Card>
          <Card>
            <SectionTitle>Tus datos</SectionTitle>
            <p className="text-sm text-ink-2">Se guardan en este navegador. Descarga una copia de vez en cuando o para pasarlos a otro dispositivo.</p>
            <div className="mt-4 flex flex-col gap-2">
              <ExportExcelButton />
              <Button icon={<Download className="size-4" />} onClick={() => void download()}>
                Descargar copia
              </Button>
              <Button icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
                Restaurar copia
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importFile(file);
                  e.target.value = '';
                }}
              />
              <Button
                variant="ghost"
                icon={<RotateCcw className="size-4" />}
                onClick={() => setConfirmReset(true)}
                disabled={!!sync.config}
                title={sync.config ? 'Sal del hogar compartido para reiniciar: si no, se borrarían los datos de todos.' : undefined}
                className="text-rust hover:text-rust"
              >
                Borrar todos los datos
              </Button>
            </div>
          </Card>
        </div>
      </form>
      <div className="mt-4 max-w-2xl">
        <ClimateSettingsCard />
      </div>
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="¿Borrar todos los datos?"
        body="Se borrarán todos los registros y la configuración de este dispositivo y la app volverá a empezar de cero. Descarga antes una copia si quieres conservarlos."
        confirmLabel="Borrar y reiniciar"
        onConfirm={() => {
          resetData();
          window.setTimeout(() => window.location.reload(), 60);
        }}
      />
    </>
  );
}
