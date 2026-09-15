import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';
import { Github } from 'lucide-react';
import StatReadout, { type StatItem } from '@/components/hud/StatReadout';
import HUDPanel from '@/components/hud/HUDPanel';
import LoginModal from '@/components/hud/LoginModal';
import Preloader from '@/components/home/Preloader';
import { createChoreo, isWebGL2Available, type ChoreoState } from '@/components/home/choreo';

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

const HomeScene = lazy(() => import('@/components/home/HomeScene'));

/* ------------------------------------------------------------------ */
/* chapter data (design home.md §ATO 3)                                */
/* ------------------------------------------------------------------ */
interface Chapter {
  index: string;
  title: string;
  route: string;
  body: string;
  readouts: string[];
}
const CHAPTERS: Chapter[] = [
  {
    index: '01',
    title: 'SIMULAÇÃO',
    route: '/simulacao',
    body: 'Gravidade newtoniana em compute shader. Cada partícula sente todas as outras — em tempo real, na sua GPU.',
    readouts: ['N 262144', 'O(N²) GPU', '60 FPS'],
  },
  {
    index: '02',
    title: 'INTELIGÊNCIA',
    route: '/ia',
    body: 'Um diretor de fotografia neural. Descreva o clima; o backend PyTorch compõe câmera, luz e névoa.',
    readouts: ['PYTORCH MLP', 'LATÊNCIA 23MS', 'FALLBACK LOCAL'],
  },
  {
    index: '03',
    title: 'DADOS VIVOS',
    route: '/dashboard',
    body: 'Repositórios reais como corpos celestes. Stars, commits e linguagens direto da API do GitHub.',
    readouts: ['API GITHUB', 'REST + OAUTH', 'LIVE 30S'],
  },
  {
    index: '04',
    title: 'KERNEL C++20',
    route: '/arquitetura',
    body: 'O núcleo de física compilado em C++20, exposto ao Python e ao navegador. Benchmark real, no repositório.',
    readouts: ['PYBIND11', 'C++20', '38× VS JS'],
  },
];

const ACT2_PHRASES = ['O CÓDIGO É A CÂMERA.', 'A FÍSICA É REAL.', 'OS DADOS ESTÃO VIVOS.'];

/** Sinaliza quando a cena 3D (chunk lazy + shaders) montou de fato. */
function SceneReadyProbe({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return null;
}

const STACK_PANELS = [
  {
    title: 'FRONTEND/',
    rows: [
      { label: 'FRAMEWORK', value: 'React 19 + R3F' },
      { label: 'RENDER', value: 'WebGL2 + compute' },
      { label: 'BUILD', value: 'Vite 7' },
    ],
  },
  {
    title: 'BACKEND/',
    rows: [
      { label: 'API', value: 'FastAPI' },
      { label: 'MODELO', value: 'PyTorch 2.x MLP' },
      { label: 'AUTH', value: 'OAuth GitHub' },
    ],
  },
  {
    title: 'KERNEL/',
    rows: [
      { label: 'LINGUAGEM', value: 'C++20' },
      { label: 'BINDINGS', value: 'pybind11' },
      { label: 'SIMD', value: 'AVX2 · OpenMP' },
    ],
  },
];

export default function Home() {
  const navigate = useNavigate();
  const choreoRef = useRef<ChoreoState>(createChoreo());
  const [webgl2] = useState(() => isWebGL2Available());
  const [sceneReady, setSceneReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [telemetry, setTelemetry] = useState({ fps: 60, ms: 16.6, dpr: 1, x: 0, y: 1.6, z: 8 });
  const [adaptiveNotice, setAdaptiveNotice] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const actsRef = useRef<HTMLDivElement>(null);
  const act1Ref = useRef<HTMLElement>(null);
  const act2Ref = useRef<HTMLElement>(null);
  const wordmarkRef = useRef<HTMLHeadingElement>(null);
  const routeFadeRef = useRef<HTMLDivElement>(null);
  const adaptiveSeenAt = useRef<number | null>(null);

  /* -------- live telemetry (5Hz, real readouts — no easing) -------- */
  useEffect(() => {
    const id = setInterval(() => {
      const ch = choreoRef.current;
      setTelemetry({ fps: ch.fps, ms: ch.ms, dpr: ch.dpr, x: ch.camX, y: ch.camY, z: ch.camZ });
      if (ch.adaptive && adaptiveSeenAt.current === null) {
        adaptiveSeenAt.current = performance.now();
        setAdaptiveNotice(true);
        setTimeout(() => setAdaptiveNotice(false), 4000);
      }
    }, 200);
    return () => clearInterval(id);
  }, []);

  /* -------- mouse parallax + manual drag orbit (±15°) -------- */
  useEffect(() => {
    const ch = choreoRef.current;
    const onMove = (e: MouseEvent) => {
      ch.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      ch.mouseY = (e.clientY / window.innerHeight) * 2 - 1;
    };
    let lastX = 0;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).tagName !== 'CANVAS') return;
      ch.dragging = true;
      lastX = e.clientX;
    };
    const onDrag = (e: PointerEvent) => {
      if (!ch.dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      const MAX = (15 * Math.PI) / 180;
      ch.dragTargetYaw = Math.max(-MAX, Math.min(MAX, ch.dragTargetYaw + dx * 0.0022));
    };
    const onUp = () => {
      ch.dragging = false;
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onDrag, { passive: true });
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onDrag);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  /* -------- route transition: fade to void, then navigate -------- */
  const goTo = (route: string) => {
    if (!routeFadeRef.current) return navigate(route);
    gsap.to(routeFadeRef.current, {
      opacity: 1,
      duration: 0.4,
      ease: 'power2.in',
      onComplete: () => navigate(route),
    });
  };

  /* -------- master scroll choreography -------- */
  useGSAP(
    () => {
      const ch = choreoRef.current;

      // master trigger across acts 1–3 (0–620vh) drives the 3D camera
      ScrollTrigger.create({
        trigger: actsRef.current,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          ch.progress = self.progress;
          // chapter local progress (act 3 spans last 320/620 of the wrapper)
          const P2 = 300 / 620;
          const cp = (self.progress - P2) / (1 - P2);
          for (let i = 0; i < 4; i++) {
            const local = Math.max(0, Math.min(1, cp * 4 - i));
            ch.chapterProgress[i] = local;
          }
          // beam boost +15% durante "A FÍSICA É REAL." (ato 2, terço do meio)
          const P1 = 100 / 620;
          const a2 = (self.progress - P1) / (P2 - P1);
          const inPhrase2 = a2 > 0.33 && a2 < 0.66 ? 1 : 0;
          ch.beamBoost = inPhrase2 * 0.15;
        },
      });

      /* ATO 1 — hero: parallax inverso do wordmark + hint some */
      gsap.to(wordmarkRef.current, {
        yPercent: -30,
        opacity: 0,
        ease: 'none',
        scrollTrigger: {
          trigger: act1Ref.current,
          start: '40% top',
          end: '90% top',
          scrub: true,
        },
      });
      gsap.to('.scroll-hint', {
        opacity: 0,
        ease: 'none',
        scrollTrigger: { trigger: act1Ref.current, start: 'top top', end: '15% top', scrub: true },
      });

      /* ATO 2 — 3 frases cinéticas com scrub */
      const phrases = gsap.utils.toArray<HTMLElement>('.act2-phrase');
      const counters = gsap.utils.toArray<HTMLElement>('.act2-count');
      const tl2 = gsap.timeline({
        scrollTrigger: {
          trigger: act2Ref.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: true,
        },
      });
      phrases.forEach((phrase, i) => {
        const words = phrase.querySelectorAll('.w');
        const at = i * 3; // timeline slots
        tl2.fromTo(
          words,
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0, stagger: 0.04, duration: 0.55, ease: 'power2.out' },
          at,
        );
        tl2.to({}, { duration: 0.75 }, at + 0.55); // sustenta
        tl2.to(
          words,
          { opacity: 0, filter: 'blur(8px)', duration: 0.45, ease: 'power1.in' },
          at + 1.3,
        );
        if (counters[i]) {
          tl2.call(() => {}, [], at); // slot marker (counters atualizam via onUpdate abaixo)
        }
      });
      // contador de ato 01/03
      ScrollTrigger.create({
        trigger: act2Ref.current,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          const idx = Math.min(2, Math.floor(self.progress * 3));
          counters.forEach((c, i) => {
            c.style.opacity = i === idx ? '1' : '0.25';
          });
        },
      });

      /* ATO 3 — capítulos: painéis entram por linhas, número fantasma em parallax */
      gsap.utils.toArray<HTMLElement>('.chapter').forEach((section) => {
        const lines = section.querySelectorAll('.chapter-line');
        const ghost = section.querySelector('.chapter-ghost');
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: 'top 75%',
            end: 'bottom 30%',
            scrub: true,
          },
        });
        tl.fromTo(
          lines,
          { opacity: 0, y: 32 },
          { opacity: 1, y: 0, stagger: 0.08, duration: 0.25, ease: 'power2.out' },
          0,
        );
        tl.to(lines, { opacity: 0, y: -40, stagger: 0.04, duration: 0.2, ease: 'power1.in' }, 0.8);
        if (ghost) {
          gsap.fromTo(
            ghost,
            { yPercent: 10 },
            {
              yPercent: -10,
              ease: 'none',
              scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true },
            },
          );
        }
      });

      /* ATO 4 — prova de stack */
      gsap.fromTo(
        '.stack-head .w',
        { opacity: 0, y: 24 },
        {
          opacity: 1,
          y: 0,
          stagger: 0.03,
          duration: 0.6,
          ease: 'power2.out',
          scrollTrigger: { trigger: '.stack-head', start: 'top 75%' },
        },
      );
      gsap.fromTo(
        '.stack-panel',
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          stagger: 0.12,
          duration: 0.7,
          ease: 'power2.out',
          scrollTrigger: { trigger: '.stack-grid', start: 'top 70%' },
        },
      );
      // faixa de benchmark: hairlines expandem + números contam
      gsap.fromTo(
        '.bench-rule',
        { scaleX: 0 },
        {
          scaleX: 1,
          duration: 0.8,
          ease: 'power2.out',
          scrollTrigger: { trigger: '.bench', start: 'top 80%' },
        },
      );
      gsap.utils.toArray<HTMLElement>('.bench-num').forEach((el) => {
        const target = parseFloat(el.dataset.value ?? '0');
        const obj = { v: 0 };
        gsap.to(obj, {
          v: target,
          duration: 1.2,
          ease: 'power2.out',
          scrollTrigger: { trigger: '.bench', start: 'top 80%' },
          onUpdate: () => {
            el.textContent = target % 1 !== 0 ? obj.v.toFixed(1) : String(Math.round(obj.v));
          },
        });
      });

      /* ATO 5 — CTA final */
      gsap.fromTo(
        '.cta-line',
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          stagger: 0.1,
          duration: 0.7,
          ease: 'power2.out',
          scrollTrigger: { trigger: '.cta-block', start: 'top 70%' },
        },
      );

      ScrollTrigger.refresh();
    },
    { scope: rootRef },
  );

  /* -------- ATO 1 load animation: wordmark por caracteres -------- */
  useEffect(() => {
    if (!loaded || !wordmarkRef.current) return;
    const splits: SplitText[] = [];
    const ctx = gsap.context(() => {
      const split = new SplitText('.hero-char-line', { type: 'chars', charsClass: 'hero-char' });
      splits.push(split);
      gsap.fromTo(
        split.chars,
        { yPercent: 110 },
        {
          yPercent: 0,
          stagger: 0.035,
          duration: 0.9,
          ease: 'power4.out',
          delay: 0.2,
        },
      );
      const subSplit = new SplitText('.hero-sub', { type: 'words', wordsClass: 'w' });
      splits.push(subSplit);
      gsap.fromTo(
        subSplit.words,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, stagger: 0.02, duration: 0.5, delay: 0.75 },
      );
      gsap.fromTo(
        '.hero-hud',
        { opacity: 0 },
        { opacity: 1, duration: 0.4, delay: 1.2 },
      );
    });
    return () => {
      ctx.revert();
      splits.forEach((s) => s.revert());
    };
  }, [loaded]);

  /* -------- split act-2 phrases into word spans -------- */
  const phraseWords = useMemo(
    () =>
      ACT2_PHRASES.map((p) =>
        p.split(' ').map((w, i) => (
          <span key={i} className="w inline-block will-change-transform">
            {w}
            {' '}
          </span>
        )),
      ),
    [],
  );

  const statItems: StatItem[] = [
    { label: 'FPS', value: String(telemetry.fps) },
    { label: 'MS', value: telemetry.ms.toFixed(1) },
    { label: 'DPR', value: telemetry.dpr.toFixed(2) },
    {
      label: 'CAM',
      value: `${telemetry.x.toFixed(2)} ${telemetry.y.toFixed(2)} ${telemetry.z.toFixed(2)}`,
    },
  ];

  return (
    // -mt-14: opt-out do offset da nav fixa — hero full-bleed sob a nav transparente (ver Layout.tsx)
    <div ref={rootRef} className="relative -mt-14">
      {/* cena 3D persistente (ou fallback estático sem WebGL2) */}
      {webgl2 ? (
        <Suspense fallback={null}>
          <HomeScene choreo={choreoRef} />
          <SceneReadyProbe onReady={() => setSceneReady(true)} />
        </Suspense>
      ) : (
        <div
          className="fixed inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: 'url(/og-cover.png)' }}
          aria-hidden
        />
      )}

      {/* fade de transição de rota */}
      <div
        ref={routeFadeRef}
        className="pointer-events-none fixed inset-0 z-[60] bg-void opacity-0"
        aria-hidden
      />

      <AnimatePresence>
        {!loaded && (
          <Preloader realProgress={sceneReady || !webgl2 ? 100 : 55} onDone={() => setLoaded(true)} />
        )}
      </AnimatePresence>

      {/* ================= ATOS 1–3 (620vh, câmera via scrub) ================= */}
      <div ref={actsRef}>
        {/* ---------------- ATO 1 — HERO ---------------- */}
        <section ref={act1Ref} className="relative min-h-[100dvh]" data-cursor="ARRASTAR">
          <div
            className="absolute inset-0 flex flex-col justify-center"
            style={{ paddingInline: 'clamp(20px, 4vw, 64px)' }}
          >
            <div className="max-w-[66vw]">
              <h1
                ref={wordmarkRef}
                className="font-sans font-medium uppercase leading-[0.95] tracking-[-0.03em] text-nxtext"
                style={{ fontSize: 'clamp(3.5rem, 11vw, 10rem)' }}
              >
                <span className="hero-char-line block overflow-hidden">NEXUS</span>
                <span className="hero-char-line block overflow-hidden">
                  <span style={{ color: 'var(--accent)', textShadow: '0 0 24px rgba(246,40,125,0.6)' }}>
                    ◆
                  </span>
                  3D
                </span>
              </h1>
              <p className="hero-sub mt-6 max-w-[420px] text-[15px] leading-relaxed text-text-dim">
                Simulação física, direção neural e dados vivos do GitHub — num único motor 3D em
                tempo real.
              </p>
            </div>
          </div>

          {/* HUD do hero */}
          <div className="hero-hud pointer-events-none absolute inset-0 opacity-0">
            {/* coordenadas da cena — canto superior direito */}
            <div
              className="absolute right-0 top-20 font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint"
              style={{ paddingInline: 'clamp(20px, 4vw, 64px)' }}
            >
              SECTOR 01 · VOID CORRIDOR
            </div>

            {/* hint de scroll — canto inferior esquerdo */}
            <div
              className="scroll-hint absolute bottom-8 left-0 flex items-center gap-4"
              style={{ paddingInline: 'clamp(20px, 4vw, 64px)' }}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
                SCROLL PARA ENTRAR
              </span>
              <span className="relative block h-12 w-px bg-hairline-strong">
                <span
                  className="absolute left-1/2 top-0 h-1 w-1 -translate-x-1/2 rounded-full"
                  style={{
                    background: 'var(--accent)',
                    animation: 'scroll-hint 2s ease-in-out infinite',
                  }}
                />
              </span>
            </div>

            {/* telemetria — canto inferior direito */}
            <div className="absolute bottom-8 right-0" style={{ paddingInline: 'clamp(20px, 4vw, 64px)' }}>
              <StatReadout items={statItems} />
              {adaptiveNotice && (
                <p className="mt-2 text-right font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--accent)' }}>
                  QUALIDADE ADAPTATIVA ATIVA
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ---------------- ATO 2 — MANIFESTO (200vh) ---------------- */}
        <section ref={act2Ref} className="relative h-[200vh]">
          <div className="sticky top-0 flex min-h-[100dvh] items-center justify-center">
            <div className="relative w-full text-center">
              {ACT2_PHRASES.map((phrase, i) => (
                <p
                  key={phrase}
                  className="act2-phrase absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 font-sans font-medium uppercase tracking-[-0.02em] text-nxtext"
                  style={{ fontSize: 'clamp(1.75rem, 4vw, 3.5rem)' }}
                  aria-label={phrase}
                >
                  {phraseWords[i]}
                </p>
              ))}
              {/* contador de ato — lateral esquerda */}
              <div className="absolute left-0 top-1/2 hidden -translate-y-1/2 flex-col gap-1 md:flex" style={{ paddingInline: 'clamp(20px, 4vw, 64px)' }}>
                {ACT2_PHRASES.map((_, i) => (
                  <span
                    key={i}
                    className="act2-count tnum font-mono text-[11px] tracking-[0.18em] text-text-dim transition-opacity duration-200"
                    style={{ opacity: i === 0 ? 1 : 0.25 }}
                  >
                    0{i + 1} / 03
                  </span>
                ))}
              </div>
              {/* readout z da câmera — lateral direita */}
              <div
                className="tnum absolute right-0 top-1/2 hidden -translate-y-1/2 font-mono text-[11px] tracking-[0.12em] text-text-faint md:block"
                style={{ paddingInline: 'clamp(20px, 4vw, 64px)' }}
              >
                CAM Z {telemetry.z.toFixed(2)}
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- ATO 3 — CAPÍTULOS (4 × 80vh) ---------------- */}
        {CHAPTERS.map((chapter, i) => (
          <section key={chapter.index} className="chapter relative flex h-[80vh] items-center overflow-hidden">
            {/* numeração fantasma */}
            <span
              className="chapter-ghost pointer-events-none absolute right-[2vw] top-1/2 -translate-y-1/2 select-none font-sans font-medium"
              style={{ fontSize: '20vw', color: 'rgba(255,255,255,0.03)', lineHeight: 1 }}
              aria-hidden
            >
              {chapter.index}
            </span>
            <div
              className="relative z-10 w-full max-w-[420px]"
              style={{ marginInline: 'clamp(20px, 4vw, 64px)' }}
            >
              <p className="chapter-line hud-label mb-4">{'//'} {chapter.index}</p>
              <h2
                className="chapter-line font-sans font-medium uppercase tracking-[-0.02em] text-nxtext"
                style={{ fontSize: 'clamp(2rem, 5vw, 4.5rem)' }}
              >
                {chapter.title}
              </h2>
              <p className="chapter-line mt-4 max-w-[380px] text-[15px] leading-relaxed text-text-dim">
                {chapter.body}
              </p>
              <div className="chapter-line mt-6 flex flex-wrap gap-x-4 gap-y-1">
                {chapter.readouts.map((r) => (
                  <span key={r} className="tnum font-mono text-[11px] tracking-[0.12em] text-text-faint">
                    {r}
                  </span>
                ))}
              </div>
              <div className="chapter-line mt-8">
                <button onClick={() => goTo(chapter.route)} className="btn-hairline" data-cursor="ABRIR">
                  EXPLORAR →
                </button>
              </div>
            </div>
            {i === 3 && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-void" />}
          </section>
        ))}
      </div>

      {/* ================= ATO 4 — PROVA DE STACK (fluxo normal) ================= */}
      <section
        className="relative z-10 mx-auto max-w-[1440px] bg-void py-32"
        style={{ paddingInline: 'clamp(20px, 4vw, 64px)' }}
      >
        <div className="stack-head">
          <p className="hud-label mb-4">{'// STACK REAL, NO REPOSITÓRIO'}</p>
          <h2
            className="font-sans font-medium uppercase tracking-[-0.02em] text-nxtext"
            style={{ fontSize: 'clamp(2rem, 5vw, 4.5rem)' }}
          >
            {'NÃO É MOCKUP. É CÓDIGO.'.split(' ').map((w, i) => (
              <span key={i} className="w inline-block">
                {w}
                {' '}
              </span>
            ))}
          </h2>
        </div>

        <div className="stack-grid mt-16 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {STACK_PANELS.map((panel) => (
            <HUDPanel
              key={panel.title}
              title={panel.title}
              rows={panel.rows}
              className="stack-panel"
              footer={
                <a
                  href="https://github.com/nexus3d/nexus-core"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost !px-0"
                >
                  ver no github <span className="ghost-arrow">→</span>
                </a>
              }
            />
          ))}
        </div>

        {/* faixa de benchmark */}
        <div className="bench mt-16">
          <div className="bench-rule h-px w-full origin-left bg-hairline-strong" />
          <p className="tnum flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-5 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-text-dim">
            <span>BENCHMARK N-BODY</span>·<span>N=65536</span>·
            <span>
              KERNEL C++ <span className="bench-num text-nxtext" data-value="4.1">0</span>MS
            </span>
            ·
            <span>
              JS <span className="bench-num text-nxtext" data-value="156">0</span>MS
            </span>
            ·
            <span style={{ color: 'var(--accent)' }}>
              <span className="bench-num" data-value="38">0</span>× MAIS RÁPIDO
            </span>
          </p>
          <div className="bench-rule h-px w-full origin-left bg-hairline-strong" />
        </div>
      </section>

      {/* ================= ATO 5 — CTA FINAL ================= */}
      <section className="cta-block relative z-10 overflow-hidden bg-void py-40 text-center">
        {/* losango gigante rotacionando */}
        <img
          src="/logo.svg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none"
          style={{
            width: '28vw',
            opacity: 0.06,
            animation: 'spin-slow 60s linear infinite',
          }}
        />
        <div className="relative" style={{ paddingInline: 'clamp(20px, 4vw, 64px)' }}>
          <p className="cta-line hud-label mb-4">{'// PRONTO PARA ENTRAR?'}</p>
          <h2
            className="cta-line font-sans font-medium uppercase tracking-[-0.02em] text-nxtext"
            style={{ fontSize: 'clamp(2rem, 5vw, 4.5rem)' }}
          >
            CLONE. RODE. QUEBRE.
          </h2>
          <p className="cta-line mx-auto mt-4 max-w-[420px] text-[15px] text-text-dim">
            Todo o código — frontend, backend e kernel — está no GitHub sob MIT.
          </p>
          <div className="cta-line mt-10 flex flex-wrap items-center justify-center gap-4">
            <button onClick={() => setLoginOpen(true)} className="btn-cta" data-cursor="ABRIR">
              <Github size={14} strokeWidth={1.75} />
              ENTRAR COM GITHUB
            </button>
            <a
              href="https://github.com/nexus3d/nexus-core"
              target="_blank"
              rel="noreferrer"
              className="btn-hairline group"
              data-cursor="ABRIR"
            >
              <Github
                size={13}
                strokeWidth={1.75}
                className="transition-transform duration-150 group-focus-visible:translate-x-0.5 group-hover:translate-x-0.5"
              />
              VER REPOSITÓRIO
            </a>
          </div>
        </div>
      </section>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
