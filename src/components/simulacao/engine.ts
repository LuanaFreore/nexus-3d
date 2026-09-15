import type * as THREE from 'three';
import type { DynamicParams, EngineMode } from './types';

/** Common interface implemented by the GPU (texture-feedback) and CPU engines. */
export interface NBodyEngine {
  readonly mode: EngineMode;
  readonly count: number;
  readonly massScale: number;
  readonly massMin: number;
  readonly massMax: number;
  /** Wall/GPU time of the last integration step, in ms. */
  readonly lastStepMs: number;
  setDynamic(p: DynamicParams): void;
  /** signedMass < 0 repels; 0 disables the well. */
  setWell(x: number, y: number, z: number, signedMass: number): void;
  step(dt: number): void;
  /** Live energy + center of mass (subsampled on GPU, exact on CPU). */
  sampleTelemetry(): { energy: number; com: [number, number, number] } | null;
  /** Snapshot of the first n particles (n must be a perfect square) for the kernel benchmark. */
  extractSubset(n: number): KernelSubset | null;
  /** Current position texture (GPU mode only; ping-pongs every frame). */
  getPositionTexture(): THREE.Texture | null;
  /** Raw per-particle masses (used for the CPU-mode render attribute). */
  getMasses(): Float32Array;
  dispose(): void;
}

export interface KernelSubset {
  positions: Float32Array; // xyz interleaved
  velocities: Float32Array; // xyz interleaved
  masses: Float32Array;
}

/** Shared energy/COM computation from interleaved samples. */
export function computeEnergyAndCom(
  positions: Float32Array,
  velocities: Float32Array,
  masses: Float32Array,
  gravity: number,
  softening: number,
  massScale: number,
): { energy: number; com: [number, number, number] } {
  const n = masses.length;
  const soft2 = softening * softening;
  let kinetic = 0;
  let mTot = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    const m = masses[i] * massScale;
    const vx = velocities[i * 3];
    const vy = velocities[i * 3 + 1];
    const vz = velocities[i * 3 + 2];
    kinetic += 0.5 * m * (vx * vx + vy * vy + vz * vz);
    mTot += m;
    cx += m * positions[i * 3];
    cy += m * positions[i * 3 + 1];
    cz += m * positions[i * 3 + 2];
  }
  let potential = 0;
  for (let i = 0; i < n; i++) {
    const mi = masses[i] * massScale;
    const xi = positions[i * 3];
    const yi = positions[i * 3 + 1];
    const zi = positions[i * 3 + 2];
    for (let j = i + 1; j < n; j++) {
      const dx = positions[j * 3] - xi;
      const dy = positions[j * 3 + 1] - yi;
      const dz = positions[j * 3 + 2] - zi;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz + soft2);
      potential -= (gravity * mi * (masses[j] * massScale)) / d;
    }
  }
  const inv = mTot > 0 ? 1 / mTot : 0;
  return {
    energy: kinetic + potential,
    com: [cx * inv, cy * inv, cz * inv],
  };
}
