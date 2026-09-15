import { useRef, useState } from 'react';
import { Link } from 'react-router';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import CodeBlock from '@/components/hud/CodeBlock';
import { cn } from '@/lib/utils';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const STORAGE_KEY = 'nexus.quickstart.v1';

const STEPS = [
  {
    filename: 'terminal — kernel',
    code: 'cd kernel && pip install pybind11 && python setup.py build_ext --inplace',
    check: 'kernel compilado · nexus_kernel*.so',
  },
  {
    filename: 'terminal — backend',
    code: 'cd backend && pip install -r requirements.txt && uvicorn main:app --port 8000',
    check: 'backend em :8000 · /v1/health → 200',
  },
  {
    filename: 'terminal — frontend',
    code: 'cd frontend && npm install && npm run dev   # → http://localhost:5173',
    check: 'frontend em :5173 · NÚCLEO ONLINE',
  },
];

function loadChecks(): boolean[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return STEPS.map(() => false);
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === STEPS.length) {
      return parsed.map((v) => v === true);
    }
  } catch {
    /* storage indisponível */
  }
  return STEPS.map(() => false);
}

/**
 * S5 — Quickstart (arquitetura.md): 3 CodeBlocks sequenciais com COPIAR,
 * checklist mono persistido em localStorage, nota sobre MODO LOCAL.
 * Blocos entram em stagger 0.2s (y 40px, trigger 70%).
 */
export default function Quickstart() {
  const scope = useRef<HTMLElement>(null);
  const [checks, setChecks] = useState<boolean[]>(loadChecks);

  const toggle = (i: number) => {
    setChecks((prev) => {
      const next = prev.map((v, j) => (j === i ? !v : v));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage indisponível — estado apenas em memória */
      }
      return next;
    });
  };

  useGSAP(
    () => {
      gsap.from('.qs-block', {
        y: 40,
        opacity: 0,
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.2,
        scrollTrigger: { trigger: scope.current, start: 'top 70%' },
      });
      gsap.from('.qs-note', {
        opacity: 0,
        duration: 0.8,
        ease: 'power2.out',
        delay: 0.3,
        scrollTrigger: { trigger: scope.current, start: 'top 70%' },
      });
    },
    { scope },
  );

  const done = checks.filter(Boolean).length;

  return (
    <section ref={scope} className="border-t border-hairline py-20">
      <p className="hud-label">{'// QUICKSTART'}</p>
      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-8">
        {/* code blocks */}
        <div className="flex flex-col gap-8 lg:col-span-8">
          {STEPS.map((step, i) => (
            <div key={step.filename} className="qs-block">
              <p className="tnum mb-3 font-mono text-[11px] tracking-[0.18em] text-text-faint">
                {`0${i + 1} — ${step.filename.split('— ')[1]?.toUpperCase()}`}
              </p>
              <CodeBlock filename={step.filename} code={step.code} language="bash" />
            </div>
          ))}
        </div>

        {/* checklist */}
        <div className="qs-block lg:col-span-4">
          <div className="hud-surface hud-notch">
            <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
              <span className="hud-label">{'// CHECKLIST'}</span>
              <span
                className="tnum font-mono text-[10px] tracking-[0.12em]"
                style={{ color: done === STEPS.length ? 'var(--accent)' : 'var(--text-faint)' }}
              >
                {done}/{STEPS.length}
              </span>
            </div>
            <div className="flex flex-col gap-1 px-3 py-3">
              {STEPS.map((step, i) => (
                <button
                  key={step.check}
                  onClick={() => toggle(i)}
                  data-cursor="MARCAR"
                  className="group flex items-center gap-3 px-2 py-2.5 text-left"
                >
                  <span
                    className={cn(
                      'flex h-3.5 w-3.5 shrink-0 items-center justify-center border transition-colors duration-150',
                      checks[i] ? 'border-nxaccent bg-nxaccent' : 'border-hairline-strong group-hover:border-nxaccent',
                    )}
                  >
                    {checks[i] && (
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5.5L4 8L8.5 2" stroke="var(--void)" strokeWidth="1.6" />
                      </svg>
                    )}
                  </span>
                  <span
                    className="font-mono text-[11px] tracking-[0.06em] transition-colors duration-150"
                    style={{
                      color: checks[i] ? 'var(--text-faint)' : 'var(--text-dim)',
                      textDecoration: checks[i] ? 'line-through' : 'none',
                    }}
                  >
                    {step.check}
                  </span>
                </button>
              ))}
            </div>
            <div className="border-t border-hairline px-5 py-3">
              <p className="font-mono text-[10px] tracking-[0.12em] text-text-faint">
                progresso salvo localmente
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="qs-note mt-10 max-w-[640px] font-mono text-[11px] leading-[1.8] tracking-[0.06em] text-text-dim">
        sem o backend, o frontend detecta e entra em{' '}
        <span style={{ color: 'var(--accent)' }}>MODO LOCAL</span> automaticamente (fallback
        client-side) — como visto nas páginas{' '}
        <Link to="/ia" className="text-nxtext underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-core">
          /ia
        </Link>{' '}
        e{' '}
        <Link to="/simulacao" className="text-nxtext underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-core">
          /simulacao
        </Link>
        .
      </p>
    </section>
  );
}
