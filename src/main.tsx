import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

registerSW({
  immediate: true,
  onOfflineReady() {
    window.dispatchEvent(new CustomEvent('mock-exam:offline-ready'));
  },
  onRegisterError(error) {
    console.error('Service worker registration failed:', error);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
