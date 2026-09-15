import { AnimatePresence, motion } from 'framer-motion';
import { Github, X } from 'lucide-react';
import { getBackendUrl, useBackendHealth } from '@/lib/backend';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * LoginModal — OAuth GitHub, design.md §7.6
 * Overlay void 90% + blur; card 420px com notch HUD.
 * Sem backend: botão exibe "INDISPONÍVEL — MODO DEMO".
 */
export default function LoginModal({ open, onClose }: LoginModalProps) {
  const { online } = useBackendHealth(30000);

  const handleGithubLogin = () => {
    if (online) {
      window.location.href = `${getBackendUrl()}/auth/github`;
    } else {
      // modo demo: dashboard público sem OAuth
      window.location.href = '/dashboard?demo=1';
    }
  };

  const handleDemo = () => {
    window.location.href = '/dashboard?demo=1';
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ background: 'rgba(5,5,5,0.9)', backdropFilter: 'blur(12px)' }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Autenticação GitHub"
        >
          <motion.div
            className="hud-notch relative w-full max-w-[420px] border border-hairline bg-surface"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="absolute right-4 top-4 text-text-faint transition-colors hover:text-core"
            >
              <X size={16} strokeWidth={1.5} />
            </button>

            <div className="p-8">
              <p className="hud-label mb-4">{'// AUTENTICAÇÃO'}</p>
              <h2 className="mb-3 font-sans text-[28px] font-medium leading-tight tracking-[-0.02em] text-nxtext">
                Conectar conta GitHub
              </h2>
              <p className="mb-8 text-sm leading-relaxed text-text-dim">
                Autorize escopos mínimos para desbloquear dados ao vivo:{' '}
                <code className="text-nxtext">read:user</code> e{' '}
                <code className="text-nxtext">public_repo</code>. Nenhum dado é
                gravado — o token vive apenas na sua sessão.
              </p>

              <button onClick={handleGithubLogin} className="btn-cta w-full justify-center">
                <Github size={15} strokeWidth={1.75} />
                {online ? 'ENTRAR COM GITHUB' : 'INDISPONÍVEL — MODO DEMO'}
              </button>

              <div className="mt-4 text-center">
                <button onClick={handleDemo} className="btn-ghost mx-auto">
                  continuar em modo demo (API pública · 60 req/h)
                  <span className="ghost-arrow">→</span>
                </button>
              </div>
            </div>

            <div className="border-t border-hairline px-8 py-3">
              <p className="tnum font-mono text-[10px] tracking-[0.08em] text-text-faint">
                oauth → /auth/github/callback → token JWT
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
