import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import {
  EffectComposer,
  Bloom,
  Vignette,
  Noise,
  ChromaticAberration,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import type { OrbitBody, OrbitTelemetry } from '@/components/dashboard/orbitModel';
import { MAX_BODIES, OVERVIEW_DIST } from '@/components/dashboard/orbitModel';

/**
 * RepoOrbit — cena 3D principal do /dashboard (dashboard.md §Cena 3D).
 * Núcleo luminoso (--core) = owner; repositórios orbitam como esferas
 * wireframe: raio orbital ∝ idade, tamanho ∝ log(stars), velocidade ∝
 * atividade recente, cor cinza→accent ∝ issues normalizadas.
 * Instanced rendering (≤30 corpos), anéis hairline com tick-marks,
 * foco por clique (dolly+orbit), hover acende --core.
 */

const ACCENT = new THREE.Color('#F6287D');
const CORE = new THREE.Color('#FFFFFF');
const GRAY = new THREE.Color('#5A5A5A');

// ---------------------------------------------------------------------------
// Núcleo central (owner)
// ---------------------------------------------------------------------------

function CoreSphere({ birthRef }: { birthRef: MutableRefObject<number> }) {
  const mesh = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const birth = birthRef.current;
    const intro = THREE.MathUtils.clamp((t - birth) / 0.8, 0, 1); // bloom/scale 0→1 em 800ms
    const ease = 1 - Math.pow(1 - intro, 3);
    const pulse = 1 + Math.sin(t * 1.4) * 0.03;
    if (mesh.current) mesh.current.scale.setScalar(Math.max(0.001, ease * pulse));
    if (mat.current) {
      const c = 0.25 + ease * (1.6 + Math.sin(t * 1.4) * 0.25);
      mat.current.color.setScalar(c);
    }
    if (light.current) light.current.intensity = ease * (26 + Math.sin(t * 1.4) * 4);
  });

  return (
    <group>
      <pointLight ref={light} color="#F6287D" intensity={0} distance={26} decay={2} />
      <pointLight position={[0, 3, 0]} color="#ffffff" intensity={5} distance={18} decay={2} />
      <mesh ref={mesh}>
        <sphereGeometry args={[0.85, 48, 48]} />
        <meshBasicMaterial ref={mat} toneMapped={false} />
      </mesh>
      {/* halo wireframe sutil */}
      <mesh scale={1.35}>
        <sphereGeometry args={[0.85, 24, 16]} />
        <meshBasicMaterial color="#F6287D" wireframe transparent opacity={0.14} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Anéis hairline com tick-marks (1 LineLoop por corpo, escala animada)
// ---------------------------------------------------------------------------

function makeRingGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const SEG = 128;
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function makeTicksGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const TICKS = 36;
  for (let i = 0; i < TICKS; i++) {
    const a = (i / TICKS) * Math.PI * 2;
    const inner = i % 3 === 0 ? 0.97 : 0.985;
    pts.push(new THREE.Vector3(Math.cos(a) * inner, 0, Math.sin(a) * inner));
    pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function OrbitRings({
  bodies,
  birthRef,
}: {
  bodies: OrbitBody[];
  birthRef: MutableRefObject<number>;
}) {
  const group = useRef<THREE.Group>(null);
  const ringGeo = useMemo(() => makeRingGeometry(), []);
  const ticksGeo = useMemo(() => makeTicksGeometry(), []);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime - birthRef.current;
    // entrada em espiral: stagger por raio orbital, 1.5s total
    g.children.forEach((child, i) => {
      const body = bodies[i];
      if (!body) return;
      const delay = 0.15 + (i / Math.max(1, bodies.length - 1)) * 0.9;
      const p = THREE.MathUtils.clamp((t - delay) / 0.6, 0, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      child.scale.setScalar(Math.max(0.0001, body.radius * ease));
      child.visible = p > 0;
    });
  });

  return (
    <group ref={group}>
      {bodies.map((b) => (
        <group key={b.fullName}>
          <lineLoop geometry={ringGeo}>
            <lineBasicMaterial color="#ffffff" transparent opacity={0.1} />
          </lineLoop>
          <lineSegments geometry={ticksGeo}>
            <lineBasicMaterial color="#ffffff" transparent opacity={0.16} />
          </lineSegments>
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Corpos orbitais (InstancedMesh wireframe)
// ---------------------------------------------------------------------------

interface BodiesProps {
  bodies: OrbitBody[];
  birthRef: MutableRefObject<number>;
  selected: string | null;
  onHover: (index: number | null, x: number, y: number) => void;
  onSelect: (index: number) => void;
  positionsRef: MutableRefObject<THREE.Vector3[]>;
  hoveredRef: MutableRefObject<number | null>;
}

const tmpObj = new THREE.Object3D();
const tmpColor = new THREE.Color();

function OrbitBodies({
  bodies,
  birthRef,
  selected,
  onHover,
  onSelect,
  positionsRef,
  hoveredRef,
}: BodiesProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const angles = useRef<number[]>([]);
  const sizes = useRef<number[]>([]);
  const radii = useRef<number[]>([]);

  // morph suave ao trocar o conjunto (interpolação ~1.2s)
  useEffect(() => {
    const prevR = radii.current;
    const prevS = sizes.current;
    radii.current = bodies.map((b, i) => prevR[i] ?? b.radius * 0.3);
    sizes.current = bodies.map((_, i) => prevS[i] ?? 0.01);
    angles.current = bodies.map((b) => b.angle0);
  }, [bodies]);

  useFrame((state, delta) => {
    const m = mesh.current;
    if (!m) return;
    const elapsed = state.clock.elapsedTime - birthRef.current;
    const k = Math.min(1, delta * 2.2); // morph 1.2s aprox.

    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i]!;
      // entrada em espiral do centro (stagger por raio)
      const delay = 0.15 + (i / Math.max(1, bodies.length - 1)) * 0.9;
      const p = THREE.MathUtils.clamp((elapsed - delay) / 0.6, 0, 1);
      const ease = 1 - Math.pow(1 - p, 3);

      angles.current[i] = (angles.current[i] ?? b.angle0) + b.speed * delta;
      radii.current[i] = THREE.MathUtils.lerp(radii.current[i] ?? b.radius, b.radius, k);
      sizes.current[i] = THREE.MathUtils.lerp(sizes.current[i] ?? b.size, b.size, k);

      const angle = angles.current[i]! + (1 - ease) * 2.4; // espiral de entrada
      const r = radii.current[i]! * ease;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      positionsRef.current[i]?.set(x, 0, z);

      const isHovered = hoveredRef.current === i;
      const isSelected = selected === b.fullName;
      const scale = sizes.current[i]! * (isHovered ? 1.35 : 1) * Math.max(0.001, ease);
      tmpObj.position.set(x, 0, z);
      tmpObj.scale.setScalar(Math.max(0.0001, scale));
      tmpObj.updateMatrix();
      m.setMatrixAt(i, tmpObj.matrix);

      // cor: cinza→accent por heat; hover → --core; seleção → accent sólido
      tmpColor.copy(GRAY).lerp(ACCENT, b.heat);
      if (isSelected) tmpColor.copy(ACCENT).multiplyScalar(1.6);
      else if (isHovered) tmpColor.copy(CORE).multiplyScalar(1.4);
      else if (selected) tmpColor.multiplyScalar(0.4); // demais escurecem
      m.setColorAt(i, tmpColor);
    }
    m.count = bodies.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const id = e.instanceId ?? null;
    hoveredRef.current = id;
    onHover(id, e.clientX, e.clientY);
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId != null) onSelect(e.instanceId);
  };

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, MAX_BODIES]}
      onPointerMove={handleMove}
      onPointerOut={() => {
        hoveredRef.current = null;
        onHover(null, 0, 0);
      }}
      onClick={handleClick}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 14, 10]} />
      <meshBasicMaterial wireframe transparent opacity={0.85} toneMapped={false} />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------------------
// Trilha accent do corpo selecionado (dash animado)
// ---------------------------------------------------------------------------

function SelectionTrail({
  bodies,
  selected,
  positionsRef,
  anglesOffsetRef,
}: {
  bodies: OrbitBody[];
  selected: string | null;
  positionsRef: MutableRefObject<THREE.Vector3[]>;
  anglesOffsetRef: MutableRefObject<number[]>;
}) {
  const markerRef = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => new THREE.BufferGeometry(), []);
  const mat = useMemo(
    () =>
      new THREE.LineDashedMaterial({
        color: '#F6287D',
        dashSize: 0.22,
        gapSize: 0.14,
        transparent: true,
        opacity: 0.9,
        toneMapped: false,
      }),
    [],
  );
  const line = useMemo(() => new THREE.Line(geo, mat), [geo, mat]);

  useFrame((state) => {
    const idx = bodies.findIndex((b) => b.fullName === selected);
    const marker = markerRef.current;
    if (!marker) return;
    if (idx < 0) {
      line.visible = false;
      marker.visible = false;
      return;
    }
    line.visible = true;
    marker.visible = true;
    const b = bodies[idx]!;
    const pos = positionsRef.current[idx];
    const angleNow = Math.atan2(pos?.z ?? 0, pos?.x ?? 1);
    const r = Math.hypot(pos?.x ?? b.radius, pos?.z ?? 0);
    // arco atrás do corpo (~1.6 rad), dash phase animada
    const N = 40;
    const arr = new Float32Array((N + 1) * 3);
    for (let i = 0; i <= N; i++) {
      const a = angleNow - (i / N) * 1.6 * Math.sign(b.speed || 1);
      arr[i * 3] = Math.cos(a) * r;
      arr[i * 3 + 1] = 0;
      arr[i * 3 + 2] = Math.sin(a) * r;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    line.computeLineDistances();
    mat.scale = 1;
    mat.dashSize = 0.22;
    // dash "fluindo" — anima o offset via gap size pulsante
    mat.gapSize = 0.14 + Math.sin(state.clock.elapsedTime * 4) * 0.05;
    if (pos) {
      marker.position.copy(pos);
      const s = b.size * 1.5;
      marker.scale.setScalar(s);
    }
    anglesOffsetRef.current[0] = angleNow;
  });

  return (
    <group>
      <primitive object={line} />
      <mesh ref={markerRef}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial color="#F6287D" wireframe toneMapped={false} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Rig de câmera: foco em repo (dolly+orbit 1s) / visão geral
// ---------------------------------------------------------------------------

function CameraRig({
  controls,
  selected,
  bodies,
  positionsRef,
  telemetry,
}: {
  controls: MutableRefObject<OrbitControlsImpl | null>;
  selected: string | null;
  bodies: OrbitBody[];
  positionsRef: MutableRefObject<THREE.Vector3[]>;
  telemetry: MutableRefObject<OrbitTelemetry>;
}) {
  const { camera } = useThree();
  const setDpr = useThree((s) => s.setDpr);
  const acc = useRef({ frames: 0, t: 0, lowT: 0 });
  const desired = useRef(new THREE.Vector3(0, 0, 0));

  useEffect(() => {
    telemetry.current.dpr = Math.min(window.devicePixelRatio, 1.75);
  }, [telemetry]);

  useFrame((_state, delta) => {
    const c = controls.current;
    const idx = bodies.findIndex((b) => b.fullName === selected);
    const focus = idx >= 0 ? positionsRef.current[idx] : null;
    const k = 1 - Math.exp(-2.6 * delta); // ~1s ease-in-out

    if (c) {
      desired.current.set(focus?.x ?? 0, focus?.y ?? 0, focus?.z ?? 0);
      c.target.lerp(desired.current, k);
      const targetDist = focus ? Math.max(4.5, (bodies[idx]?.size ?? 0.4) * 10 + 3.5) : OVERVIEW_DIST;
      const dir = camera.position.clone().sub(c.target);
      const len = dir.length() || 1;
      dir.multiplyScalar((targetDist - len) * k);
      camera.position.add(dir);
      c.update();
    }

    // telemetria FPS/MS + qualidade adaptativa (DPR 1.75→1.25 se <45fps por 3s)
    const a = acc.current;
    a.frames += 1;
    a.t += delta;
    if (a.t >= 0.5) {
      const fps = a.frames / a.t;
      telemetry.current.fps = Math.round(fps);
      telemetry.current.ms = Math.round((1000 / Math.max(1, fps)) * 10) / 10;
      if (fps < 45) a.lowT += a.t;
      else a.lowT = 0;
      if (a.lowT >= 3 && telemetry.current.dpr > 1.25) {
        telemetry.current.dpr = 1.25;
        setDpr(1.25);
        a.lowT = 0;
      }
      a.frames = 0;
      a.t = 0;
    }
  });
  return null;
}

/** Anima a intensidade do bloom 0→alvo nos primeiros 800ms. */
function BloomIntro({ birthRef }: { birthRef: MutableRefObject<number> }) {
  const ref = useRef<{ intensity: number } | null>(null);
  useFrame((state) => {
    const p = THREE.MathUtils.clamp((state.clock.elapsedTime - birthRef.current) / 0.8, 0, 1);
    if (ref.current) ref.current.intensity = p * 1.1;
  });
  return (
    <Bloom
      // @ts-expect-error — ref do efeito expõe .intensity
      ref={ref}
      mipmapBlur
      intensity={0}
      luminanceThreshold={0.72}
      luminanceSmoothing={0.25}
    />
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

interface RepoOrbitProps {
  bodies: OrbitBody[];
  selected: string | null;
  onSelect: (fullName: string | null) => void;
  telemetry: MutableRefObject<OrbitTelemetry>;
  /** muda a cada carga → reinicia a animação de entrada */
  epoch: number;
}

function RepoOrbitInner({ bodies, selected, onSelect, telemetry, epoch }: RepoOrbitProps) {
  const birthRef = useRef(0);
  const controls = useRef<OrbitControlsImpl | null>(null);
  const hoveredRef = useRef<number | null>(null);
  const positionsRef = useRef<THREE.Vector3[]>(
    Array.from({ length: MAX_BODIES }, () => new THREE.Vector3()),
  );
  const anglesOffsetRef = useRef<number[]>([0]);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const downPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    // reinicia a animação de entrada a cada nova carga (sincroniza com o
    // relógio do R3F — sistema externo). O label de hover se resolve sozinho
    // no próximo pointermove/out.
    birthRef.current = -1;
    hoveredRef.current = null;
  }, [epoch]);

  const handleHover = (index: number | null, x: number, y: number) => {
    if (index == null) {
      setHover(null);
      return;
    }
    const rect = wrapRef.current?.getBoundingClientRect();
    setHover({
      name: bodies[index]?.fullName ?? '',
      x: Math.min(x - (rect?.left ?? 0) + 14, (rect?.width ?? 400) - 140),
      y: Math.max(y - (rect?.top ?? 0) - 28, 4),
    });
  };

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0"
      data-cursor="ARRASTAR"
      onPointerDown={(e) => {
        downPos.current = { x: e.clientX, y: e.clientY };
      }}
    >
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 46, near: 0.1, far: 200, position: [0, 9, OVERVIEW_DIST] }}
        onPointerMissed={(e) => {
          // ignora "click" residual de drags de órbita (>5px de movimento)
          const d = downPos.current;
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
          onSelect(null);
        }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#050505']} />
        <BirthFixer birthRef={birthRef} />
        <CoreSphere birthRef={birthRef} />
        <OrbitRings bodies={bodies} birthRef={birthRef} />
        <OrbitBodies
          bodies={bodies}
          birthRef={birthRef}
          selected={selected}
          onHover={handleHover}
          onSelect={(i) => onSelect(bodies[i]?.fullName ?? null)}
          positionsRef={positionsRef}
          hoveredRef={hoveredRef}
        />
        <SelectionTrail
          bodies={bodies}
          selected={selected}
          positionsRef={positionsRef}
          anglesOffsetRef={anglesOffsetRef}
        />
        <CameraRig
          controls={controls}
          selected={selected}
          bodies={bodies}
          positionsRef={positionsRef}
          telemetry={telemetry}
        />
        <OrbitControls
          ref={controls}
          enableDamping
          dampingFactor={0.08}
          enablePan={false}
          minDistance={3.5}
          maxDistance={34}
          maxPolarAngle={Math.PI * 0.62}
        />
        <EffectComposer multisampling={0}>
          <BloomIntro birthRef={birthRef} />
          <ChromaticAberration
            blendFunction={BlendFunction.NORMAL}
            offset={[0.0008, 0.0008]}
            radialModulation
            modulationOffset={0.5}
          />
          <Vignette eskil={false} offset={0.26} darkness={0.4} />
          <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.045} />
        </EffectComposer>
      </Canvas>

      {/* label de hover: owner/repo */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap border border-hairline bg-surface/90 px-2 py-1 font-mono text-[10px] tracking-[0.12em] text-core"
          style={{ left: hover.x, top: hover.y }}
        >
          {hover.name}
        </div>
      )}
    </div>
  );
}

/** Fixa o tempo de nascimento da cena no primeiro frame real. */
function BirthFixer({ birthRef }: { birthRef: MutableRefObject<number> }) {
  useFrame((state) => {
    if (birthRef.current < 0) birthRef.current = state.clock.elapsedTime;
  });
  return null;
}

const RepoOrbit = memo(RepoOrbitInner);
export default RepoOrbit;
