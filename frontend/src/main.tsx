// Punto de entrada del frontend. No contiene lógica (está excluido de la cobertura):
// solo carga estilos e i18n y monta la aplicación dentro del router y del proveedor de sesión.
import 'bootstrap/dist/css/bootstrap.min.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import './i18n/i18n';
import { SessionProvider } from './session/SessionProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
