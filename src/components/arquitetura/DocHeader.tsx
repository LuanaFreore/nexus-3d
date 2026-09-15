import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Words } from '@/components/arquitetura/Split';

gsap.registerPlugin(useGSAP);

const GITHUB_COMMITS_URL = 'https://api.github.com/repos/nexus3d/nexus-core/commits?per_page=1';

/** pt-BR relative time, compact ("há 2 h", "há 3 d"). */
function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `há ${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
}

/**
 * S1 — Header do Documento (arquitetura.md).
 * Label + H1 por palavras (trigger load 200ms); subtítulo/meta em bloco;
 * hairline expande 0→100%. Meta usa dados ao vivo da API do GitHub quando
 * disponíveis (fallback: texto estático do design).
 */
export default function DocHeader() {
  const scope = useRef<HTMLElement>(null);
  const [lastCommit, setLastCommit] = useState<string>('há 2 h');

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    fetch(GITHUB_COMMITS_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('offline'))))
      .then((data: Array<{ commit?: { committer?: { date?: string } } }>) => {
        const date = data?.[0]?.commit?.committer?.date;
        if (date) setLastCommit(timeAgo(date));
      })
      .catch(() => {
        /* fallback estático do design */
      })
      .finally(() => clearTimeout(timer));
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  useGSAP(
    () => {
      const tl = gsap.timeline({ delay: 0.2 });
      tl.from('.doc-label', { opacity: 0, y: 12, duration: 0.5, ease: 'power3.out' }).from(
        scope.current?.querySelectorAll('.nx-word') ?? [],
        { yPercent: 120, duration: 0.7, ease: 'power3.out', stagger: 0.03 },
        '<0.05',
      );
      gsap.from('.doc-block', {
        opacity: 0,
        duration: 0.8,
        ease: 'power2.out',
        delay: 0.6,
        stagger: 0.12,
      });
      gsap.from('.doc-hairline', {
        scaleX: 0,
        transformOrigin: 'left center',
        duration: 0.8,
        ease: 'power3.out',
        delay: 0.4,
      });
    },
    { scope },
  );

  return (
    <section ref={scope} className="pt-24 pb-16 md:pt-32">
      <p className="doc-label hud-label">
        {'// DOCUMENTAÇÃO · v1.4.0'}
      </p>
      <h1 className="mt-4 font-sans font-medium uppercase tracking-[-0.02em] text-nxtext" style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)', lineHeight: 1.05 }}>
        <Words text="SOB O CAPÔ" />
      </h1>
      <p className="doc-block mt-6 max-w-[560px] text-[15px] leading-[1.7] text-text-dim">
        Três módulos, um motor. O frontend que você está vendo, um backend FastAPI+PyTorch
        e um kernel de física em C++20 — tudo no repositório, tudo executável.
      </p>
      <p className="doc-block tnum mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-text-faint">
        MIT · ÚLTIMO COMMIT {lastCommit} · CI ✓ PASSING
      </p>
      <div className="doc-hairline mt-12 h-px w-full bg-hairline" />
    </section>
  );
}
