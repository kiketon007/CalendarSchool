import { describe, expect, it } from 'vitest';
import { CourseChanged, ProfessorAlreadyTutor, TutorNotFound } from './courseErrors.js';
import {
  isEmptyPlan,
  planCourseUpdate,
  type CurrentCourse,
  type RequestedClass,
  type RequestedTutor,
} from './courseUpdate.js';

const current: CurrentCourse = {
  name: '1º Primaria',
  normalizedName: '1º primaria',
  classes: [
    { id: 'a', name: 'A', normalizedName: 'a', tutorId: 'p1' },
    { id: 'b', name: 'B', normalizedName: 'b', tutorId: 'p2' },
    { id: 'c', name: 'C', normalizedName: 'c', tutorId: null },
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

    expect(plan).toEqual({
      removed: [],
      renamed: [],
      created: [],
      courseRenamed: false,
      tutorsChanged: [],
    });
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
      tutorsChanged: [],
    });
  });

  it('throws CourseChanged when a requested id is not a class of the course', () => {
    const requested = unchanged();
    requested.classes[1] = { id: 'gone', existing: true, name: 'B', normalizedName: 'b' };

    expect(() => planCourseUpdate(current, requested)).toThrow(CourseChanged);
  });
});

/** Profesores que existen en el colegio: Ana (p1) tutoriza `a`, Luis (p2) `b`, Eva (p3) está libre y Pau (p9) tutoriza una clase de otro curso. */
const tutors = new Map<string, RequestedTutor>([
  ['p1', { id: 'p1', tutoredClassId: 'a' }],
  ['p2', { id: 'p2', tutoredClassId: 'b' }],
  ['p3', { id: 'p3', tutoredClassId: null }],
  ['p9', { id: 'p9', tutoredClassId: 'other-course-class' }],
]);

/** El estado sin cambios, con el `tutorId` pedido en las clases indicadas. */
function withTutors(wanted: Record<string, string | null>): EditableRequest {
  const request = unchanged();
  request.classes = request.classes.map((schoolClass) =>
    schoolClass.id in wanted ? { ...schoolClass, tutorId: wanted[schoolClass.id] } : schoolClass,
  );
  return request;
}

describe('planCourseUpdate: tutors', () => {
  it('does not change any tutor when tutorId is omitted', () => {
    const plan = planCourseUpdate(current, unchanged(), tutors);

    expect(plan.tutorsChanged).toEqual([]);
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it('does not count the same tutor as a change', () => {
    const plan = planCourseUpdate(current, withTutors({ a: 'p1', b: 'p2', c: null }), tutors);

    expect(plan.tutorsChanged).toEqual([]);
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it('assigns a free professor to a class without tutor', () => {
    const plan = planCourseUpdate(current, withTutors({ c: 'p3' }), tutors);

    expect(plan.tutorsChanged).toEqual([{ classId: 'c', tutorId: 'p3' }]);
    expect(isEmptyPlan(plan)).toBe(false);
  });

  it('removes the tutor of a class with null', () => {
    const plan = planCourseUpdate(current, withTutors({ a: null }), tutors);

    expect(plan.tutorsChanged).toEqual([{ classId: 'a', tutorId: null }]);
  });

  it('changes the tutor of a class to a free professor', () => {
    const plan = planCourseUpdate(current, withTutors({ a: 'p3' }), tutors);

    expect(plan.tutorsChanged).toEqual([{ classId: 'a', tutorId: 'p3' }]);
  });

  it('moves a professor to another class of the course when the first class is freed', () => {
    const plan = planCourseUpdate(current, withTutors({ a: null, c: 'p1' }), tutors);

    expect(plan.tutorsChanged).toEqual([
      { classId: 'a', tutorId: null },
      { classId: 'c', tutorId: 'p1' },
    ]);
  });

  it('swaps the tutors of two classes', () => {
    const plan = planCourseUpdate(current, withTutors({ a: 'p2', b: 'p1' }), tutors);

    expect(plan.tutorsChanged).toEqual([
      { classId: 'a', tutorId: 'p2' },
      { classId: 'b', tutorId: 'p1' },
    ]);
  });

  it('gives a new class the tutor of a class that is removed in the same request', () => {
    const requested = unchanged();
    requested.classes = [
      requested.classes[1] as RequestedClass,
      requested.classes[2] as RequestedClass,
      { id: 'd', existing: false, name: 'D', normalizedName: 'd', tutorId: 'p1' },
    ];

    const plan = planCourseUpdate(current, requested, tutors);

    expect(plan.removed).toEqual(['a']);
    expect(plan.tutorsChanged).toEqual([{ classId: 'd', tutorId: 'p1' }]);
  });

  it('does not count null in a new class as a change', () => {
    const requested = unchanged();
    requested.classes.push({
      id: 'd',
      existing: false,
      name: 'D',
      normalizedName: 'd',
      tutorId: null,
    });

    expect(planCourseUpdate(current, requested, tutors).tutorsChanged).toEqual([]);
  });

  it('throws TutorNotFound with the position of the class when the professor is not in the school', () => {
    const error = (() => {
      try {
        planCourseUpdate(current, withTutors({ c: 'unknown' }), tutors);
      } catch (caught) {
        return caught;
      }
      return undefined;
    })();

    expect(error).toBeInstanceOf(TutorNotFound);
    expect((error as TutorNotFound).classIndex).toBe(2);
  });

  it('throws ProfessorAlreadyTutor for a professor who tutors a class of another course', () => {
    expect(() => planCourseUpdate(current, withTutors({ c: 'p9' }), tutors)).toThrow(
      ProfessorAlreadyTutor,
    );
  });

  it('throws ProfessorAlreadyTutor when the class of the professor in this course is not freed', () => {
    expect(() => planCourseUpdate(current, withTutors({ c: 'p1' }), tutors)).toThrow(
      ProfessorAlreadyTutor,
    );
  });

  it('throws ProfessorAlreadyTutor when the class of the professor keeps them in the same request', () => {
    expect(() => planCourseUpdate(current, withTutors({ a: 'p1', c: 'p1' }), tutors)).toThrow(
      ProfessorAlreadyTutor,
    );
  });

  it('throws CourseChanged before looking at the professors', () => {
    const requested = withTutors({ c: 'unknown' });
    requested.classes[0] = { id: 'gone', existing: true, name: 'A', normalizedName: 'a' };

    expect(() => planCourseUpdate(current, requested, tutors)).toThrow(CourseChanged);
  });

  it('plans tutors together with the other changes', () => {
    const requested = withTutors({ a: 'p3' });
    requested.classes[1] = {
      id: 'b',
      existing: true,
      name: 'Grupo B',
      normalizedName: 'grupo b',
      tutorId: null,
    };

    const plan = planCourseUpdate(current, requested, tutors);

    expect(plan.renamed.map(({ id }) => id)).toEqual(['b']);
    expect(plan.tutorsChanged).toEqual([
      { classId: 'a', tutorId: 'p3' },
      { classId: 'b', tutorId: null },
    ]);
  });
});
