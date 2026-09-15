import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface PreloaderProps {
  /** real load progress 0..100 (shader/asset pipeline) */
  realProgress: number;
  onDone: () => void;
}

const BOOT_LINES = [
  'SHADERS 12/12',
  'BUFFERS OK',
  'GPU WEBGL2',
  'KERNEL ARMADO',
];

/**
 * ATO 0 — Preloader (design home.md): logo + "// INICIALIZANDO NÚCLEO",
 * 240px hairline bar filling in accent + tabular % right, boot readouts.
 * Counts 0→100 in ~1.8s, tied to real progress (min 1.2s). Bar flashes to
 * core on completion, then the parent crossfades to the hero (600ms).
 */
export default function Preloader({ realProgress, onDone }: PreloaderProps) {
  const [display, setDisplay] = useState(0);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const start = performance.now();
    const MIN_MS = 1200;
    const MAX_MS = 1800;
    let raf = 0;
    let done = false;

    const tick = () => {
      const elapsed = performance.now() - start;
      const timeRamp = Math.min(100, (elapsed / MAX_MS) * 100);
      const target = Math.min(timeRamp, realProgress);
      setDisplay((prev) => {
        const next = Math.max(prev, target);
        // completa só quando o pipeline real (shaders/chunk) reportou 100%
        if (next >= 100 && elapsed >= MIN_MS && realProgress >= 100 && !done) {
          done = true;
          setComplete(true);
          setTimeout(onDone, 300); // bar flash 150ms + handoff
        }
        return next;
      });
      if (!done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [realProgress, onDone]);

  const pct = Math.min(100, Math.floor(display));

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-void"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      <img src="/logo.svg" alt="" width={48} height={48} className="mb-6" />
      <p className="hud-label mb-8">{'// INICIALIZANDO NÚCLEO'}</p>

      <div className="flex items-center gap-4">
        <div className="h-px w-[240px] bg-hairline-strong">
          <div
            className="h-px transition-colors duration-150"
            style={{
              width: `${pct}%`,
              background: complete ? 'var(--core)' : 'var(--accent)',
              boxShadow: complete ? '0 0 8px var(--core)' : '0 0 6px var(--accent)',
            }}
          />
        </div>
        <span className="tnum w-10 font-mono text-[11px] text-text-dim">{pct}%</span>
      </div>

      <div className="absolute bottom-10 flex items-center gap-3 font-mono text-[10px] tracking-[0.18em] text-text-faint">
        {BOOT_LINES.map((line, i) => (
          <span key={line} className="flex items-center gap-3">
            {i > 0 && <span>·</span>}
            <span
              style={{
                color: pct > (i + 1) * 25 ? 'var(--text-dim)' : 'var(--text-faint)',
              }}
            >
              {line}
            </span>
          </span>
        ))}
      </div>
    </motion.div>
  );
}
