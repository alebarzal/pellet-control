import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './index.css';

const isField = (el: Element | null): el is HTMLElement =>
  !!el && (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && !['button', 'checkbox', 'radio', 'range', 'submit'].includes(el.type)));
const reveal = () => {
  const el = document.activeElement;
  if (isField(el)) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
};
document.addEventListener('focusin', (e) => {
  if (isField(e.target as Element)) window.setTimeout(reveal, 350);
});
// La vista se encoge al abrir el teclado: vuelve a centrar el campo activo.
window.addEventListener('resize', () => window.setTimeout(reveal, 60));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
