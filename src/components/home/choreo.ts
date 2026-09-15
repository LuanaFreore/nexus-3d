/**
 * Shared mutable choreography state for the Home page.
 * Written by GSAP ScrollTrigger (scroll progress), pointer handlers and the
 * R3F render loop; read by the 3D scene (useFrame) and the HTML telemetry
 * readouts. Mutable refs avoid re-rendering React at frame rate.
 */
export interface ChoreoState {
  /** 0..1 scroll progress across acts 1–3 (0–620vh) */
  progress: number;
  /** local progress (0..1) inside each act-3 chapter */
  chapterProgress: [number, number, number, number];
  /** live camera position (for HUD readouts) */
  camX: number;
  camY: number;
  camZ: number;
  /** live render stats */
  fps: number;
  ms: number;
  dpr: number;
  /** normalized mouse -1..1 */
  mouseX: number;
  mouseY: number;
  /** manual drag orbit yaw in radians (springs back to 0) */
  dragYaw: number;
  dragTargetYaw: number;
  dragging: boolean;
  /** beam intensity boost (scrub, act 2 "A FÍSICA É REAL.") */
  beamBoost: number;
  /** adaptive quality engaged */
  adaptive: boolean;
  /** god-rays disabled (fallback or adaptive) */
  godRaysOff: boolean;
}

export function createChoreo(): ChoreoState {
  return {
    progress: 0,
    chapterProgress: [0, 0, 0, 0],
    camX: 0,
    camY: 1.6,
    camZ: 8,
    fps: 60,
    ms: 16.6,
    dpr: 1,
    mouseX: 0,
    mouseY: 0,
    dragYaw: 0,
    dragTargetYaw: 0,
    dragging: false,
    beamBoost: 0,
    adaptive: false,
    godRaysOff: false,
  };
}

export function isWebGL2Available(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
}

/** Camera dolly path: progress (0..1 over 620vh) → camera z. */
export function cameraZAt(p: number): number {
  // act boundaries (vh): act1 0-100, act2 100-300, act3 300-620 (4×80vh)
  const P1 = 100 / 620;
  const P2 = 300 / 620;
  if (p <= P1) {
    // ATO 1: dolly-in z 8 → 5.5
    return lerp(8, 5.5, p / P1);
  }
  if (p <= P2) {
    // ATO 2: dolly contínuo pelo corredor
    return lerp(5.5, -14, (p - P1) / (P2 - P1));
  }
  // ATO 3: 4 capítulos — desacelera diante de cada pórtico, atravessa no fim
  const cp = (p - P2) / (1 - P2); // 0..1 across chapters
  const per = 1 / 4;
  const idx = Math.min(3, Math.floor(cp / per));
  const local = (cp - idx * per) / per; // 0..1 inside chapter
  const portalZ = -20 - idx * 24;
  const prevZ = idx === 0 ? -14 : -20 - (idx - 1) * 24 - 6;
  if (local < 0.3) {
    // aproximação com ease (desacelera)
    const t = easeOutCubic(local / 0.3);
    return lerp(prevZ, portalZ, t);
  }
  if (local < 0.8) {
    return portalZ + Math.sin(local * Math.PI) * 0.15; // micro deriva no pórtico
  }
  // atravessa o pórtico
  return lerp(portalZ, portalZ - 6, (local - 0.8) / 0.2);
}

/** FOV pulse 50→58→50 ao atravessar pórticos (sensação de passagem). */
export function cameraFovAt(p: number): number {
  const P2 = 300 / 620;
  if (p <= P2) return 50;
  const cp = (p - P2) / (1 - P2);
  const per = 1 / 4;
  const local = (cp % per) / per;
  if (local < 0.75) return 50;
  const t = (local - 0.75) / 0.25; // 0..1 through portal
  return 50 + Math.sin(t * Math.PI) * 8;
}

export function cameraYAt(p: number): number {
  const P1 = 100 / 620;
  if (p <= P1) return lerp(1.6, 1.9, p / P1);
  return 1.9 + Math.sin(p * Math.PI * 3) * 0.12;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
