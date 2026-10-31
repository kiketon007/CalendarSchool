import { describe, expect, it } from 'vitest';
import { matchesPersonSearch } from './personSearch';

const ana = { firstName: 'Ana', lastName: 'García' };
const joseMaria = { firstName: 'José María', lastName: 'García-López' };
const mary = { firstName: 'Mary', lastName: "O'Neill" };
const inigo = { firstName: 'Íñigo', lastName: 'Núñez' };

describe('matchesPersonSearch', () => {
  it.each([
    ['the first name', 'ana'],
    ['the last name', 'garcia'],
    ['part of the first name', 'an'],
    ['part of the last name', 'arc'],
  ])('finds by %s', (_label, query) => {
    expect(matchesPersonSearch(ana, query)).toBe(true);
  });

  it.each(['GARCIA', 'garcía', 'García', '  garcia  ', 'GaRcÍa'])(
    'ignores case, accents and extra spaces in "%s"',
    (query) => {
      expect(matchesPersonSearch(ana, query)).toBe(true);
    },
  );

  it('searches "ñ" as "n" on both sides', () => {
    expect(matchesPersonSearch(inigo, 'inigo nunez')).toBe(true);
    expect(matchesPersonSearch(inigo, 'ñuñez')).toBe(true);
  });

  it.each(['ana garcia', 'garcia ana', 'gar an', '  ana    garcia '])(
    'finds with several words in any order: "%s"',
    (query) => {
      expect(matchesPersonSearch(ana, query)).toBe(true);
    },
  );

  it.each(['ana perez', 'luis garcia', 'anabel'])(
    'does not find when a word is missing: "%s"',
    (query) => {
      expect(matchesPersonSearch(ana, query)).toBe(false);
    },
  );

  it.each(['garcía-lópez', 'lopez', 'garcia-lopez jose', 'maria jose'])(
    'treats hyphens as normal text: "%s"',
    (query) => {
      expect(matchesPersonSearch(joseMaria, query)).toBe(true);
    },
  );

  it('treats apostrophes as normal text', () => {
    expect(matchesPersonSearch(mary, "o'neill")).toBe(true);
    expect(matchesPersonSearch(mary, 'oneill')).toBe(false);
  });

  it.each(['', '   '])('matches every professor with the empty query "%s"', (query) => {
    expect(matchesPersonSearch(ana, query)).toBe(true);
  });

  it.each(['.*', '(', 'a+', '[a]'])('treats "%s" as text, not as a regular expression', (query) => {
    expect(matchesPersonSearch(ana, query)).toBe(false);
  });
});

describe('matchesPersonSearch with subjects', () => {
  const eva = {
    firstName: 'Eva',
    lastName: 'Ruiz',
    subjects: [{ subjectName: 'Inglés' }, { subjectName: 'Educación Física' }],
  };

  it.each([['ingl'], ['INGLES'], ['fisica'], ['educación']])(
    'finds a professor by the subject "%s"',
    (query) => {
      expect(matchesPersonSearch(eva, query)).toBe(true);
    },
  );

  it('mixes the name and the subject in any order', () => {
    expect(matchesPersonSearch(eva, 'eva ingles')).toBe(true);
    expect(matchesPersonSearch(eva, 'ingles ruiz')).toBe(true);
  });

  it('requires every word: a subject of another professor does not count', () => {
    expect(matchesPersonSearch(eva, 'eva lengua')).toBe(false);
    expect(
      matchesPersonSearch({ firstName: 'Ana', lastName: 'García', subjects: [] }, 'ingles'),
    ).toBe(false);
  });

  it('still works for a person without subjects, as the students', () => {
    expect(matchesPersonSearch({ firstName: 'Ana', lastName: 'García' }, 'garcia')).toBe(true);
    expect(matchesPersonSearch({ firstName: 'Ana', lastName: 'García' }, 'ingles')).toBe(false);
  });
});
