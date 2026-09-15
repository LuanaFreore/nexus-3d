import Lenis from 'lenis';

/**
 * Global Lenis smooth-scroll singleton (design.md §5: lerp 0.09, wheelMultiplier 0.9).
 * Pages with internal full-viewport canvases (Simulação, IA) call
 * `stopSmoothScroll()` on mount and `startSmoothScroll()` on unmount.
 */

let lenis: Lenis | null = null;
let rafId = 0;

export function initSmoothScroll(): Lenis {
  if (lenis) return lenis;
  lenis = new Lenis({
    lerp: 0.09,
    wheelMultiplier: 0.9,
    smoothWheel: true,
  });

  const raf = (time: number) => {
    lenis?.raf(time);
    rafId = requestAnimationFrame(raf);
  };
  rafId = requestAnimationFrame(raf);
  return lenis;
}

export function getLenis(): Lenis | null {
  return lenis;
}

export function stopSmoothScroll() {
  lenis?.stop();
}

export function startSmoothScroll() {
  lenis?.start();
}

export function destroySmoothScroll() {
  cancelAnimationFrame(rafId);
  lenis?.destroy();
  lenis = null;
}
