import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import type { GhWeek } from '@/lib/github';

/**
 * ActivityChart — painel ATIVIDADE 52 SEMANAS (dashboard.md).
 * Mini-canvas R3F ortográfico isométrico: barras extrudadas hairline,
 * altura = commits/semana, semana atual em --accent com bloom.
 * Entrada: stagger da esquerda (0.015s/barra); oscilação ±4° / 12s.
 * Hover → tooltip mono `SEM 14 · 87 COMMITS`.
 * Sem WebGL → SVG 2D estático (mesmos dados).
 */

const COLS = 13;
const ROWS = 4;
const GAP = 0.32;
const CELL = 1 + GAP;
const MAX_H = 5.2;
const ACCENT = new THREE.Color('#F6287D');
const GRAY = new THREE.Color('#8A8A8A');
const CORE = new THREE.Color('#FFFFFF');

const tmpObj = new THREE.Object3D();
const tmpColor = new THREE.Color();

interface BarsProps {
  weeks: GhWeek[];
  active: boolean; // entrou no viewport → dispara stagger
  onHover: (index: number | null, x: number, y: number) => void;
  groupRef: MutableRefObject<THREE.Group | null>;
}

function Bars({ weeks, active, onHover, groupRef }: BarsProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const startRef = useRef(-1);
  const hoveredRef = useRef<number | null>(null);
  const max = useMemo(() => Math.max(1, ...weeks.map((w) => w.total)), [weeks]);

  useEffect(() => {
    if (active) startRef.current = -2; // rearma no próximo frame
  }, [active, weeks]);

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    if (startRef.current === -2) startRef.current = state.clock.elapsedTime;
    const t0 = startRef.current;
    const t = t0 < 0 ? 0 : state.clock.elapsedTime - t0;

    for (let i = 0; i < weeks.length; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const h = 0.08 + (weeks[i]!.total / max) * MAX_H;
      const p = THREE.MathUtils.clamp((t - i * 0.015) / 0.8, 0, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      tmpObj.position.set(
        (col - (COLS - 1) / 2) * CELL,
        (h * ease) / 2,
        (row - (ROWS - 1) / 2) * CELL,
      );
      tmpObj.scale.set(1, Math.max(0.001, h * ease), 1);
      tmpObj.updateMatrix();
      m.setMatrixAt(i, tmpObj.matrix);

      const isCurrent = i === weeks.length - 1;
      const isHovered = hoveredRef.current === i;
      tmpColor.copy(isCurrent ? ACCENT : GRAY).multiplyScalar(isCurrent ? 1.5 : 0.9);
      if (isHovered) tmpColor.copy(CORE).multiplyScalar(1.3);
      m.setColorAt(i, tmpColor);
    }
    m.count = weeks.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;

    // oscilação isométrica ±4° em loop de 12s
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin((state.clock.elapsedTime / 12) * Math.PI * 2) * (Math.PI / 45);
    }
  });

  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hoveredRef.current = e.instanceId ?? null;
    onHover(e.instanceId ?? null, e.clientX, e.clientY);
  };

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, 52]}
      onPointerMove={handleMove}
      onPointerOut={() => {
        hoveredRef.current = null;
        onHover(null, 0, 0);
      }}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial wireframe transparent opacity={0.9} toneMapped={false} />
    </instancedMesh>
  );
}

function GridFloor() {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pts: number[] = [];
    const w = ((COLS - 1) / 2) * CELL + 0.8;
    const d = ((ROWS - 1) / 2) * CELL + 0.8;
    for (let i = 0; i <= COLS; i++) {
      const x = -w + (i / COLS) * w * 2;
      pts.push(x, 0, -d, x, 0, d);
    }
    for (let j = 0; j <= ROWS; j++) {
      const z = -d + (j / ROWS) * d * 2;
      pts.push(-w, 0, z, w, 0, z);
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    return g;
  }, []);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#ffffff" transparent opacity={0.07} />
    </lineSegments>
  );
}

interface ActivityChart3DProps {
  weeks: GhWeek[];
  active: boolean;
}

function ActivityChart3DInner({ weeks, active }: ActivityChart3DProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);

  const onHover = (index: number | null, x: number, y: number) => {
    if (index == null) {
      setTip(null);
      return;
    }
    const rect = wrapRef.current?.getBoundingClientRect();
    const w = weeks[index];
    if (!w) return;
    setTip({
      text: `SEM ${index + 1} · ${w.total.toLocaleString('pt-BR')} COMMITS`,
      x: Math.min(x - (rect?.left ?? 0) + 14, (rect?.width ?? 400) - 170),
      y: Math.max(y - (rect?.top ?? 0) - 30, 4),
    });
  };

  return (
    <div ref={wrapRef} className="relative h-[280px] w-full">
      <Canvas
        orthographic
        dpr={[1, 1.75]}
        gl={{ antialias: false, powerPreference: 'low-power', stencil: false }}
        camera={{ position: [16, 15, 16], zoom: 26, near: 0.1, far: 120 }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#050505']} />
        <group ref={groupRef} position={[0, -1.6, 0]}>
          <GridFloor />
          <Bars weeks={weeks} active={active} onHover={onHover} groupRef={groupRef} />
        </group>
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.7} luminanceSmoothing={0.3} />
        </EffectComposer>
      </Canvas>
      {tip && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap border border-hairline bg-surface/90 px-2 py-1 font-mono text-[10px] tracking-[0.12em] text-core"
          style={{ left: tip.x, top: tip.y }}
        >
          {tip.text}
        </div>
      )}
    </div>
  );
}

const ActivityChart3D = memo(ActivityChart3DInner);
export default ActivityChart3D;
