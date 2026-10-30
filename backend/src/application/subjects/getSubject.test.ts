import { describe, expect, it, vi } from 'vitest';
import type { Subject } from '../../domain/subject/subject.js';
import { SubjectNotFound } from '../../domain/subject/subjectErrors.js';
import type { SubjectRepository } from '../../domain/subject/subjectRepository.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { GetSubject } from './getSubject.js';

const subject: Subject = {
  id: 'subject-1',
  name: 'Inglés',
  code: 'ING',
  type: 'CORE',
  status: 'ACTIVE',
  description: null,
  color: 'blue',
  createdAt: new Date('2026-10-26T09:30:00Z'),
  courses: [
    { id: 'c10', name: '10º Primaria', sessionsPerWeek: 2, constraintCount: 0 },
    { id: 'c2', name: '2º Primaria', sessionsPerWeek: 3, constraintCount: 0 },
    { id: 'c1', name: '1º Primaria', sessionsPerWeek: 3, constraintCount: 0 },
  ],
};

function build(result: Subject | null | Error) {
  const findById = vi.fn<SubjectRepository['findById']>();
  if (result instanceof Error) {
    findById.mockRejectedValue(result);
  } else {
    findById.mockResolvedValue(result);
  }
  return { findById, useCase: new GetSubject({ subjectRepository: { findById } }) };
}

describe('GetSubject', () => {
  it('asks for the subject under the school of the identity', async () => {
    const { findById, useCase } = build(subject);
    await useCase.execute({ schoolId: 'school-1', subjectId: 'subject-1' });
    expect(findById).toHaveBeenCalledExactlyOnceWith('school-1', 'subject-1');
  });

  it('returns the subject with the courses in natural order', async () => {
    const { useCase } = build(subject);
    const result = await useCase.execute({ schoolId: 'school-1', subjectId: 'subject-1' });
    expect(result.courses.map(({ name }) => name)).toEqual([
      '1º Primaria',
      '2º Primaria',
      '10º Primaria',
    ]);
    expect(result).toMatchObject({ id: 'subject-1', name: 'Inglés', code: 'ING' });
  });

  it('does not change the order of the courses the repository returned', async () => {
    const { useCase } = build(subject);
    await useCase.execute({ schoolId: 'school-1', subjectId: 'subject-1' });
    expect(subject.courses.map(({ id }) => id)).toEqual(['c10', 'c2', 'c1']);
  });

  it('returns a subject without courses', async () => {
    const { useCase } = build({ ...subject, courses: [] });
    await expect(
      useCase.execute({ schoolId: 'school-1', subjectId: 'subject-1' }),
    ).resolves.toMatchObject({ courses: [] });
  });

  it('throws SubjectNotFound when the subject is not in the school', async () => {
    const { useCase } = build(null);
    await expect(
      useCase.execute({ schoolId: 'school-1', subjectId: 'subject-9' }),
    ).rejects.toBeInstanceOf(SubjectNotFound);
  });

  it('lets a database failure through', async () => {
    const { useCase } = build(new DatabaseUnavailable(new Error('connection refused')));
    await expect(
      useCase.execute({ schoolId: 'school-1', subjectId: 'subject-1' }),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);
  });
});
