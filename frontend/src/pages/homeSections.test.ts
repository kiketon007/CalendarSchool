import { describe, expect, it } from 'vitest';
import { WORKSPACE_LINKS } from '../components/navigation';
import en from '../i18n/en.json';
import es from '../i18n/es.json';
import { HOME_SECTIONS } from './homeSections';

/** Lee una clave con puntos (`header.courses`) de un fichero de traducciones. */
function textOf(translations: object, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      translations,
    );
}

const navigationLinks = WORKSPACE_LINKS.filter((link) => link.to !== '/onboarding');

describe('HOME_SECTIONS', () => {
  it('lists the sections in the order of the home page, schedules first', () => {
    expect(HOME_SECTIONS.map((section) => section.to)).toEqual([
      '/horarios',
      '/cursos',
      '/profesores',
      '/alumnos',
      '/calendarios',
      '/asignaturas',
      '/reglas',
    ]);
  });

  it('links to the same destinations as the sidebar, except Home', () => {
    expect([...HOME_SECTIONS.map((section) => section.to)].sort()).toEqual(
      navigationLinks.map((link) => link.to).sort(),
    );
  });

  it.each([
    ['es', es],
    ['en', en],
  ])('names each card as the sidebar names its section (%s)', (_language, translations) => {
    for (const section of HOME_SECTIONS) {
      const link = navigationLinks.find((candidate) => candidate.to === section.to);
      expect(textOf(translations, `onboarding.features.${section.key}.name`)).toBe(
        textOf(translations, link?.labelKey ?? ''),
      );
    }
  });

  it('uses the icon of the sidebar for each section', () => {
    for (const section of HOME_SECTIONS) {
      expect(section.Icon).toBe(navigationLinks.find((link) => link.to === section.to)?.Icon);
    }
  });

  it('has a description in both languages for every section', () => {
    for (const section of HOME_SECTIONS) {
      for (const translations of [es, en]) {
        expect(textOf(translations, `onboarding.features.${section.key}.description`)).toEqual(
          expect.any(String),
        );
      }
    }
  });

  it('rotates the four tones of the theme', () => {
    expect(HOME_SECTIONS.map((section) => section.tone)).toEqual([
      'lavender',
      'peach',
      'mint',
      'yellow',
      'lavender',
      'peach',
      'mint',
    ]);
  });
});
