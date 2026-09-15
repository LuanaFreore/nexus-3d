import { useEffect, useState } from 'react';
import StatReadout from '@/components/hud/StatReadout';
import type { StatItem } from '@/components/hud/StatReadout';
import type { Telemetry } from './types';
import { fmtClock, fmtExp } from './types';

interface TelemetryBarProps {
  telemetry: Telemetry;
  paused: boolean;
  kernelMode: boolean;
  minimized: boolean;
  onToggleMinimized: () => void;
}

/**
 * TelemetryBar — expanded StatReadout at the footer (simulacao.md):
 * FPS · MS · STEP · N · ENERGIA · COM · T (+ KERNEL ms in benchmark mode),
 * PAUSADO blinking at 1Hz, minimizable via the mono [-] button.
 */
export default function TelemetryBar({
  telemetry,
  paused,
  kernelMode,
  minimized,
  onToggleMinimized,
}: TelemetryBarProps) {
  // 1Hz blink for PAUSADO
  const [blink, setBlink] = useState(true);
  useEffect(() => {
    if (!paused) return;
    const iv = setInterval(() => setBlink((b) => !b), 500);
    return () => clearInterval(iv);
  }, [paused]);

  if (minimized) {
    return (
      <div className="hud-surface hud-notch flex items-center gap-3 px-4 py-2">
        <button
          onClick={onToggleMinimized}
          className="font-mono text-[11px] tracking-[0.12em] text-text-dim transition-colors hover:text-core"
          title="Expandir telemetria"
        >
          [+]
        </button>
        <span className="tnum font-mono text-[11px] tracking-[0.12em] text-text-dim">
          FPS <span className="text-nxtext">{telemetry.fps.toFixed(0)}</span>
        </span>
        {paused && (
          <span
            className="font-mono text-[11px] tracking-[0.18em]"
            style={{ color: 'var(--accent)', opacity: blink ? 1 : 0.25 }}
          >
            PAUSADO
          </span>
        )}
      </div>
    );
  }

  const items: StatItem[] = [
    { label: 'FPS', value: telemetry.fps.toFixed(0) },
    { label: 'MS', value: telemetry.frameMs.toFixed(1) },
    { label: 'STEP', value: `${telemetry.stepMs.toFixed(2)}MS` },
    { label: 'N', value: String(telemetry.n) },
    {
      label: 'ENERGIA',
      value: telemetry.energy !== null ? fmtExp(telemetry.energy) : '—',
    },
    {
      label: 'COM',
      value: `x ${telemetry.com[0].toFixed(2)} y ${telemetry.com[1].toFixed(2)} z ${telemetry.com[2].toFixed(2)}`,
    },
    { label: 'T', value: fmtClock(telemetry.simTime) },
  ];
  if (kernelMode) {
    items.splice(3, 0, {
      label: 'KERNEL',
      value: telemetry.kernelMs !== null ? `${telemetry.kernelMs.toFixed(2)}MS` : '…',
      accent: true,
    });
  }

  return (
    <div className="hud-surface hud-notch flex max-w-full items-center gap-4 px-4 py-2.5">
      <button
        onClick={onToggleMinimized}
        className="shrink-0 font-mono text-[11px] tracking-[0.12em] text-text-dim transition-colors hover:text-core"
        title="Minimizar telemetria"
      >
        [-]
      </button>
      <span className="h-3 w-px shrink-0 bg-hairline" aria-hidden />
      <div className="min-w-0 overflow-x-auto">
        <StatReadout items={items} className="flex-nowrap whitespace-nowrap" />
      </div>
      {paused && (
        <span
          className="shrink-0 font-mono text-[11px] tracking-[0.18em]"
          style={{ color: 'var(--accent)', opacity: blink ? 1 : 0.25 }}
        >
          PAUSADO
        </span>
      )}
    </div>
  );
}
