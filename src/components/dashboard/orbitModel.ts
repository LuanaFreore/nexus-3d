import type { GhRepo } from '@/lib/github';

/**
 * orbitModel.ts — modelo puro da órbita de repositórios (sem imports de
 * three/R3F, para que os fallbacks 2D não puxem o bundle WebGL).
 */

export interface OrbitBody {
  name: string;
  fullName: string;
  description: string | null;
  radius: number; // raio orbital (unidades de cena)
  size: number; // raio da esfera
  speed: number; // velocidade angular rad/s
  heat: number; // 0..1 issues normalizadas
  angle0: number;
  stars: number;
  forks: number;
  issues: number;
  watchers: number;
  repo: GhRepo;
}

export interface OrbitTelemetry {
  fps: number;
  ms: number;
  dpr: number;
}

export const MAX_BODIES = 30;
export const OVERVIEW_DIST = 19;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Mapeia repos da API → corpos orbitais (dashboard.md §Cena 3D). */
export function buildOrbitBodies(repos: GhRepo[]): OrbitBody[] {
  const list = repos.slice(0, MAX_BODIES);
  if (list.length === 0) return [];
  const now = Date.now();
  const ages = list.map((r) => Math.max(1, (now - new Date(r.created_at).getTime()) / 86_400_000));
  const maxAge = Math.max(...ages);
  const maxStars = Math.max(1, ...list.map((r) => r.stargazers_count));
  const maxIssues = Math.max(1, ...list.map((r) => r.open_issues_count));

  return list.map((r, i) => {
    const ageDays = ages[i]!;
    // raio ∝ idade (log p/ comprimir outliers tipo torvalds/linux)
    const radius = 3.2 + 11.5 * (Math.log1p(ageDays) / Math.log1p(maxAge));
    // tamanho ∝ log(stars)
    const size = 0.14 + 0.42 * (Math.log10(1 + r.stargazers_count) / Math.log10(1 + maxStars));
    // velocidade ∝ atividade (push recente)
    const daysSincePush = (now - new Date(r.pushed_at).getTime()) / 86_400_000;
    const activity = clamp(1 - daysSincePush / 45, 0.06, 1);
    const dir = i % 2 === 0 ? 1 : -1;
    const speed = dir * (0.04 + 0.34 * activity) * (1.6 - radius / 18); // kepler-ish
    return {
      name: r.name,
      fullName: r.full_name,
      description: r.description,
      radius,
      size,
      speed,
      heat: clamp(Math.sqrt(r.open_issues_count / maxIssues), 0, 1),
      angle0: (i / list.length) * Math.PI * 2 + (i * 0.7) % 1,
      stars: r.stargazers_count,
      forks: r.forks_count,
      issues: r.open_issues_count,
      watchers: r.watchers_count,
      repo: r,
    };
  });
}

/** Detecção de WebGL (fallback 2D quando ausente). */
export function detectWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}
