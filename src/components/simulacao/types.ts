/**
 * Shared types/constants for the /simulacao N-body page (design simulacao.md).
 */

export type PresetId = 'DISCO' | 'AGLOMERADO' | 'COLISAO' | 'ANEL';

export interface DynamicParams {
  gravity: number; // G — 0.1..10
  damping: number; // 0.90..1.00
  softening: number; // 0.001..0.5
  dtScale: number; // 0.1..3.0 (× 1/60 base step)
  wellMass: number; // cursor gravity well — 0..100
}

export interface StaticConfig {
  preset: PresetId;
  count: number;
  seed: number;
}

export type EngineMode = 'gpu' | 'cpu';

export interface Telemetry {
  fps: number;
  frameMs: number;
  stepMs: number;
  kernelMs: number | null;
  energy: number | null;
  com: [number, number, number];
  simTime: number;
  n: number;
}

export const DEFAULT_DYNAMIC: DynamicParams = {
  gravity: 1.0,
  damping: 0.999,
  softening: 0.05,
  dtScale: 1.0,
  wellMass: 20,
};

export const PARTICLE_COUNTS = [16384, 65536, 262144, 1048576] as const;

export const CPU_FALLBACK_COUNT = 2048;

export const PRESETS: PresetId[] = ['DISCO', 'AGLOMERADO', 'COLISAO', 'ANEL'];

export const PRESET_LABEL: Record<PresetId, string> = {
  DISCO: 'DISCO',
  AGLOMERADO: 'AGLOMERADO',
  COLISAO: 'COLISÃO',
  ANEL: 'ANEL',
};

export function countLabel(n: number): string {
  return n >= 1048576 ? '1M' : `${Math.round(n / 1024)}K`;
}

/** Format like "-1.24e6" (design telemetry style). */
export function fmtExp(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const [m, e] = v.toExponential(2).split('e');
  return `${m}e${parseInt(e, 10)}`;
}

export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
