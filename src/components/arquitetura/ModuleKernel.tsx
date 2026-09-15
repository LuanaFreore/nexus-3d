import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import HUDPanel from '@/components/hud/HUDPanel';
import CodeBlock from '@/components/hud/CodeBlock';
import ModuleHeader from '@/components/arquitetura/ModuleHeader';
import CodeReveal from '@/components/arquitetura/CodeReveal';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const PYBIND_CPP = `#include <pybind11/pybind11.h>
#include <pybind11/numpy.h>
namespace py = pybind11;

// step O(n²) · AVX2 + OpenMP — atualiza pos/vel in-place
void step(py::array_t<double> pos, py::array_t<double> vel,
          py::array_t<double> m, double G, double dt);

PYBIND11_MODULE(nexus_kernel, mod) {
    mod.doc() = "nexus kernel — n-body C++20";
    mod.def("step", &step, py::arg("pos"), py::arg("vel"),
            py::arg("m"), py::arg("G"), py::arg("dt"));
}`;

interface BenchRow {
  config: string;
  n: string;
  time: string;
  speedup: string;
  accent?: boolean;
}

const BENCH: BenchRow[] = [
  { config: 'JS single-thread', n: '65 536', time: '156 ms', speedup: '1×' },
  { config: 'Kernel C++20', n: '65 536', time: '4.1 ms', speedup: '38×', accent: true },
  { config: 'Kernel C++20', n: '1 048 576', time: '71 ms', speedup: '——' },
];

/**
 * S4 · 06 — KERNEL (arquitetura.md): laço O(n²) AVX2+OpenMP via pybind11,
 * kernel-chip.svg ao lado do texto (col 8–12), CodeBlock pybind11 e tabela
 * de benchmark com speedup contando 0→38× (trigger 80%).
 */
export default function ModuleKernel() {
  const scope = useRef<HTMLElement>(null);
  const speedupRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      gsap.from('.ke-rise', {
        y: 24,
        opacity: 0,
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.1,
        scrollTrigger: { trigger: scope.current, start: 'top 65%' },
      });
      gsap.from('.bench-row', {
        x: -12,
        opacity: 0,
        duration: 0.4,
        ease: 'power2.out',
        stagger: 0.06,
        scrollTrigger: { trigger: '.bench-table', start: 'top 70%' },
      });
      // speedup count-up 0→38× (1s, trigger 80%)
      const counter = { v: 0 };
      gsap.to(counter, {
        v: 38,
        duration: 1,
        ease: 'power2.out',
        scrollTrigger: { trigger: speedupRef.current, start: 'top 80%' },
        onUpdate: () => {
          if (speedupRef.current) speedupRef.current.textContent = `${Math.round(counter.v)}×`;
        },
      });
    },
    { scope },
  );

  return (
    <section ref={scope} id="modulo-kernel" className="scroll-mt-20 border-t border-hairline py-20">
      <ModuleHeader index="06" title="KERNEL" path="kernel/ · C++20 + pybind11" />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-8">
        <div className="flex flex-col gap-10 lg:col-span-7">
          <p className="ke-rise max-w-[560px] text-[15px] leading-[1.7] text-text-dim">
            O laço de forças O(n²) é vetorizado com AVX2 e paralelizado com OpenMP,
            compilado com -O3 -march=native. O pybind11 expõe o passo como{' '}
            <code className="font-mono text-[13px] text-nxtext">
              nexus_kernel.step(pos, vel, m, G, dt)
            </code>
            , operando in-place sobre arrays NumPy — zero cópia entre Python e C++.
          </p>
          <CodeReveal>
            <CodeBlock filename="kernel/bindings.cpp" code={PYBIND_CPP} language="cpp" />
          </CodeReveal>
        </div>
        <div className="ke-rise flex flex-col gap-8 lg:col-span-5">
          <div className="hud-notch border border-hairline bg-surface p-4">
            <img
              src="/kernel-chip.svg"
              alt="Die do kernel C++ — schematic com núcleo destacado"
              className="block h-auto w-full"
              loading="lazy"
            />
            <p className="tnum mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
              kernel die · núcleo AVX2 em destaque
            </p>
          </div>
          <HUDPanel
            title="// SPECS · KERNEL"
            rows={[
              { label: 'PADRÃO', value: 'C++20' },
              { label: 'BINDINGS', value: 'pybind11' },
              { label: 'PARALELO', value: 'OpenMP · AVX2' },
              { label: 'BUILD', value: '-O3 -march=native' },
            ]}
          />
        </div>
      </div>

      {/* benchmark table */}
      <div className="ke-rise bench-table mt-16 border border-hairline">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
          <span className="hud-label">{'// BENCHMARK · TEMPO POR STEP'}</span>
          <span className="tnum font-mono text-[10px] tracking-[0.12em] text-text-faint">
            menor é melhor
          </span>
        </div>
        <div className="hidden grid-cols-12 gap-4 border-b border-hairline px-4 py-2 sm:grid">
          {['CONFIGURAÇÃO', 'N', 'TEMPO/STEP', 'SPEEDUP'].map((head, i) => (
            <span
              key={head}
              className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-text-faint"
              style={{ gridColumn: i === 0 ? 'span 5' : i === 1 ? 'span 3' : 'span 2', textAlign: i > 1 ? 'right' : 'left' }}
            >
              {head}
            </span>
          ))}
        </div>
        {BENCH.map((row) => (
          <div
            key={`${row.config}-${row.n}`}
            className="bench-row grid grid-cols-2 gap-2 border-b border-hairline px-4 py-3 last:border-b-0 sm:grid-cols-12 sm:items-baseline sm:gap-4"
          >
            <span className="font-mono text-[12.5px] tracking-[0.04em] text-nxtext sm:col-span-5">
              {row.config}
            </span>
            <span className="tnum font-mono text-[12.5px] text-text-dim sm:col-span-3">
              N = {row.n}
            </span>
            <span className="tnum font-mono text-[12.5px] text-nxtext sm:col-span-2 sm:text-right">
              {row.time}
            </span>
            <span
              ref={row.accent ? speedupRef : undefined}
              className="tnum font-mono text-[12.5px] font-medium sm:col-span-2 sm:text-right"
              style={{ color: row.accent ? 'var(--accent)' : 'var(--text-dim)' }}
            >
              {row.accent ? '0×' : row.speedup}
            </span>
          </div>
        ))}
        <div className="border-t border-hairline px-4 py-2.5">
          <p className="font-mono text-[10px] tracking-[0.12em] text-text-faint">
            média de 100 steps · ryzen 9 · -O3 -march=native
          </p>
        </div>
      </div>
    </section>
  );
}
