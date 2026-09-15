import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const IaScene = lazy(() => import('@/components/ia/IaScene'));
import DirectorConsole, { type ConsoleStatus } from '@/components/ia/DirectorConsole';
import VectorPanel from '@/components/ia/VectorPanel';
import HistoryPanel, { type Take } from '@/components/ia/HistoryPanel';
import MoodSlate, { type SlateData } from '@/components/ia/MoodSlate';
import StatReadout from '@/components/hud/StatReadout';
import { stopSmoothScroll, startSmoothScroll } from '@/lib/smooth-scroll';
import { getBackendUrl, useBackendHealth } from '@/lib/backend';
import {
  advanceLive,
  createLiveState,
  extractDevice,
  fnv1a,
  localDirect,
  parseDirectionResponse,
  type Vec8,
} from '@/components/ia/director';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const slateWords = (prompt: string) =>
  prompt
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w.toUpperCase());

/**
 * IA — `/ia` Diretor Neural de Cena (ia.md).
 * Full-viewport: prompt pt-BR → POST /v1/direct → vetor de 8 parâmetros
 * interpolado na cena 3D em 2.5s. Fallback local determinístico (FNV-1a +
 * heurística de palavras-chave) badged MODO LOCAL quando o backend cai.
 */
export default function Ia() {
  const live = useRef(createLiveState());
  const health = useBackendHealth(15000);
  const healthRef = useRef(health);
  healthRef.current = health;

  const [status, setStatus] = useState<ConsoleStatus>({
    kind: 'idle',
    text: 'POST /v1/direct · AGUARDANDO PROMPT · MÁX 140 CHARS',
  });
  const [composing, setComposing] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [takes, setTakes] = useState<Take[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [slate, setSlate] = useState<SlateData | null>(null);
  const [vector, setVector] = useState<Vec8>({ ...live.current.current });
  const [tele, setTele] = useState({ fps: 0, ms: 0, dpr: 1, cam: '0.00 0.00 0.00', adaptive: false });
  const [teleMin, setTeleMin] = useState(false);
  const [hoverActor, setHoverActor] = useState(false);
  const [webgl2] = useState(() => {
    try {
      return !!document.createElement('canvas').getContext('webgl2');
    } catch {
      return false;
    }
  });

  const busyRef = useRef(false);
  const idRef = useRef(0);
  const cenaRef = useRef(0);
  const takeRef = useRef(0);
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);

  // página 3D full-viewport: Lenis parado (design.md §5)
  useEffect(() => {
    stopSmoothScroll();
    return () => startSmoothScroll();
  }, []);

  // fallback sem WebGL2: o vetor continua interpolando via rAF simples
  useEffect(() => {
    if (webgl2) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      advanceLive(live.current, Math.min((now - last) / 1000, 0.05), now);
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [webgl2]);

  // espelho do estado vivo para o HUD (~8Hz, telemetria real — design.md §5)
  useEffect(() => {
    const id = setInterval(() => {
      const l = live.current;
      setVector({ ...l.current, tensao: Math.min(1, l.current.tensao + l.spike) });
      setTele({
        fps: l.fps,
        ms: l.ms,
        dpr: l.dpr,
        cam: `${l.camX.toFixed(2)} ${l.camY.toFixed(2)} ${l.camZ.toFixed(2)}`,
        adaptive: l.adaptive,
      });
      setHoverActor(l.hoverActor);
    }, 125);
    return () => clearInterval(id);
  }, []);

  // rate-limit client-side: 1 req/2s com cooldown visível no botão
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    setCooldownLeft(Math.ceil((cooldownUntil - Date.now()) / 1000));
    const id = setInterval(() => {
      setCooldownLeft(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)));
    }, 200);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  // slate do clima: some após 3s (saída com blur no componente)
  useEffect(() => {
    if (!slate) return;
    const t = setTimeout(() => setSlate(null), 3000);
    return () => clearTimeout(t);
  }, [slate]);

  const startTransition = useCallback((to: Vec8, durationMs: number) => {
    const l = live.current;
    l.transition = { from: { ...l.current }, to, start: performance.now(), duration: durationMs };
  }, []);

  const applyDirection = useCallback(
    (vec: Vec8, prompt: string, source: Take['source']) => {
      const l = live.current;
      startTransition(vec, 2500);
      l.fixed = vec;
      idRef.current += 1;
      cenaRef.current += 1;
      takeRef.current = 1;
      const id = idRef.current;
      setTakes((t) => [{ id, prompt, vector: vec, ts: Date.now(), source }, ...t].slice(0, 6));
      setActiveId(id);
      setSlate({ id, words: slateWords(prompt), cena: cenaRef.current, take: takeRef.current });
    },
    [startTransition],
  );

  const submit = useCallback(
    async (prompt: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setComposing(true);
      setCooldownUntil(Date.now() + 2000);
      setStatus({ kind: 'working', text: 'POST /v1/direct · ENVIANDO PROMPT…' });

      const started = performance.now();
      let vec: Vec8 | null = null;
      let statusText = '';
      let source: Take['source'] = 'nucleo';
      let requestFailed = false;

      if (healthRef.current.online) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          const res = await fetch(`${getBackendUrl()}/v1/direct`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ prompt }),
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json: unknown = await res.json();
          const parsed = parseDirectionResponse(json);
          if (!parsed) throw new Error('payload inválido');
          vec = parsed;
          const ms = Math.round(performance.now() - started);
          statusText = `POST /v1/direct · 200 OK · ${ms}MS · device ${extractDevice(json)}`;
        } catch {
          requestFailed = true;
        }
      }

      if (!vec) {
        // fallback local determinístico (ia.md §Interações)
        source = 'local';
        if (requestFailed) {
          setStatus({ kind: 'error', text: 'ERRO · TIMEOUT 5000MS · TENTANDO FALLBACK LOCAL' });
          await new Promise((r) => setTimeout(r, 2000));
        }
        vec = localDirect(prompt);
        const seed = fnv1a(prompt.toLowerCase()).toString(16).toUpperCase().padStart(8, '0');
        statusText = `MODO LOCAL · HEURÍSTICA v1 · FNV-1A 0x${seed}`;
      }

      setStatus({ kind: source === 'local' ? 'local' : 'ok', text: statusText });
      setComposing(false);
      busyRef.current = false;
      applyDirection(vec, prompt, source);
    },
    [applyDirection],
  );

  // histórico: hover re-aplica (preview 800ms), saída retorna ao fixo, clique fixa
  const onPreview = useCallback(
    (take: Take) => startTransition(take.vector, 800),
    [startTransition],
  );
  const onPreviewEnd = useCallback(() => {
    startTransition(live.current.fixed, 800);
  }, [startTransition]);
  const onFix = useCallback(
    (take: Take) => {
      live.current.fixed = take.vector;
      startTransition(take.vector, 800);
      takeRef.current += 1;
      setActiveId(take.id);
      idRef.current += 1;
      setSlate({
        id: idRef.current,
        words: slateWords(take.prompt),
        cena: cenaRef.current,
        take: takeRef.current,
      });
    },
    [startTransition],
  );

  // exportar take: vetor + prompt + timestamp (formato do log do backend)
  const exportTake = useCallback(() => {
    const l = live.current;
    const take = takes.find((t) => t.id === activeId) ?? takes[0];
    const payload = {
      prompt: take?.prompt ?? '',
      vector: {
        cam_x: l.fixed.camX,
        cam_y: l.fixed.camY,
        cam_z: l.fixed.camZ,
        luz_int: l.fixed.luzInt,
        luz_hue: l.fixed.luzHue,
        nevoa: l.fixed.nevoa,
        turbulencia: l.fixed.turbulencia,
        tensao: l.fixed.tensao,
      },
      source: take?.source ?? 'local',
      model: 'nexus-director-mlp-384-256-128-8',
      cena: cenaRef.current,
      take: takeRef.current,
      timestamp: new Date(take?.ts ?? Date.now()).toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus-take-c${String(cenaRef.current).padStart(2, '0')}-t${String(
      takeRef.current,
    ).padStart(2, '0')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [takes, activeId]);

  const offline = !health.checking && !health.online;

  return (
    <div
      className="relative -mt-14 h-[100dvh] overflow-hidden"
      data-cursor={hoverActor ? 'PULSAR' : 'ARRASTAR'}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest('[data-hud]')) return;
        dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        live.current.dragging = true;
        live.current.dragVelYaw = 0;
        live.current.dragVelPitch = 0;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const l = live.current;
        l.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
        l.mouseY = (e.clientY / window.innerHeight) * 2 - 1;
        const d = dragRef.current;
        if (!d || d.id !== e.pointerId) return;
        l.dragYaw += (e.clientX - d.x) * 0.005;
        l.dragPitch = clamp(l.dragPitch + (e.clientY - d.y) * 0.004, -0.4, 0.4);
        d.x = e.clientX;
        d.y = e.clientY;
      }}
      onPointerUp={(e) => {
        if (dragRef.current?.id === e.pointerId) {
          dragRef.current = null;
          live.current.dragging = false;
        }
      }}
      onPointerCancel={() => {
        dragRef.current = null;
        live.current.dragging = false;
      }}
      onWheel={(e) => {
        const l = live.current;
        l.dolly = clamp(l.dolly + e.deltaY * 0.0006, 0.7, 1.3);
      }}
    >
      {/* cena 3D — canvas fixed sob o HUD */}
      {webgl2 ? (
        <Suspense fallback={null}>
          <IaScene live={live} />
        </Suspense>
      ) : (
        <div className="fixed inset-0 z-0 flex items-center justify-center">
          <p className="hud-label border border-hairline bg-surface px-5 py-3">
            WEBGL2 INDISPONÍVEL · APENAS TELEMETRIA DO VETOR
          </p>
        </div>
      )}

      {/* fade de entrada a partir do --void (400ms) */}
      <motion.div
        className="pointer-events-none absolute inset-0 z-30 bg-void"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      />

      {/* slate do clima ativo (topo-centro) */}
      <MoodSlate slate={slate} />

      {/* histórico de direção (lateral esquerda) */}
      <div className="pointer-events-none absolute left-[clamp(20px,4vw,64px)] top-1/2 z-10 hidden -translate-y-1/2 md:block">
        <HistoryPanel
          takes={takes}
          activeId={activeId}
          onPreview={onPreview}
          onPreviewEnd={onPreviewEnd}
          onFix={onFix}
        />
      </div>

      {/* vetor de saída (lateral direita) */}
      <div className="pointer-events-none absolute right-[clamp(20px,4vw,64px)] top-1/2 z-10 hidden -translate-y-1/2 lg:block">
        <VectorPanel vector={vector} onExport={exportTake} />
      </div>

      {/* console do diretor (centro-inferior) */}
      <div className="pointer-events-none absolute bottom-16 left-1/2 z-10 w-full max-w-[640px] -translate-x-1/2 px-5">
        <DirectorConsole
          status={status}
          composing={composing}
          cooldownLeft={cooldownLeft}
          offline={offline}
          onSubmit={submit}
        />
      </div>

      {/* telemetria (rodapé, minimizável) */}
      <div className="absolute bottom-0 left-0 right-0 z-10 border-t border-hairline bg-void/70 backdrop-blur-md">
        {teleMin ? (
          <div className="flex justify-end px-5 py-1.5">
            <button
              type="button"
              onClick={() => setTeleMin(false)}
              className="btn-ghost !text-[10px]"
              data-hud
            >
              TELEMETRIA <span className="ghost-arrow">↑</span>
            </button>
          </div>
        ) : (
          <div
            className="flex items-center justify-between gap-4 py-2"
            style={{ paddingInline: 'clamp(20px, 4vw, 64px)' }}
          >
            <StatReadout
              items={[
                { label: 'FPS', value: String(tele.fps) },
                { label: 'MS', value: tele.ms.toFixed(1) },
                { label: 'DPR', value: tele.dpr.toFixed(2) },
                { label: 'CAM', value: tele.cam },
                ...(tele.adaptive
                  ? [{ label: 'QUALIDADE ADAPTATIVA', value: 'ATIVA', accent: true }]
                  : []),
              ]}
            />
            <button
              type="button"
              onClick={() => setTeleMin(true)}
              className="btn-ghost shrink-0 !text-[10px]"
              data-hud
            >
              MINIMIZAR <span className="ghost-arrow">↓</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
