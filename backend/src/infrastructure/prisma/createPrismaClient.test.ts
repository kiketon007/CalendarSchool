import { beforeEach, describe, expect, it, vi } from 'vitest';

const { PrismaPg } = vi.hoisted(() => ({ PrismaPg: vi.fn() }));
vi.mock('@prisma/adapter-pg', () => ({ PrismaPg }));
vi.mock('./generated/client.js', () => ({ PrismaClient: vi.fn() }));

const { createPrismaClient, DEFAULT_CONNECTION_TIMEOUT_MS } =
  await import('./createPrismaClient.js');

const connectionString = 'postgresql://user:secret@localhost:5432/calendarschool';

/** Primer argumento (opciones del pool) con el que se construyó el adaptador. */
function poolOptions(): Record<string, unknown> {
  return PrismaPg.mock.calls[0]?.[0] as Record<string, unknown>;
}

describe('createPrismaClient', () => {
  beforeEach(() => {
    PrismaPg.mockClear();
  });

  it('gives the pool a connection timeout by default and leaves its size to pg', () => {
    createPrismaClient({ connectionString });

    expect(DEFAULT_CONNECTION_TIMEOUT_MS).toBe(5000);
    expect(poolOptions()).toEqual({ connectionString, connectionTimeoutMillis: 5000 });
    expect(PrismaPg.mock.calls[0]).toHaveLength(1);
  });

  it('passes the pool size, the connection timeout and the TLS settings to the adapter', () => {
    const ssl = { ca: 'ca-certificate' };

    createPrismaClient({ connectionString, poolMax: 2, connectionTimeoutMillis: 1500, ssl });

    expect(poolOptions()).toEqual({
      connectionString,
      max: 2,
      connectionTimeoutMillis: 1500,
      ssl,
    });
  });

  it('keeps the schema behaviour of the tests together with the pool options', () => {
    createPrismaClient({ connectionString, schema: 'test_1', poolMax: 3 });

    expect(poolOptions()).toEqual({
      connectionString,
      options: '-c search_path=test_1',
      max: 3,
      connectionTimeoutMillis: 5000,
    });
    expect(PrismaPg.mock.calls[0]?.[1]).toEqual({ schema: 'test_1' });
  });
});
