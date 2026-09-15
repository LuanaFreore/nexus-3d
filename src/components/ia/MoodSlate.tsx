import { AnimatePresence, motion } from 'framer-motion';

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export interface SlateData {
  id: number;
  words: string[];
  cena: number;
  take: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * MoodSlate — topo-centro (ia.md §Layout/Animações).
 * Slate de filme: nome do clima em Space Grotesk 500 uppercase com split
 * por palavras (y 20px, stagger 0.05s); sai com blur 0→6px após 3s.
 */
export default function MoodSlate({ slate }: { slate: SlateData | null }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-20 z-20 -translate-x-1/2 text-center">
      <AnimatePresence mode="wait">
        {slate && (
          <motion.div
            key={slate.id}
            exit={{ opacity: 0, filter: 'blur(6px)' }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <h2
              className="font-sans font-medium uppercase tracking-[-0.02em] text-nxtext"
              style={{ fontSize: 'clamp(1.5rem, 3vw, 2.5rem)' }}
            >
              {slate.words.map((word, i) => (
                <motion.span
                  key={`${slate.id}-${i}`}
                  className="inline-block"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.5, ease: EASE }}
                >
                  {word}
                  {i < slate.words.length - 1 ? ' ' : ''}
                </motion.span>
              ))}
            </h2>
            <motion.p
              className="tnum mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-text-faint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: slate.words.length * 0.05 + 0.15, duration: 0.4 }}
            >
              CENA {pad(slate.cena)} · TAKE {pad(slate.take)}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
