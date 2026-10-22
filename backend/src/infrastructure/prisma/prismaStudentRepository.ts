import type {
  NewStudent,
  Student,
  StudentChanges,
  StudentSummary,
  StudentUpdate,
} from '../../domain/student/student.js';
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

/** La ficha completa: el listado más los datos sensibles, que solo salen al leer o editar un alumno. */
const FULL_FIELDS = { ...SUMMARY_FIELDS, foodType: true, observations: true } as const;

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

interface FullRow extends SummaryRow {
  foodType: string | null;
  observations: string | null;
}

function toStudent(row: FullRow): Student {
  return { ...toSummary(row), foodType: row.foodType, observations: row.observations };
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
          select: FULL_FIELDS,
        });
        // La respuesta sale de lo guardado, no de lo recibido.
        return toStudent(stored);
      }),
    );
  }

  async update(
    schoolId: string,
    studentId: string,
    changes: StudentChanges,
    courseId: string,
    classId: string | null,
  ): Promise<StudentUpdate | null> {
    return translateDatabaseErrors(() =>
      this.prisma.$transaction(async (transaction): Promise<StudentUpdate | null> => {
        // Primero el curso, en modo compartido, y después el alumno: es el orden del borrado y de la
        // edición del curso (toman el curso `FOR UPDATE` y luego escriben a sus alumnos), así que no hay
        // ciclo de bloqueos y esas operaciones esperan a que termine esta. Con el curso bloqueado, ni él
        // ni sus clases pueden desaparecer antes del `UPDATE`. Se filtra por colegio: lo ajeno no existe.
        const course = await transaction.$queryRaw<{ id: string }[]>`
          SELECT id FROM courses WHERE id = ${courseId}::uuid AND school_id = ${schoolId}::uuid FOR SHARE`;
        const locked = await transaction.$queryRaw<{ id: string }[]>`
          SELECT id FROM students WHERE id = ${studentId}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE`;
        // Un alumno que no existe es un `404` aunque el curso tampoco exista.
        if (locked.length === 0) {
          return null;
        }
        if (course.length === 0) {
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

        const previous = await transaction.student.findUniqueOrThrow({
          where: { id: studentId },
          select: FULL_FIELDS,
        });
        const stored = await transaction.student.update({
          where: { id: studentId },
          data: { ...changes, courseId, classId },
          select: FULL_FIELDS,
        });
        // El resultado sale de lo guardado, no de lo recibido.
        return { before: toStudent(previous), after: toStudent(stored) };
      }),
    );
  }

  async findById(schoolId: string, studentId: string): Promise<Student | null> {
    const row = await translateDatabaseErrors(() =>
      this.prisma.student.findFirst({ where: { id: studentId, schoolId }, select: FULL_FIELDS }),
    );
    return row && toStudent(row);
  }

  async listBySchool(schoolId: string): Promise<StudentSummary[]> {
    const rows = await translateDatabaseErrors(() =>
      this.prisma.student.findMany({ where: { schoolId }, select: SUMMARY_FIELDS }),
    );
    return rows.map(toSummary);
  }
}
