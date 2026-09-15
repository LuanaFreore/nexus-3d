import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import CodeBlock from '@/components/hud/CodeBlock';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const TREE = `nexus-core/
├── frontend/        # React 19 · Vite · R3F · Tailwind
│   └── src/scenes/  # hero · simulação · ia · dashboard
├── backend/         # FastAPI · PyTorch · OAuth GitHub
│   ├── main.py      # app + rotas /v1/*
│   ├── director.py  # MLP 384→256→128→8
│   └── auth.py      # fluxo OAuth + JWT
├── kernel/          # C++20 · pybind11 · OpenMP
│   ├── nbody.cpp    # step O(n²) · AVX2
│   └── bench.cpp    # benchmark vs baseline
└── README.md        # quickstart de cada módulo`;

/**
 * S3 — Árvore do Repositório (arquitetura.md).
 * Duas colunas ≥1024px: explicação à esquerda (col 1–5), CodeBlock da árvore
 * à direita (col 6–12). Linhas da árvore revelam em cascata após o painel.
 */
export default function RepoTree() {
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: scope.current, start: 'top 70%' },
      });
      tl.from('.tree-col', {
        y: 32,
        opacity: 0,
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.15,
      }).from(
        scope.current?.querySelectorAll('.tree-code pre > div') ?? [],
        {
          opacity: 0,
          x: -12,
          duration: 0.3,
          ease: 'power2.out',
          stagger: 0.03,
        },
        '-=0.2',
      );
    },
    { scope },
  );

  return (
    <section ref={scope} className="grid grid-cols-1 gap-12 py-16 lg:grid-cols-12 lg:gap-8">
      <div className="tree-col lg:col-span-5">
        <p className="hud-label">{'// ESTRUTURA'}</p>
        <p className="mt-6 max-w-[440px] text-[15px] leading-[1.7] text-text-dim">
          Cada módulo é independente e executável: o frontend é um app Vite, o backend um
          serviço uvicorn e o kernel uma extensão nativa compilada in-place. As fronteiras
          são explícitas — REST/JSON entre frontend e backend, FFI pybind11 entre Python e
          C++. Rode qualquer um isoladamente; juntos, formam o motor completo.
        </p>
        <p className="tnum mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-text-faint">
          3 módulos · 1 repositório · MIT
        </p>
      </div>
      <div className="tree-col tree-code lg:col-span-7">
        <CodeBlock filename="nexus-core — árvore" code={TREE} language="text" />
      </div>
    </section>
  );
}
