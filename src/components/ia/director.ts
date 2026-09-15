/**
 * director.ts — lógica do Diretor Neural (ia.md).
 *
 * Vetor de saída do MLP (8 parâmetros normalizados 0..1), fallback local
 * determinístico (FNV-1a + heurística de palavras-chave pt-BR) e a máquina
 * de interpolação por parâmetro (luz/névoa mais lentas, câmera com damping).
 */

export interface Vec8 {
  camX: number;
  camY: number;
  camZ: number;
  luzInt: number;
  luzHue: number;
  nevoa: number;
  turbulencia: number;
  tensao: number;
}

export type Vec8Key = keyof Vec8;

export interface ParamDef {
  key: Vec8Key;
  label: string;
  desc: string;
}

export const PARAMS: ParamDef[] = [
  { key: 'camX', label: 'CAM_X', desc: 'Posição lateral da câmera (−4.5m … +4.5m)' },
  { key: 'camY', label: 'CAM_Y', desc: 'Altura da câmera (0.6m … 5.5m)' },
  { key: 'camZ', label: 'CAM_Z', desc: 'Distância de dolly até o ator (3.2m … 9.5m)' },
  { key: 'luzInt', label: 'LUZ_INT', desc: 'Intensidade do feixe volumétrico' },
  { key: 'luzHue', label: 'LUZ_HUE', desc: 'Matiz da luz: magenta ↔ branco' },
  { key: 'nevoa', label: 'NÉVOA', desc: 'Densidade da névoa exponencial do void' },
  { key: 'turbulencia', label: 'TURBULÊNCIA', desc: 'Amplitude do curl noise na poeira' },
  { key: 'tensao', label: 'TENSÃO', desc: 'Ritmo do pulso do ator central' },
];

export const PARAM_KEYS: Vec8Key[] = PARAMS.map((p) => p.key);

/** Estado neutro inicial da cena (antes da primeira direção). */
export const DEFAULT_VECTOR: Vec8 = {
  camX: 0.5,
  camY: 0.42,
  camZ: 0.55,
  luzInt: 0.55,
  luzHue: 0.15,
  nevoa: 0.35,
  turbulencia: 0.3,
  tensao: 0.2,
};

/* ------------------------------------------------------------------ */
/* Mapeamento vetor → cena                                             */
/* ------------------------------------------------------------------ */

export const mapCamX = (v: number) => -4.5 + v * 9;
export const mapCamY = (v: number) => 0.6 + v * 4.9;
export const mapCamZ = (v: number) => 3.2 + v * 6.3;
export const mapLightIntensity = (v: number) => 0.12 + v * 1.6;
export const mapFogDensity = (v: number) => 0.012 + v * 0.105;
export const mapTurbulence = (v: number) => 0.05 + v * 1.45;

/* ------------------------------------------------------------------ */
/* Fallback local determinístico                                       */
/* ------------------------------------------------------------------ */

/** FNV-1a 32-bit — semeia o vetor local (ia.md: "hash FNV-1a do prompt"). */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface KeywordRule {
  match: RegExp;
  nudge: Partial<Vec8>;
}

/** Heurística v1 — palavras-chave pt-BR puxam o vetor para presets. */
const KEYWORD_RULES: KeywordRule[] = [
  {
    match: /tens|suspense|colis|conflito|iminent/,
    nudge: { tensao: 0.88, luzInt: 0.82, camZ: 0.22, camY: 0.28, luzHue: 0.08 },
  },
  {
    match: /calm|seren|paz|sil[êe]ncio|profunda|tranquil/,
    nudge: { tensao: 0.08, turbulencia: 0.1, luzInt: 0.42, nevoa: 0.5, luzHue: 0.72, camZ: 0.62 },
  },
  {
    match: /caos|ca[óo]tic|euforia|explos|frenesi|del[ií]rio/,
    nudge: { turbulencia: 0.94, tensao: 0.78, luzInt: 0.92, luzHue: 0.05, camY: 0.68 },
  },
  {
    match: /melancol|triste|nost[áa]lg|solid[ãa]o|espacial|vazio|deriva/,
    nudge: { nevoa: 0.86, luzInt: 0.3, tensao: 0.22, camZ: 0.82, luzHue: 0.6, turbulencia: 0.18 },
  },
  {
    match: /escur|trevas|noite|sombra|abismo/,
    nudge: { luzInt: 0.14, nevoa: 0.72, luzHue: 0.1 },
  },
  {
    match: /luz|brilho|clar[ãa]o|aurora|alvorada|neon/,
    nudge: { luzInt: 0.95, luzHue: 0.78, nevoa: 0.28 },
  },
  {
    match: /n[ée]voa|nevoeiro|fuma[çc]a|bruma/,
    nudge: { nevoa: 0.9, luzInt: 0.5 },
  },
  {
    match: /[óo]rbita|rodopio|giro|espiral/,
    nudge: { camX: 0.85, camY: 0.55, turbulencia: 0.6 },
  },
];

/**
 * Direção local determinística: o mesmo prompt produz SEMPRE o mesmo vetor.
 * Base pseudo-aleatória semeada por FNV-1a, depois misturada (peso 0.72)
 * com os presets de cada palavra-chave encontrada.
 */
export function localDirect(prompt: string): Vec8 {
  const normalized = prompt.toLowerCase().normalize('NFC');
  const seed = fnv1a(normalized);
  const rand = mulberry32(seed);

  const vec: Vec8 = {
    camX: 0.15 + rand() * 0.7,
    camY: 0.15 + rand() * 0.7,
    camZ: 0.15 + rand() * 0.7,
    luzInt: 0.15 + rand() * 0.7,
    luzHue: 0.1 + rand() * 0.6,
    nevoa: 0.15 + rand() * 0.7,
    turbulencia: 0.15 + rand() * 0.7,
    tensao: 0.15 + rand() * 0.7,
  };

  for (const rule of KEYWORD_RULES) {
    if (!rule.match.test(normalized)) continue;
    for (const key of PARAM_KEYS) {
      const target = rule.nudge[key];
      if (target === undefined) continue;
      vec[key] = vec[key] * 0.28 + target * 0.72;
    }
  }

  return clampVec(vec);
}

export function clampVec(v: Vec8): Vec8 {
  const out = { ...v };
  for (const key of PARAM_KEYS) out[key] = Math.min(1, Math.max(0, out[key]));
  return out;
}

/* ------------------------------------------------------------------ */
/* Backend: POST /v1/direct                                            */
/* ------------------------------------------------------------------ */

export interface DirectResult {
  vector: Vec8;
  device: string;
  status: number;
  latencyMs: number;
}

const BACKEND_KEY_MAP: Record<string, Vec8Key> = {
  cam_x: 'camX',
  camx: 'camX',
  cam_y: 'camY',
  camy: 'camY',
  cam_z: 'camZ',
  camz: 'camZ',
  luz_int: 'luzInt',
  light_intensity: 'luzInt',
  luzint: 'luzInt',
  luz_hue: 'luzHue',
  light_hue: 'luzHue',
  luzhue: 'luzHue',
  nevoa: 'nevoa',
  fog: 'nevoa',
  fog_density: 'nevoa',
  turbulencia: 'turbulencia',
  turbulence: 'turbulencia',
  tensao: 'tensao',
  tension: 'tensao',
};

/** Parser tolerante: aceita [8], {vector:[8]}, {params:{…}} ou chaves flat. */
export function parseDirectionResponse(json: unknown): Vec8 | null {
  if (Array.isArray(json) && json.length === 8 && json.every((n) => typeof n === 'number')) {
    const out = {} as Vec8;
    PARAM_KEYS.forEach((key, i) => {
      out[key] = json[i] as number;
    });
    return clampVec(out);
  }
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.vector)) return parseDirectionResponse(obj.vector);
    if (obj.params && typeof obj.params === 'object') return parseDirectionResponse(obj.params);

    const out: Partial<Vec8> = {};
    let found = 0;
    for (const [rawKey, value] of Object.entries(obj)) {
      const key = BACKEND_KEY_MAP[rawKey.toLowerCase()];
      if (key && typeof value === 'number') {
        out[key] = value;
        found++;
      }
    }
    if (found === 8) return clampVec(out as Vec8);
  }
  return null;
}

export function extractDevice(json: unknown): string {
  if (json && typeof json === 'object') {
    const device = (json as Record<string, unknown>).device;
    if (typeof device === 'string' && device.length > 0) return device;
  }
  return 'cuda:0';
}

/* ------------------------------------------------------------------ */
/* Máquina de interpolação (ease-in-out por parâmetro)                 */
/* ------------------------------------------------------------------ */

export interface Transition {
  from: Vec8;
  to: Vec8;
  start: number; // performance.now()
  duration: number; // ms
}

/** Estado vivo compartilhado cena ↔ HUD (mutado fora do React render). */
export interface LiveState {
  current: Vec8; // vetor exibido/aplicado neste frame
  fixed: Vec8; // última direção fixada (para onde o preview retorna)
  transition: Transition | null;
  spike: number; // spike de TENSÃO (clique no ator), decai em ~3s
  pulse: number; // pulso radial de partículas 0..1
  reveal: number; // build-up wireframe do ator 0..1 (1.2s)
  revealDelay: number;
  dragYaw: number;
  dragPitch: number;
  dragVelYaw: number;
  dragVelPitch: number;
  dragging: boolean;
  dolly: number; // 0.7 … 1.3 (scroll ±30%)
  mouseX: number;
  mouseY: number;
  hoverActor: boolean;
  fps: number;
  ms: number;
  dpr: number;
  camX: number;
  camY: number;
  camZ: number;
  adaptive: boolean;
  beamCone: boolean; // fallback GPU fraca: cone translúcido
}

export function createLiveState(): LiveState {
  return {
    current: { ...DEFAULT_VECTOR },
    fixed: { ...DEFAULT_VECTOR },
    transition: null,
    spike: 0,
    pulse: 0,
    reveal: 0,
    revealDelay: 0.35,
    dragYaw: 0,
    dragPitch: 0,
    dragVelYaw: 0,
    dragVelPitch: 0,
    dragging: false,
    dolly: 1,
    mouseX: 0,
    mouseY: 0,
    hoverActor: false,
    fps: 0,
    ms: 0,
    dpr: 1,
    camX: 0,
    camY: 0,
    camZ: 0,
    adaptive: false,
    beamCone: false,
  };
}

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Curvas individuais por parâmetro (ia.md §Interações):
 * luz/névoa mais lentas (atraso de fase), turbulência/tensão mais rápidas.
 */
function paramEase(key: Vec8Key, t: number): number {
  switch (key) {
    case 'luzInt':
    case 'luzHue':
    case 'nevoa': {
      const slow = Math.pow(t, 1.45);
      return slow * slow * (3 - 2 * slow); // smoothstep atrasado
    }
    case 'turbulencia':
    case 'tensao': {
      const fast = Math.pow(t, 0.65);
      return fast * fast * (3 - 2 * fast);
    }
    default:
      return easeInOutCubic(t); // câmera: ease-in-out + damping no rig
  }
}

/**
 * Avança a simulação do diretor: interpolação da transição ativa,
 * decaimento do spike/pulso e build-up do ator. Usada pelo rig R3F e
 * pelo loop de fallback quando WebGL2 está ausente.
 */
export function advanceLive(live: LiveState, delta: number, now: number): void {
  const tr = live.transition;
  if (tr) {
    const t = Math.min(1, (now - tr.start) / tr.duration);
    for (const key of PARAM_KEYS) {
      live.current[key] = tr.from[key] + (tr.to[key] - tr.from[key]) * paramEase(key, t);
    }
    if (t >= 1) live.transition = null;
  }

  // spike de tensão: decaimento exponencial, ~3s até sumir
  live.spike *= Math.exp(-delta * 1.35);
  if (live.spike < 0.003) live.spike = 0;
  // pulso radial de partículas
  live.pulse *= Math.exp(-delta * 2.2);
  if (live.pulse < 0.004) live.pulse = 0;

  // build-up do ator (1.2s após delay)
  if (live.reveal < 1) {
    if (live.revealDelay > 0) {
      live.revealDelay -= delta;
    } else {
      live.reveal = Math.min(1, live.reveal + delta / 1.2);
    }
  }

  // retorno elástico da órbita manual (spring ~1.2s, leve overshoot)
  if (!live.dragging) {
    const k = 14;
    const c = 7.5;
    live.dragVelYaw += (-k * live.dragYaw - c * live.dragVelYaw) * delta;
    live.dragVelPitch += (-k * live.dragPitch - c * live.dragVelPitch) * delta;
    live.dragYaw += live.dragVelYaw * delta;
    live.dragPitch += live.dragVelPitch * delta;
    if (Math.abs(live.dragYaw) < 0.0004 && Math.abs(live.dragVelYaw) < 0.0004) {
      live.dragYaw = 0;
      live.dragVelYaw = 0;
    }
    if (Math.abs(live.dragPitch) < 0.0004 && Math.abs(live.dragVelPitch) < 0.0004) {
      live.dragPitch = 0;
      live.dragVelPitch = 0;
    }
  }
}

/** TENSÃO exibida = vetor + spike do clique (afeta o painel e o ator). */
export function displayTensao(live: LiveState): number {
  return Math.min(1, live.current.tensao + live.spike);
}
