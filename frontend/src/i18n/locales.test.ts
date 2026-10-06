import { describe, expect, it } from 'vitest';
import en from './en.json';
import es from './es.json';

type Translations = { [key: string]: string | Translations };

/** Devuelve las claves completas (`a.b.c`) de un recurso de traducción. */
function keysOf(resource: Translations, prefix = ''): string[] {
  return Object.entries(resource).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [path] : keysOf(value, path);
  });
}

describe('translation resources', () => {
  it('es.json and en.json define exactly the same keys', () => {
    expect(keysOf(en).sort()).toEqual(keysOf(es).sort());
  });

  it('have no empty translations', () => {
    for (const resource of [es, en]) {
      const values = keysOf(resource).map((key) =>
        key.split('.').reduce<unknown>((node, part) => (node as Translations)[part], resource),
      );
      expect(values.every((value) => typeof value === 'string' && value.trim() !== '')).toBe(true);
    }
  });
});
