import { describe, expect, it } from 'vitest';
import { CourseChanged } from './courseErrors.js';
import {
  isEmptyPlan,
  planCourseUpdate,
  type CurrentCourse,
  type RequestedClass,
} from './courseUpdate.js';

const current: CurrentCourse = {
  name: '1º Primaria',
  normalizedName: '1º primaria',
  classes: [
    { id: 'a', name: 'A', normalizedName: 'a' },
    { id: 'b', name: 'B', normalizedName: 'b' },
    { id: 'c', name: 'C', normalizedName: 'c' },
  ],
};

/** Estado pedido con las clases editables, para que cada test toque solo lo que quiere cambiar. */
interface EditableRequest {
  name: string;
  normalizedName: string;
  classes: RequestedClass[];
}

/** Mismo estado que `current`. */
function unchanged(): EditableRequest {
  return {
    name: '1º Primaria',
    normalizedName: '1º primaria',
    classes: [
      { id: 'a', existing: true, name: 'A', normalizedName: 'a' },
      { id: 'b', existing: true, name: 'B', normalizedName: 'b' },
      { id: 'c', existing: true, name: 'C', normalizedName: 'c' },
    ],
  };
}

describe('planCourseUpdate', () => {
  it('returns an empty plan when nothing changes', () => {
    const plan = planCourseUpdate(current, unchanged());

    expect(plan).toEqual({ removed: [], renamed: [], created: [], courseRenamed: false });
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it('detects a new course name', () => {
    const plan = planCourseUpdate(current, {
      ...unchanged(),
      name: '1º Primaria Tarde',
      normalizedName: '1º primaria tarde',
    });

    expect(plan.courseRenamed).toBe(true);
    expect(isEmptyPlan(plan)).toBe(false);
  });

  it('detects a course name that only changes its capitals', () => {
    const plan = planCourseUpdate(
      { ...current, name: '1º primaria' },
      { ...unchanged(), name: '1º Primaria' },
    );

    expect(plan.courseRenamed).toBe(true);
  });

  it('plans the rename of a class that keeps its id', () => {
    const requested = unchanged();
    requested.classes[0] = { id: 'a', existing: true, name: 'Grupo A', normalizedName: 'grupo a' };

    const plan = planCourseUpdate(current, requested);

    expect(plan.renamed).toEqual([
      { id: 'a', name: 'Grupo A', normalizedName: 'grupo a', normalizedNameChanged: true },
    ]);
    expect(plan.removed).toEqual([]);
    expect(plan.created).toEqual([]);
  });

  it('plans a rename that only changes capitals without changing the compared name', () => {
    const requested = unchanged();
    requested.classes[0] = { id: 'a', existing: true, name: 'a', normalizedName: 'a' };

    const plan = planCourseUpdate(current, requested);

    expect(plan.renamed).toEqual([
      { id: 'a', name: 'a', normalizedName: 'a', normalizedNameChanged: false },
    ]);
  });

  it('plans the removal of the classes that are not requested', () => {
    const requested = unchanged();
    requested.classes = requested.classes.slice(0, 1);

    const plan = planCourseUpdate(current, requested);

    expect(plan.removed).toEqual(['b', 'c']);
    expect(plan.renamed).toEqual([]);
  });

  it('plans the creation of the classes without an existing id', () => {
    const requested = unchanged();
    requested.classes.push({ id: 'd', existing: false, name: 'D', normalizedName: 'd' });

    const plan = planCourseUpdate(current, requested);

    expect(plan.created).toEqual([{ id: 'd', name: 'D', normalizedName: 'd' }]);
    expect(plan.removed).toEqual([]);
  });

  it('plans a swap of names as two renames', () => {
    const requested = unchanged();
    requested.classes[0] = { id: 'a', existing: true, name: 'B', normalizedName: 'b' };
    requested.classes[1] = { id: 'b', existing: true, name: 'A', normalizedName: 'a' };

    const plan = planCourseUpdate(current, requested);

    expect(plan.renamed.map(({ id }) => id)).toEqual(['a', 'b']);
    expect(plan.renamed.every(({ normalizedNameChanged }) => normalizedNameChanged)).toBe(true);
  });

  it('plans removing a class and creating another one with the same name', () => {
    const requested = unchanged();
    requested.classes[2] = { id: 'new', existing: false, name: 'C', normalizedName: 'c' };

    const plan = planCourseUpdate(current, requested);

    expect(plan.removed).toEqual(['c']);
    expect(plan.created).toEqual([{ id: 'new', name: 'C', normalizedName: 'c' }]);
  });

  it('plans all the kinds of change together', () => {
    const plan = planCourseUpdate(current, {
      name: '2º Primaria',
      normalizedName: '2º primaria',
      classes: [
        { id: 'a', existing: true, name: 'Grupo A', normalizedName: 'grupo a' },
        { id: 'b', existing: true, name: 'B', normalizedName: 'b' },
        { id: 'd', existing: false, name: 'D', normalizedName: 'd' },
      ],
    });

    expect(plan).toEqual({
      courseRenamed: true,
      removed: ['c'],
      renamed: [
        { id: 'a', name: 'Grupo A', normalizedName: 'grupo a', normalizedNameChanged: true },
      ],
      created: [{ id: 'd', name: 'D', normalizedName: 'd' }],
    });
  });

  it('throws CourseChanged when a requested id is not a class of the course', () => {
    const requested = unchanged();
    requested.classes[1] = { id: 'gone', existing: true, name: 'B', normalizedName: 'b' };

    expect(() => planCourseUpdate(current, requested)).toThrow(CourseChanged);
  });
});
