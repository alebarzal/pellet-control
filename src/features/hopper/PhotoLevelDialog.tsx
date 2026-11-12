import { Capacitor } from '@capacitor/core';
import { Camera as NativeCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Camera, ImageUp } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { fmtKg } from '../../domain/format';
import { DEFAULT_MARKS, photoPercent } from '../../domain/photoLevel';
import { useStore } from '../../store/store';
import { Dialog } from '../../ui/Dialog';
import { haptic } from '../../ui/haptics';
import { Button, cx, Segmented } from '../../ui/primitives';

type Mark = 'full' | 'surface' | 'empty';
type Marks = Record<Mark, number>;

const KEY = 'pellet-control:photo-marks';
const MARK_STYLE: Record<Mark, { label: string; line: string; tag: string }> = {
  full: { label: 'Llena', line: 'bg-olive', tag: 'bg-olive text-paper' },
  surface: { label: 'Pellet', line: 'bg-amber', tag: 'bg-amber text-ink' },
  empty: { label: 'Fondo', line: 'bg-rust', tag: 'bg-rust text-paper' },
};

function loadMarks(): Marks {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const m = JSON.parse(raw) as Partial<Marks>;
      if (typeof m.full === 'number' && typeof m.empty === 'number') return { full: m.full, empty: m.empty, surface: (m.full + m.empty) / 2 };
    }
  } catch {
    /* sin almacenamiento */
  }
  return { ...DEFAULT_MARKS };
}

function saveMarks(m: Marks) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ full: m.full, empty: m.empty }));
  } catch {
    /* sin almacenamiento */
  }
}

/**
 * Mide el nivel de la tolva con una foto: se marcan la altura de la tolva llena, el fondo y dónde llega el pellet.
 * Las marcas de llena y fondo se recuerdan para la próxima vez (basta con un toque si la foto se hace igual).
 * La foto no se guarda: solo el porcentaje.
 */
export function PhotoLevelDialog({ open, onClose, onResult }: { open: boolean; onClose: () => void; onResult: (percent: number) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Nivel con foto" description="Haz una foto de la tolva abierta, desde arriba o de frente, y marca hasta dónde llega el pellet.">
      {open && <PhotoLevel onClose={onClose} onResult={onResult} />}
    </Dialog>
  );
}

function PhotoLevel({ onClose, onResult }: { onClose: () => void; onResult: (percent: number) => void }) {
  const { data } = useStore();
  const cap = data.settings.hopperCapacityKg;
  const [url, setUrl] = useState<string | null>(null);
  const [marks, setMarks] = useState<Marks>(loadMarks);
  const [active, setActive] = useState<Mark>('surface');
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const [err, setErr] = useState('');
  useEffect(() => () => void (url?.startsWith('blob:') && URL.revokeObjectURL(url)), [url]);

  /** En el móvil abre la cámara o la galería del sistema; en el navegador, el selector de archivos. */
  async function open(source: 'camera' | 'gallery') {
    setErr('');
    if (!Capacitor.isNativePlatform()) return (source === 'camera' ? camRef : galRef).current?.click();
    try {
      const photo = await NativeCamera.getPhoto({
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        resultType: CameraResultType.Uri,
        quality: 70,
        width: 1600,
        correctOrientation: true,
        saveToGallery: false,
      });
      if (photo.webPath) {
        setUrl(photo.webPath);
        setActive('surface');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel/i.test(msg)) setErr('No se pudo abrir la cámara. Revisa el permiso de cámara de Pellet Control en los ajustes del móvil.');
    }
  }

  const percent = photoPercent(marks.full, marks.surface, marks.empty);

  function pick(file: File | undefined) {
    if (!file) return;
    setUrl((old) => {
      if (old?.startsWith('blob:')) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    setActive('surface');
  }

  function place(e: PointerEvent<HTMLDivElement>) {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r || r.height === 0) return;
    const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    setMarks((m) => ({ ...m, [active]: y }));
  }

  function save() {
    if (percent == null) return;
    saveMarks(marks);
    haptic.success();
    onResult(percent);
    onClose();
  }

  return (
    <div className="flex flex-col gap-4">
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />
      <input ref={galRef} type="file" accept="image/*" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />

      {!url ? (
        <div className="flex flex-col gap-3">
          <Button variant="primary" icon={<Camera className="size-4" />} onClick={() => void open('camera')}>
            Hacer foto
          </Button>
          <Button icon={<ImageUp className="size-4" />} onClick={() => void open('gallery')}>
            Elegir de la galería
          </Button>
          {err && <p className="text-sm text-rust">{err}</p>}
          <p className="text-[0.8125rem] text-ink-3">La foto no se guarda ni se envía: solo se usa para calcular el porcentaje.</p>
        </div>
      ) : (
        <>
          <Segmented<Mark>
            size="sm"
            label="Marca que mueves"
            value={active}
            onChange={setActive}
            options={[
              { value: 'surface', label: 'Pellet' },
              { value: 'full', label: 'Llena' },
              { value: 'empty', label: 'Fondo' },
            ]}
          />
          <p className="text-[0.8125rem] text-ink-2">
            {active === 'surface'
              ? 'Toca o arrastra sobre la foto hasta la superficie del pellet.'
              : active === 'full'
                ? 'Marca la altura que tendría el pellet con la tolva llena (justo bajo el borde).'
                : 'Marca el fondo de la tolva (donde está vacía).'}
          </p>

          <div
            ref={boxRef}
            className="relative mx-auto w-full max-w-sm touch-none overflow-hidden rounded-2xl bg-ink select-none"
            onPointerDown={(e) => {
              dragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              place(e);
            }}
            onPointerMove={(e) => dragging.current && place(e)}
            onPointerUp={() => {
              dragging.current = false;
              haptic.tap();
            }}
            onPointerCancel={() => (dragging.current = false)}
          >
            <img src={url} alt="Foto de la tolva" className="block max-h-[52vh] w-full object-contain" draggable={false} />
            {/* Zona con pellet */}
            {percent != null && (
              <div
                className="pointer-events-none absolute inset-x-0 bg-amber/20"
                style={{ top: `${marks.surface * 100}%`, height: `${Math.max(0, marks.empty - marks.surface) * 100}%` }}
              />
            )}
            {(Object.keys(MARK_STYLE) as Mark[]).map((k) => (
              <div key={k} className="pointer-events-none absolute inset-x-0" style={{ top: `${marks[k] * 100}%` }}>
                <div className={cx('h-0.5 w-full', MARK_STYLE[k].line, active === k ? 'opacity-100' : 'opacity-70')} />
                <span
                  className={cx(
                    'absolute left-2 -translate-y-1/2 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold shadow-soft',
                    MARK_STYLE[k].tag,
                    active === k && 'ring-2 ring-paper',
                  )}
                >
                  {MARK_STYLE[k].label}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-baseline justify-between gap-3">
            <p className="num text-3xl font-bold tracking-[-0.02em]">{percent != null ? `${percent} %` : '—'}</p>
            <p className="text-sm text-ink-2">
              {percent == null ? 'Pon «Llena» por encima de «Fondo».' : cap ? `≈ ${fmtKg(Math.round((cap * percent) / 100))} en la tolva` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" icon={<Camera className="size-4" />} onClick={() => void open('camera')}>
              Otra foto
            </Button>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={save} disabled={percent == null}>
                Guardar {percent != null ? `${percent} %` : ''}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
