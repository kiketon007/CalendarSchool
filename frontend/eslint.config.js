// ESLint del frontend (design.md D9). `npm run lint` usa esta configuración completa, con reglas
// que necesitan información de tipos; el hook de pre-commit usa solo `baseConfig` por velocidad.
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import pluginCypress from 'eslint-plugin-cypress';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Reglas sin información de tipos: rápidas, válidas para el hook de pre-commit. */
export const baseConfig = defineConfig(
  {
    ignores: ['dist/**', 'coverage/**', 'cypress/screenshots/**', 'cypress/videos/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    // react-refresh: los ficheros de componentes solo exportan componentes (recarga en caliente).
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['*.config.{ts,js}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Las reglas y globales de Cypress solo aplican a sus specs, nunca al código de la app.
    files: ['cypress/**/*.ts'],
    extends: [pluginCypress.configs.recommended],
  },
  {
    rules: {
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
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  prettier,
);
