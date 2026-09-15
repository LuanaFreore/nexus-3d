import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import './index.css';
import App from './App.tsx';

// Sem <StrictMode>: efeitos de canvas (R3F/GSAP) rodariam duas vezes (react-dev.md)
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
