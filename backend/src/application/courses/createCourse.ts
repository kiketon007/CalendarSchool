import type { Course } from '../../domain/course/course.js';
import { CourseAlreadyExists } from '../../domain/course/courseErrors.js';
import { normalizeName } from '../../domain/course/courseNames.js';
import type { CourseRepository } from '../../domain/course/courseRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { IdGenerator } from '../registration/idGenerator.js';
import { ValidationError } from '../validationError.js';
import { parseCreateCourseRequest } from './createCourseRequest.js';

export interface CreateCourseDependencies {
  courseRepository: Pick<CourseRepository, 'create'>;
  idGenerator: IdGenerator;
  logger: ApplicationLogger;
}

export interface CreateCourseInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Persona que crea el curso, de la identidad de la petición. */
  actorId: string;
  /** Cuerpo de la petición tal como llegó: este caso de uso lo valida. */
  body: unknown;
}

/**
 * Caso de uso: crea un curso con sus clases en el colegio de la identidad. Valida y limpia el cuerpo
 * (`ValidationError` con un `{ field, code }` por campo inválido), genera un identificador por curso y
 * por clase y delega en el repositorio, que lo guarda todo en una transacción y lanza
 * `CourseAlreadyExists` si el nombre ya está en uso en el colegio. El colegio y el tutor no se leen
 * nunca del cuerpo. Registra `COURSE_CREATED` o `COURSE_CREATION_REJECTED` solo con identificadores:
 * los nombres no van al log.
 */
export class CreateCourse {
  constructor(private readonly dependencies: CreateCourseDependencies) {}

  async execute({ schoolId, actorId, body }: CreateCourseInput): Promise<Course> {
    const { courseRepository, idGenerator, logger } = this.dependencies;

    const parsed = parseCreateCourseRequest(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.details);
    }
    const { name, classes } = parsed.data;

    let course: Course;
    try {
      course = await courseRepository.create(schoolId, {
        id: idGenerator.generate(),
        name,
        normalizedName: normalizeName(name),
        classes: classes.map((schoolClass) => ({
          id: idGenerator.generate(),
          name: schoolClass.name,
          normalizedName: normalizeName(schoolClass.name),
        })),
      });
    } catch (error) {
      if (error instanceof CourseAlreadyExists) {
        logger.warn(
          {
            event: 'COURSE_CREATION_REJECTED',
            school_id: schoolId,
            actor_id: actorId,
            reason: 'duplicate',
          },
          'Curso rechazado: el nombre ya existe en el colegio',
        );
      }
      throw error;
    }

    logger.info(
      {
        event: 'COURSE_CREATED',
        school_id: schoolId,
        actor_id: actorId,
        course_id: course.id,
        class_count: course.classes.length,
      },
      'Curso creado',
    );
    return course;
  }
}
