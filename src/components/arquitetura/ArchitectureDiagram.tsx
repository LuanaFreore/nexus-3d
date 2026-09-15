import { memo, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { getLenis } from '@/lib/smooth-scroll';

gsap.registerPlugin(ScrollTrigger, useGSAP);

type ModuleId = 'frontend' | 'backend' | 'kernel' | 'github';

interface BoxSpec {
  id: ModuleId;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle: string;
  bullets: string[];
  dashed?: boolean;
}

const BOX_W = 290;
const BOX_H = 150;

const BOXES: BoxSpec[] = [
  {
    id: 'frontend',
    x: 30,
    y: 50,
    w: BOX_W,
    h: BOX_H,
    title: 'FRONTEND',
    subtitle: 'React 19 + R3F',
    bullets: ['cena 3D · scroll-driven', 'compute por FBO ping-pong', 'adaptive quality · 60fps'],
  },
  {
    id: 'backend',
    x: 425,
    y: 50,
    w: BOX_W,
    h: BOX_H,
    title: 'BACKEND',
    subtitle: 'FastAPI + PyTorch',
    bullets: ['diretor neural · MLP 8 saídas', 'OAuth GitHub · JWT', 'uvicorn :8000'],
  },
  {
    id: 'kernel',
    x: 425,
    y: 280,
    w: BOX_W,
    h: BOX_H,
    title: 'KERNEL',
    subtitle: 'C++20 · pybind11',
    bullets: ['n-body O(n²) · AVX2', 'OpenMP · -O3 native', '38× vs JS single-thread'],
  },
  {
    id: 'github',
    x: 820,
    y: 50,
    w: BOX_W,
    h: BOX_H,
    title: 'GITHUB API',
    subtitle: 'REST + OAuth',
    bullets: ['dados ao vivo do dashboard', '60 req/h sem token'],
    dashed: true,
  },
];

interface EdgeSpec {
  id: string;
  d: string;
  label: string;
  lx: number;
  ly: number;
  connects: ModuleId[];
  begin: string;
}

const EDGES: EdgeSpec[] = [
  {
    id: 'e-rest',
    d: 'M 320 125 H 425',
    label: 'REST /v1/* · JSON',
    lx: 372.5,
    ly: 112,
    connects: ['frontend', 'backend'],
    begin: '0s',
  },
  {
    id: 'e-ffi',
    d: 'M 570 200 V 280',
    label: 'pybind11 · FFI',
    lx: 580,
    ly: 246,
    connects: ['backend', 'kernel'],
    begin: '1s',
  },
  {
    id: 'e-gh',
    d: 'M 715 125 H 820',
    label: 'GitHub API · OAuth',
    lx: 767.5,
    ly: 112,
    connects: ['backend', 'github'],
    begin: '2s',
  },
];

const DESCRIPTIONS: Record<ModuleId, string> = {
  frontend: 'render 60fps · WebGL2 · cena dirigida pelo scroll e pela física da simulação',
  backend: 'diretor neural · MLP 41K params · prompt pt-BR → vetor de 8 parâmetros de cena',
  kernel: 'step O(n²) vetorizado · AVX2 + OpenMP · exposto ao Python sem cópia de memória',
  github: 'OAuth + REST · stats do repo e órbita de repositórios no dashboard · modo demo sem token',
};

const IDLE_HINT = '// PASSE O CURSOR SOBRE UM MÓDULO · CLIQUE PARA NAVEGAR ATÉ A SEÇÃO';

/** Perpetual pulse loop isolated in a memo component (react-dev.md rule). */
const Pulses = memo(function Pulses() {
  return (
    <g className="diag-pulses">
      {EDGES.map((edge) => (
        <circle key={edge.id} r={3} fill="var(--accent)">
          <animateMotion dur="3s" begin={edge.begin} repeatCount="indefinite">
            <mpath href={`#diag-${edge.id}`} />
          </animateMotion>
        </circle>
      ))}
    </g>
  );
});

function scrollToModule(id: ModuleId) {
  if (id === 'github') {
    window.open('https://github.com/nexus3d/nexus-core', '_blank', 'noreferrer');
    return;
  }
  const el = document.getElementById(`modulo-${id}`);
  if (!el) return;
  const lenis = getLenis();
  if (lenis) lenis.scrollTo(el, { offset: -72, duration: 1.2 });
  else el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * S2 — Diagrama de Arquitetura (arquitetura.md): SVG inline desenhado em código.
 * Caixas sobem stagger 0.15s; arestas desenham-se (dash-offset, stagger 0.2s);
 * pulsos --accent entram em loop após o desenho (3s/aresta). Hover acende
 * arestas conectadas + descrição mono abaixo; clique rola até o módulo.
 */
export default function ArchitectureDiagram() {
  const scope = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<ModuleId | null>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: scope.current, start: 'top 75%' },
      });
      tl.from('.diag-box', {
        y: 20,
        opacity: 0,
        duration: 0.6,
        ease: 'power3.out',
        stagger: 0.15,
      })
        .fromTo(
          '.diag-edge',
          { strokeDashoffset: 100 },
          { strokeDashoffset: 0, duration: 1, ease: 'power2.inOut', stagger: 0.2 },
          '-=0.2',
        )
        .from('.diag-edge-label', { opacity: 0, duration: 0.4, stagger: 0.1 }, '<0.3')
        .fromTo('.diag-pulses', { opacity: 0 }, { opacity: 1, duration: 0.6 }, '+=0.1');
    },
    { scope },
  );

  return (
    <div ref={scope} className="py-8">
      <div className="hud-surface hud-notch">
        <div className="border-b border-hairline px-5 py-3">
          <span className="hud-label">{'// DIAGRAMA · FLUXO DE DADOS'}</span>
        </div>
        <div className="overflow-x-auto px-4 py-6">
          <svg
            viewBox="0 0 1140 460"
            className="mx-auto block h-auto w-full min-w-[760px] max-w-[1080px]"
            role="img"
            aria-label="Diagrama de arquitetura: frontend, backend, kernel e GitHub API"
          >
            {/* edges (drawn first, under boxes) */}
            {EDGES.map((edge) => {
              const lit = active !== null && edge.connects.includes(active);
              return (
                <g key={edge.id}>
                  <path
                    id={`diag-${edge.id}`}
                    className="diag-edge"
                    d={edge.d}
                    fill="none"
                    pathLength={100}
                    strokeDasharray="100 100"
                    strokeWidth={lit ? 1.5 : 1}
                    style={{
                      stroke: lit ? 'var(--accent)' : 'var(--hairline-strong)',
                      transition: 'stroke 150ms, stroke-width 150ms',
                    }}
                  />
                  <text
                    className="diag-edge-label"
                    x={edge.lx}
                    y={edge.ly}
                    textAnchor="middle"
                    fontFamily="'JetBrains Mono', monospace"
                    fontSize={10}
                    letterSpacing="0.08em"
                    style={{
                      fill: lit ? 'var(--accent)' : 'var(--text-faint)',
                      transition: 'fill 150ms',
                    }}
                  >
                    {edge.label}
                  </text>
                </g>
              );
            })}

            {/* boxes */}
            {BOXES.map((box) => {
              const lit = active === box.id;
              return (
                <g
                  key={box.id}
                  className="diag-box"
                  data-cursor="ABRIR"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setActive(box.id)}
                  onMouseLeave={() => setActive(null)}
                  onClick={() => scrollToModule(box.id)}
                >
                  <rect
                    x={box.x}
                    y={box.y}
                    width={box.w}
                    height={box.h}
                    fill="var(--surface)"
                    strokeWidth={lit ? 1.5 : 1}
                    strokeDasharray={box.dashed ? '5 4' : undefined}
                    style={{
                      stroke: lit ? 'var(--accent)' : 'var(--hairline-strong)',
                      transition: 'stroke 150ms',
                    }}
                  />
                  <line
                    x1={box.x}
                    y1={box.y + 34}
                    x2={box.x + box.w}
                    y2={box.y + 34}
                    style={{ stroke: 'var(--hairline)' }}
                  />
                  <text
                    x={box.x + 16}
                    y={box.y + 22}
                    fontFamily="'JetBrains Mono', monospace"
                    fontSize={11}
                    fontWeight={500}
                    letterSpacing="0.18em"
                    style={{ fill: lit ? 'var(--accent)' : 'var(--text)' }}
                  >
                    {box.title}
                  </text>
                  <text
                    x={box.x + box.w - 16}
                    y={box.y + 22}
                    textAnchor="end"
                    fontFamily="'JetBrains Mono', monospace"
                    fontSize={10}
                    style={{ fill: 'var(--text-faint)' }}
                  >
                    {box.subtitle}
                  </text>
                  {box.bullets.map((bullet, i) => (
                    <text
                      key={i}
                      x={box.x + 16}
                      y={box.y + 58 + i * 20}
                      fontFamily="'JetBrains Mono', monospace"
                      fontSize={10}
                      letterSpacing="0.04em"
                      style={{ fill: 'var(--text-dim)' }}
                    >
                      {`▸ ${bullet}`}
                    </text>
                  ))}
                </g>
              );
            })}

            <Pulses />
          </svg>
        </div>
        <div className="border-t border-hairline px-5 py-3">
          <p
            className="font-mono text-[11px] tracking-[0.12em]"
            style={{ color: active ? 'var(--text)' : 'var(--text-faint)' }}
          >
            {active ? DESCRIPTIONS[active] : IDLE_HINT}
          </p>
        </div>
      </div>
    </div>
  );
}
