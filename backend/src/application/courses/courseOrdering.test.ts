import { describe, expect, it } from 'vitest';
import type { Course } from '../../domain/course/course.js';
import { byName, withSortedClasses } from './courseOrdering.js';

describe('byName', () => {
  it('puts numbers in natural order: 2º before 10º', () => {
    const sorted = [{ name: '10º' }, { name: '2º' }, { name: '1º' }].sort(byName);

    expect(sorted.map(({ name }) => name)).toEqual(['1º', '2º', '10º']);
  });

  it('ignores case and accents', () => {
    const sorted = [{ name: 'Ñ' }, { name: 'a' }, { name: 'B' }, { name: 'á' }].sort(byName);

    expect(sorted.map(({ name }) => name)).toEqual(['a', 'á', 'B', 'Ñ']);
  });
});

describe('withSortedClasses', () => {
  const course: Course = {
    id: 'c1',
    name: '1º Primaria',
    createdAt: new Date('2026-10-19T09:30:00Z'),
    studentCount: 0,
    classes: [
      { id: 'k3', name: 'C', tutor: null, studentCount: 0 },
      { id: 'k1', name: 'A', tutor: null, studentCount: 0 },
      { id: 'k2', name: 'B', tutor: null, studentCount: 0 },
    ],
  };

  it('returns the course with its classes in order, without touching the original', () => {
    const sorted = withSortedClasses(course);

    expect(sorted.classes.map(({ name }) => name)).toEqual(['A', 'B', 'C']);
    expect(course.classes.map(({ name }) => name)).toEqual(['C', 'A', 'B']);
    expect(sorted.id).toBe('c1');
    expect(sorted.createdAt).toBe(course.createdAt);
  });
});
