import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/**
 * Guarda o comparte un archivo generado por la app.
 * - Android: lo escribe en la caché y abre la hoja de compartir (Drive, Descargas, WhatsApp, correo…).
 * - Navegador: lo descarga.
 */
export async function saveFile(blob: Blob, fileName: string, title: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({ path: fileName, data: await toBase64(blob), directory: Directory.Cache });
    try {
      await Share.share({ title, files: [uri], dialogTitle: title });
    } catch (e) {
      // Cerrar la hoja de compartir sin elegir destino no es un error.
      if (!/cancel/i.test(String((e as Error)?.message ?? e))) throw e;
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
