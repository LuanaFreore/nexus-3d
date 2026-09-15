import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer, Bloom, Vignette, Noise, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import type { DynamicParams, EngineMode, StaticConfig, Telemetry } from './types';
import { CPU_FALLBACK_COUNT } from './types';
import { generateInitialState } from './initialConditions';
import { GpuEngine } from './GpuEngine';
import { CpuEngine } from './CpuEngine';
import type { NBodyEngine } from './engine';
import { POINTS_VERTEX_SHADER, POINTS_FRAGMENT_SHADER } from './shaders';

export interface WellState {
  active: boolean;
  repel: boolean;
  world: [number, number, number];
}

export interface NBodySceneProps {
  config: StaticConfig;
  mode: EngineMode;
  dynRef: MutableRefObject<DynamicParams>;
  pausedRef: MutableRefObject<boolean>;
  wellRef: MutableRefObject<WellState>;
  telemetryRef: MutableRefObject<Telemetry>;
  engineRef: MutableRefObject<NBodyEngine | null>;
  restartToken: number;
  onRequestReduceN: () => void;
  onFirstInteract: () => void;
}

/**
 * NBodyScene — full-viewport R3F canvas: GPU N-body points + camera rig +
 * post pipeline (bloom seletivo + vignette + grain, same as Home).
 */
export default function NBodyScene(props: NBodySceneProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 55, near: 0.1, far: 400, position: [0, 10, 24] }}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }}
    >
      <color attach="background" args={['#050505']} />
      <Simulation {...props} />
      <CameraRig
        wellRef={props.wellRef}
        telemetryRef={props.telemetryRef}
        onFirstInteract={props.onFirstInteract}
      />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={1.25} luminanceThreshold={0.55} luminanceSmoothing={0.25} />
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={[0.0008, 0.0008]}
          radialModulation
          modulationOffset={0.5}
        />
        <Vignette eskil={false} offset={0.26} darkness={0.38} />
        <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.04} />
      </EffectComposer>
    </Canvas>
  );
}

/**
 * Simulation — owns engine lifecycle (rebuilds on preset/N/seed/restart),
 * the THREE.Points renderer and the per-frame telemetry/adaptive-quality loop.
 */
function Simulation({
  config,
  mode,
  dynRef,
  pausedRef,
  wellRef,
  telemetryRef,
  engineRef,
  restartToken,
  onRequestReduceN,
}: NBodySceneProps) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const setDpr = useThree((s) => s.setDpr);

  const engineLocal = useRef<NBodyEngine | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const matRef = useRef<THREE.ShaderMaterial | null>(null);
  const birth = useRef(0);
  const simTime = useRef(0);
  const fpsEma = useRef(60);
  const frameMsEma = useRef(16.6);
  const lowFpsSince = useRef<number | null>(null);
  const dprDegraded = useRef(false);
  const nReduced = useRef(false);
  const telemetryClock = useRef(0);

  // engine + points lifecycle
  useEffect(() => {
    const count = mode === 'cpu' ? CPU_FALLBACK_COUNT : config.count;
    const state = generateInitialState(config.preset, count, config.seed);
    let engine: NBodyEngine;
    try {
      engine =
        mode === 'gpu'
          ? new GpuEngine(gl, state, dynRef.current)
          : new CpuEngine(state, dynRef.current);
    } catch (err) {
      // float textures claimed but compute failed → hard fallback
      console.error('[simulacao] GPU engine failed, falling back to CPU:', err);
      engine = new CpuEngine(
        generateInitialState(config.preset, CPU_FALLBACK_COUNT, config.seed),
        dynRef.current,
      );
    }
    engineLocal.current = engine;
    engineRef.current = engine;
    birth.current = 0;
    simTime.current = 0;

    const n = engine.count;
    const cpu = engine.mode === 'cpu';
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(n * 3);
    if (cpu) posArr.set((engine as CpuEngine).positions);
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(posArr, 3).setUsage(THREE.DynamicDrawUsage),
    );
    if (cpu) {
      geo.setAttribute('aMass', new THREE.BufferAttribute(engine.getMasses(), 1));
    } else {
      const size = Math.sqrt(n);
      const ref = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        ref[i * 2] = ((i % size) + 0.5) / size;
        ref[i * 2 + 1] = (Math.floor(i / size) + 0.5) / size;
      }
      geo.setAttribute('reference', new THREE.BufferAttribute(ref, 2));
    }
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 500);

    const mat = new THREE.ShaderMaterial({
      defines: cpu ? { CPU_MODE: 1 } : {},
      uniforms: {
        uPosTex: { value: null },
        uPointScale: { value: 600 },
        uMassMin: { value: engine.massMin },
        uMassMax: { value: engine.massMax },
        uBirth: { value: 0 },
        uColorA: { value: new THREE.Color('#F6287D') },
        uColorB: { value: new THREE.Color('#FFFFFF') },
        uFogColor: { value: new THREE.Color('#050505') },
        uFogDensity: { value: 0.011 },
      },
      vertexShader: POINTS_VERTEX_SHADER,
      fragmentShader: POINTS_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    pointsRef.current = pts;
    matRef.current = mat;

    return () => {
      scene.remove(pts);
      geo.dispose();
      mat.dispose();
      engine.dispose();
      engineLocal.current = null;
      engineRef.current = null;
      pointsRef.current = null;
      matRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, config.preset, config.count, config.seed, mode, restartToken]);

  useFrame((state, delta) => {
    const engine = engineLocal.current;
    if (!engine) return;

    // fps / frame-time EMAs
    const fps = 1 / Math.max(delta, 1e-4);
    fpsEma.current += (fps - fpsEma.current) * 0.05;
    const frameMs = delta * 1000;
    frameMsEma.current += (frameMs - frameMsEma.current) * 0.08;

    engine.setDynamic(dynRef.current);

    // cursor gravity well
    const w = wellRef.current;
    const signed = w.active ? (w.repel ? -1 : 1) * dynRef.current.wellMass : 0;
    engine.setWell(w.world[0], w.world[1], w.world[2], signed);

    // integrate
    if (!pausedRef.current) {
      const dt = (1 / 60) * dynRef.current.dtScale;
      engine.step(dt);
      simTime.current += dt;
    }

    // renderer material sync
    const mat = matRef.current;
    if (mat) {
      birth.current = Math.min(1, birth.current + delta / 1.2);
      mat.uniforms.uBirth.value = birth.current;
      const cam = state.camera as THREE.PerspectiveCamera;
      const fov = (cam.fov * Math.PI) / 180;
      const drawingH = state.gl.getDrawingBufferSize(new THREE.Vector2()).y;
      mat.uniforms.uPointScale.value = (drawingH / (2 * Math.tan(fov / 2))) * 0.075;
      if (engine.mode === 'gpu') {
        mat.uniforms.uPosTex.value = engine.getPositionTexture();
      } else {
        const attr = pointsRef.current?.geometry.getAttribute('position') as
          | THREE.BufferAttribute
          | undefined;
        if (attr) {
          (attr.array as Float32Array).set((engine as CpuEngine).positions);
          attr.needsUpdate = true;
        }
      }
    }

    // telemetry
    const tel = telemetryRef.current;
    tel.fps = fpsEma.current;
    tel.frameMs = frameMsEma.current;
    tel.stepMs = engine.lastStepMs;
    tel.n = engine.count;
    tel.simTime = simTime.current;

    telemetryClock.current += delta;
    if (telemetryClock.current >= 0.4) {
      telemetryClock.current = 0;
      const sample = engine.sampleTelemetry();
      if (sample) {
        tel.energy = sample.energy;
        tel.com = sample.com;
      }
    }

    // adaptive quality (design.md §1 / simulacao.md): FPS < 45 for 3s
    if (fpsEma.current < 45) {
      if (lowFpsSince.current === null) lowFpsSince.current = performance.now();
      if (performance.now() - lowFpsSince.current > 3000) {
        if (!dprDegraded.current) {
          dprDegraded.current = true;
          setDpr(1.25);
          lowFpsSince.current = performance.now();
        } else if (!nReduced.current && engine.mode === 'gpu') {
          nReduced.current = true;
          onRequestReduceN();
        }
      }
    } else {
      lowFpsSince.current = null;
    }
  });

  return null;
}

/**
 * CameraRig — custom engine-style controls (simulacao.md):
 * left-drag = gravity well (Shift = repel), wheel = dolly zoom clamped
 * 2–60, right-drag = orbit, double-click = recenter on center of mass.
 */
function CameraRig({
  wellRef,
  telemetryRef,
  onFirstInteract,
}: {
  wellRef: MutableRefObject<WellState>;
  telemetryRef: MutableRefObject<Telemetry>;
  onFirstInteract: () => void;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const rig = useRef({
    yaw: 0.45,
    pitch: 0.42,
    dist: 26,
    target: new THREE.Vector3(0, 0, 0),
    goal: new THREE.Vector3(0, 0, 0),
  });
  const drag = useRef({ well: false, orbit: false, pointerId: -1 });
  const ndc = useRef(new THREE.Vector2(0, 0));

  useEffect(() => {
    const el = gl.domElement;

    const updateNdc = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      ndc.current.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      onFirstInteract();
      updateNdc(e);
      if (e.button === 0) {
        drag.current.well = true;
        drag.current.pointerId = e.pointerId;
        wellRef.current.active = true;
        wellRef.current.repel = e.shiftKey;
        el.setPointerCapture(e.pointerId);
      } else if (e.button === 2) {
        drag.current.orbit = true;
        drag.current.pointerId = e.pointerId;
        el.setPointerCapture(e.pointerId);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (drag.current.well) {
        updateNdc(e);
        wellRef.current.repel = e.shiftKey;
      } else if (drag.current.orbit) {
        rig.current.yaw -= e.movementX * 0.005;
        rig.current.pitch = THREE.MathUtils.clamp(
          rig.current.pitch + e.movementY * 0.005,
          -1.35,
          1.35,
        );
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== drag.current.pointerId) return;
      if (e.button === 0) {
        drag.current.well = false;
        wellRef.current.active = false;
      } else if (e.button === 2) {
        drag.current.orbit = false;
      }
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      rig.current.dist = THREE.MathUtils.clamp(
        rig.current.dist * Math.exp(e.deltaY * 0.0012),
        2,
        60,
      );
    };

    const onDblClick = () => {
      const com = telemetryRef.current.com;
      rig.current.goal.set(com[0], com[1], com[2]);
    };

    const onContextMenu = (e: Event) => e.preventDefault();
    const onBlur = () => {
      drag.current.well = false;
      drag.current.orbit = false;
      wellRef.current.active = false;
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('dblclick', onDblClick);
    el.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('dblclick', onDblClick);
      el.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('blur', onBlur);
    };
  }, [gl, wellRef, telemetryRef, onFirstInteract]);

  useFrame(() => {
    const r = rig.current;
    // ease target toward goal (double-click recenter)
    r.target.lerp(r.goal, 0.08);

    camera.position.set(
      r.target.x + r.dist * Math.cos(r.pitch) * Math.sin(r.yaw),
      r.target.y + r.dist * Math.sin(r.pitch),
      r.target.z + r.dist * Math.cos(r.pitch) * Math.cos(r.yaw),
    );
    camera.lookAt(r.target);

    // project the mouse ray onto the plane at `dist` from the camera →
    // world position of the gravity well
    if (wellRef.current.active) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc.current, camera);
      const p = ray.ray.origin.clone().addScaledVector(ray.ray.direction, r.dist);
      wellRef.current.world = [p.x, p.y, p.z];
    }
  });

  return null;
}
