import { afterEach, describe, expect, it } from 'vitest';
import { testPrisma, testSchema } from '../support/testPrisma.js';

describe('integration worker isolation', () => {
  afterEach(async () => {
    await testPrisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${testSchema}".isolation_probe`);
  });

  it('runs raw SQL inside the worker schema', async () => {
    const [row] = await testPrisma.$queryRaw<{ schema: string }[]>`
      SELECT current_schema() AS schema
    `;

    expect(row?.schema).toBe(testSchema);
  });

  it('creates tables only in its own worker schema', async () => {
    await testPrisma.$executeRawUnsafe('CREATE TABLE isolation_probe (id int)');

    const schemas = await testPrisma.$queryRaw<{ table_schema: string }[]>`
      SELECT table_schema FROM information_schema.tables WHERE table_name = 'isolation_probe'
    `;

    expect(schemas.map((row) => row.table_schema)).toEqual([testSchema]);
  });
});
