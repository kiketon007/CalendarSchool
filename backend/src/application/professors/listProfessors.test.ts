import { describe, expect, it, vi } from 'vitest';
import type { Professor } from '../../domain/professor/professor.js';
import type { ProfessorRepository } from '../../domain/professor/professorRepository.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { ListProfessors } from './listProfessors.js';

function professor(id: string, firstName: string, lastName: string): Professor {
  return { id, firstName, lastName, position: null, subjects: [], tutoredClass: null };
}

function listProfessorsWith(professors: Professor[]) {
  const listBySchool = vi.fn<ProfessorRepository['listBySchool']>().mockResolvedValue(professors);
  return {
    listBySchool,
    useCase: new ListProfessors({ professorRepository: { listBySchool } }),
  };
}

const names = (professors: Professor[]) =>
  professors.map(({ lastName, firstName }) => `${lastName}, ${firstName}`);

describe('ListProfessors', () => {
  it('asks for the professors of the school of the identity', async () => {
    const { listBySchool, useCase } = listProfessorsWith([]);

    await useCase.execute({ schoolId: 'school-1' });

    expect(listBySchool).toHaveBeenCalledExactlyOnceWith('school-1');
  });

  it('returns an empty list when the school has no professors', async () => {
    const { useCase } = listProfessorsWith([]);

    await expect(useCase.execute({ schoolId: 'school-1' })).resolves.toEqual([]);
  });

  it('orders by last name and then by first name', async () => {
    const { useCase } = listProfessorsWith([
      professor('p1', 'Luis', 'Pérez'),
      professor('p2', 'Ana', 'García'),
      professor('p3', 'Beatriz', 'García'),
      professor('p4', 'Zoe', 'Abad'),
    ]);

    const professors = await useCase.execute({ schoolId: 'school-1' });

    expect(names(professors)).toEqual([
      'Abad, Zoe',
      'García, Ana',
      'García, Beatriz',
      'Pérez, Luis',
    ]);
  });

  it('compares in Spanish, ignoring case and accents: Álvaro goes before Ana', async () => {
    const { useCase } = listProfessorsWith([
      professor('p1', 'Ana', 'García'),
      professor('p2', 'Álvaro', 'García'),
      professor('p3', 'luis', 'garcía'),
      professor('p4', 'Ñandú', 'Navarro'),
      professor('p5', 'Nuria', 'Navarro'),
    ]);

    const professors = await useCase.execute({ schoolId: 'school-1' });

    expect(names(professors)).toEqual([
      'García, Álvaro',
      'García, Ana',
      'garcía, luis',
      'Navarro, Nuria',
      'Navarro, Ñandú',
    ]);
  });

  it('keeps the class of each professor and does not modify what the repository returned', async () => {
    const tutoring = professor('p1', 'Ana', 'García');
    const withClass: Professor = {
      ...tutoring,
      tutoredClass: { id: 'k1', name: 'A', courseId: 'c1', courseName: '1º Primaria' },
    };
    const original = [professor('p0', 'Zoe', 'Zurita'), withClass];
    const { useCase } = listProfessorsWith(original);

    const professors = await useCase.execute({ schoolId: 'school-1' });

    expect(professors[0]).toEqual(withClass);
    expect(original.map(({ id }) => id)).toEqual(['p0', 'p1']);
  });

  it('lets a database failure through', async () => {
    const listBySchool = vi
      .fn<ProfessorRepository['listBySchool']>()
      .mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));
    const useCase = new ListProfessors({ professorRepository: { listBySchool } });

    await expect(useCase.execute({ schoolId: 'school-1' })).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );
  });
});
