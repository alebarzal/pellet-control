import { Globe, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { FetchError, fetchPage } from '../../data/web';
import { CERT_LABEL, emptyQuality, labelReport, parseLabelText, parseProductPage, storeFromUrl, type LabelField, type LabelReportItem, type ParsedProduct } from '../../domain/market';
import { LabelReport } from './LabelReport';
import { PhotoImport } from './PhotoImport';
import { fmtEur } from '../../domain/format';
import type { Certification, MarketProduct, PriceObservation, QualitySpec } from '../../domain/types';
import { useStore } from '../../store/store';
import { decimalToInput, parseDecimal, SelectInput, TextArea, TextInput, type FieldMark } from '../../ui/fields';
import { Button } from '../../ui/primitives';

const CERTS: Certification[] = ['enplus-a1', 'dinplus', 'enplus-a2', 'iso-a1', 'none', 'unknown'];

export function ProductForm({
  initial,
  initialUrl = '',
  mode,
  onDone,
}: {
  initial?: MarketProduct;
  initialUrl?: string;
  /** «store»: saco visto en una tienda física. Se empieza por la foto y no se pide enlace. */
  mode?: 'store';
  onDone: (saved: MarketProduct | null) => void;
}) {
  const { data, addProduct, patchProduct } = useStore();
  const q0 = initial?.quality ?? emptyQuality();
  const [url, setUrl] = useState(initial?.url ?? initialUrl);
  const [name, setName] = useState(initial?.name ?? '');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [store, setStore] = useState(initial?.store ?? (initialUrl ? storeFromUrl(initialUrl) : ''));
  const [weight, setWeight] = useState(decimalToInput(initial?.bagWeightKg ?? data.settings.bagWeightKg));
  const [price, setPrice] = useState('');
  const [cert, setCert] = useState<Certification>(q0.certification);
  const [ash, setAsh] = useState(decimalToInput(q0.ashPct));
  const [moist, setMoist] = useState(decimalToInput(q0.moisturePct));
  const [ncv, setNcv] = useState(decimalToInput(q0.ncvKwhKg));
  const [dur, setDur] = useState(decimalToInput(q0.durabilityPct));
  const [dia, setDia] = useState(decimalToInput(q0.diameterMm));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<string | null>(initial?.photo ?? null);
  const [report, setReport] = useState<LabelReportItem[] | null>(null);
  const [reading, setReading] = useState(false);
  const [readResult, setReadResult] = useState<{ ok: boolean; text: string; parsed?: ParsedProduct } | null>(null);

  async function read() {
    setReading(true);
    setReadResult(null);
    try {
      const html = await fetchPage(url.trim());
      const p = parseProductPage(html);
      if (p.name) setName(p.name);
      const known = data.settings.brands.find((b) => (p.name ?? '').toLowerCase().includes(b.toLowerCase()));
      if (p.brand) setBrand(p.brand);
      else if (known) setBrand(known);
      if (!store) setStore(storeFromUrl(url));
      if (p.weightKg) setWeight(decimalToInput(p.weightKg));
      if (p.price != null && !initial) setPrice(decimalToInput(p.price));
      const q = p.quality;
      if (q.certification) setCert(q.certification);
      if (q.ashPct != null) setAsh(decimalToInput(q.ashPct));
      if (q.moisturePct != null) setMoist(decimalToInput(q.moisturePct));
      if (q.ncvKwhKg != null) setNcv(decimalToInput(q.ncvKwhKg));
      if (q.durabilityPct != null) setDur(decimalToInput(q.durabilityPct));
      if (q.diameterMm != null) setDia(decimalToInput(q.diameterMm));
      const found = [
        p.price != null && `precio ${fmtEur(p.price)}`,
        p.weightKg && `${p.weightKg} kg`,
        q.certification && CERT_LABEL[q.certification],
        q.ashPct != null && `cenizas ${decimalToInput(q.ashPct)} %`,
        q.moisturePct != null && `humedad ${decimalToInput(q.moisturePct)} %`,
      ].filter(Boolean);
      setReadResult(
        p.price != null
          ? { ok: true, text: `Leído: ${found.join(' · ')}. Revisa los datos antes de guardar.`, parsed: p }
          : { ok: false, text: 'La página no publica el precio en un formato legible. Anótalo a mano.', parsed: p },
      );
    } catch (e) {
      setReadResult({ ok: false, text: e instanceof FetchError ? e.message : 'No se pudo leer la página.' });
    } finally {
      setReading(false);
    }
  }

  /** Rellena la ficha con lo que se haya leído en la foto (solo lo que aparezca; no pisa con vacíos). */
  function fromPhoto(text: string) {
    const d = parseLabelText(text, data.settings.brands);
    if (d.name && !name.trim()) setName(d.name);
    if (d.brand) setBrand(d.brand);
    if (d.weightKg) setWeight(decimalToInput(d.weightKg));
    if (d.price != null && !initial) setPrice(decimalToInput(d.price));
    const q = d.quality;
    if (q.certification) setCert(q.certification);
    if (q.ashPct != null) setAsh(decimalToInput(q.ashPct));
    if (q.moisturePct != null) setMoist(decimalToInput(q.moisturePct));
    if (q.ncvKwhKg != null) setNcv(decimalToInput(q.ncvKwhKg));
    if (q.durabilityPct != null) setDur(decimalToInput(q.durabilityPct));
    if (q.diameterMm != null) setDia(decimalToInput(q.diameterMm));
    if (d.store && !store.trim()) setStore(d.store);
    setReport(labelReport(d));
  }

  /** Marca de un campo después de leer una foto: leído (revisar) o sin leer (poner a mano). */
  const mk = (key: LabelField, value: string, check = false): { mark?: FieldMark; hint?: string } => {
    const it = report?.find((r) => r.key === key);
    if (!it) return {};
    if (it.value != null) return { mark: 'found', hint: 'Leído en la foto' };
    if (check) return { mark: 'missing', hint: 'No leído: compruébalo' };
    if (value.trim() !== '') return {};
    return { mark: 'missing', hint: it.required ? 'Ponlo a mano' : 'A mano, si lo sabes' };
  };
  const stores = [...new Set(data.market.filter((p) => !p.url && p.store.trim()).map((p) => p.store.trim()))];

  function opt(v: string, key: string, min: number, max: number, e: Record<string, string>, msg: string) {
    if (v.trim() === '') return null;
    const n = parseDecimal(v);
    if (!Number.isFinite(n) || n < min || n > max) {
      e[key] = msg;
      return null;
    }
    return n;
  }

  function submit(ev: FormEvent) {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Pon un nombre para reconocer el producto.';
    if (url.trim() && !/^https?:\/\/\S+$/.test(url.trim())) e.url = 'El enlace debe empezar por http:// o https://';
    const w = parseDecimal(weight);
    if (!Number.isFinite(w) || w <= 0) e.weight = 'Indica el peso del formato en kg.';
    const pr = opt(price, 'price', 0.01, 10000, e, 'Indica el precio en €.');
    if (!initial && pr == null && !e.price) e.price = 'Indica el precio (o léelo de la tienda).';
    const quality: QualitySpec = {
      certification: cert,
      ashPct: opt(ash, 'ash', 0.01, 10, e, 'Entre 0 y 10 %.'),
      moisturePct: opt(moist, 'moist', 0.1, 25, e, 'Entre 0 y 25 %.'),
      ncvKwhKg: opt(ncv, 'ncv', 3, 6, e, 'Entre 3 y 6 kWh/kg.'),
      durabilityPct: opt(dur, 'dur', 80, 100, e, 'Entre 80 y 100 %.'),
      diameterMm: opt(dia, 'dia', 4, 12, e, 'Entre 4 y 12 mm.'),
    };
    setErrors(e);
    if (Object.keys(e).length) return;

    const base = {
      name: name.trim(),
      brand: brand.trim(),
      store: store.trim(),
      url: url.trim(),
      bagWeightKg: w,
      quality,
      notes: notes.trim(),
      photo,
    };
    if (initial) {
      patchProduct(initial.id, (p) => ({ ...p, ...base }));
      onDone({ ...initial, ...base });
      return;
    }
    const now = new Date().toISOString();
    const fromOnline = readResult?.ok && readResult.parsed?.price === pr;
    const obs: PriceObservation = {
      at: now,
      price: pr!,
      source: fromOnline ? 'online' : 'manual',
      available: fromOnline ? (readResult?.parsed?.available ?? null) : null,
    };
    onDone(
      addProduct({
        ...base,
        prices: [obs],
        lastCheck: fromOnline ? { at: now, ok: true, message: 'Precio leído de la tienda' } : null,
      }),
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <PhotoImport photo={photo} onPhoto={setPhoto} onText={fromPhoto} autoOpen={mode === 'store'} />
      {report && <LabelReport items={report} />}
      {mode !== 'store' && <div className="flex flex-col gap-2">
        <TextInput
          label="Enlace del producto en la tienda"
          type="url"
          inputMode="url"
          placeholder="https://…"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (!store) setStore(storeFromUrl(e.target.value));
          }}
          error={errors.url}
          hint="Pega la ficha del saco o pack. Si lo compras en una tienda que no lo tiene en su web, déjalo vacío y anota el precio a mano."
        />
        <Button
          size="sm"
          className="self-start"
          disabled={!/^https?:\/\/\S+$/.test(url.trim()) || reading}
          icon={reading ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
          onClick={read}
        >
          {reading ? 'Leyendo la tienda…' : 'Leer datos de la tienda'}
        </Button>
        {readResult && (
          <p className={`rounded-xl px-3 py-2.5 text-[0.8125rem] ${readResult.ok ? 'bg-olive-soft text-olive-strong' : 'bg-amber-soft text-amber'}`}>
            {readResult.text}
          </p>
        )}
      </div>}

      <TextInput label="Producto" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Saco pellet 15 kg" {...mk('name', name)} />
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Marca" list="pc-brands" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Opcional" {...mk('brand', brand)} />
        <datalist id="pc-brands">
          {data.settings.brands.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
        <datalist id="pc-stores">
          {stores.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <TextInput label="Tienda" list="pc-stores" value={store} onChange={(e) => setStore(e.target.value)} placeholder={mode === 'store' ? 'Dónde lo has visto' : 'Opcional'} {...mk('store', store)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Peso del formato" inputMode="decimal" suffix="kg" value={weight} onChange={(e) => setWeight(e.target.value)} error={errors.weight} hint="Saco, pack o palé" {...mk('weight', weight, true)} />
        {!initial && <TextInput label="Precio del formato" inputMode="decimal" suffix="€" value={price} onChange={(e) => setPrice(e.target.value)} error={errors.price} {...mk('price', price)} />}
      </div>

      <div role="group" aria-labelledby="pc-quality" className="flex flex-col gap-3 rounded-2xl bg-sand-soft/60 p-4">
        <p id="pc-quality" className="text-sm font-bold">Calidad</p>
        <SelectInput label="Certificación" value={cert} onChange={(e) => setCert(e.target.value as Certification)} {...mk('cert', cert === 'unknown' ? '' : cert)}>
          {CERTS.map((c) => (
            <option key={c} value={c}>
              {CERT_LABEL[c]}
            </option>
          ))}
        </SelectInput>
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Cenizas" inputMode="decimal" suffix="%" placeholder="—" value={ash} onChange={(e) => setAsh(e.target.value)} error={errors.ash} {...mk('ash', ash)} />
          <TextInput label="Humedad" inputMode="decimal" suffix="%" placeholder="—" value={moist} onChange={(e) => setMoist(e.target.value)} error={errors.moist} {...mk('moist', moist)} />
          <TextInput label="Poder calorífico" inputMode="decimal" suffix="kWh/kg" placeholder="—" value={ncv} onChange={(e) => setNcv(e.target.value)} error={errors.ncv} {...mk('ncv', ncv)} />
          <TextInput label="Durabilidad" inputMode="decimal" suffix="%" placeholder="—" value={dur} onChange={(e) => setDur(e.target.value)} error={errors.dur} {...mk('dur', dur)} />
          <TextInput label="Diámetro" inputMode="decimal" suffix="mm" placeholder="—" value={dia} onChange={(e) => setDia(e.target.value)} error={errors.dia} {...mk('dia', dia)} />
        </div>
        <p className="text-[0.8125rem] text-ink-3">Deja en blanco lo que no publique el fabricante. No se inventa ningún dato.</p>
      </div>

      <TextArea label="Observaciones" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />

      <div className="mt-1 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onDone(null)}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary">
          {initial ? 'Guardar cambios' : mode === 'store' ? 'Guardar saco' : 'Seguir este producto'}
        </Button>
      </div>
    </form>
  );
}
