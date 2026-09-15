import { useRef } from 'react';
import type { ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * CodeReveal — wraps a CodeBlock and reveals its lines one by one
 * (stagger 0.02s) when 60% visible, per arquitetura.md §S4 animation.
 * Targets the CodeBlock's internal `pre > div` line elements.
 */
export default function CodeReveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const lines = ref.current?.querySelectorAll('pre > div');
      if (!lines || lines.length === 0) return;
      gsap.from(lines, {
        opacity: 0,
        x: -12,
        duration: 0.35,
        ease: 'power2.out',
        stagger: 0.02,
        scrollTrigger: { trigger: ref.current, start: 'top 60%' },
      });
    },
    { scope: ref },
  );

  return <div ref={ref}>{children}</div>;
}
