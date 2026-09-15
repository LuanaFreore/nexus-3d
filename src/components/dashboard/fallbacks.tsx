import type { OrbitBody } from '@/components/dashboard/orbitModel';
import type { GhWeek } from '@/lib/github';

/**
 * fallbacks.tsx — versões 2D (sem WebGL) da órbita e do gráfico de
 * atividade (dashboard.md §Fallbacks). Não importam three/R3F.
 */

/** Órbita → lista mono de repos (hairlines, mesmos dados). */
export function RepoOrbitFallback({
  bodies,
  selected,
  onSelect,
}: {
  bodies: OrbitBody[];
  selected: string | null;
  onSelect: (fullName: string | null) => void;
}) {
  return (
    <div className="absolute inset-0 overflow-y-auto bg-void p-6">
      <p className="hud-label mb-4" style={{ color: 'var(--danger)' }}>
        {'// WEBGL INDISPONÍVEL — LISTA MONO'}
      </p>
      <div className="flex flex-col">
        {bodies.map((b) => (
          <button
            key={b.fullName}
            onClick={() => onSelect(selected === b.fullName ? null : b.fullName)}
            className="flex items-baseline justify-between gap-4 border-b border-hairline py-2.5 text-left transition-colors hover:bg-surface"
          >
            <span
              className="font-mono text-[12.5px] tracking-[0.04em]"
              style={{ color: selected === b.fullName ? 'var(--accent)' : 'var(--text)' }}
            >
              {b.fullName}
            </span>
            <span className="tnum font-mono text-[11px] text-text-faint">
              ★ {b.stars.toLocaleString('pt-BR')} · ◌ {b.issues}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Gráfico 52 semanas → barras 2D estáticas (mesmos dados). */
export function ActivityChart2D({ weeks }: { weeks: GhWeek[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.total));
  return (
    <div className="flex h-[280px] w-full items-end gap-[2px] px-2 pb-4 pt-6">
      {weeks.map((w, i) => (
        <div
          key={w.week}
          className="group relative flex-1"
          title={`SEM ${i + 1} · ${w.total} commits`}
        >
          <div
            className="w-full border transition-colors"
            style={{
              height: `${Math.max(2, (w.total / max) * 220)}px`,
              borderColor: i === weeks.length - 1 ? 'var(--accent)' : 'var(--hairline-strong)',
              background: i === weeks.length - 1 ? 'var(--accent-dim)' : 'rgba(255,255,255,0.03)',
            }}
          />
        </div>
      ))}
    </div>
  );
}
