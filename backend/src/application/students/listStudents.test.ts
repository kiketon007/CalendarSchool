import { describe, expect, it, vi } from 'vitest';
import type { StudentSummary } from '../../domain/student/student.js';
import type { StudentRepository } from '../../domain/student/studentRepository.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { ListStudents } from './listStudents.js';

function student(id: string, firstName: string, lastName: string): StudentSummary {
  return {
    id,
    firstName,
    lastName,
    course: null,
    class: null,
    cafeteria: false,
    scholarship: null,
  };
}

function listStudentsWith(students: StudentSummary[]) {
  const listBySchool = vi.fn<StudentRepository['listBySchool']>().mockResolvedValue(students);
  return { listBySchool, useCase: new ListStudents({ studentRepository: { listBySchool } }) };
}

const names = (students: StudentSummary[]) =>
  students.map(({ lastName, firstName }) => `${lastName}, ${firstName}`);

describe('ListStudents', () => {
  it('asks for the students of the school of the identity', async () => {
    const { listBySchool, useCase } = listStudentsWith([]);

    await useCase.execute({ schoolId: 'school-1' });

    expect(listBySchool).toHaveBeenCalledExactlyOnceWith('school-1');
  });

  it('returns an empty list when the school has no students', async () => {
    const { useCase } = listStudentsWith([]);

    await expect(useCase.execute({ schoolId: 'school-1' })).resolves.toEqual([]);
  });

  it('orders by last name and then by first name, ignoring case and accents', async () => {
    const { useCase } = listStudentsWith([
      student('s1', 'Juan', 'García'),
      student('s2', 'ana', 'álvarez'),
      student('s3', 'Eva', 'García'),
      student('s4', 'Zoe', 'Zamora'),
    ]);

    const students = await useCase.execute({ schoolId: 'school-1' });

    expect(names(students)).toEqual(['álvarez, ana', 'García, Eva', 'García, Juan', 'Zamora, Zoe']);
  });

  it('does not change the list it receives', async () => {
    const received = [student('s1', 'Juan', 'García'), student('s2', 'Ana', 'Álvarez')];
    const { useCase } = listStudentsWith(received);

    await useCase.execute({ schoolId: 'school-1' });

    expect(names(received)).toEqual(['García, Juan', 'Álvarez, Ana']);
  });

  it('lets a database failure through', async () => {
    const listBySchool = vi
      .fn<StudentRepository['listBySchool']>()
      .mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));
    const useCase = new ListStudents({ studentRepository: { listBySchool } });

    await expect(useCase.execute({ schoolId: 'school-1' })).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );
  });
});
