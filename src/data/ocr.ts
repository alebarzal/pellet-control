import { Capacitor, registerPlugin } from '@capacitor/core';

/** Plugin nativo (android/.../OcrPlugin.java): lee el texto de una imagen en el propio móvil. */
const Plugin = registerPlugin<{ recognize(o: { base64: string }): Promise<{ text: string }> }>('PelletOcr');

export const ocrAvailable = () => Capacitor.getPlatform() === 'android';

/** Texto que se ve en la imagen (JPEG/PNG como data URL). Cadena vacía si no hay lector. */
export async function recognizeText(dataUrl: string): Promise<string> {
  if (!ocrAvailable()) return '';
  const base64 = dataUrl.replace(/^data:[^,]*,/, '');
  return (await Plugin.recognize({ base64 })).text ?? '';
}

/** Redimensiona una imagen (URL o data URL) a JPEG con el lado mayor indicado. */
export function toJpeg(src: string, maxSide: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k));
      const h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return reject(new Error('Sin lienzo'));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('No se pudo abrir la imagen'));
    img.src = src;
  });
}
