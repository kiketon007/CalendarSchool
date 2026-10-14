import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRIVACY_POLICY_VERSION } from './privacyPolicy.js';

const localesDirectory = resolve(import.meta.dirname, '../../../../frontend/src/i18n');

function lastUpdatedIn(locale: 'es' | 'en'): unknown {
  const texts = JSON.parse(readFileSync(resolve(localesDirectory, `${locale}.json`), 'utf8')) as {
    privacyPolicy?: { lastUpdated?: unknown };
  };
  return texts.privacyPolicy?.lastUpdated;
}

describe('PRIVACY_POLICY_VERSION', () => {
  it('is a date in YYYY-MM-DD format', () => {
    expect(PRIVACY_POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(PRIVACY_POLICY_VERSION).toISOString().slice(0, 10)).toBe(
      PRIVACY_POLICY_VERSION,
    );
  });

  it.each(['es', 'en'] as const)('matches the last update date of the %s text', (locale) => {
    expect(lastUpdatedIn(locale)).toBe(PRIVACY_POLICY_VERSION);
  });
});
