import type { DynamicParams, EngineMode } from './types';
import type { InitialState } from './initialConditions';
import { TARGET_TOTAL_MASS, totalRawMass } from './initialConditions';
import { computeEnergyAndCom } from './engine';
import type { KernelSubset, NBodyEngine } from './engine';

/**
 * CpuEngine — JS O(n²) fallback used when WebGL2 float render targets are
 * unavailable (simulacao.md: "MODO CPU · N=2048 · GPU FLOAT INDISPONÍVEL").
 * Same physics + interface as the GPU engine.
 */
export class CpuEngine implements NBodyEngine {
  readonly mode: EngineMode = 'cpu';
  readonly count: number;
  readonly massScale: number;
  readonly massMin: number;
  readonly massMax: number;
  lastStepMs = 0;

  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly masses: Float32Array;
  private dynamic: DynamicParams;
  private well = { x: 0, y: 0, z: 0, mass: 0 };

  constructor(state: InitialState, dynamic: DynamicParams) {
    this.count = state.masses.length;
    this.positions = state.positions.slice();
    this.velocities = state.velocities.slice();
    this.masses = state.masses.slice();
    this.massMin = state.massMin;
    this.massMax = state.massMax;
    this.massScale = TARGET_TOTAL_MASS / totalRawMass(state.masses);
    this.dynamic = { ...dynamic };
  }

  setDynamic(p: DynamicParams): void {
    this.dynamic = { ...p };
  }

  setWell(x: number, y: number, z: number, signedMass: number): void {
    this.well = { x, y, z, mass: signedMass };
  }

  getPositionTexture(): null {
    return null;
  }

  getMasses(): Float32Array {
    return this.masses;
  }

  step(dt: number): void {
    const t0 = performance.now();
    const n = this.count;
    const pos = this.positions;
    const vel = this.velocities;
    const mas = this.masses;
    const g = this.dynamic.gravity * this.massScale;
    const damp = this.dynamic.damping;
    const soft2 = this.dynamic.softening * this.dynamic.softening;
    const wellM = this.well.mass * this.massScale * this.count * 0.02;
    const wx = this.well.x;
    const wy = this.well.y;
    const wz = this.well.z;
    const wellSoft2 = soft2 * 4;

    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      const xi = pos[ix];
      const yi = pos[ix + 1];
      const zi = pos[ix + 2];
      let ax = 0;
      let ay = 0;
      let az = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const jx = j * 3;
        const dx = pos[jx] - xi;
        const dy = pos[jx + 1] - yi;
        const dz = pos[jx + 2] - zi;
        const dist2 = dx * dx + dy * dy + dz * dz + soft2;
        const inv = 1 / Math.sqrt(dist2);
        const f = mas[j] * inv * inv * inv;
        ax += f * dx;
        ay += f * dy;
        az += f * dz;
      }
      const dwx = wx - xi;
      const dwy = wy - yi;
      const dwz = wz - zi;
      const dw2 = dwx * dwx + dwy * dwy + dwz * dwz + wellSoft2;
      const invw = 1 / Math.sqrt(dw2);
      const fw = wellM * invw * invw * invw;
      ax += fw * dwx;
      ay += fw * dwy;
      az += fw * dwz;

      vel[ix] = (vel[ix] + g * ax * dt) * damp;
      vel[ix + 1] = (vel[ix + 1] + g * ay * dt) * damp;
      vel[ix + 2] = (vel[ix + 2] + g * az * dt) * damp;
    }
    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      pos[ix] += vel[ix] * dt;
      pos[ix + 1] += vel[ix + 1] * dt;
      pos[ix + 2] += vel[ix + 2] * dt;
    }
    this.lastStepMs = performance.now() - t0;
  }

  sampleTelemetry(): { energy: number; com: [number, number, number] } {
    return computeEnergyAndCom(
      this.positions,
      this.velocities,
      this.masses,
      this.dynamic.gravity,
      this.dynamic.softening,
      this.massScale,
    );
  }

  extractSubset(n: number): KernelSubset | null {
    if (n > this.count) return null;
    const positions = new Float32Array(n * 3);
    const velocities = new Float32Array(n * 3);
    const masses = new Float32Array(n);
    positions.set(this.positions.subarray(0, n * 3));
    velocities.set(this.velocities.subarray(0, n * 3));
    masses.set(this.masses.subarray(0, n));
    return { positions, velocities, masses };
  }

  dispose(): void {
    // nothing to release — plain typed arrays
  }
}
