import DocHeader from '@/components/arquitetura/DocHeader';
import ArchitectureDiagram from '@/components/arquitetura/ArchitectureDiagram';
import RepoTree from '@/components/arquitetura/RepoTree';
import ModuleFrontend from '@/components/arquitetura/ModuleFrontend';
import ModuleBackend from '@/components/arquitetura/ModuleBackend';
import ModuleKernel from '@/components/arquitetura/ModuleKernel';
import Quickstart from '@/components/arquitetura/Quickstart';
import RepoCTA from '@/components/arquitetura/RepoCTA';

/**
 * /arquitetura — Documentação Viva (design/arquitetura.md).
 * Página-documento mono-dominante: sem cena 3D pesada, o "movimento real" são
 * os pulsos do diagrama SVG, reveals tipográficos (GSAP ScrollTrigger) e
 * dados ao vivo (health-check do backend, API do GitHub). Max-w 1200px.
 */
export default function Arquitetura() {
  return (
    <div
      className="mx-auto w-full max-w-[1200px]"
      style={{ paddingInline: 'clamp(20px, 4vw, 64px)' }}
    >
      {/* S1 — header do documento */}
      <DocHeader />

      {/* S2 — diagrama de arquitetura (SVG inline com pulsos) */}
      <ArchitectureDiagram />

      {/* S3 — árvore do repositório */}
      <RepoTree />

      {/* S4 — módulos em detalhe */}
      <ModuleFrontend />
      <ModuleBackend />
      <ModuleKernel />

      {/* S5 — quickstart + checklist persistido */}
      <Quickstart />

      {/* S6 — CTA repositório */}
      <RepoCTA />
    </div>
  );
}
