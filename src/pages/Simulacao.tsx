import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { stopSmoothScroll, startSmoothScroll } from '@/lib/smooth-scroll';
import { getBackendUrl, useBackendHealth } from '@/lib/backend';
import NBodyScene from '@/components/simulacao/NBodyScene';
import type { WellState } from '@/components/simulacao/NBodyScene';
import ControlPanel from '@/components/simulacao/ControlPanel';
import TelemetryBar from '@/components/simulacao/TelemetryBar';
import type { NBodyEngine } from '@/components/simulacao/engine';
import { generateInitialState } from '@/components/simulacao/initialConditions';
import { kernelStep } from '@/components/simulacao/kernelClient';
import type {
  DynamicParams,
  EngineMode,
  PresetId,
  StaticConfig,
  Telemetry,
} from '@/components/simulacao/types';
import { DEFAULT_DYNAMIC, PARTICLE_COUNTS, PRESET_LABEL } from '@/components/simulacao/types';

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** WebGL2 + float render-target support probe (drives the CPU fallback). */
function detectGpuFloat(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    const ok = gl.getExtension('EXT_color_buffer_float') !== null;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

/** Default preset: 262K particles, 65K on weak devices (simulacao.md). */
function defaultCount(): number {
  const cores = navigator.hardwareConcurrency ?? 8;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return cores <= 4 || coarse ? 65536 : 262144;
}

/**
 * Simulação — `/simulacao` (design simulacao.md): full-viewport GPU N-body
 * instrument page. No scroll (Lenis stopped, overflow hidden); HUD floats
 * over the canvas; navigation via navbar + keyboard shortcuts.
 */
export default function Simulacao() {
  const mode: EngineMode = useMemo(() => (detectGpuFloat() ? 'gpu' : 'cpu'), []);
  const { online: backendOnline } = useBackendHealth(15000);

  const [dyn, setDyn] = useState<DynamicParams>({ ...DEFAULT_DYNAMIC });
  const [config, setConfig] = useState<StaticConfig>(() => ({
    preset: 'DISCO',
    count: defaultCount(),
    seed: 42,
  }));
  const [restartToken, setRestartToken] = useState(0);
  const [restarting, setRestarting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const [hintsVisible, setHintsVisible] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [kernelMode, setKernelMode] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState(0);
  const [telem, setTelem] = useState<Telemetry>({
    fps: 60,
    frameMs: 16.6,
    stepMs: 0,
    kernelMs: null,
    energy: null,
    com: [0, 0, 0],
    simTime: 0,
    n: 0,
  });

  // high-frequency channels (never re-render per frame)
  const dynRef = useRef(dyn);
  const pausedRef = useRef(false);
  const wellRef = useRef<WellState>({ active: false, repel: false, world: [0, 0, 0] });
  const telemetryRef = useRef<Telemetry>(telem);
  const engineRef = useRef<NBodyEngine | null>(null);
  const autoPaused = useRef(false);

  // full-viewport page: stop Lenis while mounted (design.md §5)
  useEffect(() => {
    stopSmoothScroll();
    return () => startSmoothScroll();
  }, []);

  const applyPause = useCallback((v: boolean) => {
    pausedRef.current = v;
    setPaused(v);
  }, []);

  const onDynChange = useCallback((patch: Partial<DynamicParams>) => {
    dynRef.current = { ...dynRef.current, ...patch };
    setDyn((d) => ({ ...d, ...patch }));
  }, []);

  const doRestart = useCallback(
    (next?: { count: number; seed: number }) => {
      setRestarting(true);
      if (next) {
        setConfig((c) => ({ ...c, count: mode === 'cpu' ? c.count : next.count, seed: next.seed }));
      }
      setRestartToken((t) => t + 1);
      setFlashKey((k) => k + 1);
      setTimeout(() => setRestarting(false), 400);
    },
    [mode],
  );

  const onPreset = useCallback((preset: PresetId) => {
    // presets swap seed + initial conditions and restart automatically
    setConfig((c) => ({ ...c, preset, seed: Math.floor(Math.random() * 999999) }));
    setRestartToken((t) => t + 1);
    setFlashKey((k) => k + 1);
  }, []);

  // adaptive quality callback: reduce N one notch (GPU only)
  const onRequestReduceN = useCallback(() => {
    setConfig((c) => {
      const idx = PARTICLE_COUNTS.indexOf(c.count as (typeof PARTICLE_COUNTS)[number]);
      if (idx <= 0) return c;
      const next = PARTICLE_COUNTS[idx - 1];
      setNotice(`N REDUZIDO PARA ${next}`);
      return { ...c, count: next };
    });
  }, []);

  // notice auto-clear
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  // keyboard shortcuts: ESPAÇO pause · R restart · H hide HUD
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        applyPause(!pausedRef.current);
      } else if (e.code === 'KeyR') {
        doRestart();
      } else if (e.code === 'KeyH') {
        setHudVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyPause, doRestart]);

  // auto-pause when the tab loses focus
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        if (!pausedRef.current) {
          autoPaused.current = true;
          applyPause(true);
        }
      } else if (autoPaused.current) {
        autoPaused.current = false;
        applyPause(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [applyPause]);

  // telemetry poll → React state at 4Hz (design.md §5)
  useEffect(() => {
    const iv = setInterval(() => setTelem({ ...telemetryRef.current }), 250);
    return () => clearInterval(iv);
  }, []);

  // kernel C++ inline benchmark loop (N ≤ 16K subset via /v1/sim/step)
  useEffect(() => {
    if (!kernelMode || !backendOnline) return;
    let alive = true;
    let busy = false;
    const subsetN = 16384;
    let subset = engineRef.current?.extractSubset(subsetN) ?? null;
    if (!subset) {
      // float readback unavailable — benchmark on a regenerated subset
      const gen = generateInitialState(config.preset, subsetN, config.seed);
      subset = { positions: gen.positions, velocities: gen.velocities, masses: gen.masses };
    }
    const url = getBackendUrl();
    const telemetry = telemetryRef.current;
    const iv = setInterval(() => {
      if (!alive || busy || !subset) return;
      busy = true;
      const current = subset;
      kernelStep(url, current, dynRef.current, (1 / 60) * dynRef.current.dtScale)
        .then((res) => {
          if (!alive) return;
          current.positions = res.positions;
          current.velocities = res.velocities;
          telemetry.kernelMs = res.stepMs;
        })
        .catch(() => {
          if (!alive) return;
          telemetry.kernelMs = null;
          setKernelMode(false);
          setNotice('KERNEL C++ SEM RESPOSTA · MODO GPU-WEBGL');
        })
        .finally(() => {
          busy = false;
        });
    }, 400);
    return () => {
      alive = false;
      clearInterval(iv);
      telemetry.kernelMs = null;
    };
  }, [kernelMode, backendOnline, config.preset, config.seed]);

  const onFirstInteract = useCallback(() => setHintsVisible(false), []);

  return (
    <div className="relative -mt-14 h-[100dvh] w-full overflow-hidden">
      {/* 3D canvas */}
      <div className="absolute inset-0" data-cursor="ARRASTAR">
        <NBodyScene
          config={config}
          mode={mode}
          dynRef={dynRef}
          pausedRef={pausedRef}
          wellRef={wellRef}
          telemetryRef={telemetryRef}
          engineRef={engineRef}
          restartToken={restartToken}
          onRequestReduceN={onRequestReduceN}
          onFirstInteract={onFirstInteract}
        />
      </div>

      {/* entry: fade from void (400ms) */}
      <motion.div
        className="pointer-events-none absolute inset-0 z-40"
        style={{ background: 'var(--void)' }}
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      />

      {/* restart flash: white→magenta radial burst from sim center (250ms) */}
      <AnimatePresence>
        {flashKey > 0 && (
          <motion.div
            key={flashKey}
            className="pointer-events-none absolute inset-0 z-30"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.85) 0%, rgba(246,40,125,0.45) 28%, transparent 65%)',
            }}
            initial={{ opacity: 0.9, scale: 0.25 }}
            animate={{ opacity: 0, scale: 1.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            onAnimationComplete={() => setFlashKey(0)}
          />
        )}
      </AnimatePresence>

      {/* gravity-well influence ring (radius reflects MASSA DO POÇO) */}
      <WellRing wellRef={wellRef} dynRef={dynRef} />

      <AnimatePresence>
        {hudVisible && (
          <motion.div
            key="hud"
            className="pointer-events-none absolute inset-0 z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* top bar (under navbar, bottom hairline) */}
            <motion.div
              className="pointer-events-auto absolute left-0 right-0 top-14 flex items-center justify-between border-b border-hairline"
              style={{
                paddingInline: 'clamp(20px, 4vw, 64px)',
                background: 'rgba(5,5,5,0.55)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.2, ease: EASE }}
            >
              <span className="hud-label py-2.5">
                {mode === 'gpu'
                  ? '// SIMULAÇÃO N-BODY · GPU COMPUTE'
                  : '// SIMULAÇÃO N-BODY · CPU FALLBACK'}
              </span>
              <motion.span
                key={config.preset}
                className="absolute left-1/2 hidden -translate-x-1/2 py-2.5 font-mono text-[11px] font-medium tracking-[0.18em] md:block"
                style={{ color: 'var(--accent)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                {PRESET_LABEL[config.preset]}
              </motion.span>
              <div className="flex items-center gap-4 py-1.5">
                <div className="hidden items-center gap-2 border border-hairline px-3 py-1.5 sm:flex">
                  <span
                    className="block h-1.5 w-1.5 rounded-full"
                    style={{
                      background: backendOnline ? 'var(--accent)' : 'var(--danger)',
                      animation: 'pulse-dot 1.6s ease-in-out infinite',
                      boxShadow: backendOnline ? '0 0 6px var(--accent)' : 'none',
                    }}
                  />
                  <span
                    className="font-mono text-[10px] font-medium uppercase"
                    style={{
                      letterSpacing: '0.18em',
                      color: backendOnline ? 'var(--text-dim)' : 'var(--danger)',
                    }}
                  >
                    {backendOnline ? 'KERNEL C++ ONLINE' : 'KERNEL JS LOCAL'}
                  </span>
                </div>
                <Link to="/" className="btn-ghost">
                  SAIR <span className="ghost-arrow">→</span>
                </Link>
              </div>
            </motion.div>

            {/* control panel (floating left, 300px) */}
            <motion.div
              className="pointer-events-auto absolute left-[clamp(20px,4vw,64px)] top-[104px] max-h-[calc(100dvh-200px)] overflow-y-auto"
              initial={{ x: -24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.45, delay: 0.3, ease: EASE }}
            >
              <ControlPanel
                dyn={dyn}
                onDynChange={onDynChange}
                config={config}
                mode={mode}
                restarting={restarting}
                notice={notice}
                backendOnline={backendOnline}
                kernelMode={kernelMode}
                onKernelModeChange={setKernelMode}
                onRestart={(next) => doRestart(next)}
                onPreset={onPreset}
              />
            </motion.div>

            {/* telemetry bar (footer) */}
            <motion.div
              className="pointer-events-auto absolute bottom-6 left-[clamp(20px,4vw,64px)] right-[clamp(20px,4vw,64px)] flex justify-center"
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.45, ease: EASE }}
            >
              <TelemetryBar
                telemetry={telem}
                paused={paused}
                kernelMode={kernelMode}
                minimized={minimized}
                onToggleMinimized={() => setMinimized((m) => !m)}
              />
            </motion.div>

            {/* interaction hints (bottom-right, fade after first interaction) */}
            <AnimatePresence>
              {hintsVisible && (
                <motion.div
                  className="absolute bottom-24 right-[clamp(20px,4vw,64px)] flex flex-col items-end gap-1 font-mono text-[10px] tracking-[0.12em] text-text-faint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, delay: 0.6 }}
                >
                  <span>ARRASTAR · POÇO GRAVITACIONAL</span>
                  <span>SHIFT+ARRASTAR · REPELIR</span>
                  <span>SCROLL · ZOOM</span>
                  <span>BOTÃO DIREITO · ORBITAR</span>
                  <span>ESPAÇO · PAUSAR</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * WellRing — crosshair ring following the cursor while the gravity well is
 * active; radius reflects MASSA DO POÇO (accent = attract, danger = repel).
 */
function WellRing({
  wellRef,
  dynRef,
}: {
  wellRef: MutableRefObject<WellState>;
  dynRef: MutableRefObject<DynamicParams>;
}) {
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pos = { x: -100, y: -100 };
    const onMove = (e: PointerEvent) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    let raf = 0;
    const loop = () => {
      const el = ringRef.current;
      if (el) {
        const active = wellRef.current.active;
        el.style.opacity = active ? '1' : '0';
        if (active) {
          const size = 24 + dynRef.current.wellMass * 1.4;
          el.style.width = `${size}px`;
          el.style.height = `${size}px`;
          el.style.transform = `translate(${pos.x - size / 2}px, ${pos.y - size / 2}px)`;
          el.style.borderColor = wellRef.current.repel ? 'var(--danger)' : 'var(--accent)';
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
    };
  }, [wellRef, dynRef]);

  return (
    <div
      ref={ringRef}
      className="pointer-events-none fixed left-0 top-0 z-30 rounded-full border transition-opacity duration-150"
      style={{ opacity: 0 }}
      aria-hidden
    />
  );
}
