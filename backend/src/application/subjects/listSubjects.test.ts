import { describe, expect, it, vi } from 'vitest';
import type { Subject } from '../../domain/subject/subject.js';
import type { SubjectRepository } from '../../domain/subject/subjectRepository.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { ListSubjects } from './listSubjects.js';

function subject(id: string, name: string, courses: [string, number][] = []): Subject {
  return {
    id,
    name,
    code: null,
    type: 'CORE',
    status: 'ACTIVE',
    description: null,
    color: 'blue',
    createdAt: new Date('2026-10-26T09:30:00Z'),
    courses: courses.map(([courseName, sessionsPerWeek], index) => ({
      id: `${id}-c${String(index)}`,
      name: courseName,
      sessionsPerWeek,
    })),
  };
}

function listSubjectsWith(subjects: Subject[]) {
  const listBySchool = vi.fn<SubjectRepository['listBySchool']>().mockResolvedValue(subjects);
  return { listBySchool, useCase: new ListSubjects({ subjectRepository: { listBySchool } }) };
}

describe('ListSubjects', () => {
  it('asks for the subjects of the school of the identity', async () => {
    const { listBySchool, useCase } = listSubjectsWith([]);

    await useCase.execute({ schoolId: 'school-1' });

    expect(listBySchool).toHaveBeenCalledExactlyOnceWith('school-1');
  });

  it('returns an empty list when the school has no subjects', async () => {
    const { useCase } = listSubjectsWith([]);

    await expect(useCase.execute({ schoolId: 'school-1' })).resolves.toEqual([]);
  });

  it('orders the subjects by name, in Spanish, without caring about capitals or accents', async () => {
    const { useCase } = listSubjectsWith([
      subject('3', 'Programación'),
      subject('1', 'inglés'),
      subject('2', 'Educación Física'),
      subject('4', 'Álgebra'),
    ]);

    const names = (await useCase.execute({ schoolId: 'school-1' })).map(({ name }) => name);

    expect(names).toEqual(['Álgebra', 'Educación Física', 'inglés', 'Programación']);
  });

  it('orders the courses of each subject naturally, so 2º comes before 10º', async () => {
    const { useCase } = listSubjectsWith([
      subject('1', 'Inglés', [
        ['10º Primaria', 1],
        ['2º Primaria', 3],
        ['1º Primaria', 2],
      ]),
    ]);

    const [first] = await useCase.execute({ schoolId: 'school-1' });

    expect(first?.courses.map(({ name, sessionsPerWeek }) => [name, sessionsPerWeek])).toEqual([
      ['1º Primaria', 2],
      ['2º Primaria', 3],
      ['10º Primaria', 1],
    ]);
  });

  it('keeps a subject whose courses were all deleted, with an empty list', async () => {
    const { useCase } = listSubjectsWith([subject('1', 'Inglés')]);

    await expect(useCase.execute({ schoolId: 'school-1' })).resolves.toEqual([
      expect.objectContaining({ name: 'Inglés', courses: [] }),
    ]);
  });

  it('does not change the order of the list it received', async () => {
    const received = [subject('2', 'Música'), subject('1', 'Inglés')];
    const { useCase } = listSubjectsWith(received);

    await useCase.execute({ schoolId: 'school-1' });

    expect(received.map(({ name }) => name)).toEqual(['Música', 'Inglés']);
  });

  it('lets a database failure through', async () => {
    const listBySchool = vi
      .fn<SubjectRepository['listBySchool']>()
      .mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));
    const useCase = new ListSubjects({ subjectRepository: { listBySchool } });

    await expect(useCase.execute({ schoolId: 'school-1' })).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );
  });
});
