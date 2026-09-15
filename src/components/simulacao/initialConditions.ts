import type { PresetId } from './types';

/**
 * Seeded initial-condition generators for the N-body presets (simulacao.md).
 * Produces interleaved xyz position/velocity arrays + per-particle raw mass.
 * Raw masses drive the #F6287D→#FFFFFF color ramp; the engines scale them to
 * a fixed total system mass so dynamics stay stable at any N.
 */

export interface InitialState {
  positions: Float32Array; // xyz interleaved
  velocities: Float32Array; // xyz interleaved
  masses: Float32Array; // raw mass (color ramp + relative weight)
  massMin: number;
  massMax: number;
}

/** Total gravitational mass the raw masses are normalized to. */
export const TARGET_TOTAL_MASS = 1000;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  // Box–Muller
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Raw mass distribution: mostly light (magenta), few heavy (white). */
function rawMass(rng: () => number): number {
  return 0.4 + 3.0 * Math.pow(rng(), 4);
}

function randomUnitVector(rng: () => number, out: [number, number, number]) {
  const z = rng() * 2 - 1;
  const t = rng() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  out[0] = r * Math.cos(t);
  out[1] = z;
  out[2] = r * Math.sin(t);
}

function plummerRadius(rng: () => number, a: number): number {
  // Plummer sphere inverse-CDF, clamped
  const x = Math.min(Math.max(rng(), 1e-4), 1 - 1e-4);
  const r = a / Math.sqrt(Math.pow(x, -2 / 3) - 1);
  return Math.min(r, a * 6);
}

export function generateInitialState(
  preset: PresetId,
  count: number,
  seed: number,
): InitialState {
  const rng = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const masses = new Float32Array(count);

  const M = TARGET_TOTAL_MASS;
  const dir: [number, number, number] = [0, 0, 0];

  if (preset === 'DISCO') {
    // Collapsing galactic disk with spin (default preset)
    const R = 12;
    for (let i = 0; i < count; i++) {
      const r = 0.4 + R * Math.sqrt(rng());
      const th = rng() * Math.PI * 2;
      positions[i * 3] = Math.cos(th) * r;
      positions[i * 3 + 1] = gaussian(rng) * 0.35;
      positions[i * 3 + 2] = Math.sin(th) * r;
      masses[i] = rawMass(rng);
      // enclosed mass ~ uniform disk → v ∝ sqrt(M_enc / r)
      const mEnc = M * (r / R) * (r / R);
      const v = 0.92 * Math.sqrt(Math.max(mEnc, 0.02 * M) / r);
      velocities[i * 3] = -Math.sin(th) * v + gaussian(rng) * 0.3;
      velocities[i * 3 + 1] = gaussian(rng) * 0.12;
      velocities[i * 3 + 2] = Math.cos(th) * v + gaussian(rng) * 0.3;
    }
  } else if (preset === 'AGLOMERADO') {
    // Single Plummer cluster, near-cold collapse
    const a = 3;
    for (let i = 0; i < count; i++) {
      const r = plummerRadius(rng, a);
      randomUnitVector(rng, dir);
      positions[i * 3] = dir[0] * r;
      positions[i * 3 + 1] = dir[1] * r;
      positions[i * 3 + 2] = dir[2] * r;
      masses[i] = rawMass(rng);
      velocities[i * 3] = gaussian(rng) * 1.4;
      velocities[i * 3 + 1] = gaussian(rng) * 1.4;
      velocities[i * 3 + 2] = gaussian(rng) * 1.4;
    }
  } else if (preset === 'COLISAO') {
    // Two clusters on a collision course
    const a = 2.4;
    const speed = 3.4;
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const r = plummerRadius(rng, a);
      randomUnitVector(rng, dir);
      positions[i * 3] = dir[0] * r - side * 8;
      positions[i * 3 + 1] = dir[1] * r + side * 1.6;
      positions[i * 3 + 2] = dir[2] * r;
      masses[i] = rawMass(rng);
      // bulk velocity toward the other cluster + internal rotation + jitter
      const rx = positions[i * 3] + side * 8;
      const rz = positions[i * 3 + 2];
      velocities[i * 3] = side * speed - rz * 0.35 + gaussian(rng) * 0.5;
      velocities[i * 3 + 1] = -side * 0.55 + gaussian(rng) * 0.4;
      velocities[i * 3 + 2] = rx * 0.35 + gaussian(rng) * 0.5;
    }
  } else {
    // ANEL — thin ring orbiting a single compact heavy core particle.
    // Core raw = 9× ring raw total → physical core ≈ 0.9 · M, so the ring
    // behaves as near-test particles (self-gravity would tear it apart).
    const R = 9;
    let ringRawTotal = 0;
    for (let i = 1; i < count; i++) {
      const r = R + gaussian(rng) * 0.7;
      const th = rng() * Math.PI * 2;
      positions[i * 3] = Math.cos(th) * r;
      positions[i * 3 + 1] = gaussian(rng) * 0.15;
      positions[i * 3 + 2] = Math.sin(th) * r;
      const m = rawMass(rng);
      masses[i] = m;
      ringRawTotal += m;
    }
    masses[0] = ringRawTotal * 9;
    positions[0] = 0;
    positions[1] = 0;
    positions[2] = 0;
    // Pass 2: ring orbital velocities around the physical core mass
    const massScale = M / (ringRawTotal + masses[0]);
    const corePhysical = masses[0] * massScale;
    for (let i = 1; i < count; i++) {
      const x = positions[i * 3];
      const z = positions[i * 3 + 2];
      const r = Math.max(Math.sqrt(x * x + z * z), 0.5);
      const v = Math.sqrt(corePhysical / r);
      velocities[i * 3] = (-z / r) * v + gaussian(rng) * 0.08;
      velocities[i * 3 + 1] = gaussian(rng) * 0.04;
      velocities[i * 3 + 2] = (x / r) * v + gaussian(rng) * 0.08;
    }
  }

  let massMin = Infinity;
  let massMax = -Infinity;
  for (let i = 0; i < count; i++) {
    if (masses[i] < massMin) massMin = masses[i];
    if (masses[i] > massMax) massMax = masses[i];
  }

  return { positions, velocities, masses, massMin, massMax };
}

/** Sum of raw masses — engines normalize to TARGET_TOTAL_MASS. */
export function totalRawMass(masses: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < masses.length; i++) sum += masses[i];
  return sum;
}
