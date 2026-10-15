import { defineConfig } from 'cypress';
import { setUserStatus } from '../scripts/e2eData.mjs';

// E2E contra el build servido con `vite preview` (puerto 4173), que hace de proxy de `/api`
// hacia el backend de E2E. El script scripts/e2e.mjs arranca ambos antes de ejecutar Cypress.
export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4173',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: false,
    video: false,
    setupNodeEvents(on) {
      on('task', {
        /**
         * Cambia el estado de un usuario en la base de test, para preparar una cuenta suspendida (la
         * aplicación aún no tiene cómo hacerlo: US02_b). `scripts/e2e.mjs` pasa la URL en
         * `E2E_DATABASE_URL`; `setUserStatus` solo actúa sobre bases cuyo nombre termina en `_test`.
         */
        setUserStatus({
          email,
          status,
        }: {
          email: string;
          status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
        }) {
          const connectionString = process.env.E2E_DATABASE_URL;
          if (!connectionString) {
            throw new Error('Falta E2E_DATABASE_URL: ejecuta el E2E con `npm run test:e2e`');
          }
          return setUserStatus(connectionString, email, status);
        },
      });
    },
    // Por defecto Cypress elimina la CSP entera. Con `true` quitaría además default-src,
    // script-src, frame-src y form-action, justo las que protegen contra scripts ajenos; el array
    // las conserva. `frame-ancestors` lo elimina siempre y solo se comprueba con la cabecera.
    experimentalCspAllowList: [
      'default-src',
      'child-src',
      'frame-src',
      'script-src',
      'script-src-elem',
      'form-action',
    ],
  },
});
