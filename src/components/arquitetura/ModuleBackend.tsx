import { useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import HUDPanel from '@/components/hud/HUDPanel';
import CodeBlock from '@/components/hud/CodeBlock';
import ModuleHeader from '@/components/arquitetura/ModuleHeader';
import CodeReveal from '@/components/arquitetura/CodeReveal';
import { getBackendUrl } from '@/lib/backend';

gsap.registerPlugin(ScrollTrigger, useGSAP);

interface Endpoint {
  method: 'GET' | 'POST';
  route: string;
  description: string;
}

const ENDPOINTS: Endpoint[] = [
  { method: 'GET', route: '/v1/health', description: 'status + device torch (cuda/cpu)' },
  { method: 'POST', route: '/v1/direct', description: 'prompt → vetor de 8 parâmetros de cena' },
  { method: 'POST', route: '/v1/sim/step', description: 'N corpos → próximo estado (chama o kernel)' },
  { method: 'GET', route: '/auth/github/login', description: 'inicia OAuth · redirect GitHub' },
  { method: 'GET', route: '/auth/github/callback', description: 'troca code→token · emite JWT' },
];

const DIRECTOR_PY = `import torch
import torch.nn as nn


class SceneDirector(nn.Module):
    """MLP 384→256→128→8 — prompt embedding → parâmetros de cena."""

    def __init__(self) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(384, 256),
            nn.GELU(),
            nn.Linear(256, 128),
            nn.GELU(),
            nn.Linear(128, 8),
        )

    def forward(self, emb: torch.Tensor) -> torch.Tensor:
        out = self.net(emb)
        pos, look = out[:3], out[3:6]      # câmera
        fog = torch.sigmoid(out[6])        # densidade da névoa
        exposure = torch.sigmoid(out[7])   # exposição
        return pos, look, fog, exposure`;

type ProbeState = 'idle' | 'loading' | 'ok' | 'fail';

/**
 * S4 · 05 — BACKEND (arquitetura.md): endpoints, diretor neural, e botão
 * ghost `testar /v1/health →` que dispara fetch real e exibe o JSON inline
 * (ou OFFLINE --danger) — a documentação prova o estado do backend ao vivo.
 */
export default function ModuleBackend() {
  const scope = useRef<HTMLElement>(null);
  const [probe, setProbe] = useState<ProbeState>('idle');
  const [payload, setPayload] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  useGSAP(
    () => {
      gsap.from('.be-rise', {
        y: 24,
        opacity: 0,
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.1,
        scrollTrigger: { trigger: scope.current, start: 'top 65%' },
      });
      gsap.from('.endpoint-row', {
        x: -12,
        opacity: 0,
        duration: 0.4,
        ease: 'power2.out',
        stagger: 0.06,
        scrollTrigger: { trigger: '.endpoint-table', start: 'top 70%' },
      });
    },
    { scope },
  );

  const testHealth = async () => {
    setProbe('loading');
    setPayload(null);
    setLatency(null);
    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(`${getBackendUrl()}/v1/health`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      setLatency(Math.round((performance.now() - started) * 10) / 10);
      try {
        setPayload(JSON.stringify(await res.json(), null, 2));
      } catch {
        setPayload(null);
      }
      setProbe(res.ok ? 'ok' : 'fail');
    } catch {
      setProbe('fail');
    } finally {
      clearTimeout(timer);
    }
  };

  return (
    <section ref={scope} id="modulo-backend" className="scroll-mt-20 border-t border-hairline py-20">
      <ModuleHeader index="05" title="BACKEND" path="backend/ · FastAPI + PyTorch" />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-8">
        <div className="flex flex-col gap-10 lg:col-span-7">
          <p className="be-rise max-w-[560px] text-[15px] leading-[1.7] text-text-dim">
            FastAPI serve o Diretor Neural: um MLP de 41K parâmetros em PyTorch que converte
            um prompt em pt-BR num vetor de 8 parâmetros de cena — posição de câmera, alvo,
            névoa e exposição. O mesmo serviço expõe o passo de simulação (via kernel C++) e
            o fluxo OAuth do GitHub com emissão de JWT.
          </p>

          {/* endpoint table */}
          <div className="be-rise endpoint-table border border-hairline">
            <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
              <span className="hud-label">{'// ENDPOINTS · /v1 + /auth'}</span>
              <span className="tnum font-mono text-[10px] tracking-[0.12em] text-text-faint">
                base {getBackendUrl().replace(/^https?:\/\//, '')}
              </span>
            </div>
            {ENDPOINTS.map((ep) => (
              <div
                key={ep.route}
                className="endpoint-row flex flex-col gap-1 border-b border-hairline px-4 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4"
              >
                <span
                  className="tnum w-12 shrink-0 font-mono text-[11px] font-medium tracking-[0.12em]"
                  style={{ color: ep.method === 'POST' ? 'var(--accent)' : 'var(--text)' }}
                >
                  {ep.method}
                </span>
                <span className="tnum shrink-0 font-mono text-[12.5px] tracking-[0.04em] text-nxtext">
                  {ep.route}
                </span>
                <span className="font-mono text-[11px] tracking-[0.04em] text-text-dim sm:ml-auto sm:text-right">
                  {ep.description}
                </span>
              </div>
            ))}
          </div>

          {/* live health probe */}
          <div className="be-rise flex flex-col gap-4">
            <button onClick={testHealth} disabled={probe === 'loading'} className="btn-ghost w-fit" data-cursor="TESTAR">
              {probe === 'loading' ? 'TESTANDO…' : 'testar /v1/health'}
              <span className="ghost-arrow">→</span>
            </button>
            {probe === 'ok' && (
              <div className="hud-notch border border-hairline bg-surface">
                <div className="flex items-center justify-between border-b border-hairline px-4 py-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--accent)' }}>
                    ● ONLINE · {latency ?? '—'} ms
                  </span>
                  <span className="font-mono text-[10px] tracking-[0.12em] text-text-faint">
                    GET {getBackendUrl()}/v1/health
                  </span>
                </div>
                {payload && (
                  <pre className="tnum overflow-x-auto px-4 py-3 font-mono text-[12.5px] leading-[1.6] text-nxtext">
                    {payload}
                  </pre>
                )}
              </div>
            )}
            {probe === 'fail' && (
              <p className="font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--danger)' }}>
                OFFLINE — MODO LOCAL · fallback client-side ativo
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-8 lg:col-span-5">
          <div className="be-rise">
            <HUDPanel
              title="// SPECS · BACKEND"
              rows={[
                { label: 'FRAMEWORK', value: 'FastAPI 0.1xx' },
                { label: 'MODELO', value: 'PyTorch 2.x' },
                { label: 'REDE', value: 'MLP 41K params', accent: true },
                { label: 'SERVER', value: 'uvicorn :8000' },
                { label: 'AUTH', value: 'OAuth GitHub · JWT' },
              ]}
            />
          </div>
          <CodeReveal>
            <CodeBlock filename="backend/director.py" code={DIRECTOR_PY} language="python" />
          </CodeReveal>
        </div>
      </div>
    </section>
  );
}
