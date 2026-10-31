import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Professor } from '../../domain/professor/professor.js';
import { ClassAlreadyHasTutor, ClassNotFound } from '../../domain/professor/professorErrors.js';
import type { ProfessorRepository } from '../../domain/professor/professorRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { ValidationError } from '../validationError.js';
import { CreateProfessor } from './createProfessor.js';

const CLASS_ID = '0192f5a0-0000-7000-8000-0000000000e1';
const identity = { schoolId: 'school-1', actorId: 'actor-1' } as const;
const body = { firstName: '  José   María ', lastName: 'García López' };

const created: Professor = {
  id: 'id-1',
  firstName: 'José María',
  lastName: 'García López',
  position: null,
  subjects: [],
  unavailableCount: 0,
  tutoredClass: null,
};

describe('CreateProfessor', () => {
  let create: Mock<ProfessorRepository['create']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: CreateProfessor;

  beforeEach(() => {
    create = vi.fn<ProfessorRepository['create']>().mockResolvedValue(created);
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new CreateProfessor({
      professorRepository: { create },
      idGenerator: { generate: () => 'id-1' },
      logger: { info, warn },
    });
  });

  it('stores the cleaned names under the school of the identity, with a generated id and no class', async () => {
    await useCase.execute({ ...identity, body });

    expect(create).toHaveBeenCalledExactlyOnceWith(
      'school-1',
      { id: 'id-1', firstName: 'José María', lastName: 'García López', position: null },
      null,
    );
  });

  it('passes the position and the class when they come', async () => {
    await useCase.execute({
      ...identity,
      body: { ...body, position: 'JEFE_ESTUDIOS', classId: CLASS_ID },
    });

    expect(create).toHaveBeenCalledExactlyOnceWith(
      'school-1',
      { id: 'id-1', firstName: 'José María', lastName: 'García López', position: 'JEFE_ESTUDIOS' },
      CLASS_ID,
    );
  });

  it('returns the professor that the repository created', async () => {
    await expect(useCase.execute({ ...identity, body })).resolves.toEqual(created);
  });

  it('ignores a school or subjects that come in the body', async () => {
    await useCase.execute({
      ...identity,
      body: { ...body, schoolId: 'school-2', subjectIds: ['subject-1'] },
    });

    expect(create.mock.calls[0]?.[0]).toBe('school-1');
    expect(JSON.stringify(create.mock.calls)).not.toContain('school-2');
    expect(JSON.stringify(create.mock.calls)).not.toContain('subject-1');
  });

  it('logs PROFESSOR_CREATED with the identifiers, the position and whether it has a class, never the names', async () => {
    create.mockResolvedValue({
      ...created,
      position: 'DIRECTOR',
      tutoredClass: { id: CLASS_ID, name: 'A', courseId: 'course-1', courseName: '1º Primaria' },
    });

    await useCase.execute({
      ...identity,
      body: { ...body, position: 'DIRECTOR', classId: CLASS_ID },
    });

    expect(info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'PROFESSOR_CREATED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        professor_id: 'id-1',
        has_class: true,
        position: 'DIRECTOR',
      },
      expect.any(String),
    );
    const logged = JSON.stringify([info.mock.calls, warn.mock.calls]);
    expect(logged).not.toContain('José');
    expect(logged).not.toContain('García');
    expect(logged).not.toContain('Primaria');
  });

  it('logs has_class false and a null position for a professor without class or position', async () => {
    await useCase.execute({ ...identity, body });

    expect(info.mock.calls[0]?.[0]).toMatchObject({ has_class: false, position: null });
  });

  it('throws ValidationError with the invalid fields and stores nothing', async () => {
    const attempt = useCase.execute({
      ...identity,
      body: { firstName: '', lastName: 'García', position: 'PRESIDENTE' },
    });

    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt).rejects.toMatchObject({
      details: [
        { field: 'firstName', code: 'REQUIRED' },
        { field: 'position', code: 'INVALID_FORMAT' },
      ],
    });
    expect(create).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it('turns ClassNotFound into a classId field error and logs PROFESSOR_CREATION_REJECTED', async () => {
    create.mockRejectedValue(new ClassNotFound());

    const attempt = useCase.execute({ ...identity, body: { ...body, classId: CLASS_ID } });

    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt).rejects.toMatchObject({
      details: [{ field: 'classId', code: 'NOT_FOUND' }],
    });
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'PROFESSOR_CREATION_REJECTED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        reason: 'class_not_found',
      },
      expect.any(String),
    );
    expect(info).not.toHaveBeenCalled();
  });

  it('logs PROFESSOR_CREATION_REJECTED and rethrows ClassAlreadyHasTutor when the class has a tutor', async () => {
    create.mockRejectedValue(new ClassAlreadyHasTutor());

    await expect(
      useCase.execute({ ...identity, body: { ...body, classId: CLASS_ID } }),
    ).rejects.toBeInstanceOf(ClassAlreadyHasTutor);

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'PROFESSOR_CREATION_REJECTED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        reason: 'class_has_tutor',
      },
      expect.any(String),
    );
    expect(info).not.toHaveBeenCalled();
  });

  it('lets a database failure through without logging', async () => {
    create.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    await expect(useCase.execute({ ...identity, body })).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );

    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
