/**
 * Representación 3D aproximada de la instalación: caldera de pellets con tolva lateral,
 * sacos almacenados y pellets sueltos. No es un modelo técnico del fabricante.
 */
import { ContactShadows, Environment, Lightformer, OrbitControls, RoundedBox } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

const PELLET = '#a8814f';
const PELLET_DARK = '#7d5c33';

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nube de pellets instanciados sobre un plano rectangular (superficie de la tolva) o en montón. */
function Pellets({
  count,
  area,
  pile,
  seed = 7,
}: {
  count: number;
  area: [number, number];
  pile?: boolean;
  seed?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.CylinderGeometry(0.011, 0.011, 0.045, 7), []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const rnd = mulberry(seed);
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      if (pile) {
        const r = rnd() * rnd() * area[0] * 1.6;
        const a = rnd() * Math.PI * 2;
        const h = Math.max(0, (1 - r / area[0]) * area[1]) * rnd();
        o.position.set(Math.cos(a) * r, 0.011 + h, Math.sin(a) * r);
      } else {
        o.position.set((rnd() - 0.5) * area[0], rnd() * 0.02, (rnd() - 0.5) * area[1]);
      }
      o.rotation.set(Math.PI / 2 + (rnd() - 0.5) * 0.9, rnd() * Math.PI, (rnd() - 0.5) * 0.6);
      o.scale.setScalar(0.85 + rnd() * 0.3);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(PELLET).lerp(new THREE.Color(PELLET_DARK), rnd() * 0.6));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [count, area, pile, seed]);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, count]} castShadow receiveShadow>
      <meshStandardMaterial roughness={0.85} />
    </instancedMesh>
  );
}

/** Contenido de la tolva: bloque de pellet + capa superficial de pellets, con altura animada. */
function HopperFill({ level, height, width, depth }: { level: number; height: number; width: number; depth: number }) {
  const group = useRef<THREE.Group>(null);
  const block = useRef<THREE.Mesh>(null);
  const current = useRef(level);
  useFrame((_, dt) => {
    current.current = THREE.MathUtils.damp(current.current, level, 4, dt);
    const h = Math.max(0.002, height * current.current);
    if (block.current) {
      block.current.scale.y = h;
      block.current.position.y = h / 2;
    }
    if (group.current) group.current.position.y = h;
    if (group.current) group.current.visible = current.current > 0.01;
  });
  return (
    <group>
      <mesh ref={block} receiveShadow>
        <boxGeometry args={[width, 1, depth]} />
        <meshStandardMaterial color="#8f6c40" roughness={0.95} />
      </mesh>
      <group ref={group}>
        <Pellets count={520} area={[width * 0.96, depth * 0.96]} seed={11} />
      </group>
    </group>
  );
}

function Bag({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <RoundedBox args={[0.46, 0.13, 0.32]} radius={0.055} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial color="#4f6b37" roughness={0.55} metalness={0.02} />
      </RoundedBox>
      {/* Etiqueta frontal */}
      <mesh position={[0, 0.0, 0.161]}>
        <planeGeometry args={[0.24, 0.07]} />
        <meshStandardMaterial color="#efe6cf" roughness={0.7} />
      </mesh>
      <mesh position={[-0.07, 0.0, 0.1615]}>
        <circleGeometry args={[0.018, 20]} />
        <meshStandardMaterial color="#6b7a36" />
      </mesh>
    </group>
  );
}

function BagStack({ count }: { count: number }) {
  const visible = Math.min(count, 9);
  const slots: [number, number, number, number][] = [];
  // Dos columnas, apiladas hacia arriba
  for (let i = 0; i < visible; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    slots.push([col * 0.5 + (row % 2 ? 0.03 : 0), 0.066 + row * 0.128, (row % 2 ? -0.02 : 0.02), (row % 2 ? 0.05 : -0.04) + col * 0.03]);
  }
  return (
    <group position={[-1.38, 0, 0.32]}>
      {slots.map(([x, y, z, r], i) => (
        <Bag key={i} position={[x, y, z]} rotation={r} />
      ))}
    </group>
  );
}

function Boiler({ level }: { level: number }) {
  const W = 0.78;
  const H = 1.42;
  const D = 0.7;
  const hopperW = 0.62;
  const hopperH = 1.18;
  return (
    <group>
      {/* Cuerpo de la caldera */}
      {/* La carcasa termina bajo el panel para que no compartan cara (evita parpadeo) */}
      <RoundedBox args={[W, H - 0.18, D]} radius={0.035} smoothness={4} position={[0, (H - 0.18) / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f1eee7" roughness={0.38} metalness={0.05} />
      </RoundedBox>
      {/* Panel de control superior antracita */}
      <RoundedBox args={[W + 0.02, 0.2, D + 0.02]} radius={0.03} smoothness={4} position={[0, H - 0.1, 0]} castShadow>
        <meshStandardMaterial color="#2b2f2b" roughness={0.45} metalness={0.15} />
      </RoundedBox>
      {/* Pantalla */}
      <mesh position={[-0.08, H - 0.1, D / 2 + 0.016]}>
        <planeGeometry args={[0.22, 0.09]} />
        <meshStandardMaterial color="#c9dc7e" emissive="#a9c25a" emissiveIntensity={0.9} roughness={0.3} />
      </mesh>
      {/* Mando */}
      <mesh position={[0.2, H - 0.1, D / 2 + 0.024]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.02, 32]} />
        <meshStandardMaterial color="#d8d4ca" metalness={0.6} roughness={0.25} />
      </mesh>
      {/* Puerta frontal: junta y tirador */}
      <mesh position={[0, 0.66, D / 2 + 0.005]}>
        <planeGeometry args={[W - 0.12, 0.9]} />
        <meshStandardMaterial color="#e8e4db" roughness={0.45} />
      </mesh>
      <RoundedBox args={[0.04, 0.22, 0.03]} radius={0.012} position={[W / 2 - 0.1, 0.78, D / 2 + 0.02]} castShadow>
        <meshStandardMaterial color="#2b2f2b" roughness={0.4} />
      </RoundedBox>
      {/* Zócalo */}
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[W - 0.02, 0.06, D - 0.02]} />
        <meshStandardMaterial color="#2b2f2b" roughness={0.7} />
      </mesh>

      {/* Tolva lateral */}
      <group position={[W / 2 + hopperW / 2 + 0.02, 0, -0.02]}>
        {/* Cuerpo trasero (deja un hueco frontal visible tras el cristal) */}
        <RoundedBox args={[hopperW, hopperH, 0.42]} radius={0.03} smoothness={4} position={[0, hopperH / 2, -0.12]} castShadow receiveShadow>
          <meshStandardMaterial color="#363b35" roughness={0.5} metalness={0.2} />
        </RoundedBox>
        {/* Marco frontal */}
        {[-1, 1].map((sx) => (
          <mesh key={sx} position={[sx * (hopperW / 2 - 0.035), hopperH / 2, 0.22]} castShadow>
            <boxGeometry args={[0.07, hopperH, 0.26]} />
            <meshStandardMaterial color="#363b35" roughness={0.5} metalness={0.2} />
          </mesh>
        ))}
        <mesh position={[0, 0.04, 0.22]} castShadow>
          <boxGeometry args={[hopperW, 0.08, 0.26]} />
          <meshStandardMaterial color="#363b35" roughness={0.5} metalness={0.2} />
        </mesh>
        <mesh position={[0, hopperH - 0.05, 0.22]} castShadow>
          <boxGeometry args={[hopperW, 0.1, 0.26]} />
          <meshStandardMaterial color="#363b35" roughness={0.5} metalness={0.2} />
        </mesh>
        {/* Tapa */}
        <RoundedBox args={[hopperW + 0.02, 0.05, D - 0.02]} radius={0.02} position={[0, hopperH + 0.02, 0]} castShadow>
          <meshStandardMaterial color="#2b2f2b" roughness={0.45} metalness={0.2} />
        </RoundedBox>
        {/* Pellet en el interior, visible a través del cristal */}
        <group position={[0, 0.08, 0.22]}>
          <HopperFill level={level} height={hopperH - 0.18} width={hopperW - 0.15} depth={0.24} />
        </group>
        {/* Cristal de inspección */}
        <mesh position={[0, 0.08 + (hopperH - 0.18) / 2, 0.348]}>
          <planeGeometry args={[hopperW - 0.14, hopperH - 0.18]} />
          <meshPhysicalMaterial color="#dfe8e3" transparent opacity={0.14} roughness={0.05} metalness={0} clearcoat={1} />
        </mesh>
        {/* Escala de nivel */}
        {[0.25, 0.5, 0.75].map((t) => (
          <mesh key={t} position={[hopperW / 2 - 0.035, 0.08 + (hopperH - 0.18) * t, 0.352]}>
            <planeGeometry args={[0.04, 0.008]} />
            <meshBasicMaterial color="#e9e3d2" />
          </mesh>
        ))}
      </group>

      {/* Conducto de humos */}
      <mesh position={[-0.12, H + 0.14, -0.16]} castShadow>
        <cylinderGeometry args={[0.065, 0.065, 0.3, 32]} />
        <meshStandardMaterial color="#9aa09a" metalness={0.75} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** Aleja la cámara en formatos estrechos (móvil) para que quepa toda la instalación. */
function ResponsiveCamera() {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    const aspect = size.width / size.height;
    const k = aspect < 1.4 ? Math.min(1.75, 1.4 / aspect + 0.12) : 1;
    camera.position.set(2.1 * k, 1.55 + (k - 1) * 0.6, 3.3 * k);
    camera.lookAt(0, 0.65, 0);
  }, [camera, size.width, size.height]);
  return null;
}

/** Avisa cuando la escena ya ha dibujado sus primeros fotogramas (para quitar el indicador de carga). */
function ReadySignal({ onReady }: { onReady?: () => void }) {
  const frames = useRef(0);
  useFrame(() => {
    frames.current++;
    if (frames.current === 3) onReady?.();
  });
  return null;
}

export default function BoilerScene({ level, storedBags, onReady }: { level: number; storedBags: number; onReady?: () => void }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [2.1, 1.55, 3.3], fov: 32 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      aria-label="Representación 3D aproximada de la caldera, la tolva y los sacos almacenados"
      role="img"
    >
      <color attach="background" args={['#ede7d9']} />
      <fog attach="fog" args={['#ede7d9', 6, 11]} />
      <hemisphereLight args={['#fffaf0', '#cfc6b2', 0.55]} />
      <directionalLight
        position={[3, 5, 3.5]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <Environment resolution={128}>
        <Lightformer intensity={1.4} position={[0, 4, 2]} scale={[6, 2, 1]} rotation-x={Math.PI / 2} color="#fff6e6" />
        <Lightformer intensity={0.8} position={[-4, 1.5, 1]} scale={[3, 3, 1]} rotation-y={Math.PI / 2} color="#f2efe6" />
        <Lightformer intensity={0.5} position={[4, 1, -2]} scale={[3, 2, 1]} rotation-y={-Math.PI / 2} color="#e4ead2" />
      </Environment>

      <group position={[0.15, 0, 0]}>
        <Boiler level={level} />
        <BagStack count={storedBags} />
        <group position={[-0.55, 0, 0.82]}>
          <Pellets count={260} area={[0.16, 0.06]} pile seed={3} />
        </group>
      </group>

      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#e7e0d0" roughness={1} />
      </mesh>
      <ContactShadows position={[0, 0.001, 0]} opacity={0.45} scale={6} blur={2.4} far={2} />
      <ResponsiveCamera />
      <ReadySignal onReady={onReady} />
      <OrbitControls
        target={[0, 0.65, 0]}
        enablePan={false}
        enableZoom={false}
        enableDamping
        minPolarAngle={Math.PI / 3.2}
        maxPolarAngle={Math.PI / 2.15}
        minAzimuthAngle={-Math.PI / 4}
        maxAzimuthAngle={Math.PI / 2.6}
      />
    </Canvas>
  );
}
