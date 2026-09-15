import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { ChoreoState } from './choreo';

const BEAM_ORIGIN = new THREE.Vector3(-11, 8.5, -20);
const BEAM_DIR = new THREE.Vector3(0.62, -0.42, -0.66).normalize();

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uCoreColor;
  uniform float uIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;

  // cheap hash noise for density streaks
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  void main() {
    // across-beam falloff (x), along-beam density falloff (y)
    float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float density = exp(-vUv.y * 2.6);
    // volumetric streaks — static in space, shift only with viewpoint
    float streaks = 0.6 + 0.4 * noise(vec2(vUv.x * 9.0, vUv.y * 2.2));
    float core = pow(across, 6.0);
    float body = pow(across, 2.0) * density * streaks;
    vec3 col = uColor * body + uCoreColor * core * density * 0.9;
    float alpha = clamp((body + core * density) * uIntensity, 0.0, 1.0);
    // dithering anti-banding (design: HDR accumulation feel)
    float dither = (hash(gl_FragCoord.xy) - 0.5) / 128.0;
    gl_FragColor = vec4(col * uIntensity + dither, alpha);
  }
`;

/**
 * GodRays — volumetric magenta beam with white core through the monolith
 * corridor. Three crossed additive sheets give parallax volume; density
 * falloff + streak noise + dithering. The light is view-dependent: it
 * "breathes" as a function of camera position (never animated in time).
 */
export default function GodRays({ choreo }: { choreo: React.MutableRefObject<ChoreoState> }) {
  const groupRef = useRef<THREE.Group>(null);
  const matsRef = useRef<THREE.ShaderMaterial[]>([]);
  const { camera } = useThree();

  const materials = useMemo(() => {
    const mats: THREE.ShaderMaterial[] = [];
    for (let i = 0; i < 3; i++) {
      mats.push(
        new THREE.ShaderMaterial({
          vertexShader,
          fragmentShader,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          uniforms: {
            uColor: { value: new THREE.Color('#F6287D') },
            uCoreColor: { value: new THREE.Color('#FFFFFF') },
            uIntensity: { value: 1 },
          },
        }),
      );
    }
    matsRef.current = mats;
    return mats;
  }, []);

  const quat = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), BEAM_DIR.clone());
    return q;
  }, []);

  useFrame(() => {
    const ch = choreo.current;
    // view-dependent breathing: intensity follows camera alignment with beam
    const camPos = camera.position;
    const toCam = new THREE.Vector3().subVectors(camPos, BEAM_ORIGIN).normalize();
    const align = Math.abs(toCam.dot(BEAM_DIR));
    const drift = 0.75 + align * 0.45 + ch.beamBoost;
    const intensity = ch.godRaysOff ? 0 : drift;
    matsRef.current.forEach((m) => {
      m.uniforms.uIntensity.value = THREE.MathUtils.lerp(
        m.uniforms.uIntensity.value as number,
        intensity,
        0.08,
      );
      // IA chapter: beam hue slides magenta → white (o diretor "decide")
      const iaT = THREE.MathUtils.smoothstep(ch.progress, 0.61, 0.68);
      (m.uniforms.uColor.value as THREE.Color)
        .set('#F6287D')
        .lerp(new THREE.Color('#ffffff'), iaT * 0.55);
    });
  });

  return (
    <group ref={groupRef} position={BEAM_ORIGIN} quaternion={quat}>
      {materials.map((mat, i) => (
        <mesh key={i} rotation={[0, (i / 3) * Math.PI, 0]} position={[0, 14, 0]}>
          <planeGeometry args={[7.5, 34, 1, 1]} />
          <primitive object={mat} attach="material" />
        </mesh>
      ))}
    </group>
  );
}
