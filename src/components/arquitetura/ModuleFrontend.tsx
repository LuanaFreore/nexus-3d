import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import HUDPanel from '@/components/hud/HUDPanel';
import CodeBlock from '@/components/hud/CodeBlock';
import ModuleHeader from '@/components/arquitetura/ModuleHeader';
import CodeReveal from '@/components/arquitetura/CodeReveal';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const SIM_LOOP = `// simStep — compute por feedback de texturas (FBO ping-pong)
simStep.useFrame(({ gl }) => {
  for (let i = 0; i < SUBSTEPS; i++) {
    gl.setRenderTarget(targets[write]);
    gl.render(simScene, simCamera);          // pos/vel → GPGPU
    [read, write] = [write, read];           // ping-pong
  }
  gl.setRenderTarget(null);
  material.uniforms.uPositions.value = targets[read].texture;
});`;

/**
 * S4 · 04 — FRONTEND (arquitetura.md): pipeline de render, adaptive quality,
 * fallbacks. Specs HUD + CodeBlock do loop de simulação GPU.
 */
export default function ModuleFrontend() {
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.from('.fe-rise', {
        y: 24,
        opacity: 0,
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.1,
        scrollTrigger: { trigger: scope.current, start: 'top 65%' },
      });
    },
    { scope },
  );

  return (
    <section ref={scope} id="modulo-frontend" className="scroll-mt-20 border-t border-hairline py-20">
      <ModuleHeader index="04" title="FRONTEND" path="frontend/" />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-8">
        <div className="flex flex-col gap-8 lg:col-span-7">
          <p className="fe-rise max-w-[560px] text-[15px] leading-[1.7] text-text-dim">
            Pipeline de render em React Three Fiber: a física roda em compute por feedback
            de texturas (ping-pong FBO), a cena passa por pós-processamento — bloom
            seletivo, vignette, grain — e a qualidade é adaptativa: se o FPS cai abaixo de
            45 por 3s, o DPR degrada de 1.75 para 1.25. Sem WebGL2, um fallback CPU mantém
            a simulação viva.
          </p>
          <CodeReveal>
            <CodeBlock filename="frontend/src/scenes/simStep.ts" code={SIM_LOOP} language="typescript" />
          </CodeReveal>
        </div>
        <div className="fe-rise lg:col-span-5">
          <HUDPanel
            title="// SPECS · FRONTEND"
            rows={[
              { label: 'FRAMEWORK', value: 'React 19' },
              { label: 'RENDER', value: 'three r186 · R3F' },
              { label: 'API', value: 'WebGL2' },
              { label: 'ALVO', value: '60 FPS', accent: true },
              { label: 'FALLBACK', value: 'CPU · DPR 1.25' },
            ]}
          />
        </div>
      </div>
    </section>
  );
}
