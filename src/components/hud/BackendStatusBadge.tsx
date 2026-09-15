import { useBackendHealth, getBackendUrl } from '@/lib/backend';

/**
 * BackendStatusBadge — design.md §7.2
 * Hairline pill, mono 10px: pulsing 6px dot (accent ONLINE / danger OFFLINE)
 * + "NÚCLEO ONLINE" / "MODO LOCAL". Hover tooltip shows endpoint + latency.
 */
export default function BackendStatusBadge() {
  const { online, latencyMs, checking } = useBackendHealth(15000);

  const endpoint = getBackendUrl().replace(/^https?:\/\//, '');
  const tooltip = online
    ? `${endpoint} · ${latencyMs ?? '—'}ms`
    : `${endpoint} · sem resposta`;

  return (
    <div className="group relative hidden sm:flex" title={tooltip}>
      <div className="flex items-center gap-2 border border-hairline px-3 py-1.5">
        <span
          className="block h-1.5 w-1.5 rounded-full"
          style={{
            background: checking ? 'var(--text-faint)' : online ? 'var(--accent)' : 'var(--danger)',
            animation: 'pulse-dot 1.6s ease-in-out infinite',
            boxShadow: online ? '0 0 6px var(--accent)' : 'none',
          }}
        />
        <span
          className="tnum font-mono text-[10px] font-medium uppercase"
          style={{
            letterSpacing: '0.18em',
            color: checking
              ? 'var(--text-faint)'
              : online
                ? 'var(--text-dim)'
                : 'var(--danger)',
          }}
        >
          {checking ? 'PROBANDO…' : online ? 'NÚCLEO ONLINE' : 'MODO LOCAL'}
        </span>
      </div>
      {/* tooltip */}
      <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 whitespace-nowrap border border-hairline bg-surface px-3 py-2 font-mono text-[10px] tracking-[0.08em] text-text-dim opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        {tooltip}
      </div>
    </div>
  );
}
