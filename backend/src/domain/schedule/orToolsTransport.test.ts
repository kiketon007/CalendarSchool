import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fixtures from '../../../../test-fixtures/schedule-generation.json' with { type: 'json' };
import {
  problemOf,
  professor,
  subject,
  type FixtureCalendars,
} from '../../../test/support/scheduleProblemFixtures.js';
import { generationInputOf } from './generationInput.js';
import { isOrToolsResponse, toOrToolsRequest } from './orToolsTransport.js';
import { MAX_TEACHING_MINUTES } from './scheduleSolver.js';

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const calendars = (fixtures as unknown as { calendars: FixtureCalendars }).calendars;

/** Una lección de 3 sesiones sueltas con nombres reconocibles, para comprobar que no viajan. */
const input = generationInputOf(
  problemOf(
    calendars,
    [
      {
        name: 'Curso Secreto',
        calendar: 'Corto',
        classes: ['Clase Secreta'],
        subjects: [subject('Asignatura Secreta', 3, { 'Clase Secreta': 'Profesor Secreto' })],
      },
    ],
    [professor('Profesor Secreto')],
  ),
  (a, b) => collator.compare(a, b),
);

const solved = (placements: unknown[]) => ({ version: 1, status: 'solved', placements });
const place = (unitIndex: number, dayOfWeek: number, firstSession: number) => ({
  unitIndex,
  dayOfWeek,
  firstSession,
});
const valid = solved([place(0, 1, 1), place(1, 2, 1), place(2, 3, 1)]);

describe('toOrToolsRequest', () => {
  it('sends the cells, the lessons and the units with their placements, in the version 1', () => {
    const request = toOrToolsRequest(input, 60);

    expect(request.version).toBe(1);
    expect(request.limitSeconds).toBe(60);
    expect(request.courses).toHaveLength(1);
    expect(request.courses[0]?.cells[0]).toEqual({
      sessionNumber: 1,
      startMinute: expect.any(Number),
      endMinute: expect.any(Number),
    });
    expect(request.lessons).toEqual([
      expect.objectContaining({ index: 0, maxPerDay: 1, blockSize: null }),
    ]);
    expect(request.units).toHaveLength(3);
    expect(request.units[0]?.placements.length).toBeGreaterThan(0);
  });

  it('does not send any name field nor the preferred cells', () => {
    const request = toOrToolsRequest(input, 60);
    const keys = new Set<string>();
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(collect);
      } else if (typeof value === 'object' && value !== null) {
        Object.entries(value).forEach(([key, nested]) => {
          keys.add(key);
          collect(nested);
        });
      }
    };
    collect(request);

    expect(
      [...keys].filter((key) => /name|preferred|forbidden|unavailable|score/i.test(key)),
    ).toEqual([]);
    // El id de la asignatura ni su nombre salen: no hacen falta para resolver.
    expect(JSON.stringify(request)).not.toContain('Asignatura Secreta');
  });
});

describe('isOrToolsResponse', () => {
  it.each([
    ['solved', valid],
    ['infeasible', { version: 1, status: 'infeasible' }],
    ['timeout', { version: 1, status: 'timeout' }],
    ['cancelled', { version: 1, status: 'cancelled' }],
  ])('accepts %s', (_name, response) => {
    expect(isOrToolsResponse(response, input)).toBe(true);
  });

  it.each([
    ['null', null],
    ['text', 'solved'],
    ['an array', []],
    ['another version', { ...valid, version: 2 }],
    ['an unknown status', { version: 1, status: 'ok' }],
    ['solved without placements', { version: 1, status: 'solved' }],
    ['placements that are not a list', { ...valid, placements: 'x' }],
    ['a placement missing', solved([place(0, 1, 1), place(1, 2, 1)])],
    ['a repeated unit', solved([place(0, 1, 1), place(0, 2, 1), place(2, 3, 1)])],
    ['a unit out of range', solved([place(0, 1, 1), place(1, 2, 1), place(3, 3, 1)])],
    [
      'a placement outside the domain of its unit',
      solved([place(0, 1, 1), place(1, 2, 1), place(2, 6, 1)]),
    ],
    [
      'a placement with text',
      solved([place(0, 1, 1), place(1, 2, 1), { ...place(2, 3, 1), dayOfWeek: '3' }]),
    ],
    ['a decimal', solved([place(0, 1, 1), place(1, 2, 1), place(2, 3, 1.5)])],
  ])('rejects %s', (_name, response) => {
    expect(isOrToolsResponse(response, input)).toBe(false);
  });
});

describe('the Python solver', () => {
  it('uses the same maximum teaching minutes as the domain (HC7)', () => {
    const source = readFileSync(
      new URL('../../../../solver-ortools/solver.py', import.meta.url),
      'utf8',
    );

    expect(source).toMatch(new RegExp(`^MAX_TEACHING_MINUTES = ${MAX_TEACHING_MINUTES}$`, 'm'));
  });
});
