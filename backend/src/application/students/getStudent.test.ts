import { describe, expect, it, vi } from 'vitest';
import type { Student } from '../../domain/student/student.js';
import { StudentNotFound } from '../../domain/student/studentErrors.js';
import type { StudentRepository } from '../../domain/student/studentRepository.js';
import { GetStudent } from './getStudent.js';

const student: Student = {
  id: 's1',
  firstName: 'Juan',
  lastName: 'García',
  course: { id: 'k1', name: '1º Primaria' },
  class: { id: 'c1', name: 'A' },
  cafeteria: true,
  scholarship: false,
  foodType: 'Vegetariana',
  observations: 'Necesita apoyo',
};

describe('GetStudent', () => {
  it('asks the repository for the student of the school of the identity and returns it with its sensitive data', async () => {
    const findById = vi.fn<StudentRepository['findById']>().mockResolvedValue(student);

    const found = await new GetStudent({ studentRepository: { findById } }).execute({
      schoolId: 'school-1',
      studentId: 's1',
    });

    expect(found).toEqual(student);
    expect(findById).toHaveBeenCalledExactlyOnceWith('school-1', 's1');
  });

  it('throws StudentNotFound when the student is not in the school', async () => {
    const findById = vi.fn<StudentRepository['findById']>().mockResolvedValue(null);

    await expect(
      new GetStudent({ studentRepository: { findById } }).execute({
        schoolId: 'school-1',
        studentId: 's2',
      }),
    ).rejects.toBeInstanceOf(StudentNotFound);
  });
});
