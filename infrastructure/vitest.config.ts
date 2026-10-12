import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Sintetizar un stack con NodejsFunction lanza esbuild y puede tardar más que el límite por defecto.
    testTimeout: 60_000,
  },
});
