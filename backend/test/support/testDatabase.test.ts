import { describe, expect, it } from 'vitest';
import { assertTestDatabase, schemaUrl, testSchemaName } from './testDatabase.js';

const TEST_URL = 'postgresql://user:secret@localhost:5432/calendarschool_test';
const DEV_URL = 'postgresql://user:secret@localhost:5432/calendarschool';

describe('assertTestDatabase', () => {
  it('accepts a test database with a worker schema', () => {
    expect(() => assertTestDatabase(TEST_URL, 'test_1')).not.toThrow();
    expect(() => assertTestDatabase(TEST_URL, 'test_12')).not.toThrow();
  });

  it('rejects a database whose name does not end with _test', () => {
    expect(() => assertTestDatabase(DEV_URL, 'test_1')).toThrow(/_test/);
  });

  it('rejects a database name that only contains _test in the middle', () => {
    const url = 'postgresql://user:secret@localhost:5432/calendarschool_test_copy';

    expect(() => assertTestDatabase(url, 'test_1')).toThrow(/_test/);
  });

  it('rejects the public schema and any schema that is not test_<n>', () => {
    expect(() => assertTestDatabase(TEST_URL, 'public')).toThrow(/test_<n>/);
    expect(() => assertTestDatabase(TEST_URL, 'test_')).toThrow(/test_<n>/);
    expect(() => assertTestDatabase(TEST_URL, 'test_1; DROP')).toThrow(/test_<n>/);
  });

  it('rejects an empty or malformed connection string', () => {
    expect(() => assertTestDatabase('', 'test_1')).toThrow();
    expect(() => assertTestDatabase('not a url', 'test_1')).toThrow();
  });

  it('never includes the password in the error message', () => {
    expect(() => assertTestDatabase(DEV_URL, 'test_1')).toThrow(
      expect.not.objectContaining({ message: expect.stringContaining('secret') }),
    );
  });
});

describe('testSchemaName', () => {
  it('builds the worker schema name from the pool id', () => {
    expect(testSchemaName('3')).toBe('test_3');
  });

  it('fails when the pool id is missing or not a positive integer', () => {
    expect(() => testSchemaName(undefined)).toThrow(/VITEST_POOL_ID/);
    expect(() => testSchemaName('abc')).toThrow(/VITEST_POOL_ID/);
    expect(() => testSchemaName('0')).toThrow(/VITEST_POOL_ID/);
  });
});

describe('schemaUrl', () => {
  it('adds the schema parameter to the connection string', () => {
    expect(schemaUrl(TEST_URL, 'test_2')).toBe(`${TEST_URL}?schema=test_2`);
  });

  it('replaces an existing schema parameter and keeps the others', () => {
    expect(schemaUrl(`${TEST_URL}?sslmode=disable&schema=public`, 'test_2')).toBe(
      `${TEST_URL}?sslmode=disable&schema=test_2`,
    );
  });
});
