import { afterAll, beforeEach } from 'vitest';
import { resetDatabase } from '../support/resetDatabase.js';
import { testDatabaseUrl, testPrisma, testSchema } from '../support/testPrisma.js';

// Se ejecuta antes de cada fichero de integración, dentro de su worker.
beforeEach(async () => {
  await resetDatabase(testPrisma, testDatabaseUrl, testSchema);
});

afterAll(async () => {
  await testPrisma.$disconnect();
});
