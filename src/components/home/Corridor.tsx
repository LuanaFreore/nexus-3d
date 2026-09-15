import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MeshReflectorMaterial } from '@react-three/drei';

const MONO_COUNT = 44;

/**
 * MonolithCorridor — infinite-feel corridor of dark extruded boxes
 * (design home.md §cena base): near-black material, slight specular,
 * matte reflective floor, ~400 slow dust motes catching the beam.
 */
export default function Corridor() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dustRef = useRef<THREE.Points>(null);

  const monoliths = useMemo(() => {
    const rng = mulberry32(1337);
    const items: { pos: [number, number, number]; scale: [number, number, number] }[] = [];
    for (let i = 0; i < MONO_COUNT; i++) {
      const z = 6 - i * 3.1 + rng() * 1.2;
      const side = i % 2 === 0 ? 1 : -1;
      const x = side * (3.2 + rng() * 3.4);
      const h = 4.5 + rng() * 6;
      const w = 0.8 + rng() * 1.8;
      const d = 0.8 + rng() * 2.2;
      items.push({ pos: [x, h / 2, z], scale: [w, h, d] });
    }
    return items;
  }, []);

  const dust = useMemo(() => {
    const rng = mulberry32(4242);
    const positions = new Float32Array(400 * 3);
    const seeds = new Float32Array(400);
    for (let i = 0; i < 400; i++) {
      positions[i * 3] = (rng() - 0.5) * 10;
      positions[i * 3 + 1] = rng() * 6;
      positions[i * 3 + 2] = 8 - rng() * 120;
      seeds[i] = rng() * Math.PI * 2;
    }
    return { positions, seeds };
  }, []);

  const dustUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBeamDir: { value: new THREE.Vector3(-0.55, 0.7, -0.45).normalize() },
    }),
    [],
  );

  useFrame((state) => {
    dustUniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <group>
      {/* monoliths */}
      <instancedMesh ref={meshRef} args={[undefined, undefined, MONO_COUNT]} castShadow={false}>
        <boxGeometry />
        <meshStandardMaterial color="#0a0a0c" roughness={0.42} metalness={0.65} />
      </instancedMesh>
      <MonolithPlacer meshRef={meshRef} items={monoliths} />

      {/* matte reflective floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -60]}>
        <planeGeometry args={[60, 220]} />
        <MeshReflectorMaterial
          blur={[280, 60]}
          resolution={1024}
          mixBlur={0.9}
          mixStrength={2.2}
          roughness={0.85}
          depthScale={0.6}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          color="#060607"
          metalness={0.4}
          mirror={0.4}
        />
      </mesh>

      {/* dust in suspension, catching the beam */}
      <points ref={dustRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dust.positions, 3]} />
          <bufferAttribute attach="attributes-aSeed" args={[dust.seeds, 1]} />
        </bufferGeometry>
        <shaderMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={dustUniforms}
          vertexShader={/* glsl */ `
            uniform float uTime;
            attribute float aSeed;
            varying float vGlow;
            void main() {
              vec3 p = position;
              p.x += sin(uTime * 0.12 + aSeed) * 0.35;
              p.y += sin(uTime * 0.09 + aSeed * 2.0) * 0.28;
              // motes near the upper-left beam catch the light
              float beamness = clamp(1.0 - length(p.xy - vec2(-2.0, 4.2)) * 0.22, 0.0, 1.0);
              vGlow = beamness;
              vec4 mv = modelViewMatrix * vec4(p, 1.0);
              gl_Position = projectionMatrix * mv;
              gl_PointSize = (1.4 + beamness * 2.4) * (120.0 / -mv.z);
            }
          `}
          fragmentShader={/* glsl */ `
            varying float vGlow;
            void main() {
              vec2 c = gl_PointCoord - 0.5;
              if (dot(c, c) > 0.25) discard; // circular sprite
              vec3 col = mix(vec3(0.45, 0.42, 0.46), vec3(0.96, 0.16, 0.49), vGlow);
              float a = 0.08 + vGlow * 0.5;
              gl_FragColor = vec4(col, a);
            }
          `}
        />
      </points>

      {/* magenta key light from the beam origin + faint fill */}
      <pointLight position={[-9, 7, -14]} intensity={60} color="#F6287D" distance={60} decay={2} />
      <pointLight position={[6, 3, -40]} intensity={14} color="#ffffff" distance={50} decay={2} />
      <ambientLight intensity={0.06} />
    </group>
  );
}

function MonolithPlacer({
  meshRef,
  items,
}: {
  meshRef: React.RefObject<THREE.InstancedMesh | null>;
  items: { pos: [number, number, number]; scale: [number, number, number] }[];
}) {
  const placed = useRef(false);
  useFrame(() => {
    if (placed.current || !meshRef.current) return;
    const m = new THREE.Matrix4();
    items.forEach((item, i) => {
      m.compose(
        new THREE.Vector3(...item.pos),
        new THREE.Quaternion(),
        new THREE.Vector3(...item.scale),
      );
      meshRef.current!.setMatrixAt(i, m);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    placed.current = true;
  });
  return null;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
