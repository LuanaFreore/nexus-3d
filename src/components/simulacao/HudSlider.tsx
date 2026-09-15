import { useRef, useState } from 'react';

interface HudSliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}

/**
 * HudSlider — hairline slider per simulacao.md: accent-filled track, 10px
 * diamond thumb (logo echo), tabular readout that flashes --core for 80ms
 * on every value change.
 */
export default function HudSlider({ label, min, max, step, value, format, onChange }: HudSliderProps) {
  const [flash, setFlash] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (v: number) => {
    onChange(v);
    setFlash(true);
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setFlash(false), 80);
  };

  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] tracking-[0.12em] text-text-dim">{label}</span>
        <span
          className="tnum font-mono text-[12.5px] tracking-[0.04em]"
          style={{ color: flash ? 'var(--core)' : 'var(--text)' }}
        >
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        className="nxs-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => handleChange(parseFloat(e.target.value))}
        style={{
          background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, var(--hairline) ${pct}%, var(--hairline) 100%)`,
        }}
      />
      <style>{`
        .nxs-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 1px;
          outline: none;
          padding: 0;
          margin: 6px 0;
        }
        .nxs-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 10px;
          height: 10px;
          background: var(--core);
          border: 1px solid var(--accent);
          transform: rotate(45deg);
          cursor: pointer;
        }
        .nxs-slider::-moz-range-thumb {
          width: 10px;
          height: 10px;
          background: var(--core);
          border: 1px solid var(--accent);
          border-radius: 0;
          transform: rotate(45deg);
          cursor: pointer;
        }
        .nxs-slider::-moz-range-track {
          height: 1px;
          background: transparent;
        }
      `}</style>
    </div>
  );
}
