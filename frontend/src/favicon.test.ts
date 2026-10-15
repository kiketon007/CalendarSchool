import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const frontendRoot = resolve(__dirname, '..');
const indexHtml = readFileSync(resolve(frontendRoot, 'index.html'), 'utf-8');

describe('favicon', () => {
  it.each(['/favicon.ico', '/icon-192.png'])(
    'links %s from index.html and ships the file',
    (href) => {
      expect(indexHtml).toContain(`rel="icon"`);
      expect(indexHtml).toContain(`href="${href}"`);
      expect(existsSync(resolve(frontendRoot, 'public', href.slice(1)))).toBe(true);
    },
  );
});
