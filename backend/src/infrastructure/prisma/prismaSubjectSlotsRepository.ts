import { formatClock } from '../../domain/calendar/clock.js';
import { sessionGroupsOf } from '../../domain/calendar/sessionGroups.js';
import type { SlotRuleType, SubjectSlotsSnapshot } from '../../domain/slots/subjectSlots.js';
import type {
  ReplaceSlotsResult,
  SubjectSlotsRepository,
} from '../../domain/slots/subjectSlotsRepository.js';
import type { SlotCell } from '../../domain/workload/workloadWarnings.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';

/** Lo que hace falta para leer las franjas: vale el cliente y el de una transacción. */
type Reader = Pick<PrismaClient, 'course' | 'subjectCourse'>;

/** Una celda como texto, para comparar conjuntos de celdas. */
const keyOf = ({ dayOfWeek, sessionNumber }: SlotCell) =>
  `${String(dayOfWeek)}-${String(sessionNumber)}`;

/** Las celdas guardadas de una regla y su orden de lectura: por día y por sesión. */
const byDayAndSession = (a: SlotCell, b: SlotCell) =>
  a.dayOfWeek - b.dayOfWeek || a.sessionNumber - b.sessionNumber;

/**
 * Lee la pareja asignatura-curso con su calendario y las celdas de su regla de franjas del tipo pedido, y siempre
 * las de la regla de prohibidas (`forbiddenCells`). Se filtra por colegio en el curso y en la asignatura: uno
 * ajeno no existe. Solo valen las celdas cuya sesión existe en el calendario actual (sin calendario, ninguna);
 * las demás de la regla pedida se cuentan en `outsideCount`. No bloquea nada; `replace` la llama dentro de su
 * transacción para responder con lo que dejó escrito.
 */
async function readSnapshot(
  client: Reader,
  schoolId: string,
  courseId: string,
  subjectId: string,
  type: SlotRuleType,
): Promise<SubjectSlotsSnapshot | null> {
  const course = await client.course.findFirst({
    where: { id: courseId, schoolId },
    select: {
      id: true,
      name: true,
      calendar: {
        select: {
          id: true,
          name: true,
          periods: {
            select: { kind: true, startMinute: true, endMinute: true },
            orderBy: { position: 'asc' },
          },
        },
      },
    },
  });
  if (course === null) {
    return null;
  }
  const pair = await client.subjectCourse.findFirst({
    where: { courseId, subjectId, subject: { schoolId } },
    select: {
      sessionsPerWeek: true,
      subject: { select: { id: true, name: true, code: true, color: true } },
      constraints: {
        select: {
          type: true,
          maxPerDay: true,
          blockSize: true,
          slots: { select: { dayOfWeek: true, sessionNumber: true } },
        },
      },
    },
  });
  if (pair === null) {
    return null;
  }

  const sessionGroups =
    course.calendar === null
      ? []
      : sessionGroupsOf(course.calendar.periods.map(({ kind }) => kind));
  const sessions = sessionGroups.reduce((total, size) => total + size, 0);
  const cellsOf = (kind: SlotRuleType) => {
    const stored = pair.constraints.find((rule) => rule.type === kind)?.slots ?? [];
    const inside = stored
      .filter(({ sessionNumber }) => sessionNumber <= sessions)
      .sort(byDayAndSession);
    return { inside, outside: stored.length - inside.length };
  };
  const forbidden = cellsOf('FORBIDDEN_SLOTS');
  const own = type === 'FORBIDDEN_SLOTS' ? forbidden : cellsOf(type);

  return {
    course: { id: course.id, name: course.name },
    subject: {
      ...pair.subject,
      sessionsPerWeek: pair.sessionsPerWeek,
      maxPerDay: pair.constraints.find(({ type }) => type === 'MAX_PER_DAY')?.maxPerDay ?? null,
      blockSize: pair.constraints.find(({ type }) => type === 'BLOCK')?.blockSize ?? null,
    },
    calendar:
      course.calendar === null
        ? null
        : {
            id: course.calendar.id,
            name: course.calendar.name,
            periods: course.calendar.periods.map(({ kind, startMinute, endMinute }) => ({
              type: kind,
              startTime: formatClock(startMinute),
              endTime: formatClock(endMinute),
            })),
            sessionGroups,
          },
    cells: own.inside,
    outsideCount: own.outside,
    forbiddenCells: forbidden.inside,
  };
}

/** Las franjas, prohibidas o preferidas, de una asignatura en un curso (`scheduling_constraint_slots`), en PostgreSQL. */
export class PrismaSubjectSlotsRepository implements SubjectSlotsRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly generateId: () => string = () => crypto.randomUUID(),
  ) {}

  async find(
    schoolId: string,
    courseId: string,
    subjectId: string,
    type: SlotRuleType,
  ): Promise<SubjectSlotsSnapshot | null> {
    return translateDatabaseErrors(() =>
      readSnapshot(this.prisma, schoolId, courseId, subjectId, type),
    );
  }

  async replace(
    schoolId: string,
    courseId: string,
    subjectId: string,
    type: SlotRuleType,
    cells: readonly SlotCell[],
  ): Promise<ReplaceSlotsResult> {
    return translateDatabaseErrors(() =>
      this.prisma.$transaction(async (transaction): Promise<ReplaceSlotsResult> => {
        // 1. La asignatura, \`FOR UPDATE\`, y después el curso, \`FOR SHARE\`: es el orden de la carga horaria y de la
        // edición de una asignatura, así que no hay ciclos con ellas, con el borrado de la asignatura ni con el
        // del curso (que espera en el \`FOR SHARE\`). Se filtra por colegio: uno ajeno no existe.
        const subjects = await transaction.$queryRaw<{ id: string }[]>`
          SELECT id FROM subjects
          WHERE id = ${subjectId}::uuid AND school_id = ${schoolId}::uuid
          FOR UPDATE`;
        const courses = await transaction.$queryRaw<{ id: string }[]>`
          SELECT id FROM courses
          WHERE id = ${courseId}::uuid AND school_id = ${schoolId}::uuid
          FOR SHARE`;
        if (subjects.length === 0 || courses.length === 0) {
          return { kind: 'notFound' };
        }

        // 2. La pareja y el calendario (que no se bloquea: si cambia a la vez, la siguiente lectura avisa).
        const before = await readSnapshot(transaction, schoolId, courseId, subjectId, type);
        if (before === null) {
          return { kind: 'notFound' };
        }
        if (before.calendar === null) {
          return { kind: 'noCalendar' };
        }
        const sessions = before.calendar.sessionGroups.reduce((total, size) => total + size, 0);
        const outOfCalendar = cells.flatMap(({ sessionNumber }, position) =>
          sessionNumber > sessions ? [position] : [],
        );
        if (outOfCalendar.length > 0) {
          return { kind: 'outOfCalendar', positions: outOfCalendar };
        }

        // 3. Lo que hay guardado, también lo que está fuera del calendario: quitarlo es un cambio.
        const rule = await transaction.schedulingConstraint.findUnique({
          where: {
            subjectId_courseId_type: { subjectId, courseId, type },
          },
          select: { id: true, slots: { select: { dayOfWeek: true, sessionNumber: true } } },
        });
        const stored = new Set((rule?.slots ?? []).map(keyOf));
        const wanted = new Set(cells.map(keyOf));
        const changed = stored.size !== wanted.size || [...wanted].some((key) => !stored.has(key));

        if (changed) {
          // 4. Sin celdas la regla no existe; con ellas, se crea si hacía falta y se reemplazan sus celdas.
          const ordered = [...cells].sort(byDayAndSession);
          if (ordered.length === 0) {
            if (rule !== null) {
              await transaction.schedulingConstraint.delete({ where: { id: rule.id } });
            }
          } else if (rule === null) {
            await transaction.schedulingConstraint.create({
              data: {
                id: this.generateId(),
                schoolId,
                subjectId,
                courseId,
                type,
                slots: { create: ordered },
              },
            });
          } else {
            await transaction.schedulingConstraintSlot.deleteMany({
              where: { constraintId: rule.id },
            });
            await transaction.schedulingConstraintSlot.createMany({
              data: ordered.map((slot) => ({ constraintId: rule.id, ...slot })),
            });
          }
        }

        const snapshot = await readSnapshot(transaction, schoolId, courseId, subjectId, type);
        if (snapshot === null) {
          // No puede pasar: la asignatura y el curso están bloqueados en esta transacción.
          return { kind: 'notFound' };
        }
        return { kind: 'saved', changed, slotCount: wanted.size, snapshot };
      }),
    );
  }
}
