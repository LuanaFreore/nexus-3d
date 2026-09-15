import { Outlet } from 'react-router';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Cursor from '@/components/hud/Cursor';

/**
 * Layout — global shell (Navbar fixed + Footer + custom Cursor).
 *
 * NAV OFFSET CONTRACT (react-dev.md): the Navbar is `fixed top-0 z-50`
 * (overlay nav, 56px tall), so this Layout owns the offset: the content
 * slot gets `pt-14` (56px). Pages must NOT add their own nav padding.
 *
 * OPT-OUT: pages with a full-bleed 3D hero (e.g. Home) that must render
 * under the transparent nav wrap their hero section in `-mt-14` inside the
 * page — the Layout offset stays untouched. Pages with an internal
 * full-viewport canvas (Simulação, IA) may also disable page scroll
 * (`overflow: hidden` on their root) per design.md §5.
 *
 * Routing pattern: nested-route (<Outlet/>) — App.tsx renders
 * <Route element={<Layout/>}> with child routes. Do NOT switch this slot
 * to {children} without changing App.tsx to match.
 */
export default function Layout() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-void text-nxtext">
      <Cursor />
      <Navbar />
      <main className="flex-1 pt-14">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
