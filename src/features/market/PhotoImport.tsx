import { Camera as NativeCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Camera, ImageUp, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ocrAvailable, recognizeText, toJpeg } from '../../data/ocr';
import { Button } from '../../ui/primitives';

/**
 * Foto del saco o de la etiqueta de precio. Guarda una miniatura con el producto y, en el móvil,
 * lee el texto de la foto para rellenar la ficha (la imagen no sale del teléfono).
 */
export function PhotoImport({
  photo,
  onPhoto,
  onText,
  autoOpen,
}: {
  photo: string | null;
  onPhoto: (thumb: string | null) => void;
  /** Texto leído en la foto (solo en la app Android). */
  onText: (text: string) => void;
  /** Abrir la cámara nada más mostrarse (saco visto en tienda). */
  autoOpen?: boolean;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function use(src: string) {
    setBusy(true);
    setErr('');
    try {
      onPhoto(await toJpeg(src, 360, 0.6));
      if (ocrAvailable()) onText(await recognizeText(await toJpeg(src, 1600, 0.85)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setErr(/descargando/.test(msg) ? msg : 'No se pudo leer la foto. Prueba con otra más nítida y con buena luz.');
    } finally {
      setBusy(false);
      if (src.startsWith('blob:')) URL.revokeObjectURL(src);
    }
  }

  async function open(source: 'camera' | 'gallery') {
    setErr('');
    if (!Capacitor.isNativePlatform()) return (source === 'camera' ? camRef : galRef).current?.click();
    try {
      const p = await NativeCamera.getPhoto({
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        resultType: CameraResultType.Uri,
        quality: 85,
        width: 1600,
        correctOrientation: true,
        saveToGallery: false,
      });
      if (p.webPath) await use(p.webPath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel/i.test(msg)) setErr('No se pudo abrir la cámara. Revisa el permiso de cámara de Pellet Control en los ajustes del móvil.');
    }
  }

  const opened = useRef(false);
  useEffect(() => {
    if (!autoOpen || opened.current) return;
    opened.current = true;
    void open('camera');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (f: File | undefined) => f && void use(URL.createObjectURL(f));

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-sand-soft/60 p-4">
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />
      <input ref={galRef} type="file" accept="image/*" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />
      <p className="text-sm font-bold">Foto del saco o de la etiqueta</p>
      <div className="flex items-start gap-3">
        {photo && (
          <span className="relative shrink-0">
            <img src={photo} alt="Foto del producto" className="size-20 rounded-xl object-cover ring-1 ring-line" />
            <button
              type="button"
              aria-label="Quitar la foto"
              onClick={() => onPhoto(null)}
              className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-ink text-paper shadow-soft"
            >
              <X className="size-3.5" />
            </button>
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} icon={busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} onClick={() => void open('camera')}>
            {busy ? 'Leyendo la foto…' : 'Hacer foto'}
          </Button>
          <Button size="sm" disabled={busy} icon={<ImageUp className="size-4" />} onClick={() => void open('gallery')}>
            Galería
          </Button>
        </div>
      </div>
      {err && <p className="text-sm text-rust">{err}</p>}
      <p className="text-[0.8125rem] text-ink-3">
        {ocrAvailable()
          ? 'Para pellet que no está en ninguna web: la app lee en la foto la marca, el peso, el precio y los datos de calidad, y tú revisas antes de guardar. La foto no se envía a ningún sitio.'
          : 'Se guarda una miniatura con el producto. La lectura automática del texto de la foto funciona en la app del móvil.'}
      </p>
    </div>
  );
}
