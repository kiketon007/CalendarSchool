import { describe, expect, it } from 'vitest';
import { assertTestDatabaseUrl, cleanE2eData } from '../../../scripts/e2eData.mjs';

// URL a un puerto sin servidor: si la salvaguarda no cortara antes, el error sería de conexión.
const unreachable = (database: string) =>
  `postgresql://usuario:secreto-1234@localhost:5999/${database}`;

describe('assertTestDatabaseUrl', () => {
  it('accepts a database whose name ends in _test', () => {
    expect(() => {
      assertTestDatabaseUrl(unreachable('calendarschool_test'));
    }).not.toThrow();
  });

  it.each(['calendarschool', 'calendarschool_test_backup', 'test', ''])(
    'refuses the database "%s" without leaking the credentials',
    (database) => {
      let message = '';
      try {
        assertTestDatabaseUrl(unreachable(database));
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toMatch(/_test/);
      expect(message).not.toContain('secreto-1234');
    },
  );

  it('refuses a URL that cannot be parsed', () => {
    expect(() => {
      assertTestDatabaseUrl('no es una url');
    }).toThrow(/no es válida/);
  });
});

describe('cleanE2eData guards', () => {
  it('rejects a non-test database before trying to connect', async () => {
    await expect(cleanE2eData(unreachable('calendarschool'))).rejects.toThrow(/_test/);
  });

  it.each(['public"; DROP TABLE users; --', 'con espacio', '1schema', ''])(
    'rejects the schema name "%s"',
    async (schema) => {
      await expect(cleanE2eData(unreachable('calendarschool_test'), schema)).rejects.toThrow(
        /esquema/,
      );
    },
  );
});
