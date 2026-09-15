import { useState } from 'react';
import { Dices, RotateCcw } from 'lucide-react';
import HUDPanel from '@/components/hud/HUDPanel';
import HudSlider from './HudSlider';
import type { DynamicParams, EngineMode, PresetId, StaticConfig } from './types';
import { PARTICLE_COUNTS, PRESETS, PRESET_LABEL, countLabel } from './types';

interface ControlPanelProps {
  dyn: DynamicParams;
  onDynChange: (patch: Partial<DynamicParams>) => void;
  config: StaticConfig;
  mode: EngineMode;
  restarting: boolean;
  notice: string | null;
  backendOnline: boolean;
  kernelMode: boolean;
  onKernelModeChange: (on: boolean) => void;
  onRestart: (next: { count: number; seed: number }) => void;
  onPreset: (preset: PresetId) => void;
}

const SELECT_COUNTS: number[] = [...PARTICLE_COUNTS];

/**
 * ControlPanel — floating HUDPanel (300px) with dynamic sliders (realtime),
 * static params (require restart), kernel benchmark switch and the preset
 * segmented control in the footer (simulacao.md).
 */
export default function ControlPanel({
  dyn,
  onDynChange,
  config,
  mode,
  restarting,
  notice,
  backendOnline,
  kernelMode,
  onKernelModeChange,
  onRestart,
  onPreset,
}: ControlPanelProps) {
  const [pendingCount, setPendingCount] = useState(config.count);
  const [pendingSeed, setPendingSeed] = useState(config.seed);

  // stay in sync when the applied config changes elsewhere (preset switch,
  // adaptive N reduction) — render-time adjust pattern
  const [prevConfig, setPrevConfig] = useState({ count: config.count, seed: config.seed });
  if (prevConfig.count !== config.count || prevConfig.seed !== config.seed) {
    setPrevConfig({ count: config.count, seed: config.seed });
    setPendingCount(config.count);
    setPendingSeed(config.seed);
  }

  const randomSeed = () => setPendingSeed(Math.floor(Math.random() * 999999));

  return (
    <HUDPanel
      title="// PARÂMETROS"
      className="w-[300px]"
      footer={
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] tracking-[0.18em] text-text-faint">PRESETS</span>
          <div className="grid grid-cols-4 border border-hairline">
            {PRESETS.map((p) => {
              const active = config.preset === p;
              return (
                <button
                  key={p}
                  onClick={() => onPreset(p)}
                  className="px-1 py-2 font-mono text-[10px] tracking-[0.08em] transition-colors duration-150"
                  style={{
                    background: active ? 'var(--accent-dim)' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--text-dim)',
                    borderRight: p !== 'ANEL' ? '1px solid var(--hairline)' : 'none',
                  }}
                >
                  {PRESET_LABEL[p]}
                </button>
              );
            })}
          </div>
        </div>
      }
    >
      {/* DINÂMICOS */}
      <span className="font-mono text-[10px] tracking-[0.18em] text-text-faint">DINÂMICOS</span>
      <HudSlider
        label="GRAVIDADE G"
        min={0.1}
        max={10}
        step={0.01}
        value={dyn.gravity}
        format={(v) => v.toFixed(2)}
        onChange={(v) => onDynChange({ gravity: v })}
      />
      <HudSlider
        label="AMORTECIMENTO"
        min={0.9}
        max={1}
        step={0.001}
        value={dyn.damping}
        format={(v) => v.toFixed(3)}
        onChange={(v) => onDynChange({ damping: v })}
      />
      <HudSlider
        label="RAIO SOFTENING"
        min={0.001}
        max={0.5}
        step={0.001}
        value={dyn.softening}
        format={(v) => v.toFixed(3)}
        onChange={(v) => onDynChange({ softening: v })}
      />
      <HudSlider
        label="TEMPO Δt"
        min={0.1}
        max={3}
        step={0.01}
        value={dyn.dtScale}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(v) => onDynChange({ dtScale: v })}
      />
      <HudSlider
        label="MASSA DO POÇO"
        min={0}
        max={100}
        step={0.5}
        value={dyn.wellMass}
        format={(v) => v.toFixed(1)}
        onChange={(v) => onDynChange({ wellMass: v })}
      />

      {/* ESTÁTICOS */}
      <div className="mt-1 border-t border-hairline pt-3">
        <span className="font-mono text-[10px] tracking-[0.18em] text-text-faint">
          ESTÁTICOS · EXIGEM RESTART
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] tracking-[0.12em] text-text-dim">PARTÍCULAS</span>
        <select
          value={pendingCount}
          disabled={mode === 'cpu'}
          onChange={(e) => setPendingCount(parseInt(e.target.value, 10))}
          className="border border-hairline bg-transparent px-2 py-1 font-mono text-[11px] tracking-[0.08em] text-nxtext outline-none transition-colors focus:border-hairline-strong disabled:opacity-40"
          style={{ background: 'var(--surface)' }}
        >
          {SELECT_COUNTS.map((n) => (
            <option key={n} value={n} style={{ background: '#0a0a0a' }}>
              {countLabel(n)}
              {n === 1048576 ? ' ⚠ GPU FORTE' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] tracking-[0.12em] text-text-dim">SEMENTE</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={pendingSeed}
            onChange={(e) => setPendingSeed(parseInt(e.target.value || '0', 10))}
            className="tnum w-24 border border-hairline bg-transparent px-2 py-1 font-mono text-[11px] text-nxtext outline-none transition-colors focus:border-hairline-strong"
          />
          <button
            onClick={randomSeed}
            title="Semente aleatória"
            className="border border-hairline p-1.5 text-text-dim transition-colors hover:border-hairline-strong hover:text-core"
          >
            <Dices size={12} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <button
        onClick={() => onRestart({ count: pendingCount, seed: pendingSeed })}
        disabled={restarting}
        className="btn-hairline w-full justify-center !px-3 !py-2.5 disabled:opacity-50"
      >
        <RotateCcw size={12} strokeWidth={1.75} />
        {restarting ? 'REALOCANDO BUFFERS…' : 'REINICIAR SIMULAÇÃO'}
      </button>

      {/* kernel benchmark switch — only when the FastAPI backend is online */}
      {backendOnline && mode === 'gpu' && (
        <div className="flex flex-col gap-2 border-t border-hairline pt-3">
          <span className="font-mono text-[10px] tracking-[0.18em] text-text-faint">
            {'// EXECUTAR STEP EM:'}
          </span>
          <div className="grid grid-cols-2 border border-hairline">
            {(['GPU-WEBGL', 'KERNEL C++'] as const).map((label, i) => {
              const active = kernelMode === (i === 1);
              return (
                <button
                  key={label}
                  onClick={() => onKernelModeChange(i === 1)}
                  className="px-2 py-2 font-mono text-[10px] tracking-[0.12em] transition-colors duration-150"
                  style={{
                    background: active ? 'var(--accent-dim)' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--text-dim)',
                    borderRight: i === 0 ? '1px solid var(--hairline)' : 'none',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {mode === 'cpu' && (
        <p
          className="font-mono text-[10px] tracking-[0.12em]"
          style={{ color: 'var(--danger)', opacity: 0.85 }}
        >
          MODO CPU · N=2048 · GPU FLOAT INDISPONÍVEL
        </p>
      )}
      {notice && (
        <p className="font-mono text-[10px] tracking-[0.12em]" style={{ color: 'var(--accent)' }}>
          {notice}
        </p>
      )}
    </HUDPanel>
  );
}
