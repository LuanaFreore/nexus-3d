import { Link } from 'react-router';
import { Github } from 'lucide-react';

const LINKS = [
  { label: 'SIMULAÇÃO', to: '/simulacao' },
  { label: 'IA', to: '/ia' },
  { label: 'DADOS', to: '/dashboard' },
  { label: 'ARQUITETURA', to: '/arquitetura' },
];

/** Footer — design.md §7.8 (hairline top, 3 colunas ≥768px, linha-base mono 10px). */
export default function Footer() {
  return (
    <footer className="border-t border-hairline">
      <div
        className="mx-auto max-w-[1440px] py-16"
        style={{ paddingInline: 'clamp(20px, 4vw, 64px)' }}
      >
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {/* col 1: wordmark */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <img src="/logo.svg" alt="NEXUS 3D" width={28} height={28} />
              <span className="font-sans text-[15px] font-medium uppercase tracking-[0.08em]">
                NEXUS<span style={{ color: 'var(--accent)' }}>◆</span>3D
              </span>
            </div>
            <p className="font-mono text-[11px] tracking-[0.18em] text-text-faint">
              CINEMATIC REALTIME ENGINE
            </p>
          </div>

          {/* col 2: links */}
          <nav className="flex flex-col gap-3">
            {LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="w-fit font-mono text-[11px] uppercase tracking-[0.18em] text-text-dim transition-colors duration-150 hover:text-core"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* col 3: repo */}
          <div className="flex flex-col gap-3 md:items-end">
            <a
              href="https://github.com/nexus3d/nexus-core"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 font-mono text-[11px] tracking-[0.12em] text-text-dim transition-colors duration-150 hover:text-core"
            >
              <Github size={13} strokeWidth={1.5} />
              github.com/nexus3d/nexus-core
            </a>
            <p className="font-mono text-[11px] tracking-[0.12em] text-text-faint">MIT © 2025</p>
          </div>
        </div>
      </div>
      <div className="border-t border-hairline">
        <p
          className="mx-auto max-w-[1440px] py-4 text-center font-mono text-[10px] tracking-[0.18em] text-text-faint"
          style={{ paddingInline: 'clamp(20px, 4vw, 64px)' }}
        >
          REACT 19 · FASTAPI · PYTORCH · C++20 · WEBGL2
        </p>
      </div>
    </footer>
  );
}
