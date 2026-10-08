import { describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { createPrismaClient } from './createPrismaClient.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { PrismaMunicipalityRepository } from './prismaMunicipalityRepository.js';

const repository = new PrismaMunicipalityRepository(testPrisma);

describe('PrismaMunicipalityRepository', () => {
  describe('findAll', () => {
    it('returns the 542 municipalities of the Comunitat Valenciana', async () => {
      const municipalities = await repository.findAll();

      expect(municipalities).toHaveLength(542);
      const byProvince = (prefix: string) =>
        municipalities.filter(({ code }) => code.startsWith(prefix)).length;
      expect([byProvince('03'), byProvince('12'), byProvince('46')]).toEqual([141, 135, 266]);
    });

    it('returns code, name and province, ordered by name', async () => {
      const municipalities = await repository.findAll();

      expect(municipalities[0]).toEqual({
        code: expect.stringMatching(/^\d{5}$/) as string,
        name: expect.any(String) as string,
        province: expect.any(String) as string,
      });
      const names = municipalities.map(({ name }) => name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'es')));
    });

    it('keeps the municipalities with two official names', async () => {
      const municipalities = await repository.findAll();

      expect(municipalities).toContainEqual({
        code: '03014',
        name: 'Alacant/Alicante',
        province: 'Alicante/Alacant',
      });
    });
  });

  describe('findByCode', () => {
    it('finds a municipality by its INE code', async () => {
      await expect(repository.findByCode('46250')).resolves.toEqual({
        code: '46250',
        name: 'València',
        province: 'Valencia/València',
      });
    });

    it('returns null when the code does not exist', async () => {
      await expect(repository.findByCode('99999')).resolves.toBeNull();
    });
  });
});

describe('PrismaMunicipalityRepository with an unreachable database', () => {
  function unreachable() {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });
    return { prisma, repository: new PrismaMunicipalityRepository(prisma) };
  }

  it.each([
    ['findAll', (repository: PrismaMunicipalityRepository) => repository.findAll()],
    ['findByCode', (repository: PrismaMunicipalityRepository) => repository.findByCode('46250')],
  ])('%s throws DatabaseUnavailable', async (_name, operation) => {
    const { prisma, repository } = unreachable();

    await expect(operation(repository)).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
