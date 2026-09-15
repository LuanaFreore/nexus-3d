import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { Github } from 'lucide-react';
import BackendStatusBadge from '@/components/hud/BackendStatusBadge';
import LoginModal from '@/components/hud/LoginModal';

const LINKS = [
  { label: 'SIMULAÇÃO', to: '/simulacao' },
  { label: 'IA', to: '/ia' },
  { label: 'DADOS', to: '/dashboard' },
  { label: 'ARQUITETURA', to: '/arquitetura' },
];

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * Navbar — design.md §7.1 (HUD superior, fixed, z-50, 56px).
 * Overlay nav: transparent → void/80 + blur + bottom hairline after 40px
 * scroll (200ms transition). The matching top offset for page content lives
 * in Layout — pages never add their own nav padding.
 */
export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <>
      <header
        className="fixed top-0 z-50 h-14 w-full transition-all duration-200"
        style={{
          background: scrolled ? 'rgba(5,5,5,0.8)' : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
          borderBottom: scrolled ? '1px solid var(--hairline)' : '1px solid transparent',
        }}
      >
        <div
          className="mx-auto flex h-full max-w-[1440px] items-center justify-between"
          style={{ paddingInline: 'clamp(20px, 4vw, 64px)' }}
        >
          {/* wordmark */}
          <Link
            to="/"
            className="flex items-center gap-2 font-sans text-[15px] font-medium uppercase tracking-[0.08em] text-nxtext"
          >
            NEXUS<span style={{ color: 'var(--accent)' }}>◆</span>3D
          </Link>

          {/* center links (desktop) */}
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 lg:flex">
            {LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} className="group relative py-1">
                {({ isActive }) => (
                  <span
                    className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] transition-colors duration-150"
                    style={{ color: isActive ? 'var(--accent)' : 'var(--text-dim)' }}
                  >
                    {isActive && <span className="mr-1.5">▸</span>}
                    <span className="group-hover:text-core">{link.label}</span>
                    <span
                      className="absolute -bottom-0.5 left-0 h-px w-full origin-left bg-core transition-transform duration-150"
                      style={{
                        transform: isActive ? 'scaleX(1)' : 'scaleX(0)',
                        background: isActive ? 'var(--accent)' : 'var(--hairline-strong)',
                      }}
                    />
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* right side */}
          <div className="flex items-center gap-4">
            <BackendStatusBadge />
            <button
              onClick={() => setLoginOpen(true)}
              className="btn-hairline hidden !px-4 !py-2 md:inline-flex"
            >
              <Github size={13} strokeWidth={1.75} />
              ENTRAR COM GITHUB
            </button>
            <button
              onClick={() => setMenuOpen(true)}
              className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-dim transition-colors hover:text-core lg:hidden"
            >
              MENU
            </button>
          </div>
        </div>
      </header>

      {/* mobile overlay menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="fixed inset-0 z-[80] flex flex-col"
            style={{ background: 'var(--void)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div
              className="flex h-14 items-center justify-between"
              style={{ paddingInline: 'clamp(20px, 4vw, 64px)' }}
            >
              <span className="font-sans text-[15px] font-medium uppercase tracking-[0.08em]">
                NEXUS<span style={{ color: 'var(--accent)' }}>◆</span>3D
              </span>
              <button
                onClick={() => setMenuOpen(false)}
                className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-dim hover:text-core"
              >
                FECHAR
              </button>
            </div>
            <nav className="flex flex-1 flex-col justify-center gap-6 px-8">
              {[{ label: 'INÍCIO', to: '/' }, ...LINKS].map((link, i) => (
                <motion.div
                  key={link.to}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + i * 0.06, duration: 0.5, ease: EASE }}
                >
                  <Link
                    to={link.to}
                    className="font-sans font-medium uppercase tracking-[-0.02em] text-nxtext"
                    style={{ fontSize: 'clamp(2rem, 8vw, 3rem)' }}
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.42, duration: 0.5, ease: EASE }}
                className="pt-6"
              >
                <button onClick={() => { setMenuOpen(false); setLoginOpen(true); }} className="btn-cta">
                  <Github size={14} strokeWidth={1.75} />
                  ENTRAR COM GITHUB
                </button>
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}
