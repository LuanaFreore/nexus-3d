import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { Github } from 'lucide-react';
import { Chars } from '@/components/arquitetura/Split';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const REPO_URL = 'https://github.com/nexus3d/nexus-core';
const REPO_API = 'https://api.github.com/repos/nexus3d/nexus-core';

interface RepoStats {
  stars: number;
  forks: number;
  issues: number;
}

/** 2400 → "2.4K" */
function fmtK(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1)}K`;
  }
  return String(n);
}

/**
 * S6 — CTA Repositório (arquitetura.md): H2 por caracteres (stagger 0.02s),
 * CTA acento + ghost, stats ao vivo do repo via API do GitHub (fallback ——),
 * números contam ao entrar no viewport.
 */
export default function RepoCTA() {
  const scope = useRef<HTMLElement>(null);
  const starsRef = useRef<HTMLSpanElement>(null);
  const forksRef = useRef<HTMLSpanElement>(null);
  const issuesRef = useRef<HTMLSpanElement>(null);
  const [stats, setStats] = useState<RepoStats | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    fetch(REPO_API, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('offline'))))
      .then((data: { stargazers_count?: number; forks_count?: number; open_issues_count?: number }) => {
        setStats({
          stars: data.stargazers_count ?? 0,
          forks: data.forks_count ?? 0,
          issues: data.open_issues_count ?? 0,
        });
      })
      .catch(() => setStats(null))
      .finally(() => clearTimeout(timer));
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: scope.current, start: 'top 70%' },
      });
      tl.from(scope.current?.querySelectorAll('.nx-char') ?? [], {
        yPercent: 120,
        duration: 0.6,
        ease: 'power3.out',
        stagger: 0.02,
      }).from('.cta-rise', {
        y: 24,
        opacity: 0,
        duration: 0.6,
        ease: 'power3.out',
        stagger: 0.1,
      });
    },
    { scope },
  );

  // stats contam ao entrar (somente quando a API respondeu)
  useGSAP(
    () => {
      if (!stats) return;
      const targets: Array<[React.RefObject<HTMLSpanElement | null>, number]> = [
        [starsRef, stats.stars],
        [forksRef, stats.forks],
        [issuesRef, stats.issues],
      ];
      targets.forEach(([ref, final]) => {
        if (!ref.current) return;
        const counter = { v: 0 };
        gsap.to(counter, {
          v: final,
          duration: 1.2,
          ease: 'power2.out',
          scrollTrigger: { trigger: ref.current, start: 'top 85%' },
          onUpdate: () => {
            if (ref.current) ref.current.textContent = fmtK(Math.round(counter.v));
          },
        });
      });
    },
    { scope, dependencies: [stats] },
  );

  return (
    <section ref={scope} className="flex flex-col items-center border-t border-hairline py-28 text-center">
      <p className="hud-label">{'// REPOSITÓRIO'}</p>
      <h2
        className="mt-6 max-w-[900px] font-sans font-medium uppercase tracking-[-0.02em] text-nxtext"
        style={{ fontSize: 'clamp(2rem, 5vw, 4.5rem)', lineHeight: 1.08 }}
      >
        <Chars text="O CÓDIGO É A DOCUMENTAÇÃO FINAL." />
      </h2>

      <div className="cta-rise mt-10 flex flex-wrap items-center justify-center gap-6">
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn-cta">
          <Github size={14} strokeWidth={1.75} />
          ABRIR NO GITHUB
        </a>
        <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer" className="btn-ghost">
          ver issues abertas
          <span className="ghost-arrow">→</span>
        </a>
      </div>

      <p className="cta-rise tnum mt-10 font-mono text-[11px] uppercase tracking-[0.18em] text-text-dim">
        ★ <span ref={starsRef} className="text-nxtext">{stats ? '0' : '——'}</span>
        {' · '}
        ⑂ <span ref={forksRef} className="text-nxtext">{stats ? '0' : '——'}</span>
        {' · '}
        ◌ <span ref={issuesRef} className="text-nxtext">{stats ? '0' : '——'}</span> ISSUES
      </p>
    </section>
  );
}
