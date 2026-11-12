import { Cloud, CloudAlert, CloudOff, RefreshCw } from 'lucide-react';
import { cx } from '../../ui/primitives';
import { useSync } from './SyncProvider';

const LABEL = { online: 'Sincronizado', syncing: 'Sincronizando', offline: 'Sin conexión', error: 'Error de sincronización', off: '' } as const;

/** Estado de la sincronización con el hogar (no se muestra si no hay hogar). */
export function SyncBadge({ withLabel, light, className }: { withLabel?: boolean; light?: boolean; className?: string }) {
  const { status, pending } = useSync();
  if (status === 'off') return null;
  const Icon = status === 'online' ? Cloud : status === 'syncing' ? RefreshCw : status === 'offline' ? CloudOff : CloudAlert;
  const tone = light
    ? status === 'error'
      ? 'text-[#f0a58c]'
      : status === 'offline'
        ? 'text-[#e8c27a]'
        : 'text-[#c5d28e]'
    : status === 'error'
      ? 'text-rust'
      : status === 'offline'
        ? 'text-amber'
        : 'text-olive-strong';
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-xs font-semibold', tone, className)} title={LABEL[status]}>
      <Icon className={cx('size-4', status === 'syncing' && 'animate-spin motion-reduce:animate-none')} aria-hidden />
      {withLabel ? LABEL[status] : <span className="sr-only">{LABEL[status]}</span>}
      {pending > 0 && status !== 'syncing' && <span className="num">· {pending}</span>}
    </span>
  );
}
