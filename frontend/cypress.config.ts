import { defineConfig } from 'cypress';

// E2E contra el build servido con `vite preview` (puerto 4173), que hace de proxy de `/api`
// hacia el backend de E2E. El script scripts/e2e.mjs arranca ambos antes de ejecutar Cypress.
export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4173',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: false,
    video: false,
  },
});
