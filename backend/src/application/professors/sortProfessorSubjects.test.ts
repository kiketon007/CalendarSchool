import { describe, expect, it, vi } from 'vitest';
import type { ProfessorSubject } from '../../domain/assignment/courseAssignments.js';
import type { Professor } from '../../domain/professor/professor.js';
import type { ProfessorRepository } from '../../domain/professor/professorRepository.js';
import { GetProfessor } from './getProfessor.js';
import { ListProfessors } from './listProfessors.js';
import { withSortedSubjects } from './sortProfessorSubjects.js';

const subject = (
  subjectName: string,
  courseName: string,
  className: string,
  sessionsPerWeek = 3,
): ProfessorSubject => ({
  subjectId: `s-${subjectName}`,
  subjectName,
  courseId: `c-${courseName}`,
  courseName,
  classId: `k-${courseName}-${className}`,
  className,
  sessionsPerWeek,
});

const professor = (subjects: ProfessorSubject[]): Professor => ({
  id: 'p1',
  firstName: 'Ana',
  lastName: 'García',
  position: null,
  subjects,
  unavailableCount: 0,
  tutoredClass: null,
});

/** Desordenadas a propósito. */
const shuffled = [
  subject('Lengua', '2º Primaria', 'B'),
  subject('Inglés', '10º Primaria', 'A'),
  subject('Inglés', '2º Primaria', 'B'),
  subject('Inglés', '2º Primaria', 'A'),
  subject('Álgebra', '1º Primaria', 'A'),
];

const labels = (subjects: readonly ProfessorSubject[]) =>
  subjects.map(
    ({ subjectName, courseName, className }) => `${subjectName} ${courseName} ${className}`,
  );

describe('withSortedSubjects', () => {
  it('sorts by subject, then by course in natural order and then by class, with the Spanish comparison', () => {
    expect(labels(withSortedSubjects(professor(shuffled)).subjects)).toEqual([
      'Álgebra 1º Primaria A',
      'Inglés 2º Primaria A',
      'Inglés 2º Primaria B',
      'Inglés 10º Primaria A',
      'Lengua 2º Primaria B',
    ]);
  });

  it('keeps the rest of the professor and does not modify the original', () => {
    const original = professor(shuffled);
    const before = structuredClone(original);

    const sorted = withSortedSubjects(original);

    expect(original).toEqual(before);
    expect({ ...sorted, subjects: [] }).toEqual({ ...original, subjects: [] });
  });

  it('keeps an empty list as it is', () => {
    expect(withSortedSubjects(professor([])).subjects).toEqual([]);
  });
});

describe('the use cases that return professors', () => {
  it('ListProfessors returns each professor with the subjects sorted', async () => {
    const listBySchool = vi
      .fn<ProfessorRepository['listBySchool']>()
      .mockResolvedValue([professor(shuffled)]);

    const [listed] = await new ListProfessors({ professorRepository: { listBySchool } }).execute({
      schoolId: 'school-1',
    });

    expect(labels(listed?.subjects ?? [])[0]).toBe('Álgebra 1º Primaria A');
    expect(listed?.subjects).toHaveLength(5);
  });

  it('GetProfessor returns the professor with the subjects sorted', async () => {
    const findById = vi
      .fn<ProfessorRepository['findById']>()
      .mockResolvedValue(professor(shuffled));

    const found = await new GetProfessor({ professorRepository: { findById } }).execute({
      schoolId: 'school-1',
      professorId: 'p1',
    });

    expect(labels(found.subjects).at(-1)).toBe('Lengua 2º Primaria B');
  });
});
