import { memo, useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

/**
 * Cursor — design.md §6 (desktop only).
 * 6px core dot + 28px hairline ring (mix-blend-difference). On interactive
 * elements the ring expands to 44px and shows a mono 10px micro-label
 * (data-cursor attr, default "ABRIR"). On sliders it becomes a crosshair.
 * Disabled entirely on touch (pointer: coarse).
 */
function CursorInner() {
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 400, damping: 40, mass: 0.6 });
  const ringY = useSpring(y, { stiffness: 400, damping: 40, mass: 0.6 });

  const [label, setLabel] = useState<string | null>(null);
  const [crosshair, setCrosshair] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      setVisible(true);

      const target = e.target as HTMLElement | null;
      if (!target) return;
      const interactive = target.closest<HTMLElement>(
        'a, button, [role="button"], input, textarea, select, [data-cursor]',
      );
      if (interactive) {
        setLabel(interactive.dataset.cursor ?? 'ABRIR');
        const isSlider =
          interactive.getAttribute('role') === 'slider' ||
          interactive.dataset.cursor === 'ARRASTAR' ||
          interactive.tagName === 'INPUT';
        setCrosshair(isSlider);
      } else {
        setLabel(null);
        setCrosshair(false);
      }
    };
    const onLeave = () => setVisible(false);

    window.addEventListener('mousemove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, [x, y]);

  const active = label !== null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100]"
      style={{ opacity: visible ? 1 : 0 }}
      aria-hidden
    >
      {/* ring */}
      <motion.div
        className="absolute left-0 top-0"
        style={{ x: ringX, y: ringY, mixBlendMode: 'difference' }}
      >
        <div
          className="relative -translate-x-1/2 -translate-y-1/2 rounded-full border border-white transition-all duration-200"
          style={{
            width: active ? 44 : 28,
            height: active ? 44 : 28,
            borderRadius: crosshair ? 0 : '50%',
          }}
        >
          {crosshair && (
            <>
              <span className="absolute left-1/2 top-[-5px] h-[6px] w-px -translate-x-1/2 bg-white" />
              <span className="absolute left-1/2 bottom-[-5px] h-[6px] w-px -translate-x-1/2 bg-white" />
              <span className="absolute top-1/2 left-[-5px] h-px w-[6px] -translate-y-1/2 bg-white" />
              <span className="absolute top-1/2 right-[-5px] h-px w-[6px] -translate-y-1/2 bg-white" />
            </>
          )}
        </div>
      </motion.div>

      {/* dot */}
      <motion.div className="absolute left-0 top-0" style={{ x, y }}>
        <div className="h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      </motion.div>

      {/* micro label */}
      {label && (
        <motion.div className="absolute left-0 top-0" style={{ x: ringX, y: ringY }}>
          <span className="tnum absolute left-6 top-4 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em] text-white mix-blend-difference">
            {label}
          </span>
        </motion.div>
      )}
    </div>
  );
}

const Cursor = memo(function Cursor() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)');
    setEnabled(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setEnabled(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  if (!enabled) return null;
  return <CursorInner />;
});

export default Cursor;
