import type {
  ProfessorAvailability,
  UnavailableInterval,
} from '../../domain/professor/availability.js';
import type {
  ProfessorAvailabilityRepository,
  ReplaceAvailabilityResult,
} from '../../domain/professor/professorAvailabilityRepository.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';

/** Lo que hace falta para leer los tramos: vale el cliente y el de una transacción. */
type Reader = Pick<PrismaClient, 'professorUnavailability'>;

const intervalsOf = async (client: Reader, professorId: string): Promise<UnavailableInterval[]> =>
  (
    await client.professorUnavailability.findMany({
      where: { professorId },
      select: { dayOfWeek: true, startMinute: true, endMinute: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }, { endMinute: 'asc' }],
    })
  ).map(({ dayOfWeek, startMinute, endMinute }) => ({ dayOfWeek, startMinute, endMinute }));

const sameIntervals = (a: readonly UnavailableInterval[], b: readonly UnavailableInterval[]) =>
  a.length === b.length &&
  a.every(
    (interval, index) =>
      interval.dayOfWeek === b[index]?.dayOfWeek &&
      interval.startMinute === b[index].startMinute &&
      interval.endMinute === b[index].endMinute,
  );

/** La disponibilidad de los profesores (`professor_unavailabilities`) en PostgreSQL. */
export class PrismaProfessorAvailabilityRepository implements ProfessorAvailabilityRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly generateId: () => string = () => crypto.randomUUID(),
  ) {}

  async find(schoolId: string, professorId: string): Promise<ProfessorAvailability | null> {
    return translateDatabaseErrors(async () => {
      const professor = await this.prisma.professor.findFirst({
        where: { id: professorId, schoolId },
        select: { id: true },
      });
      if (professor === null) {
        return null;
      }
      return { professorId, intervals: await intervalsOf(this.prisma, professorId) };
    });
  }

  async replace(
    schoolId: string,
    professorId: string,
    intervals: readonly UnavailableInterval[],
  ): Promise<ReplaceAvailabilityResult> {
    return translateDatabaseErrors(() =>
      this.prisma.$transaction(async (transaction): Promise<ReplaceAvailabilityResult> => {
        // Mismo bloqueo que la edición y el borrado del profesor: dos guardados se serializan aquí y, si el
        // borrado confirma antes, no hay fila y la respuesta es `notFound`.
        const locked = await transaction.$queryRaw<{ id: string }[]>`
          SELECT id FROM professors
          WHERE id = ${professorId}::uuid AND school_id = ${schoolId}::uuid
          FOR UPDATE`;
        if (locked.length === 0) {
          return { kind: 'notFound' };
        }

        const current = await intervalsOf(transaction, professorId);
        if (sameIntervals(current, intervals)) {
          return { kind: 'unchanged', availability: { professorId, intervals: current } };
        }

        await transaction.professorUnavailability.deleteMany({ where: { professorId } });
        await transaction.professorUnavailability.createMany({
          data: intervals.map(({ dayOfWeek, startMinute, endMinute }) => ({
            id: this.generateId(),
            schoolId,
            professorId,
            dayOfWeek,
            startMinute,
            endMinute,
          })),
        });
        return {
          kind: 'replaced',
          availability: { professorId, intervals: await intervalsOf(transaction, professorId) },
        };
      }),
    );
  }
}
