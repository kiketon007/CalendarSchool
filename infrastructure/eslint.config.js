// ESLint de la infraestructura: las mismas reglas que el backend (con información de tipos).
// El hook de pre-commit usa solo `baseConfig` por velocidad.
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Reglas sin información de tipos: rápidas, válidas para el hook de pre-commit. */
export const baseConfig = defineConfig(
  {
    ignores: ['cdk.out/**', 'coverage/**', 'assets/**', 'functions/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Las plantillas de CloudFormation que se inspeccionan en los tests son JSON sin tipo. Va en la
    // configuración base para que el hook de pre-commit y `npm run lint` coincidan.
    files: ['test/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
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
    // `recommendedTypeChecked` reactiva `no-explicit-any` y, con tipos, los accesos a las plantillas
    // de CloudFormation de los tests tampoco se comprueban.
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
);
