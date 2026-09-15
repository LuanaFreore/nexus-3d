import { memo, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Github } from 'lucide-react';
import HUDPanel from '@/components/hud/HUDPanel';
import type { GhCommit, GhLanguages, GhRepo, GhAuthUser, RateLimitInfo } from '@/lib/github';
import {
  firstLine,
  formatBytes,
  formatCompact,
  relativeTime,
  shortSha,
} from '@/lib/github';
import type { OrbitBody } from '@/components/dashboard/orbitModel';

/**
 * panels.tsx — painéis HUD do /dashboard (dashboard.md §Layout):
 * ContextBar (seletor owner/repo + presets + auth), SelectedRepoPanel,
 * ApiHealthPanel, CommitsPanel, LanguagesPanel, OAuthStrip.
 */

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

// ---------------------------------------------------------------------------
// Número com roll tabular (~100ms/dígito) — telemetria real, sem easing fofo
// ---------------------------------------------------------------------------

export function RollingNumber({ value, format }: { value: number; format?: (n: number) => string }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = value;
    if (from === value) return; // display já está em sync
    const digits = Math.max(1, String(Math.round(value)).length);
    const dur = Math.min(600, 100 * digits);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      setDisplay(Math.round(from + (value - from) * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const fmt = format ?? ((n: number) => n.toLocaleString('pt-BR'));
  return <span className="tnum">{fmt(display)}</span>;
}

// ---------------------------------------------------------------------------
// Barra de contexto (sob navbar)
// ---------------------------------------------------------------------------

export const REPO_PRESETS = [
  'pytorch/pytorch',
  'facebook/react',
  'torvalds/linux',
  'microsoft/vscode',
  'vercel/next.js',
] as const;

interface ContextBarProps {
  value: string;
  onChange: (v: string) => void;
  onLoad: (target: string) => void;
  loading: boolean;
  errorTick: number; // incrementa → shake 404
  statusLine: string | null; // ex.: "404 · REPOSITÓRIO NÃO ENCONTRADO"
  user: GhAuthUser | null;
  onLogin: () => void;
  onLogout: () => void;
}

export function ContextBar({
  value,
  onChange,
  onLoad,
  loading,
  errorTick,
  statusLine,
  user,
  onLogin,
  onLogout,
}: ContextBarProps) {
  return (
    <div className="border-b border-hairline bg-void">
      <div
        className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-5 gap-y-2 py-3"
        style={{ paddingInline: 'clamp(20px, 4vw, 64px)' }}
      >
        {/* esquerda: label + seletor */}
        <span className="hud-label shrink-0">{'// GITHUB LIVE'}</span>
        <motion.div
          key={errorTick}
          animate={errorTick > 0 ? { x: [0, -6, 6, -6, 6, 0] } : undefined}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-2"
        >
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onLoad(value);
            }}
            placeholder="owner/repo"
            spellCheck={false}
            aria-label="owner/repo"
            className="w-[180px] border border-hairline bg-transparent px-3 py-2 font-mono text-[12px] tracking-[0.04em] text-nxtext outline-none transition-colors placeholder:text-text-faint focus:border-hairline-strong sm:w-[220px]"
          />
          <button onClick={() => onLoad(value)} disabled={loading} className="btn-hairline !px-4 !py-2">
            {loading ? 'SYNC…' : 'CARREGAR ▸'}
          </button>
        </motion.div>
        {statusLine && (
          <span className="tnum font-mono text-[10px] tracking-[0.14em]" style={{ color: 'var(--danger)' }}>
            {statusLine}
          </span>
        )}

        {/* centro: presets */}
        <div className="hidden items-center gap-2 lg:flex">
          {REPO_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => onLoad(p)}
              className="border border-hairline px-2.5 py-1 font-mono text-[11px] tracking-[0.08em] text-text-dim transition-colors hover:border-hairline-strong hover:text-core"
            >
              {p}
            </button>
          ))}
        </div>

        {/* direita: auth */}
        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <img
                src={user.avatar_url}
                alt={user.login}
                className="h-6 w-6 rounded-full border border-hairline"
              />
              <span className="font-mono text-[11px] tracking-[0.12em] text-nxtext">{user.login}</span>
              <button onClick={onLogout} className="btn-ghost">
                SAIR
                <span className="ghost-arrow">→</span>
              </button>
            </>
          ) : (
            <>
              <button onClick={onLogin} className="btn-hairline !px-4 !py-2">
                <Github size={13} strokeWidth={1.75} />
                ENTRAR COM GITHUB
              </button>
              <span className="tnum hidden font-mono text-[10px] tracking-[0.14em] text-text-faint md:inline">
                MODO DEMO · 60 REQ/H
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel: repo selecionado (canto superior esquerdo do canvas)
// ---------------------------------------------------------------------------

interface SelectedRepoPanelProps {
  body: OrbitBody | null; // corpo orbital focado
  repo: GhRepo | null; // repo carregado (seleção padrão)
  loading: boolean;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[clamp(1.25rem,2vw,1.75rem)] font-medium leading-none text-nxtext">
        <RollingNumber value={value} format={formatCompact} />
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">{label}</span>
    </div>
  );
}

export const SelectedRepoPanel = memo(function SelectedRepoPanel({
  body,
  repo,
  loading,
}: SelectedRepoPanelProps) {
  const name = body?.fullName ?? repo?.full_name ?? '——';
  const desc = body?.description ?? repo?.description ?? null;
  const stats = body
    ? { stars: body.stars, forks: body.forks, issues: body.issues, watchers: body.watchers }
    : repo
      ? {
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          issues: repo.open_issues_count,
          watchers: repo.subscribers_count ?? repo.watchers_count,
        }
      : null;

  return (
    <HUDPanel title="// REPO EM FOCO" className="w-[240px]">
      <AnimatePresence mode="wait">
        <motion.div
          key={name}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col gap-3"
        >
          <span className="font-mono text-[13px] tracking-[0.04em] text-core">{name}</span>
          <p
            className="overflow-hidden text-[12px] leading-snug text-text-dim"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
          >
            {desc ?? 'sem descrição'}
          </p>
          {loading || !stats ? (
            <div className="grid grid-cols-2 gap-3">
              {['★ STARS', '⑂ FORKS', '◌ ISSUES', '◉ WATCHERS'].map((l) => (
                <div key={l} className="flex flex-col gap-0.5">
                  <span className="animate-pulse font-mono text-[1.25rem] leading-none text-text-faint">
                    ——
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
                    {l}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="★ STARS" value={stats.stars} />
              <Stat label="⑂ FORKS" value={stats.forks} />
              <Stat label="◌ ISSUES" value={stats.issues} />
              <Stat label="◉ WATCHERS" value={stats.watchers} />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </HUDPanel>
  );
});

// ---------------------------------------------------------------------------
// Painel: saúde da API (canto superior direito do canvas)
// ---------------------------------------------------------------------------

interface ApiHealthPanelProps {
  rateLimit: RateLimitInfo;
  fetching: boolean;
  lastSyncAt: number | null;
  latencyMs: number | null;
  rateLimitedUntil: number | null; // epoch ms do reset após 403
  stale: boolean; // servindo cache
  economy: boolean; // remaining < 5 → refresh 120s
}

function useNow(stepMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(id);
  }, [stepMs]);
  return now;
}

export const ApiHealthPanel = memo(function ApiHealthPanel({
  rateLimit,
  fetching,
  lastSyncAt,
  latencyMs,
  rateLimitedUntil,
  stale,
  economy,
}: ApiHealthPanelProps) {
  const now = useNow(1000);
  const pct = rateLimit.limit > 0 ? rateLimit.remaining / rateLimit.limit : 0;
  const resetIn = Math.max(0, rateLimit.resetAt - now);
  const resetMm = String(Math.floor(resetIn / 60_000)).padStart(2, '0');
  const resetSs = String(Math.floor((resetIn % 60_000) / 1000)).padStart(2, '0');
  const syncAgo = lastSyncAt ? Math.max(0, Math.round((now - lastSyncAt) / 1000)) : null;
  const blocked = rateLimitedUntil != null && rateLimitedUntil > now;
  const blockedIn = blocked ? Math.max(0, rateLimitedUntil - now) : 0;

  return (
    <HUDPanel
      title={
        fetching ? '// API HEALTH · SYNC' : '// API HEALTH'
      }
      className="w-[220px]"
    >
      <div className="flex items-center justify-between gap-6">
        <span className="font-mono text-[11px] tracking-[0.12em] text-text-dim">RATE LIMIT</span>
        <span className="hud-readout tnum" style={rateLimit.remaining < 5 ? { color: 'var(--danger)' } : undefined}>
          {rateLimit.remaining}/{rateLimit.limit}
          {stale && (
            <span className="ml-2 text-[10px] text-text-faint">CACHE</span>
          )}
        </span>
      </div>
      {/* barra hairline */}
      <div className="h-[3px] w-full border border-hairline">
        <div
          className="h-full transition-[width] duration-500"
          style={{
            width: `${Math.round(pct * 100)}%`,
            background: rateLimit.remaining < 5 ? 'var(--danger)' : 'var(--accent)',
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="font-mono text-[11px] tracking-[0.12em] text-text-dim">RESET</span>
        <span className="hud-readout tnum">
          {resetMm}:{resetSs}
        </span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="font-mono text-[11px] tracking-[0.12em] text-text-dim">ÚLTIMA SYNC</span>
        <span className="hud-readout tnum">{syncAgo == null ? '——' : `${syncAgo}S ATRÁS`}</span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="font-mono text-[11px] tracking-[0.12em] text-text-dim">LATÊNCIA</span>
        <span className="hud-readout tnum">{latencyMs == null ? '——' : `${Math.round(latencyMs)}MS`}</span>
      </div>
      {economy && !blocked && (
        <p className="tnum font-mono text-[10px] tracking-[0.14em]" style={{ color: 'var(--danger)' }}>
          MODO ECONOMIA · RATE LIMIT
        </p>
      )}
      {blocked && (
        <p className="tnum font-mono text-[10px] tracking-[0.14em]" style={{ color: 'var(--danger)' }}>
          403 · RETENTANDO EM {String(Math.floor(blockedIn / 60_000)).padStart(2, '0')}:
          {String(Math.floor((blockedIn % 60_000) / 1000)).padStart(2, '0')}
        </p>
      )}
      {/* ponto pulsante enquanto fetching */}
      <div className="flex items-center gap-2 pt-1">
        <span
          className="block h-1.5 w-1.5 rounded-full"
          style={{
            background: fetching ? 'var(--accent)' : 'var(--text-faint)',
            animation: fetching ? 'pulse-dot 1.2s ease-in-out infinite' : 'none',
            boxShadow: fetching ? '0 0 6px var(--accent)' : 'none',
          }}
        />
        <span className="font-mono text-[10px] tracking-[0.14em] text-text-faint">
          {fetching ? 'SINCRONIZANDO' : 'API PÚBLICA · ANÔNIMA'}
        </span>
      </div>
    </HUDPanel>
  );
});

// ---------------------------------------------------------------------------
// Painel: commits recentes
// ---------------------------------------------------------------------------

export const CommitsPanel = memo(function CommitsPanel({
  commits,
  repoUrl,
  loading,
}: {
  commits: GhCommit[];
  repoUrl: string;
  loading: boolean;
}) {
  return (
    <HUDPanel
      title="// COMMITS RECENTES"
      footer={
        <a href={`${repoUrl}/commits`} target="_blank" rel="noreferrer" className="btn-ghost">
          ver todos no github
          <span className="ghost-arrow">→</span>
        </a>
      }
    >
      {loading
        ? Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-baseline gap-3 border-b border-hairline pb-2.5 last:border-0">
              <span className="animate-pulse font-mono text-[12px] text-text-faint">——</span>
              <span className="h-3 flex-1 animate-pulse bg-hairline" />
            </div>
          ))
        : commits.slice(0, 8).map((c) => (
            <div key={c.sha} className="flex flex-col gap-0.5 border-b border-hairline pb-2.5 last:border-0 last:pb-0">
              <div className="flex items-baseline gap-3">
                <a
                  href={c.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="tnum shrink-0 font-mono text-[12px] tracking-[0.04em]"
                  style={{ color: 'var(--accent)' }}
                >
                  {shortSha(c.sha)}
                </a>
                <span className="truncate font-mono text-[12.5px] tracking-[0.02em] text-nxtext">
                  {firstLine(c.commit.message)}
                </span>
              </div>
              <span className="pl-[52px] font-mono text-[10px] tracking-[0.08em] text-text-faint">
                {c.author?.login ?? c.commit.author.name} · {relativeTime(c.commit.author.date)}
              </span>
            </div>
          ))}
    </HUDPanel>
  );
});

// ---------------------------------------------------------------------------
// Painel: linguagens (mono branco→cinza + accent na dominante)
// ---------------------------------------------------------------------------

const GRAY_SCALE = ['#EDEDED', '#B9B9B9', '#8A8A8A', '#636363', '#454545', '#333333'];

export const LanguagesPanel = memo(function LanguagesPanel({
  languages,
  loading,
}: {
  languages: GhLanguages;
  loading: boolean;
}) {
  const entries = Object.entries(languages).sort((a, b) => b[1] - a[1]);
  const top = entries.slice(0, 6);
  const restBytes = entries.slice(6).reduce((acc, [, b]) => acc + b, 0);
  const rows = restBytes > 0 ? [...top, ['OUTRAS', restBytes] as [string, number]] : top;
  const total = rows.reduce((acc, [, b]) => acc + b, 0) || 1;

  return (
    <HUDPanel title="// LINGUAGENS · BYTES">
      {loading
        ? Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <span className="h-3 w-1/3 animate-pulse bg-hairline" />
              <span className="h-2 w-full animate-pulse bg-hairline" />
            </div>
          ))
        : rows.map(([lang, bytes], rank) => {
            const pct = (bytes / total) * 100;
            const dominant = rank === 0;
            return (
              <motion.div
                key={lang}
                layout="position"
                transition={{ duration: 0.4, ease: EASE }}
                className="group flex flex-col gap-1.5"
                title={`${lang} · ${formatBytes(bytes)}`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-dim transition-colors group-hover:text-core">
                    {lang}
                  </span>
                  <span className="tnum font-mono text-[11px] tracking-[0.04em] text-nxtext">
                    {pct.toFixed(1).replace('.', ',')}%
                  </span>
                </div>
                <div className="h-2 w-full border border-hairline">
                  <motion.div
                    className="h-full transition-[filter] duration-150 group-hover:brightness-150"
                    style={{
                      background: dominant ? 'var(--accent)' : GRAY_SCALE[Math.min(rank, GRAY_SCALE.length - 1)],
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: EASE }}
                  />
                </div>
              </motion.div>
            );
          })}
    </HUDPanel>
  );
});

// ---------------------------------------------------------------------------
// Faixa OAuth técnica
// ---------------------------------------------------------------------------

export function OAuthStrip({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex flex-col items-start justify-between gap-6 border-y border-hairline py-8 md:flex-row md:items-center">
      <p className="tnum font-mono text-[11px] leading-relaxed tracking-[0.1em] text-text-dim">
        <span className="text-text-faint">{'// FLUXO OAUTH'}</span>
        <br />
        1. authorize → 2. /auth/github/callback → 3. JWT · escopos{' '}
        <span className="text-nxtext">read:user public_repo</span>
      </p>
      <div className="flex flex-wrap items-center gap-6">
        <button onClick={onConnect} className="btn-hairline">
          <Github size={13} strokeWidth={1.75} />
          CONECTAR CONTA GITHUB
        </button>
        <a
          href="https://github.com/nexus3d/nexus-core"
          target="_blank"
          rel="noreferrer"
          className="btn-ghost"
        >
          documentação no repo
          <span className="ghost-arrow">→</span>
        </a>
      </div>
    </div>
  );
}
