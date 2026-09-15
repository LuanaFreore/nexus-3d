import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  EffectComposer,
  Bloom,
  Vignette,
  Noise,
  ChromaticAberration,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import {
  advanceLive,
  displayTensao,
  mapCamX,
  mapCamY,
  mapCamZ,
  mapFogDensity,
  mapLightIntensity,
  mapTurbulence,
  type LiveState,
} from './director';

type Live = React.MutableRefObject<LiveState>;

const ACCENT = new THREE.Color('#F6287D');
const WHITE = new THREE.Color('#FFFFFF');
const ACTOR_TARGET = new THREE.Vector3(0, 0.85, 0);

/**
 * IaScene — palco do Diretor Neural (ia.md §Cena 3D):
 * grade wireframe infinita, feixe volumétrico reconfigurável (técnica dos
 * god-rays da Home), ~2.000 partículas de poeira com turbulência dirigida
 * pelo modelo e ator central icosaédrico duplo que pulsa com TENSÃO.
 * Pós: pipeline global do design.md §1.
 */
export default function IaScene({ live }: { live: Live }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 50, near: 0.1, far: 220, position: [0, 2.4, 6.5] }}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0 }}
    >
      <color attach="background" args={['#050505']} />
      <FogRig live={live} />
      <DirectorRig live={live} />
      <Telemetry live={live} />
      <GridFloor live={live} />
      <Beam live={live} />
      <Dust live={live} />
      <Actor live={live} />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.85} luminanceSmoothing={0.2} />
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={[0.0012, 0.0012]}
          radialModulation
          modulationOffset={0.5}
        />
        <Vignette eskil={false} offset={0.28} darkness={0.38} />
        <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.045} />
      </EffectComposer>
    </Canvas>
  );
}

/* ------------------------------------------------------------------ */
/* Rig do diretor: interpolação + câmera dirigida com órbita/dolly     */
/* ------------------------------------------------------------------ */

function DirectorRig({ live }: { live: Live }) {
  const { camera } = useThree();
  const smooth = useRef(new THREE.Vector3(0, 2.4, 6.5));
  const tmp = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const l = live.current;
    advanceLive(l, Math.min(delta, 0.05), performance.now());
    const v = l.current;

    // enquadramento dirigido pelo vetor (dolly ±30% via scroll)
    const base = tmp.current.set(
      mapCamX(v.camX),
      mapCamY(v.camY),
      mapCamZ(v.camZ) * l.dolly,
    );

    // órbita manual em torno do ator (spring de retorno vive em advanceLive)
    const offset = base.clone().sub(ACTOR_TARGET);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), l.dragYaw);
    const right = new THREE.Vector3().crossVectors(offset, new THREE.Vector3(0, 1, 0)).normalize();
    if (right.lengthSq() > 0.001) offset.applyAxisAngle(right, l.dragPitch);
    base.copy(ACTOR_TARGET).add(offset);

    // paralaxe sutil do mouse
    base.x += l.mouseX * 0.25;
    base.y += l.mouseY * -0.15;

    // damping de dolly: a câmera persegue o alvo com suavização
    const k = 1 - Math.exp(-delta * 3.2);
    smooth.current.lerp(base, k);
    camera.position.copy(smooth.current);
    camera.lookAt(ACTOR_TARGET);

    l.camX = camera.position.x;
    l.camY = camera.position.y;
    l.camZ = camera.position.z;
  });

  return null;
}

/* ------------------------------------------------------------------ */
/* Névoa exponencial dirigida pelo parâmetro NÉVOA                     */
/* ------------------------------------------------------------------ */

function FogRig({ live }: { live: Live }) {
  const { scene } = useThree();

  useEffect(() => {
    const fog = new THREE.FogExp2('#050505', mapFogDensity(live.current.current.nevoa));
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene, live]);

  useFrame((_, delta) => {
    const fog = scene.fog as THREE.FogExp2 | null;
    if (!fog) return;
    const target = mapFogDensity(live.current.current.nevoa);
    fog.density = THREE.MathUtils.lerp(fog.density, target, 1 - Math.exp(-delta * 2));
  });

  return null;
}

/* ------------------------------------------------------------------ */
/* Telemetria + qualidade adaptativa (design.md §1, ia.md §Fallbacks)  */
/* ------------------------------------------------------------------ */

function Telemetry({ live }: { live: Live }) {
  const setDpr = useThree((s) => s.setDpr);
  const acc = useRef({ frames: 0, time: 0, lowTime: 0 });

  useEffect(() => {
    live.current.dpr = Math.min(window.devicePixelRatio, 1.75);
  }, [live]);

  useFrame((state, delta) => {
    const l = live.current;
    const a = acc.current;
    a.frames += 1;
    a.time += delta;
    if (a.time >= 0.5) {
      const fps = a.frames / a.time;
      l.fps = Math.round(fps);
      l.ms = Math.round((1000 / fps) * 10) / 10;
      l.dpr = state.viewport.dpr;
      if (fps < 45 && !l.adaptive) {
        a.lowTime += a.time;
        if (a.lowTime >= 3) {
          l.adaptive = true;
          l.beamCone = true; // god-rays → cone translúcido (GPU fraca)
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

/* ------------------------------------------------------------------ */
/* Grade wireframe infinita (hairlines rgba(255,255,255,0.05))         */
/* ------------------------------------------------------------------ */

const gridVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const gridFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFade;
  varying vec3 vWorld;

  float gridLine(vec2 p, float scale) {
    vec2 coord = p / scale;
    vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
    return 1.0 - min(min(grid.x, grid.y), 1.0);
  }

  void main() {
    float line = gridLine(vWorld.xz, 1.0);
    float major = gridLine(vWorld.xz, 5.0);
    float dist = length(vWorld.xz - cameraPosition.xz);
    float fade = exp(-dist * uFade);
    float alpha = (line * 0.7 + major * 0.5) * fade;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function GridFloor({ live }: { live: Live }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: gridVertex,
        fragmentShader: gridFragment,
        transparent: true,
        depthWrite: false,
        uniforms: {
          // hairline rgba(255,255,255,0.05) — pré-multiplicado no alpha final
          uColor: { value: new THREE.Color(0.075, 0.075, 0.075) },
          uFade: { value: 0.09 },
        },
      }),
    [],
  );

  useEffect(() => () => mat.dispose(), [mat]);

  useFrame((_, delta) => {
    // a grade some na névoa junto com o resto da cena
    const target = 0.05 + live.current.current.nevoa * 0.22;
    (mat.uniforms.uFade as { value: number }).value = THREE.MathUtils.lerp(
      (mat.uniforms.uFade as { value: number }).value,
      target,
      1 - Math.exp(-delta * 2),
    );
  });

  return (
    <mesh material={mat} rotation-x={-Math.PI / 2} position-y={-1.2} renderOrder={-1}>
      <planeGeometry args={[240, 240]} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Feixe volumétrico reconfigurável (técnica GodRays da Home)          */
/* ------------------------------------------------------------------ */

const beamVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uCoreColor;
  uniform float uIntensity;
  varying vec2 vUv;

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
    float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float density = exp(-vUv.y * 2.4);
    float streaks = 0.6 + 0.4 * noise(vec2(vUv.x * 9.0, vUv.y * 2.2));
    float core = pow(across, 6.0);
    float body = pow(across, 2.0) * density * streaks;
    vec3 col = uColor * body + uCoreColor * core * density * 0.9;
    float alpha = clamp((body + core * density) * uIntensity, 0.0, 1.0);
    float dither = (hash(gl_FragCoord.xy) - 0.5) / 128.0;
    gl_FragColor = vec4(col * uIntensity + dither, alpha);
  }
`;

const coneFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float g = pow(across, 1.8) * exp(-vUv.y * 1.6);
    gl_FragColor = vec4(uColor * g * uIntensity, g * 0.5 * uIntensity);
  }
`;

const BEAM_LEN = 18;
const BEAM_W = 5.5;

function Beam({ live }: { live: Live }) {
  const groupRef = useRef<THREE.Group>(null);
  const coneRef = useRef<THREE.Mesh>(null);

  const sheetMats = useMemo(() => {
    const mats: THREE.ShaderMaterial[] = [];
    for (let i = 0; i < 3; i++) {
      mats.push(
        new THREE.ShaderMaterial({
          vertexShader: beamVertex,
          fragmentShader: beamFragment,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          uniforms: {
            uColor: { value: ACCENT.clone() },
            uCoreColor: { value: WHITE.clone() },
            uIntensity: { value: 0.9 },
          },
        }),
      );
    }
    return mats;
  }, []);

  const coneMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: beamVertex,
        fragmentShader: coneFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uColor: { value: ACCENT.clone() },
          uIntensity: { value: 0 },
        },
      }),
    [],
  );

  useEffect(
    () => () => {
      sheetMats.forEach((m) => m.dispose());
      coneMat.dispose();
    },
    [sheetMats, coneMat],
  );

  useFrame((_, delta) => {
    const l = live.current;
    const v = l.current;
    const k = 1 - Math.exp(-delta * 2.5);

    // cor da luz cruza magenta ↔ branco (LUZ_HUE)
    const beamColor = ACCENT.clone().lerp(WHITE, v.luzHue * 0.88);
    const intensity = mapLightIntensity(v.luzInt);

    // o feixe reposiciona com a direção (espelha o eixo da câmera)
    const g = groupRef.current;
    if (g) {
      const targetX = -mapCamX(v.camX) * 0.45 - 2.5;
      g.position.x = THREE.MathUtils.lerp(g.position.x, targetX, k);
    }

    sheetMats.forEach((m) => {
      (m.uniforms.uColor as { value: THREE.Color }).value.copy(beamColor);
      const u = m.uniforms.uIntensity as { value: number };
      u.value = THREE.MathUtils.lerp(u.value, l.beamCone ? 0 : intensity, k);
    });

    (coneMat.uniforms.uColor as { value: THREE.Color }).value.copy(beamColor);
    const cu = coneMat.uniforms.uIntensity as { value: number };
    cu.value = THREE.MathUtils.lerp(cu.value, l.beamCone ? intensity : 0, k);
    if (coneRef.current) coneRef.current.visible = cu.value > 0.01;
  });

  // origem elevada, apontando para o ator — mesmo truque de 3 planos cruzados
  const quat = useMemo(() => {
    const dir = new THREE.Vector3(2.2, -1, 1.4).normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  }, []);

  return (
    <group ref={groupRef} position={[-2.5, 5.5, -3.5]} quaternion={quat}>
      {sheetMats.map((mat, i) => (
        <mesh key={i} material={mat} rotation-y={(i * Math.PI) / 3} position-y={-BEAM_LEN / 2}>
          <planeGeometry args={[BEAM_W, BEAM_LEN]} />
        </mesh>
      ))}
      <mesh ref={coneRef} material={coneMat} position-y={-BEAM_LEN / 2} visible={false}>
        <coneGeometry args={[BEAM_W * 0.55, BEAM_LEN, 24, 1, true]} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Poeira: ~2.000 partículas, turbulência (curl-ish) dirigida pelo MLP */
/* ------------------------------------------------------------------ */

const DUST_COUNT = 2000;

const dustVertex = /* glsl */ `
  uniform float uTime;
  uniform float uTurb;
  uniform float uPulse;
  uniform float uPixelRatio;
  attribute vec3 aSeed;
  varying float vFade;
  varying float vSeed;

  void main() {
    vec3 p = position;
    float t = uTime * 0.22;
    // campo de fluxo pseudo-curl: amplitude dirigida por TURBULÊNCIA
    vec3 flow = vec3(
      sin(p.y * 0.72 + t + aSeed.x * 6.2831) + sin(p.z * 0.5 - t * 1.31),
      (sin(p.z * 0.63 + t * 0.82 + aSeed.y * 6.2831) + cos(p.x * 0.41 + t * 0.57)) * 0.55,
      cos(p.x * 0.56 - t + aSeed.z * 6.2831) + sin(p.y * 0.38 + t * 1.13)
    );
    p += flow * uTurb * 0.85;
    // pulso radial (clique no ator)
    vec3 dir = normalize(position + vec3(0.0001, 0.0001, 0.0001));
    p += dir * uPulse * (1.4 + aSeed.y * 1.8);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = max(-mv.z, 0.001);
    gl_PointSize = (1.6 + aSeed.x * 2.6) * uPixelRatio * (7.0 / dist);
    vFade = smoothstep(34.0, 9.0, dist) * (0.3 + 0.7 * aSeed.z);
    vSeed = aSeed.y;
  }
`;

const dustFragment = /* glsl */ `
  uniform vec3 uAccent;
  varying float vFade;
  varying float vSeed;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.08, d) * vFade * 0.5;
    vec3 col = mix(uAccent * 0.7, vec3(1.0), vSeed * 0.85);
    gl_FragColor = vec4(col, alpha);
  }
`;

function Dust({ live }: { live: Live }) {
  const { viewport } = useThree();

  const { geometry, mat } = useMemo(() => {
    const positions = new Float32Array(DUST_COUNT * 3);
    const seeds = new Float32Array(DUST_COUNT * 3);
    let s = 1234567;
    const rand = () => {
      s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    for (let i = 0; i < DUST_COUNT; i++) {
      positions[i * 3] = (rand() - 0.5) * 30;
      positions[i * 3 + 1] = -1 + rand() * 8;
      positions[i * 3 + 2] = (rand() - 0.5) * 30;
      seeds[i * 3] = rand();
      seeds[i * 3 + 1] = rand();
      seeds[i * 3 + 2] = rand();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));

    const material = new THREE.ShaderMaterial({
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uTurb: { value: 0.4 },
        uPulse: { value: 0 },
        uPixelRatio: { value: 1 },
        uAccent: { value: ACCENT.clone() },
      },
    });
    return { geometry: geo, mat: material };
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      mat.dispose();
    },
    [geometry, mat],
  );

  useFrame((state, delta) => {
    const l = live.current;
    const k = 1 - Math.exp(-delta * 2);
    (mat.uniforms.uTime as { value: number }).value = state.clock.elapsedTime;
    const tu = mat.uniforms.uTurb as { value: number };
    tu.value = THREE.MathUtils.lerp(tu.value, mapTurbulence(l.current.turbulencia), k);
    (mat.uniforms.uPulse as { value: number }).value = l.pulse;
    (mat.uniforms.uPixelRatio as { value: number }).value = viewport.dpr;
  });

  return <points geometry={geometry} material={mat} frustumCulled={false} />;
}

/* ------------------------------------------------------------------ */
/* Ator central: icosaedro wireframe duplo, pulsa com TENSÃO           */
/* ------------------------------------------------------------------ */

const actorVertex = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// build-up: linhas "desenhadas" por varredura angular (dashOffset-like)
const actorFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uBrightness;
  uniform float uProgress;
  varying vec3 vPos;

  void main() {
    float ang = atan(vPos.z, vPos.x) / 6.2831853 + 0.5;
    float sweep = 1.0 - smoothstep(uProgress - 0.07, uProgress, ang);
    float vertical = smoothstep(-1.4, 1.4, vPos.y) * 0.3 + 0.7;
    float a = sweep * vertical;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor * uBrightness, a);
  }
`;

function Actor({ live }: { live: Live }) {
  const outerRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);

  const outerGeo = useMemo(() => new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.35, 1)), []);
  const innerGeo = useMemo(() => new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(0.82, 0)), []);

  const outerMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: actorVertex,
        fragmentShader: actorFragment,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uColor: { value: new THREE.Color(1, 1, 1) },
          uBrightness: { value: 0.42 },
          uProgress: { value: 0 },
        },
      }),
    [],
  );

  const innerMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: actorVertex,
        fragmentShader: actorFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uColor: { value: ACCENT.clone() },
          uBrightness: { value: 1.2 },
          uProgress: { value: 0 },
        },
      }),
    [],
  );

  useEffect(
    () => () => {
      outerGeo.dispose();
      innerGeo.dispose();
      outerMat.dispose();
      innerMat.dispose();
    },
    [outerGeo, innerGeo, outerMat, innerMat],
  );

  useFrame((state, delta) => {
    const l = live.current;
    const tensao = displayTensao(l);

    // rotação lenta contínua (12s/volta), interno em contrafase
    const rot = (delta * Math.PI * 2) / 12;
    if (outerRef.current) {
      outerRef.current.rotation.y += rot;
      outerRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.12;
    }
    if (innerRef.current) {
      innerRef.current.rotation.y -= rot * 1.35;
      innerRef.current.rotation.z += rot * 0.5;
    }

    // pulso de escala 1.0→1.04, frequência cresce com a TENSÃO
    const freq = 1.2 + tensao * 6.5;
    const pulse = 1 + 0.04 * (0.5 + 0.5 * Math.sin(state.clock.elapsedTime * freq));
    const spikeScale = 1 + l.spike * 0.12;
    outerRef.current?.scale.setScalar(pulse * spikeScale);
    innerRef.current?.scale.setScalar((2 - pulse) * spikeScale);

    // build-up wireframe (1.2s) + brilho do núcleo sobe com a tensão
    (outerMat.uniforms.uProgress as { value: number }).value = l.reveal * 1.07;
    (innerMat.uniforms.uProgress as { value: number }).value = l.reveal * 1.07;
    (innerMat.uniforms.uBrightness as { value: number }).value = 0.9 + tensao * 1.1;
  });

  return (
    <group position={ACTOR_TARGET}>
      <group ref={outerRef}>
        <lineSegments geometry={outerGeo} material={outerMat} />
      </group>
      <group ref={innerRef}>
        <lineSegments geometry={innerGeo} material={innerMat} />
      </group>
      {/* proxy invisível para raycast de hover/clique */}
      <mesh
        visible={false}
        onPointerOver={(e) => {
          e.stopPropagation();
          live.current.hoverActor = true;
        }}
        onPointerOut={() => {
          live.current.hoverActor = false;
        }}
        onClick={(e) => {
          e.stopPropagation();
          live.current.spike = Math.min(1, live.current.spike + 0.55);
          live.current.pulse = 1;
        }}
      >
        <sphereGeometry args={[1.5, 12, 12]} />
      </mesh>
    </group>
  );
}
