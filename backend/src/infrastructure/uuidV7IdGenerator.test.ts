import { describe, expect, it } from 'vitest';
import { UuidV7IdGenerator } from './uuidV7IdGenerator.js';

describe('UuidV7IdGenerator', () => {
  const generator = new UuidV7IdGenerator();

  it('generates UUIDs of version 7', () => {
    expect(generator.generate()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('generates unique identifiers', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generator.generate()));

    expect(ids.size).toBe(1000);
  });

  it('orders the identifiers by creation time', async () => {
    const first = generator.generate();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = generator.generate();

    expect(second > first).toBe(true);
  });
});
