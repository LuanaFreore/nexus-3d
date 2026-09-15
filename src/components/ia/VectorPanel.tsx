import { motion } from 'framer-motion';
import { PARAMS, type Vec8 } from './director';

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface VectorPanelProps {
  vector: Vec8;
  onExport: () => void;
}

/**
 * VectorPanel — lateral direita, 260px (ia.md §Layout).
 * Visualização viva da saída do MLP: 8 barras hairline, preenchimento
 * --accent; o parâmetro dominante preenche em --core com bloom CSS sutil.
 * Valores atualizam ao vivo durante a interpolação da cena (~8Hz).
 */
export default function VectorPanel({ vector, onExport }: VectorPanelProps) {
  const dominant = PARAMS.reduce((a, b) => (vector[a.key] >= vector[b.key] ? a : b)).key;

  return (
    <motion.aside
      className="hud-surface hud-notch pointer-events-auto w-[260px]"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.55, duration: 0.5, ease: EASE }}
      data-hud
    >
      <div className="border-b border-hairline px-5 py-3">
        <span className="hud-label">{'// VETOR DE SAÍDA'}</span>
      </div>

      <div className="flex flex-col gap-3 px-5 py-4">
        {PARAMS.map((param) => {
          const value = vector[param.key];
          const isDominant = param.key === dominant;
          return (
            <div key={param.key} className="group relative">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-text-dim">
                  {param.label}
                </span>
                <span
                  className="tnum font-mono text-[11px] tracking-[0.04em]"
                  style={{ color: isDominant ? 'var(--core)' : 'var(--text-dim)' }}
                >
                  {value.toFixed(2)}
                </span>
              </div>
              <div className="h-[3px] w-full bg-hairline transition-all duration-150 group-hover:h-[5px]">
                <div
                  className="h-full transition-[width] duration-150 ease-linear"
                  style={{
                    width: `${Math.max(2, value * 100)}%`,
                    background: isDominant ? 'var(--core)' : 'var(--accent)',
                    boxShadow: isDominant
                      ? '0 0 8px rgba(255,255,255,0.75), 0 0 2px rgba(255,255,255,0.9)'
                      : 'none',
                  }}
                />
              </div>
              {/* tooltip com descrição do parâmetro */}
              <div className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 w-52 border border-hairline bg-surface px-3 py-2 font-mono text-[10px] leading-relaxed tracking-[0.06em] text-text-dim opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                {param.desc}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2.5 border-t border-hairline px-5 py-3">
        <button type="button" onClick={onExport} className="btn-ghost w-fit" data-cursor="BAIXAR">
          EXPORTAR JSON <span className="ghost-arrow">↓</span>
        </button>
        <p className="font-mono text-[10px] tracking-[0.1em] text-text-faint">
          MLP 384→256→128→8 · GELU · 41K params
        </p>
      </div>
    </motion.aside>
  );
}
