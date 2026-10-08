import { v7 } from 'uuid';
import type { IdGenerator } from '../application/registration/idGenerator.js';

/** Genera UUIDv7: aleatorios y ordenados por tiempo, lo que mantiene los índices compactos. */
export class UuidV7IdGenerator implements IdGenerator {
  generate(): string {
    return v7();
  }
}
