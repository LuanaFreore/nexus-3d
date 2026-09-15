import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { Vec8 } from './director';

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export interface Take {
  id: number;
  prompt: string;
  vector: Vec8;
  ts: number;
  source: 'nucleo' | 'local';
}

interface HistoryPanelProps {
  takes: Take[];
  activeId: number | null;
  onPreview: (take: Take) => void;
  onPreviewEnd: () => void;
  onFix: (take: Take) => void;
}

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('pt-BR', { hour12: false });

/**
 * HistoryPanel — lateral esquerda, coluna mono (ia.md §Layout).
 * Máx. 6 entradas; hover re-aplica o estado à cena (preview 800ms),
 * clique fixa e adiciona ao take. Entrada ativa com tick ▸ --accent.
 */
export default function HistoryPanel({
  takes,
  activeId,
  onPreview,
  onPreviewEnd,
  onFix,
}: HistoryPanelProps) {
  return (
    <motion.aside
      className="pointer-events-auto w-[280px]"
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.06, delayChildren: 0.7 } } }}
      data-hud
    >
      <p className="hud-label mb-3">{'// HISTÓRICO DE DIREÇÃO'}</p>
      <div className="flex flex-col">
        {takes.length === 0 && (
          <motion.p
            className="border-l border-hairline py-1 pl-3 font-mono text-[11px] tracking-[0.1em] text-text-faint"
            variants={{ hidden: { opacity: 0, x: -12 }, visible: { opacity: 1, x: 0, transition: { duration: 0.45, ease: EASE } } }}
          >
            NENHUM TAKE REGISTRADO
          </motion.p>
        )}
        {takes.map((take) => {
          const active = take.id === activeId;
          return (
            <motion.button
              key={take.id}
              type="button"
              onMouseEnter={() => onPreview(take)}
              onMouseLeave={onPreviewEnd}
              onClick={() => onFix(take)}
              className={cn(
                'group flex items-baseline gap-2.5 border-l py-1.5 pl-3 text-left transition-colors duration-150',
                active ? 'border-nxaccent' : 'border-hairline hover:border-hairline-strong',
              )}
              variants={{
                hidden: { opacity: 0, x: -12 },
                visible: { opacity: 1, x: 0, transition: { duration: 0.45, ease: EASE } },
              }}
              data-cursor="APLICAR"
            >
              <span
                className="tnum shrink-0 font-mono text-[10px] tracking-[0.08em] text-text-faint"
              >
                {fmtTime(take.ts)}
              </span>
              <span
                className="min-w-0 truncate font-mono text-[11px] tracking-[0.06em] transition-colors duration-150 group-hover:text-core"
                style={{ color: active ? 'var(--text)' : 'var(--text-dim)' }}
              >
                {active && <span style={{ color: 'var(--accent)' }}>▸ </span>}
                {take.prompt.length > 40 ? `${take.prompt.slice(0, 40)}…` : take.prompt}
              </span>
              {take.source === 'local' && (
                <span className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">
                  LOCAL
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </motion.aside>
  );
}
