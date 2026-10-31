import { describe, expect, it, vi } from 'vitest';
import type { Professor } from '../../domain/professor/professor.js';
import { ProfessorNotFound } from '../../domain/professor/professorErrors.js';
import type { ProfessorRepository } from '../../domain/professor/professorRepository.js';
import { GetProfessor } from './getProfessor.js';

const professor: Professor = {
  id: 'p1',
  firstName: 'Ana',
  lastName: 'García',
  position: 'DIRECTOR',
  subjects: [],
  unavailableCount: 0,
  tutoredClass: { id: 'c1', name: 'A', courseId: 'k1', courseName: '1º Primaria' },
};

describe('GetProfessor', () => {
  it('asks the repository for the professor of the school of the identity and returns it', async () => {
    const findById = vi.fn<ProfessorRepository['findById']>().mockResolvedValue(professor);

    const found = await new GetProfessor({ professorRepository: { findById } }).execute({
      schoolId: 'school-1',
      professorId: 'p1',
    });

    expect(found).toEqual(professor);
    expect(findById).toHaveBeenCalledExactlyOnceWith('school-1', 'p1');
  });

  it('throws ProfessorNotFound when the professor is not in the school', async () => {
    const findById = vi.fn<ProfessorRepository['findById']>().mockResolvedValue(null);

    await expect(
      new GetProfessor({ professorRepository: { findById } }).execute({
        schoolId: 'school-1',
        professorId: 'p2',
      }),
    ).rejects.toBeInstanceOf(ProfessorNotFound);
  });
});
