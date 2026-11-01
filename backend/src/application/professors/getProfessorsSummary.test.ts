import { describe, expect, it, vi } from 'vitest';
import type { ProfessorSubject } from '../../domain/assignment/courseAssignments.js';
import type {
  ProfessorsSummarySnapshot,
  SummaryCourse,
  SummaryProfessor,
} from '../../domain/professor/professorsSummaryRepository.js';
import type { TeachingCalendar } from '../../domain/professor/teachingLoad.js';
import { GetProfessorsSummary } from './getProfessorsSummary.js';

/** Cinco sesiones de 60 minutos al día. */
const primaria: TeachingCalendar = {
  id: 'cal-1',
  name: 'Primaria',
  sessions: [
    { startMinute: 540, endMinute: 600 },
    { startMinute: 600, endMinute: 660 },
    { startMinute: 660, endMinute: 720 },
    { startMinute: 720, endMinute: 780 },
    { startMinute: 780, endMinute: 840 },
  ],
};

const course = (
  id: string,
  name: string,
  calendar: TeachingCalendar | null,
  classCount: number,
  subjects: SummaryCourse['subjects'] = [],
): SummaryCourse => ({ id, name, calendar, classCount, subjects });

const given = (
  subjectName: string,
  courseId: string,
  courseName: string,
  className: string,
  sessionsPerWeek: number,
): ProfessorSubject => ({
  subjectId: `s-${subjectName}`,
  subjectName,
  courseId,
  courseName,
  classId: `k-${courseId}-${className}`,
  className,
  sessionsPerWeek,
});

const professor = (
  id: string,
  firstName: string,
  lastName: string,
  subjects: ProfessorSubject[] = [],
  unavailable: SummaryProfessor['unavailable'] = [],
): SummaryProfessor => ({ id, firstName, lastName, subjects, unavailable });

function summaryOf(snapshot: ProfessorsSummarySnapshot) {
  const read = vi.fn().mockResolvedValue(snapshot);
  const useCase = new GetProfessorsSummary({ professorsSummaryRepository: { read } });
  return { read, useCase };
}

describe('GetProfessorsSummary', () => {
  it('reads the school of the identity and answers the maximum of 23 hours in minutes', async () => {
    const { read, useCase } = summaryOf({ professors: [], courses: [] });

    const summary = await useCase.execute({ schoolId: 'school-1' });

    expect(read).toHaveBeenCalledExactlyOnceWith('school-1');
    expect(summary).toEqual({ maxTeachingMinutes: 1380, professors: [], unassigned: [] });
  });

  it('calculates the load of every professor, also of the one without assignments', async () => {
    const { useCase } = summaryOf({
      professors: [
        professor('p-luis', 'Luis', 'Ruiz'),
        professor('p-ana', 'Ana', 'García', [given('Lengua', 'c-1', '1º Primaria', 'A', 5)]),
      ],
      courses: [course('c-1', '1º Primaria', primaria, 1, [])],
    });

    const { professors } = await useCase.execute({ schoolId: 'school-1' });

    expect(professors).toEqual([
      {
        id: 'p-ana',
        firstName: 'Ana',
        lastName: 'García',
        subjects: [given('Lengua', 'c-1', '1º Primaria', 'A', 5)],
        courses: [{ id: 'c-1', name: '1º Primaria' }],
        sessionsPerWeek: 5,
        minMinutes: 300,
        maxMinutes: 300,
        status: 'FITS',
        warnings: [],
      },
      {
        id: 'p-luis',
        firstName: 'Luis',
        lastName: 'Ruiz',
        subjects: [],
        courses: [],
        sessionsPerWeek: 0,
        minMinutes: 0,
        maxMinutes: 0,
        status: 'NO_LOAD',
        warnings: [],
      },
    ]);
  });

  it('orders the professors by last name and then first name, in the Spanish way', async () => {
    const { useCase } = summaryOf({
      professors: [
        professor('p-3', 'Zoe', 'Álvarez'),
        professor('p-2', 'Luis', 'Perez'),
        professor('p-1', 'Ana', 'Perez'),
        professor('p-0', 'Eva', 'Zapata'),
      ],
      courses: [],
    });

    const { professors } = await useCase.execute({ schoolId: 'school-1' });

    expect(professors.map(({ id }) => id)).toEqual(['p-3', 'p-1', 'p-2', 'p-0']);
  });

  it('orders the subjects as the list of professors and the courses by name with natural numbers', async () => {
    const { useCase } = summaryOf({
      professors: [
        professor('p-1', 'Eva', 'Pérez', [
          given('Mates', 'c-10', '10º Primaria', 'A', 1),
          given('Lengua', 'c-10', '10º Primaria', 'A', 1),
          given('Lengua', 'c-2', '2º Primaria', 'A', 1),
        ]),
      ],
      courses: [course('c-10', '10º Primaria', null, 1), course('c-2', '2º Primaria', null, 1)],
    });

    const [eva] = (await useCase.execute({ schoolId: 'school-1' })).professors;

    expect(
      eva?.subjects.map(({ subjectName, courseName }) => `${subjectName} ${courseName}`),
    ).toEqual(['Lengua 2º Primaria', 'Lengua 10º Primaria', 'Mates 10º Primaria']);
    expect(eva?.courses.map(({ name }) => name)).toEqual(['2º Primaria', '10º Primaria']);
    expect(eva?.sessionsPerWeek).toBe(3);
    expect(eva?.warnings).toEqual([
      {
        code: 'COURSE_WITHOUT_CALENDAR',
        course: { id: 'c-2', name: '2º Primaria' },
        assignmentCount: 1,
      },
      {
        code: 'COURSE_WITHOUT_CALENDAR',
        course: { id: 'c-10', name: '10º Primaria' },
        assignmentCount: 2,
      },
    ]);
  });

  it('uses the unavailable intervals of the professor to warn that the availability is not enough', async () => {
    const { useCase } = summaryOf({
      professors: [
        professor(
          'p-1',
          'Ana',
          'García',
          [given('Lengua', 'c-1', '1º Primaria', 'A', 22)],
          [{ dayOfWeek: 1, startMinute: 540, endMinute: 840 }],
        ),
      ],
      courses: [course('c-1', '1º Primaria', primaria, 1)],
    });

    const [ana] = (await useCase.execute({ schoolId: 'school-1' })).professors;

    expect(ana?.warnings).toEqual([
      {
        code: 'AVAILABILITY_INSUFFICIENT',
        calendar: { id: 'cal-1', name: 'Primaria' },
        sessions: 22,
        available: 20,
      },
    ]);
  });

  it('counts the cells without professor of every course and leaves out the complete ones', async () => {
    const { useCase } = summaryOf({
      professors: [],
      courses: [
        course('c-2', '2º Primaria', primaria, 2, [{ subjectId: 's-1', assignmentCount: 2 }]),
        course('c-1', '1º Primaria', primaria, 3, [
          { subjectId: 's-1', assignmentCount: 1 },
          { subjectId: 's-2', assignmentCount: 3 },
          { subjectId: 's-3', assignmentCount: 0 },
        ]),
        course('c-10', '10º Primaria', null, 2, [{ subjectId: 's-1', assignmentCount: 1 }]),
        course('c-0', 'Sin clases', primaria, 0, [{ subjectId: 's-1', assignmentCount: 0 }]),
        course('c-9', 'Sin asignaturas', primaria, 4),
      ],
    });

    const { unassigned } = await useCase.execute({ schoolId: 'school-1' });

    expect(unassigned).toEqual([
      { courseId: 'c-1', courseName: '1º Primaria', missingCount: 5 },
      { courseId: 'c-10', courseName: '10º Primaria', missingCount: 1 },
    ]);
  });

  it('lets a database failure reach the caller', async () => {
    const failure = new Error('database down');
    const useCase = new GetProfessorsSummary({
      professorsSummaryRepository: { read: vi.fn().mockRejectedValue(failure) },
    });

    await expect(useCase.execute({ schoolId: 'school-1' })).rejects.toBe(failure);
  });
});
