import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import contentSecurityPolicy from './content-security-policy.json' with { type: 'json' };
import { serializeContentSecurityPolicy } from './src/security/contentSecurityPolicy.ts';

/**
 * Destino del proxy de `/api`. Por defecto, el backend de desarrollo; el script de E2E lo
 * apunta a su propio backend (design.md D7). Sin esta variable, `vite preview` enviaría las
 * peticiones del E2E al backend de desarrollo.
 */
const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // `preview.proxy` hereda este proxy: frontend y API comparten origen en dev y en preview.
    proxy: {
      '/api': { target: apiProxyTarget, changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    // La misma CSP que sirve CloudFront (design.md D2). No va en `server`: el servidor de
    // desarrollo inyecta un script en línea para HMR y React Refresh, y la CSP lo bloquearía.
    headers: {
      'Content-Security-Policy': serializeContentSecurityPolicy(contentSecurityPolicy),
    },
  },
  test: {
    environment: 'jsdom',
    // Sin globals: los tests importan describe/it/expect para no chocar con los tipos de Cypress.
    globals: false,
    // Los tests de RegisterPage tardan de 2 a 4 s con userEvent y, con la cobertura de v8 y varios
    // workers de jsdom (o en un runner de CI lento), se acercaban al límite por defecto de 5 s.
    testTimeout: 15_000,
    setupFiles: ['src/setupTests.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['cypress/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // Exclusiones (criterio de design.md D8): tipos, tests, setup de tests, los tipos de la API
      // generados desde docs/api-spec.yml, los helpers de test y el punto de entrada main.tsx, que no puede contener
      // lógica (solo monta <App />).
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/setupTests.ts',
        'src/testSupport/**',
        'src/api/generated/**',
        'src/main.tsx',
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
