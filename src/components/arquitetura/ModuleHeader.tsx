import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { Words } from '@/components/arquitetura/Split';

gsap.registerPlugin(ScrollTrigger, useGSAP);

interface ModuleHeaderProps {
  index: string;
  title: string;
  path: string;
}

/**
 * Module header (arquitetura.md §S4): label `// 0X` + H2 por palavras
 * (trigger 75%) + path mono. Used by the three module subsections.
 */
export default function ModuleHeader({ index, title, path }: ModuleHeaderProps) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: scope.current, start: 'top 75%' },
      });
      tl.from('.mod-label', { opacity: 0, y: 12, duration: 0.5, ease: 'power3.out' }).from(
        scope.current?.querySelectorAll('.nx-word') ?? [],
        { yPercent: 120, duration: 0.7, ease: 'power3.out', stagger: 0.03 },
        '<0.05',
      );
    },
    { scope },
  );

  return (
    <div ref={scope} className="mb-10">
      <p className="mod-label hud-label" style={{ color: 'var(--accent)' }}>
        {`// ${index}`}
      </p>
      <h2
        className="mt-3 font-sans font-medium uppercase tracking-[-0.02em] text-nxtext"
        style={{ fontSize: 'clamp(2rem, 5vw, 4.5rem)', lineHeight: 1.05 }}
      >
        <Words text={title} />
      </h2>
      <p className="mt-2 font-mono text-[11px] tracking-[0.18em] text-text-faint">{path}</p>
    </div>
  );
}
