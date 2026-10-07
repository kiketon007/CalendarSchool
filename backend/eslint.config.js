// ESLint del backend (design.md D9). `npm run lint` usa esta configuración completa, con reglas
// que necesitan información de tipos; el hook de pre-commit usa solo `baseConfig` por velocidad.
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Reglas sin información de tipos: rápidas, válidas para el hook de pre-commit. */
export const baseConfig = defineConfig(
  {
    ignores: ['dist/**', 'coverage/**', 'src/infrastructure/prisma/generated/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // Variables intencionadamente sin usar con prefijo `_` (p. ej. parámetros de Express).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },
  prettier,
);

export default defineConfig(
  baseConfig,
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // En los tests, los matchers asimétricos de Vitest (expect.any, ...) y el `body` de Supertest
    // están tipados como `any`: estas reglas solo generarían ruido.
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  prettier,
);
