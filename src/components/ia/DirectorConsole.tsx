import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import BackendStatusBadge from '@/components/hud/BackendStatusBadge';
import { cn } from '@/lib/utils';

export type ConsoleStatus =
  | { kind: 'idle'; text: string }
  | { kind: 'working'; text: string }
  | { kind: 'ok'; text: string }
  | { kind: 'local'; text: string }
  | { kind: 'error'; text: string };

export const PROMPT_CHIPS = [
  'calma profunda',
  'tensão crescente',
  'euforia caótica',
  'melancolia espacial',
] as const;

export const MAX_PROMPT = 140;

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface DirectorConsoleProps {
  status: ConsoleStatus;
  composing: boolean;
  cooldownLeft: number; // segundos restantes (0 = livre)
  offline: boolean;
  onSubmit: (prompt: string) => void;
}

/**
 * DirectorConsole — centro-inferior (ia.md §Layout).
 * Input de prompt pt-BR + botão DIRIGIR ▸, chips prontos, linha de status
 * e badge MODO LOCAL explícito quando o backend está fora.
 */
export default function DirectorConsole({
  status,
  composing,
  cooldownLeft,
  offline,
  onSubmit,
}: DirectorConsoleProps) {
  const [prompt, setPrompt] = useState('');
  const [dots, setDots] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // "COMPONDO…" — 3 pontos sequenciais, 300ms cada (ia.md §Animações)
  useEffect(() => {
    if (!composing) return;
    const id = setInterval(() => setDots((d) => (d + 1) % 4), 300);
    return () => clearInterval(id);
  }, [composing]);

  const blocked = composing || cooldownLeft > 0;
  const canSubmit = !blocked && prompt.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(prompt.trim().slice(0, MAX_PROMPT));
  };

  const buttonLabel = composing
    ? `COMPONDO${'.'.repeat(dots)}${' '.repeat(3 - dots)}`
    : cooldownLeft > 0
      ? `AGUARDE ${cooldownLeft}S`
      : 'DIRIGIR ▸';

  return (
    <motion.div
      className="hud-surface hud-notch pointer-events-auto w-full"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.5, ease: EASE }}
      data-hud
    >
      {/* header */}
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3">
        <span className="hud-label">{'// DIRETOR NEURAL · FASTAPI + PYTORCH'}</span>
        <span className="flex items-center gap-2">
          {offline && (
            <span
              className="flex items-center gap-2 border px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.18em]"
              style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
            >
              <span
                className="block h-1.5 w-1.5 rounded-full"
                style={{ background: 'var(--danger)', animation: 'pulse-dot 1.6s ease-in-out infinite' }}
              />
              MODO LOCAL
            </span>
          )}
          <BackendStatusBadge />
        </span>
      </div>

      <div className="flex flex-col gap-3 px-5 py-4">
        {/* input + botão */}
        <form
          className="flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            maxLength={MAX_PROMPT}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder='descreva o clima da cena… ex.: "tensão crescente antes da colisão"'
            className="h-11 min-w-0 flex-1 border border-hairline bg-surface px-4 font-mono text-[13px] tracking-[0.04em] text-nxtext placeholder:text-text-faint focus:border-hairline-strong focus:outline-none"
            style={{ caretColor: 'var(--accent)' }}
            aria-label="Prompt do diretor neural"
          />
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn('btn-hairline !h-11 shrink-0 !px-5', !canSubmit && 'opacity-40')}
            data-cursor="DIRIGIR"
          >
            {buttonLabel}
          </button>
        </form>

        {/* chips de prompt prontos */}
        <div className="flex flex-wrap gap-2">
          {PROMPT_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => {
                setPrompt(chip);
                inputRef.current?.focus();
              }}
              className="border border-hairline px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] text-text-dim transition-colors duration-150 hover:border-nxaccent hover:bg-accent-dim hover:text-core"
              data-cursor="USAR"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* linha de status */}
        <div className="flex flex-col gap-1 border-t border-hairline pt-3">
          <p
            className="tnum font-mono text-[10px] uppercase tracking-[0.14em]"
            style={{
              color:
                status.kind === 'error'
                  ? 'var(--danger)'
                  : status.kind === 'ok'
                    ? 'var(--text-dim)'
                    : status.kind === 'local'
                      ? 'var(--accent)'
                      : 'var(--text-faint)',
            }}
            role="status"
          >
            {status.text}
          </p>
          {offline && (
            <p
              className="font-mono text-[10px] uppercase tracking-[0.14em]"
              style={{ color: 'var(--danger)' }}
            >
              BACKEND OFFLINE · DIREÇÃO LOCAL APROXIMADA
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
