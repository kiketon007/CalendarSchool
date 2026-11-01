import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../i18n/i18n';
import { lostItemsText } from './lostItemsText';

describe('lostItemsText', () => {
  afterEach(async () => {
    await i18n.changeLanguage('es');
  });

  const textOf = (rules: number, assignments: number) =>
    lostItemsText(i18n.t, i18n.language, { rules, assignments });

  it('has nothing to say when neither rules nor assignments are lost', () => {
    expect(textOf(0, 0)).toBeNull();
  });

  it.each([
    [2, 0, 'sus 2 reglas', 2],
    [1, 0, 'su regla', 1],
    [0, 3, 'sus 3 asignaciones de profesores', 3],
    [0, 1, 'su asignación de profesor', 1],
  ])('names only what is lost: %i rules and %i assignments', (rules, assignments, items, total) => {
    expect(textOf(rules, assignments)).toEqual({ items, total });
  });

  it('joins the two pieces with the conjunction of the language', () => {
    expect(textOf(2, 3)).toEqual({
      items: 'sus 2 reglas y sus 3 asignaciones de profesores',
      total: 5,
    });
  });

  it('counts two things, so the verb goes in the plural, even if each one is single', () => {
    expect(textOf(1, 1)).toEqual({ items: 'su regla y su asignación de profesor', total: 2 });
  });

  it('uses the language it is given, with its own plurals and its own "and"', async () => {
    await i18n.changeLanguage('en');

    expect(textOf(2, 3)).toEqual({
      items: 'its 2 rules and its 3 professor assignments',
      total: 5,
    });
    expect(textOf(0, 1)).toEqual({ items: 'its professor assignment', total: 1 });
  });
});
