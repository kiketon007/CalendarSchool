import type { NewStudent, Student, StudentSummary } from '../../domain/student/student.js';
import { ClassNotFound, CourseNotFound } from '../../domain/student/studentErrors.js';
import type { StudentRepository } from '../../domain/student/studentRepository.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';

/** Lo que muestra el listado: el curso y la clase con su nombre; nunca los datos sensibles ni las fechas. */
const SUMMARY_FIELDS = {
  id: true,
  firstName: true,
  lastName: true,
  cafeteria: true,
  scholarship: true,
  course: { select: { id: true, name: true } },
  schoolClass: { select: { id: true, name: true } },
} as const;

interface SummaryRow {
  id: string;
  firstName: string;
  lastName: string;
  cafeteria: boolean;
  scholarship: boolean | null;
  course: { id: string; name: string } | null;
  schoolClass: { id: string; name: string } | null;
}

function toSummary(row: SummaryRow): StudentSummary {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    course: row.course && { id: row.course.id, name: row.course.name },
    class: row.schoolClass && { id: row.schoolClass.id, name: row.schoolClass.name },
    cafeteria: row.cafeteria,
    scholarship: row.scholarship,
  };
}

/** Alumnos en PostgreSQL. */
export class PrismaStudentRepository implements StudentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    schoolId: string,
    student: NewStudent,
    courseId: string,
    classId: string | null,
  ): Promise<Student> {
    return translateDatabaseErrors(() =>
      this.prisma.$transaction(async (transaction): Promise<Student> => {
        // Bloqueo compartido del curso: el borrado y la edición del curso lo toman en exclusivo (`FOR
        // UPDATE`), así que esperan a que termine el alta y esta no puede ver una clase que desaparece
        // justo después. Dos altas en el mismo curso no se bloquean entre sí. Se filtra por colegio: un
        // curso ajeno no existe.
        const locked = await transaction.$queryRaw<{ id: string }[]>`
          SELECT id FROM courses WHERE id = ${courseId}::uuid AND school_id = ${schoolId}::uuid FOR SHARE`;
        if (locked.length === 0) {
          throw new CourseNotFound();
        }
        if (classId !== null) {
          const schoolClass = await transaction.schoolClass.findFirst({
            where: { id: classId, courseId },
            select: { id: true },
          });
          if (schoolClass === null) {
            throw new ClassNotFound();
          }
        }

        const stored = await transaction.student.create({
          data: { ...student, schoolId, courseId, classId },
          select: { ...SUMMARY_FIELDS, foodType: true, observations: true },
        });
        // La respuesta sale de lo guardado, no de lo recibido.
        return {
          ...toSummary(stored),
          foodType: stored.foodType,
          observations: stored.observations,
        };
      }),
    );
  }

  async listBySchool(schoolId: string): Promise<StudentSummary[]> {
    const rows = await translateDatabaseErrors(() =>
      this.prisma.student.findMany({ where: { schoolId }, select: SUMMARY_FIELDS }),
    );
    return rows.map(toSummary);
  }
}
