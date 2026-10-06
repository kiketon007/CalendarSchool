import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Número de workers de Vitest. Es también el número de esquemas `test_<n>` que crea el
 * globalSetup de integración: cada worker usa el esquema `test_<VITEST_POOL_ID>`.
 */
export const MAX_WORKERS = 4;

export default defineConfig(({ mode }) => {
  // Vitest no vuelca `.env` en process.env: se lee aquí solo lo que necesitan los tests.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    test: {
      maxWorkers: MAX_WORKERS,
      env: {
        TEST_DATABASE_URL: env.TEST_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? '',
      },
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
            exclude: ['**/*.int.test.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'integration',
            include: ['src/**/*.int.test.ts', 'test/**/*.int.test.ts'],
          },
        },
      ],
      coverage: {
        provider: 'v8',
        // La cobertura se mide sobre la unión de los proyectos unit e integration.
        include: ['src/**/*.ts'],
        // Exclusiones (criterio de design.md D8): código generado, tipos, tests y el punto de
        // entrada server.ts, que no puede contener lógica (solo loadConfig → createApp → listen).
        exclude: [
          'src/infrastructure/prisma/generated/**',
          'src/**/*.d.ts',
          'src/**/*.test.ts',
          'src/server.ts',
        ],
        thresholds: {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
      },
    },
  };
});
