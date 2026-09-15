import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface HUDReadoutRow {
  label: string;
  value: ReactNode;
  accent?: boolean;
}

interface HUDPanelProps {
  title: string;
  rows?: HUDReadoutRow[];
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * HUDPanel — design.md §7.4
 * Floating panel: mono 11px header + bottom hairline, readout rows
 * (dim label left, tabular value right), 8px notch on top-left corner.
 */
export default function HUDPanel({ title, rows, children, footer, className }: HUDPanelProps) {
  return (
    <div className={cn('hud-surface hud-notch', className)}>
      <div className="border-b border-hairline px-5 py-3">
        <span className="hud-label">{title}</span>
      </div>
      {(rows || children) && (
        <div className="flex flex-col gap-3 px-5 py-4">
          {rows?.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-6">
              <span className="font-mono text-[11px] tracking-[0.12em] text-text-dim">
                {row.label}
              </span>
              <span
                className="hud-readout"
                style={row.accent ? { color: 'var(--accent)' } : undefined}
              >
                {row.value}
              </span>
            </div>
          ))}
          {children}
        </div>
      )}
      {footer && <div className="border-t border-hairline px-5 py-3">{footer}</div>}
    </div>
  );
}
