import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { buildWorkbook, excelFileName } from '../../data/excel';
import { saveFile } from '../../data/files';
import { useStore } from '../../store/store';
import { haptic } from '../../ui/haptics';
import { Button } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

/** Exporta pellets, economía, temperatura y caldera a un Excel con varias hojas. */
export function ExportExcelButton({ variant = 'secondary', className }: { variant?: 'primary' | 'secondary'; className?: string }) {
  const { data } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      className={className}
      disabled={busy}
      icon={busy ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
      onClick={async () => {
        setBusy(true);
        try {
          await saveFile(await buildWorkbook(data), excelFileName(), 'Exportar a Excel');
          haptic.success();
        } catch {
          toast.show({ tone: 'error', title: 'No se pudo crear el Excel', body: 'Inténtalo de nuevo.' });
        } finally {
          setBusy(false);
        }
      }}
    >
      Exportar a Excel
    </Button>
  );
}
