import { useEffect, useRef, useState } from 'react';

/**
 * Shared client for the NEXUS FastAPI backend (backend/ — FastAPI + PyTorch).
 * Consumed by page agents: BackendStatusBadge, /ia (neural director),
 * /dashboard (GitHub OAuth + live data), /simulacao (kernel benchmarks).
 */

export function getBackendUrl(): string {
  return (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? 'http://localhost:8000';
}

export interface HealthResult {
  online: boolean;
  latencyMs: number | null;
}

/** GET /v1/health with a 3s timeout. Never throws. */
export async function checkHealth(): Promise<HealthResult> {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${getBackendUrl()}/v1/health`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const latencyMs = Math.round((performance.now() - started) * 10) / 10;
    return { online: res.ok, latencyMs };
  } catch {
    return { online: false, latencyMs: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Polls the backend health endpoint every `pollMs` (default 15s, per design §7.2).
 * Returns the latest result plus a `checking` flag for the first probe.
 */
export function useBackendHealth(pollMs = 15000): HealthResult & { checking: boolean } {
  const [state, setState] = useState<HealthResult & { checking: boolean }>({
    online: false,
    latencyMs: null,
    checking: true,
  });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let timer: ReturnType<typeof setTimeout>;

    const probe = async () => {
      const result = await checkHealth();
      if (!mounted.current) return;
      setState({ ...result, checking: false });
      timer = setTimeout(probe, pollMs);
    };

    probe();
    return () => {
      mounted.current = false;
      clearTimeout(timer);
    };
  }, [pollMs]);

  return state;
}
