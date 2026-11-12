import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { Move3d } from 'lucide-react';

const BoilerScene = lazy(() => import('./BoilerScene'));

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Indicador 2D de respaldo cuando no hay WebGL. */
function FlatHopper({ level }: { level: number }) {
  return (
    <div className="grid h-full place-items-center">
      <div className="relative h-48 w-28 overflow-hidden rounded-2xl bg-ink/90 ring-4 ring-ink/10">
        <div className="absolute inset-x-2 bottom-2 rounded-xl bg-[#9a7444] transition-[height] duration-700" style={{ height: `calc(${level * 100}% - 1rem)` }} />
      </div>
    </div>
  );
}

/** Indicador de carga: tres pellets que rebotan mientras se prepara la escena 3D. */
function SceneLoader({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden={!visible}
      role={visible ? 'status' : undefined}
      className={`absolute inset-0 z-[1] grid place-items-center bg-[#ede7d9] transition-opacity duration-500 ease-out ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-end gap-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="pellet-bounce h-6 w-3 rounded-full bg-[#9a7444] shadow-[inset_0_-4px_0_rgb(0_0_0/0.18)]" style={{ animationDelay: `${i * 140}ms` }} />
          ))}
        </div>
        <p className="text-sm font-semibold text-ink-2">Preparando la caldera…</p>
      </div>
    </div>
  );
}

export function SceneFrame({ level, storedBags, children }: { level: number; storedBags: number; children?: ReactNode }) {
  const ok = typeof window !== 'undefined' && webglAvailable();
  const fallback = <FlatHopper level={level} />;
  const [ready, setReady] = useState(false);
  return (
    <div className="relative h-[320px] overflow-hidden rounded-3xl bg-[#ede7d9] ring-1 ring-line/70 sm:h-[400px] lg:h-full lg:min-h-[440px]">
      {ok ? (
        <SceneBoundary fallback={fallback}>
          <Suspense fallback={null}>
            <BoilerScene level={level} storedBags={storedBags} onReady={() => setReady(true)} />
          </Suspense>
        </SceneBoundary>
      ) : (
        fallback
      )}
      {ok && <SceneLoader visible={!ready} />}
      {children}
      <p className="pointer-events-none absolute bottom-3 left-4 flex items-center gap-1.5 text-xs font-medium text-ink-2">
        <Move3d className="size-3.5" aria-hidden />
        Representación aproximada · arrastra para girar
      </p>
    </div>
  );
}
