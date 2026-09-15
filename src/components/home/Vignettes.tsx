import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Line, useTexture } from '@react-three/drei';
import type { ChoreoState } from './choreo';

/** Portal z positions must match cameraZAt() in choreo.ts */
export const PORTAL_Z = [-20, -44, -68, -92];

interface VignetteProps {
  choreo: React.MutableRefObject<ChoreoState>;
  index: number;
}

/** Crossfades a group in/out based on chapter progress; also scales 0.85→1. */
function useVignetteVisibility(
  groupRef: React.RefObject<THREE.Group | null>,
  choreo: React.MutableRefObject<ChoreoState>,
  index: number,
) {
  const mats = useRef<THREE.Material[]>([]);
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    if (mats.current.length === 0) {
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh || (o as THREE.Points).type === 'Points') {
          const m = mesh.material as THREE.Material | THREE.Material[];
          (Array.isArray(m) ? m : [m]).forEach((mm) => {
            mm.transparent = true;
            mats.current.push(mm);
          });
        }
      });
    }
    const cp = choreo.current.chapterProgress[index];
    const fadeIn = THREE.MathUtils.smoothstep(cp, 0.02, 0.22);
    const fadeOut = 1 - THREE.MathUtils.smoothstep(cp, 0.82, 0.98);
    const opacity = Math.max(0, Math.min(fadeIn, fadeOut));
    g.visible = opacity > 0.01;
    mats.current.forEach((m) => {
      m.opacity = opacity;
    });
    const s = 0.85 + 0.15 * fadeIn;
    g.scale.setScalar(s);
  });
}

/** 01 · SIMULAÇÃO — ~3000 magenta→white particles orbiting/aggregating */
export function SimVignette({ choreo, index }: VignetteProps) {
  const groupRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  useVignetteVisibility(groupRef, choreo, index);

  const { positions, colors } = useMemo(() => {
    const rng = mulberry32(9001);
    const N = 3000;
    const positions = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const accent = new THREE.Color('#F6287D');
    const core = new THREE.Color('#FFFFFF');
    for (let i = 0; i < N; i++) {
      // shell cluster with mass ramp
      const mass = Math.pow(rng(), 2.2);
      const r = 0.6 + Math.pow(rng(), 0.6) * 2.4;
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) * 0.7 + 2.2;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const c = accent.clone().lerp(core, mass);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    return { positions, colors };
  }, []);

  useFrame((state) => {
    if (pointsRef.current && groupRef.current?.visible) {
      pointsRef.current.rotation.y = state.clock.elapsedTime * 0.18;
      pointsRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.1) * 0.1;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, PORTAL_Z[0]]}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.035} vertexColors transparent sizeAttenuation />
      </points>
    </group>
  );
}

/** 02 · INTELIGÊNCIA — camera spline drawing itself in accent hairline */
export function IaVignette({ choreo, index }: VignetteProps) {
  const groupRef = useRef<THREE.Group>(null);
  const lineRef = useRef<any>(null);
  useVignetteVisibility(groupRef, choreo, index);

  const points = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.6, 1.2, 1.5),
      new THREE.Vector3(-1.2, 3.2, 0.2),
      new THREE.Vector3(0.8, 2.4, -1.2),
      new THREE.Vector3(2.4, 3.8, -2.2),
      new THREE.Vector3(1.4, 4.6, -3.6),
    ]);
    return curve.getPoints(120);
  }, []);

  useFrame(() => {
    const line = lineRef.current;
    if (!line || !groupRef.current?.visible) return;
    const cp = choreo.current.chapterProgress[index];
    const mat = line.material as THREE.ShaderMaterial;
    if (mat?.uniforms?.dashOffset) {
      mat.uniforms.dashOffset.value = -(1 - Math.min(1, cp * 1.4)) * 40;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, PORTAL_Z[1]]}>
      <Line
        ref={lineRef}
        points={points}
        color="#F6287D"
        lineWidth={1}
        dashed
        dashSize={40}
        gapSize={40}
        transparent
      />
      {/* neural core: small white node at spline end */}
      <mesh position={points[points.length - 1]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshBasicMaterial color="#FFFFFF" transparent />
      </mesh>
    </group>
  );
}

/** 03 · DADOS VIVOS — wireframe spheres orbiting a bright core, data rings */
export function DataVignette({ choreo, index }: VignetteProps) {
  const groupRef = useRef<THREE.Group>(null);
  const orbitRef = useRef<THREE.Group>(null);
  useVignetteVisibility(groupRef, choreo, index);

  useFrame((state) => {
    if (orbitRef.current && groupRef.current?.visible) {
      orbitRef.current.rotation.y = state.clock.elapsedTime * 0.35;
    }
  });

  return (
    <group ref={groupRef} position={[0, 2.4, PORTAL_Z[2]]}>
      {/* núcleo brilhante */}
      <mesh>
        <sphereGeometry args={[0.32, 24, 24]} />
        <meshBasicMaterial color="#FFFFFF" transparent />
      </mesh>
      <pointLight intensity={18} color="#F6287D" distance={12} decay={2} />
      {/* anéis de dados hairline */}
      <mesh rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[1.4, 0.004, 8, 96]} />
        <meshBasicMaterial color="#F6287D" transparent />
      </mesh>
      <mesh rotation={[Math.PI / 1.8, 0.4, 0]}>
        <torusGeometry args={[2.0, 0.004, 8, 96]} />
        <meshBasicMaterial color="#888888" transparent />
      </mesh>
      {/* esferas-wireframe orbitando */}
      <group ref={orbitRef}>
        {[
          { r: 1.4, size: 0.14, speed: 1 },
          { r: 2.0, size: 0.1, speed: -0.7 },
          { r: 1.7, size: 0.08, speed: 1.4 },
        ].map((s, i) => (
          <mesh
            key={i}
            position={[s.r * Math.cos(i * 2.1), Math.sin(i * 1.3) * 0.5, s.r * Math.sin(i * 2.1)]}
          >
            <sphereGeometry args={[s.size, 10, 10]} />
            <meshBasicMaterial color={i === 0 ? '#F6287D' : '#EDEDED'} wireframe transparent />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** 04 · KERNEL C++20 — wireframe grid deformed by a radial force pulse */
export function KernelVignette({ choreo, index }: VignetteProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  useVignetteVisibility(groupRef, choreo, index);
  const chip = useTexture('/kernel-chip.svg');

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh || !groupRef.current?.visible) return;
    const geo = mesh.geometry as THREE.PlaneGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const d = Math.sqrt(x * x + y * y);
      // pulso radial — referência ao campo de forças do kernel
      pos.setZ(i, Math.sin(d * 1.6 - t * 1.4) * Math.exp(-d * 0.32) * 0.7);
    }
    pos.needsUpdate = true;
  });

  return (
    <group ref={groupRef} position={[0, 2.2, PORTAL_Z[3]]}>
      <mesh ref={meshRef} rotation={[-Math.PI / 2.6, 0, 0]}>
        <planeGeometry args={[6, 6, 28, 28]} />
        <meshBasicMaterial color="#F6287D" wireframe transparent opacity={0.5} />
      </mesh>
      {/* kernel-chip.svg flutuando discreto */}
      <mesh position={[2.6, 1.2, -1]} rotation={[0, -0.4, 0]}>
        <planeGeometry args={[1.6, 1.2]} />
        <meshBasicMaterial map={chip} transparent opacity={0.75} />
      </mesh>
    </group>
  );
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
