import { useEffect } from 'react';
import { Routes, Route } from 'react-router';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import Simulacao from '@/pages/Simulacao';
import Ia from '@/pages/Ia';
import Dashboard from '@/pages/Dashboard';
import Arquitetura from '@/pages/Arquitetura';
import { initSmoothScroll, destroySmoothScroll } from '@/lib/smooth-scroll';

export default function App() {
  // Lenis global (design.md §5) sincronizado com o ScrollTrigger
  useEffect(() => {
    const lenis = initSmoothScroll();
    lenis.on('scroll', ScrollTrigger.update);
    return () => destroySmoothScroll();
  }, []);

  return (
    // Padrão nested-route: Layout renderiza <Outlet/> — ver Layout.tsx
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="simulacao" element={<Simulacao />} />
        <Route path="ia" element={<Ia />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="arquitetura" element={<Arquitetura />} />
      </Route>
    </Routes>
  );
}
