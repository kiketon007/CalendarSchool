import type { Municipality } from '../../domain/municipality/municipality.js';
import type { MunicipalityRepository } from '../../domain/municipality/municipalityRepository.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';

const FIELDS = { code: true, name: true, province: true } as const;

/** Consulta los municipios cargados por la migración (datos fijos del INE). */
export class PrismaMunicipalityRepository implements MunicipalityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(): Promise<Municipality[]> {
    const municipalities = await translateDatabaseErrors(() =>
      this.prisma.municipality.findMany({ select: FIELDS }),
    );
    // La ordenación es del lado de la aplicación: la intercalación de PostgreSQL depende de cómo
    // se creó la base de datos, y los nombres llevan acentos y dos formas oficiales.
    return municipalities.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  findByCode(code: string): Promise<Municipality | null> {
    return translateDatabaseErrors(() =>
      this.prisma.municipality.findUnique({ where: { code }, select: FIELDS }),
    );
  }
}
