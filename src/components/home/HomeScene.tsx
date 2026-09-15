import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer, Bloom, Vignette, Noise, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import Corridor from './Corridor';
import GodRays from './GodRays';
import { SimVignette, IaVignette, DataVignette, KernelVignette } from './Vignettes';
import { cameraZAt, cameraYAt, cameraFovAt, lerp, type ChoreoState } from './choreo';

interface HomeSceneProps {
  choreo: React.MutableRefObject<ChoreoState>;
}

/**
 * HomeScene — single persistent R3F canvas (design home.md notas).
 * Camera choreography is fully driven by scroll progress; vignettes
 * crossfade via material opacity (never mounted/unmounted).
 */
export default function HomeScene({ choreo }: HomeSceneProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 50, near: 0.1, far: 220, position: [0, 1.6, 8] }}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0 }}
    >
      <color attach="background" args={['#050505']} />
      <fog attach="fog" args={['#050505', 6, 90]} />
      <CameraRig choreo={choreo} />
      <AdaptiveQuality choreo={choreo} />
      <Corridor />
      <GodRays choreo={choreo} />
      <SimVignette choreo={choreo} index={0} />
      <IaVignette choreo={choreo} index={1} />
      <DataVignette choreo={choreo} index={2} />
      <KernelVignette choreo={choreo} index={3} />
      <EffectComposer multisampling={0}>
        <Bloom
          mipmapBlur
          intensity={1.15}
          luminanceThreshold={0.85}
          luminanceSmoothing={0.2}
        />
        <ChromaticAberration blendFunction={BlendFunction.NORMAL} offset={[0.001, 0.001]} radialModulation modulationOffset={0.5} />
        <Vignette eskil={false} offset={0.28} darkness={0.35} />
        <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.04} />
      </EffectComposer>
    </Canvas>
  );
}

/**
 * CameraRig — dolly/orbit driven by scroll (scrub), mouse parallax
 * (±0.15, lerp 0.05) and limited manual drag orbit (±15°, spring return).
 */
function CameraRig({ choreo }: HomeSceneProps) {
  const { camera } = useThree();
  const smooth = useRef({ x: 0, y: 0, z: 8, yaw: 0 });

  useFrame((_, delta) => {
    const ch = choreo.current;
    const targetZ = cameraZAt(ch.progress);
    const targetY = cameraYAt(ch.progress);
    const targetX = ch.mouseX * 0.15;
    const s = smooth.current;

    // scrub: camera follows scroll tightly but with light smoothing
    const k = Math.min(1, delta * 6);
    s.z = lerp(s.z, targetZ, k);
    s.y = lerp(s.y, targetY + ch.mouseY * -0.08, 0.05);
    s.x = lerp(s.x, targetX, 0.05);

    // drag orbit with spring return (±15°)
    if (!ch.dragging) ch.dragTargetYaw *= 0.94;
    ch.dragYaw = lerp(ch.dragYaw, ch.dragTargetYaw, 0.08);
    s.yaw = lerp(s.yaw, ch.dragYaw, 0.08);

    camera.position.set(s.x, s.y, s.z);
    const lookDist = 8;
    camera.lookAt(
      s.x + Math.sin(s.yaw) * lookDist,
      s.y - 0.1,
      s.z - Math.cos(s.yaw) * lookDist,
    );

    const persp = camera as THREE.PerspectiveCamera;
    const targetFov = cameraFovAt(ch.progress);
    if (Math.abs(persp.fov - targetFov) > 0.01) {
      persp.fov = lerp(persp.fov, targetFov, k);
      persp.updateProjectionMatrix();
    }

    // publish live camera coords for the HUD readouts
    ch.camX = camera.position.x;
    ch.camY = camera.position.y;
    ch.camZ = camera.position.z;
  });

  return null;
}

/**
 * AdaptiveQuality — design home.md notas: avg FPS < 45 for 3s → DPR
 * 1.75→1.25, god-rays off (sprite-glow kept via additive sheets),
 * "QUALIDADE ADAPTATIVA ATIVA" flag for the StatReadout.
 */
function AdaptiveQuality({ choreo }: HomeSceneProps) {
  const setDpr = useThree((s) => s.setDpr);
  const acc = useRef({ frames: 0, time: 0, lowTime: 0 });

  useEffect(() => {
    // init published dpr
    choreo.current.dpr = Math.min(window.devicePixelRatio, 1.75);
  }, [choreo]);

  useFrame((state, delta) => {
    const ch = choreo.current;
    const a = acc.current;
    a.frames += 1;
    a.time += delta;
    if (a.time >= 0.5) {
      const fps = a.frames / a.time;
      ch.fps = Math.round(fps);
      ch.ms = Math.round((1000 / fps) * 10) / 10;
      ch.dpr = state.viewport.dpr;
      if (fps < 45 && !ch.adaptive) {
        a.lowTime += a.time;
        if (a.lowTime >= 3) {
          ch.adaptive = true;
          ch.godRaysOff = true;
          setDpr(1.25);
        }
      } else {
        a.lowTime = Math.max(0, a.lowTime - a.time * 0.5);
      }
      a.frames = 0;
      a.time = 0;
    }
  });

  return null;
}
