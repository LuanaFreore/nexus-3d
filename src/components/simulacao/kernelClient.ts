import type { DynamicParams } from './types';
import type { KernelSubset } from './engine';

/**
 * Client for the C++20 pybind11 kernel endpoint (POST /v1/sim/step).
 * Used by the inline benchmark mode (simulacao.md): a subset (N ≤ 16K) is
 * stepped server-side each request and STEP MS is compared with WebGL.
 */

export interface KernelStepResponse {
  positions: Float32Array;
  velocities: Float32Array;
  stepMs: number;
}

function toNumberArray(src: ArrayLike<number>): number[] {
  return Array.from(src as ArrayLike<number>);
}

export async function kernelStep(
  backendUrl: string,
  subset: KernelSubset,
  params: DynamicParams,
  dt: number,
  timeoutMs = 5000,
): Promise<KernelStepResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${backendUrl}/v1/sim/step`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        n: subset.masses.length,
        dt,
        g: params.gravity,
        softening: params.softening,
        damping: params.damping,
        positions: toNumberArray(subset.positions),
        velocities: toNumberArray(subset.velocities),
        masses: toNumberArray(subset.masses),
      }),
    });
    if (!res.ok) throw new Error(`kernel ${res.status}`);
    const data = (await res.json()) as {
      positions?: number[];
      velocities?: number[];
      step_ms?: number;
      stepMs?: number;
    };
    if (!data.positions || !data.velocities) throw new Error('kernel: bad payload');
    return {
      positions: Float32Array.from(data.positions),
      velocities: Float32Array.from(data.velocities),
      stepMs:
        typeof data.step_ms === 'number'
          ? data.step_ms
          : typeof data.stepMs === 'number'
            ? data.stepMs
            : 0,
    };
  } finally {
    clearTimeout(timer);
  }
}
