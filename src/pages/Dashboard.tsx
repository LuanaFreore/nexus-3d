import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import HUDPanel from '@/components/hud/HUDPanel';
import LoginModal from '@/components/hud/LoginModal';
import StatReadout from '@/components/hud/StatReadout';
import { useBackendHealth } from '@/lib/backend';
import type { GhAuthUser, RepoBundle } from '@/lib/github';
import {
  GithubNotFoundError,
  GithubRateLimitError,
  SNAPSHOT_BUNDLE,
  fetchAuthUser,
  fetchRepoBundle,
  fetchRepoStats,
  getRateLimit,
  logoutAuth,
  useRateLimit,
} from '@/lib/github';
import type { OrbitBody, OrbitTelemetry } from '@/components/dashboard/orbitModel';
import { buildOrbitBodies, detectWebGL } from '@/components/dashboard/orbitModel';
import { ActivityChart2D, RepoOrbitFallback } from '@/components/dashboard/fallbacks';
import {
  ApiHealthPanel,
  CommitsPanel,
  ContextBar,
  LanguagesPanel,
  OAuthStrip,
  SelectedRepoPanel,
} from '@/components/dashboard/panels';

const RepoOrbit = lazy(() => import('@/components/dashboard/RepoOrbit'));
const ActivityChart3D = lazy(() => import('@/components/dashboard/ActivityChart'));

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

type LoadError = { kind: '404' | 'rate' | 'network'; resetAt?: number } | null;

/**
 * Dashboard — /dashboard (design/dashboard.md).
 * Órbita 3D de repositórios ao vivo (API REST pública do GitHub, modo demo
 * 60 req/h) + painéis HUD de stats/commits/linguagens/atividade 52 semanas
 * + saúde da API via headers de rate-limit. Auto-refresh 30s (120s em
 * modo economia). Login OAuth via LoginModal global (backend FastAPI).
 */
export default function Dashboard() {
  // --- alvo e dados -------------------------------------------------------
  const [input, setInput] = useState('pytorch/pytorch');
  const [target, setTarget] = useState('pytorch/pytorch');
  const [bundle, setBundle] = useState<RepoBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<LoadError>(null);
  const [errorTick, setErrorTick] = useState(0);
  const [stale, setStale] = useState(false);
  const [snapshot, setSnapshot] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [user, setUser] = useState<GhAuthUser | null>(null);
  const [webgl] = useState(detectWebGL);

  const rateLimit = useRateLimit();
  const economy = rateLimit.remaining < 5;
  const telemetry = useRef<OrbitTelemetry>({ fps: 0, ms: 0, dpr: Math.min(1.75, window.devicePixelRatio) });
  const [hudStats, setHudStats] = useState({ fps: 0, ms: 0, dpr: telemetry.current.dpr });
  const bundleRef = useRef<RepoBundle | null>(null);
  bundleRef.current = bundle;

  // --- auth (backend OAuth; null = modo demo) ------------------------------
  const { online: backendOnline } = useBackendHealth(30000);
  useEffect(() => {
    if (!backendOnline) return;
    fetchAuthUser().then((u) => {
      if (u) setUser(u);
    });
  }, [backendOnline]);

  // --- carregamento --------------------------------------------------------
  const load = useCallback(async (t: string, silent = false) => {
    const m = /^([^/\s]+)\/([^/\s]+)\/?$/.exec(t.trim());
    if (!m) {
      if (!silent) {
        setError({ kind: '404' });
        setErrorTick((n) => n + 1);
      }
      return;
    }
    // rate-limit esgotado → não gasta request, mostra countdown
    const rl = getRateLimit();
    if (rl.remaining <= 0 && Date.now() < rl.resetAt) {
      setRateLimitedUntil(rl.resetAt);
      setError({ kind: 'rate', resetAt: rl.resetAt });
      if (bundleRef.current) setStale(true);
      return;
    }
    const [, owner, repo] = m;
    setFetching(true);
    if (!silent) setLoading(true);
    const t0 = performance.now();
    try {
      if (silent && bundleRef.current) {
        // refresh 30s: só stats + commits (economia de requests)
        const stats = await fetchRepoStats(owner!, repo!);
        setBundle({ ...bundleRef.current, repo: stats.repo, commits: stats.commits });
      } else {
        const data = await fetchRepoBundle(owner!, repo!);
        setBundle(data);
        setTarget(t.trim());
        setInput(t.trim());
        setSelected(null);
        setEpoch((n) => n + 1);
      }
      setError(null);
      setStale(false);
      setSnapshot(false);
      setRateLimitedUntil(null);
      setLastSyncAt(Date.now());
    } catch (e) {
      if (e instanceof GithubNotFoundError) {
        if (!silent) {
          setError({ kind: '404' });
          setErrorTick((n) => n + 1);
        }
      } else if (e instanceof GithubRateLimitError) {
        setRateLimitedUntil(e.resetAt);
        setError({ kind: 'rate', resetAt: e.resetAt });
        if (bundleRef.current) setStale(true);
        else {
          setBundle(SNAPSHOT_BUNDLE);
          setSnapshot(true);
          setEpoch((n) => n + 1);
        }
      } else {
        // rede/API indisponível: snapshot local na 1ª carga, cache depois
        if (bundleRef.current) setStale(true);
        else {
          setBundle(SNAPSHOT_BUNDLE);
          setSnapshot(true);
          setEpoch((n) => n + 1);
        }
        setError({ kind: 'network' });
      }
    } finally {
      setLatencyMs(Math.round(performance.now() - t0));
      setFetching(false);
      setLoading(false);
    }
  }, []);

  // carga inicial
  useEffect(() => {
    load('pytorch/pytorch');
  }, [load]);

  // auto-refresh silencioso: 30s (120s em modo economia)
  useEffect(() => {
    const interval = economy ? 120_000 : 30_000;
    const id = setInterval(() => load(target, true), interval);
    return () => clearInterval(id);
  }, [load, target, economy]);

  // readouts FPS/MS/DPR a 2Hz (telemetria, sem easing)
  useEffect(() => {
    const id = setInterval(() => {
      setHudStats({ ...telemetry.current });
    }, 500);
    return () => clearInterval(id);
  }, []);

  // --- logout ---------------------------------------------------------------
  const handleLogout = useCallback(() => {
    logoutAuth().finally(() => setUser(null));
  }, []);

  // --- derivados ------------------------------------------------------------
  const bodies = useMemo<OrbitBody[]>(
    () => (bundle ? buildOrbitBodies(bundle.orbit) : []),
    [bundle],
  );
  const focusedBody = useMemo(
    () => bodies.find((b) => b.fullName === selected) ?? null,
    [bodies, selected],
  );

  const statusLine =
    error?.kind === '404'
      ? '404 · REPOSITÓRIO NÃO ENCONTRADO'
      : error?.kind === 'rate'
        ? null // countdown vive no painel de saúde
        : error?.kind === 'network' && snapshot
          ? null // tag de snapshot aparece abaixo
          : null;

  return (
    <div className="bg-void">
      {/* fade de entrada a partir do --void */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
        {/* barra de contexto */}
        <ContextBar
          value={input}
          onChange={setInput}
          onLoad={(t) => load(t)}
          loading={fetching}
          errorTick={errorTick}
          statusLine={statusLine}
          user={user}
          onLogin={() => setLoginOpen(true)}
          onLogout={handleLogout}
        />
        {snapshot && (
          <div className="border-b border-hairline bg-void px-4 py-1.5 text-center">
            <span className="tnum font-mono text-[10px] tracking-[0.16em]" style={{ color: 'var(--danger)' }}>
              SNAPSHOT LOCAL · API INDISPONÍVEL
            </span>
          </div>
        )}

        {/* canvas 3D + HUD sobreposto */}
        <section className="relative h-[calc(100dvh-56px-57px)] min-h-[520px] overflow-hidden">
          {webgl ? (
            <Suspense
              fallback={
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="hud-label animate-pulse">{'// INICIALIZANDO WEBGL'}</span>
                </div>
              }
            >
              <RepoOrbit
                bodies={bodies}
                selected={selected}
                onSelect={setSelected}
                telemetry={telemetry}
                epoch={epoch}
              />
            </Suspense>
          ) : (
            <RepoOrbitFallback bodies={bodies} selected={selected} onSelect={setSelected} />
          )}

          {/* HUD canto superior esquerdo: repo em foco */}
          <motion.div
            className="absolute left-4 top-4 z-10 hidden sm:block"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 0.5, ease: EASE }}
          >
            <SelectedRepoPanel body={focusedBody} repo={bundle?.repo ?? null} loading={loading} />
          </motion.div>

          {/* HUD canto superior direito: saúde da API */}
          <motion.div
            className="absolute right-4 top-4 z-10 hidden sm:block"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6, duration: 0.5, ease: EASE }}
          >
            <ApiHealthPanel
              rateLimit={rateLimit}
              fetching={fetching}
              lastSyncAt={lastSyncAt}
              latencyMs={latencyMs}
              rateLimitedUntil={rateLimitedUntil}
              stale={stale}
              economy={economy}
            />
          </motion.div>

          {/* hint mono */}
          <motion.p
            className="absolute bottom-14 left-4 z-10 hidden font-mono text-[10px] tracking-[0.16em] text-text-faint md:block"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.5, ease: EASE }}
          >
            CLIQUE NUM CORPO · FOCAR REPO&nbsp;&nbsp;/&nbsp;&nbsp;SCROLL · ZOOM&nbsp;&nbsp;/&nbsp;&nbsp;ARRASTAR · ORBITAR
          </motion.p>

          {/* rodapé do canvas: telemetria */}
          <motion.div
            className="absolute inset-x-0 bottom-0 z-10 border-t border-hairline bg-void/70 px-4 py-2.5 backdrop-blur-[12px]"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.5, ease: EASE }}
          >
            <StatReadout
              items={[
                { label: 'FPS', value: String(hudStats.fps || '——') },
                { label: 'MS', value: hudStats.ms ? hudStats.ms.toFixed(1) : '——' },
                { label: 'DPR', value: hudStats.dpr.toFixed(2) },
                { label: 'REPOS EM ÓRBITA', value: String(bodies.length), accent: true },
              ]}
            />
          </motion.div>
        </section>

        {/* faixa de detalhe (scroll) */}
        <section
          className="mx-auto grid max-w-[1440px] grid-cols-1 gap-6 py-16 md:grid-cols-12"
          style={{ paddingInline: 'clamp(20px, 4vw, 64px)' }}
        >
          <motion.div
            className="md:col-span-7"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <CommitsPanel
              commits={bundle?.commits ?? []}
              repoUrl={bundle?.repo.html_url ?? `https://github.com/${target}`}
              loading={loading}
            />
          </motion.div>

          <motion.div
            className="md:col-span-5"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.6, delay: 0.12, ease: EASE }}
          >
            <LanguagesPanel languages={bundle?.languages ?? {}} loading={loading} />
          </motion.div>

          <motion.div
            className="md:col-span-12"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.6, delay: 0.24, ease: EASE }}
          >
            <ActivityPanel
              weeks={bundle?.activity ?? []}
              loading={loading}
              webgl={webgl}
            />
          </motion.div>

          <motion.div
            className="md:col-span-12"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, delay: 0.36, ease: EASE }}
          >
            <OAuthStrip onConnect={() => setLoginOpen(true)} />
          </motion.div>
        </section>
      </motion.div>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel ATIVIDADE 52 SEMANAS — dispara o stagger ao entrar no viewport
// ---------------------------------------------------------------------------

function ActivityPanel({
  weeks,
  loading,
  webgl,
}: {
  weeks: { week: number; total: number }[];
  loading: boolean;
  webgl: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setActive(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <HUDPanel title="// ATIVIDADE · 52 SEMANAS">
      <div ref={ref}>
        {loading ? (
          <div className="flex h-[280px] items-center justify-center">
            <span className="hud-label animate-pulse">{'// SINCRONIZANDO'}</span>
          </div>
        ) : webgl ? (
          <Suspense
            fallback={
              <div className="flex h-[280px] items-center justify-center">
                <span className="hud-label animate-pulse">{'// INICIALIZANDO'}</span>
              </div>
            }
          >
            <ActivityChart3D weeks={weeks} active={active} />
          </Suspense>
        ) : (
          <ActivityChart2D weeks={weeks} />
        )}
      </div>
    </HUDPanel>
  );
}
