import { cn } from '@/lib/utils';

export interface StatItem {
  label: string;
  value: string;
  accent?: boolean;
}

interface StatReadoutProps {
  items: StatItem[];
  className?: string;
}

/**
 * StatReadout — design.md §7.5 telemetry bar.
 * Mono 11px items separated by vertical hairlines. Values are expected to
 * update live (4–10Hz) like real telemetry — no easing, direct text swap.
 */
export default function StatReadout({ items, className }: StatReadoutProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-[0.12em]',
        className,
      )}
    >
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-4">
          {i > 0 && <span className="h-3 w-px bg-hairline" aria-hidden />}
          <span className="text-text-dim">{item.label}</span>
          <span
            className="tnum text-nxtext"
            style={item.accent ? { color: 'var(--accent)' } : undefined}
          >
            {item.value}
          </span>
        </span>
      ))}
    </div>
  );
}
