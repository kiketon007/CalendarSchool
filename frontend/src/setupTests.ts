// Setup de Vitest para el frontend: matchers de jest-dom y limpieza del DOM y del almacenamiento entre tests.
// Sin `globals`, React Testing Library no puede registrar su limpieza automática.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  // El borrador del registro vive en `sessionStorage`: no debe filtrarse de un test a otro.
  window.sessionStorage.clear();
});
