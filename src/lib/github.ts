import { useSyncExternalStore } from 'react';
import { getBackendUrl } from '@/lib/backend';

/**
 * github.ts — cliente da API REST pública do GitHub (sem token, modo demo,
 * 60 req/h) para a página /dashboard. Rastreia rate-limit via headers de
 * resposta, expõe erros tipados (404 / 403 rate-limit) e um snapshot local
 * de fallback (pytorch/pytorch) para quando a API está indisponível.
 */

const API = 'https://api.github.com';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface GhRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  watchers_count: number;
  subscribers_count?: number;
  language: string | null;
  created_at: string;
  pushed_at: string;
  owner: { login: string; avatar_url: string };
}

export interface GhCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  author: { login: string; avatar_url: string } | null;
}

export type GhLanguages = Record<string, number>;

export interface GhWeek {
  /** unix timestamp (s) do início da semana */
  week: number;
  /** total de commits na semana */
  total: number;
}

export interface RepoBundle {
  repo: GhRepo;
  commits: GhCommit[];
  languages: GhLanguages;
  activity: GhWeek[]; // 52 semanas
  orbit: GhRepo[]; // até 30 repos do owner p/ a órbita
}

export interface RepoStats {
  repo: GhRepo;
  commits: GhCommit[];
}

// ---------------------------------------------------------------------------
// Erros tipados
// ---------------------------------------------------------------------------

export class GithubNotFoundError extends Error {
  constructor(message = 'Repositório não encontrado') {
    super(message);
    this.name = 'GithubNotFoundError';
  }
}

export class GithubRateLimitError extends Error {
  resetAt: number; // epoch ms
  constructor(resetAt: number) {
    super('Rate limit excedido');
    this.name = 'GithubRateLimitError';
    this.resetAt = resetAt;
  }
}

export class GithubApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GithubApiError';
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Rate-limit store (headers x-ratelimit-*) com subscrição externa
// ---------------------------------------------------------------------------

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: number; // epoch ms
}

let rateLimitState: RateLimitInfo = {
  limit: 60,
  remaining: 60,
  resetAt: Date.now() + 3600_000,
};

const rlListeners = new Set<() => void>();

function setRateLimit(next: RateLimitInfo) {
  rateLimitState = next;
  rlListeners.forEach((l) => l());
}

function updateRateLimitFromHeaders(headers: Headers) {
  const limit = Number(headers.get('x-ratelimit-limit'));
  const remaining = Number(headers.get('x-ratelimit-remaining'));
  const reset = Number(headers.get('x-ratelimit-reset'));
  if (Number.isFinite(limit) && limit > 0) {
    setRateLimit({
      limit,
      remaining: Number.isFinite(remaining) ? remaining : rateLimitState.remaining,
      resetAt: Number.isFinite(reset) && reset > 0 ? reset * 1000 : rateLimitState.resetAt,
    });
  }
}

export function getRateLimit(): RateLimitInfo {
  return rateLimitState;
}

function subscribeRl(cb: () => void) {
  rlListeners.add(cb);
  return () => rlListeners.delete(cb);
}

export function useRateLimit(): RateLimitInfo {
  return useSyncExternalStore(subscribeRl, getRateLimit, getRateLimit);
}

// ---------------------------------------------------------------------------
// Fetch base
// ---------------------------------------------------------------------------

async function ghFetch<T>(path: string, timeoutMs = 9000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    });
    updateRateLimitFromHeaders(res.headers);

    if (res.status === 404) throw new GithubNotFoundError();
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      if (remaining === '0' || res.status === 429) {
        throw new GithubRateLimitError(getRateLimit().resetAt);
      }
      throw new GithubApiError(res.status, `GitHub API ${res.status}`);
    }
    if (!res.ok) throw new GithubApiError(res.status, `GitHub API ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** /stats/commit_activity pode responder 202 enquanto o GitHub computa. */
async function ghFetchActivity(path: string): Promise<GhWeek[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(`${API}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    });
    updateRateLimitFromHeaders(res.headers);
    if (res.status === 404) throw new GithubNotFoundError();
    if (res.status === 202) {
      // GitHub está computando as estatísticas — tenta de novo em 1.4s
      await new Promise((r) => setTimeout(r, 1400));
      const res2 = await fetch(`${API}${path}`, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      updateRateLimitFromHeaders(res2.headers);
      if (res2.status === 202) return emptyWeeks();
      if (!res2.ok) throw new GithubApiError(res2.status, `GitHub API ${res2.status}`);
      const data = (await res2.json()) as GhWeek[];
      return normalizeWeeks(data);
    }
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      if (remaining === '0' || res.status === 429) {
        throw new GithubRateLimitError(getRateLimit().resetAt);
      }
      throw new GithubApiError(res.status, `GitHub API ${res.status}`);
    }
    if (!res.ok) throw new GithubApiError(res.status, `GitHub API ${res.status}`);
    const data = (await res.json()) as GhWeek[];
    return normalizeWeeks(data);
  } finally {
    clearTimeout(timer);
  }
}

function emptyWeeks(): GhWeek[] {
  const now = Math.floor(Date.now() / 1000);
  const week = 7 * 24 * 3600;
  const start = now - 51 * week;
  return Array.from({ length: 52 }, (_, i) => ({ week: start + i * week, total: 0 }));
}

function normalizeWeeks(data: GhWeek[]): GhWeek[] {
  if (!Array.isArray(data) || data.length === 0) return emptyWeeks();
  return data.slice(-52).map((w) => ({ week: w.week, total: w.total }));
}

// ---------------------------------------------------------------------------
// Endpoints compostos
// ---------------------------------------------------------------------------

async function fetchOrbitRepos(owner: string): Promise<GhRepo[]> {
  try {
    return await ghFetch<GhRepo[]>(
      `/users/${encodeURIComponent(owner)}/repos?per_page=30&sort=updated&type=owner`,
    );
  } catch (e) {
    if (e instanceof GithubNotFoundError) {
      // alguns owners são orgs "puras"
      return ghFetch<GhRepo[]>(
        `/orgs/${encodeURIComponent(owner)}/repos?per_page=30&sort=updated&type=public`,
      );
    }
    throw e;
  }
}

/** Carga completa (troca de repo): 5 requests em paralelo. */
export async function fetchRepoBundle(owner: string, repo: string): Promise<RepoBundle> {
  const o = encodeURIComponent(owner);
  const r = encodeURIComponent(repo);
  const [repoData, commits, languages, activity, orbit] = await Promise.all([
    ghFetch<GhRepo>(`/repos/${o}/${r}`),
    ghFetch<GhCommit[]>(`/repos/${o}/${r}/commits?per_page=8`),
    ghFetch<GhLanguages>(`/repos/${o}/${r}/languages`),
    ghFetchActivity(`/repos/${o}/${r}/stats/commit_activity`),
    fetchOrbitRepos(owner),
  ]);
  return { repo: repoData, commits, languages, activity, orbit };
}

/** Refresh silencioso (30s): só stats do repo + commits (2 requests). */
export async function fetchRepoStats(owner: string, repo: string): Promise<RepoStats> {
  const o = encodeURIComponent(owner);
  const r = encodeURIComponent(repo);
  const [repoData, commits] = await Promise.all([
    ghFetch<GhRepo>(`/repos/${o}/${r}`),
    ghFetch<GhCommit[]>(`/repos/${o}/${r}/commits?per_page=8`),
  ]);
  return { repo: repoData, commits };
}

// ---------------------------------------------------------------------------
// Auth (OAuth via backend FastAPI — modo demo quando offline)
// ---------------------------------------------------------------------------

export interface GhAuthUser {
  login: string;
  avatar_url: string;
}

/** GET /auth/me do backend — nunca lança; null = não autenticado/offline. */
export async function fetchAuthUser(timeoutMs = 2500): Promise<GhAuthUser | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${getBackendUrl()}/auth/me`, {
      credentials: 'include',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<GhAuthUser>;
    if (typeof data.login === 'string' && typeof data.avatar_url === 'string') {
      return { login: data.login, avatar_url: data.avatar_url };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Logout best-effort no backend. */
export async function logoutAuth(): Promise<void> {
  try {
    await fetch(`${getBackendUrl()}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    /* backend offline — nada a fazer */
  }
}

// ---------------------------------------------------------------------------
// Formatadores pt-BR
// ---------------------------------------------------------------------------

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `há ${d} d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `há ${w} sem`;
  const m = Math.floor(d / 30);
  if (m < 12) return `há ${m} ${m === 1 ? 'mês' : 'meses'}`;
  const y = Math.floor(d / 365);
  return `há ${y} ${y === 1 ? 'ano' : 'anos'}`;
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1).replace('.', ',')}K`;
  return n.toLocaleString('pt-BR');
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1).replace('.', ',')} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${bytes} B`;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function firstLine(message: string): string {
  const line = message.split('\n')[0] ?? message;
  return line.length > 72 ? `${line.slice(0, 72)}…` : line;
}

// ---------------------------------------------------------------------------
// Snapshot local (fallback quando a API está indisponível) — pytorch/pytorch
// ---------------------------------------------------------------------------

function snapshotWeeks(): GhWeek[] {
  const now = Math.floor(Date.now() / 1000);
  const week = 7 * 24 * 3600;
  const start = now - 51 * week;
  // deterministic pseudo-random, ~volume real do pytorch/pytorch
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  return Array.from({ length: 52 }, (_, i) => ({
    week: start + i * week,
    total: Math.round(180 + rand() * 420 + Math.sin(i / 6) * 80),
  }));
}

const snap = (partial: Partial<GhRepo> & Pick<GhRepo, 'name' | 'full_name'>): GhRepo => ({
  description: null,
  html_url: `https://github.com/${partial.full_name}`,
  stargazers_count: 1000,
  forks_count: 200,
  open_issues_count: 40,
  watchers_count: 1000,
  language: 'Python',
  created_at: '2016-08-13T00:36:24Z',
  pushed_at: new Date().toISOString(),
  owner: { login: 'pytorch', avatar_url: 'https://avatars.githubusercontent.com/u/21003710?v=4' },
  ...partial,
});

export const SNAPSHOT_BUNDLE: RepoBundle = {
  repo: snap({
    name: 'pytorch',
    full_name: 'pytorch/pytorch',
    description:
      'Tensors and Dynamic neural networks in Python with strong GPU acceleration',
    stargazers_count: 83500,
    forks_count: 22500,
    open_issues_count: 14500,
    watchers_count: 83500,
    subscribers_count: 1900,
    language: 'Python',
  }),
  commits: [
    ['a1b2c3d', 'Fix CUDA graph capture under stream capture mode', 'albanD', 2],
    ['e4f5g6h', '[inductor] Fuse pointwise ops in backward graphs', 'jansel', 5],
    ['i7j8k9l', 'Update NCCL to 2.23.4 for nightly builds', 'malfet', 9],
    ['m1n2o3p', 'Fix autograd view semantics for inplace scatter', 'soulitzer', 14],
    ['q4r5s6t', '[dynamo] Guard on tensor dispatch mode stack', 'voznesenskym', 22],
    ['u7v8w9x', 'Add torch.accelerator device-agnostic API docs', 'albanD', 30],
    ['y1z2a3b', 'Fix flaky distributed test on ROCm runners', 'jeffdaily', 49],
    ['c4d5e6f', 'Bump XLA pin and fix cpp tests', 'clee2000', 70],
  ].map(([sha, msg, author, hours]) => ({
    sha: String(sha),
    html_url: 'https://github.com/pytorch/pytorch/commits/main',
    commit: {
      message: String(msg),
      author: {
        name: String(author),
        date: new Date(Date.now() - Number(hours) * 3600_000).toISOString(),
      },
    },
    author: { login: String(author), avatar_url: '' },
  })),
  languages: {
    Python: 38_900_000,
    'C++': 15_700_000,
    Cuda: 3_400_000,
    C: 1_250_000,
    CMake: 540_000,
    Shell: 210_000,
    ObjectiveC: 95_000,
  },
  activity: snapshotWeeks(),
  orbit: [
    SNAPSHOT_BUNDLE_PLACEHOLDER('pytorch', 'pytorch/pytorch', 83500, 14500, 43),
    SNAPSHOT_BUNDLE_PLACEHOLDER('vision', 'pytorch/vision', 16100, 700, 36),
    SNAPSHOT_BUNDLE_PLACEHOLDER('audio', 'pytorch/audio', 4000, 240, 30),
    SNAPSHOT_BUNDLE_PLACEHOLDER('tutorials', 'pytorch/tutorials', 8200, 90, 21),
    SNAPSHOT_BUNDLE_PLACEHOLDER('examples', 'pytorch/examples', 23400, 65, 19),
    SNAPSHOT_BUNDLE_PLACEHOLDER('serve', 'pytorch/serve', 4300, 120, 15),
    SNAPSHOT_BUNDLE_PLACEHOLDER('captum', 'pytorch/captum', 4800, 60, 12),
    SNAPSHOT_BUNDLE_PLACEHOLDER('xla', 'pytorch/xla', 2700, 210, 8),
    SNAPSHOT_BUNDLE_PLACEHOLDER('ignite', 'pytorch/ignite', 4500, 40, 6),
    SNAPSHOT_BUNDLE_PLACEHOLDER('FBGEMM', 'pytorch/FBGEMM', 420, 30, 5),
    SNAPSHOT_BUNDLE_PLACEHOLDER('fairscale', 'facebookresearch/fairscale', 2400, 80, 3),
    SNAPSHOT_BUNDLE_PLACEHOLDER('pytorch.github.io', 'pytorch/pytorch.github.io', 190, 12, 2),
  ],
};

function SNAPSHOT_BUNDLE_PLACEHOLDER(
  name: string,
  full_name: string,
  stars: number,
  issues: number,
  ageYears: number,
): GhRepo {
  return snap({
    name,
    full_name,
    stargazers_count: stars,
    forks_count: Math.round(stars * 0.27),
    open_issues_count: issues,
    watchers_count: stars,
    created_at: new Date(Date.now() - ageYears * 30 * 24 * 3600_000).toISOString(),
    pushed_at: new Date(Date.now() - Math.random() * 5 * 24 * 3600_000).toISOString(),
  });
}
