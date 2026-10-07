import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createLogger } from '../logger.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaDatabasePing } from './prismaDatabasePing.js';

function captureLogs(): { logger: ReturnType<typeof createLogger>; output: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { logger: createLogger('error', stream), output: () => chunks.join('') };
}

describe('PrismaDatabasePing', () => {
  it('returns true when the database answers', async () => {
    const { logger } = captureLogs();

    await expect(new PrismaDatabasePing(testPrisma, logger).ping()).resolves.toBe(true);
  });

  it('returns false and logs the cause when the database rejects the connection', async () => {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const unreachable = createPrismaClient({ connectionString: wrongCredentials.toString() });
    const { logger, output } = captureLogs();

    try {
      await expect(new PrismaDatabasePing(unreachable, logger).ping()).resolves.toBe(false);
      expect(output()).toContain('Fallo al comprobar la conexión con la base de datos');
    } finally {
      await unreachable.$disconnect();
    }
  });
});
