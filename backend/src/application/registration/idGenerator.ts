/** Puerto de generación de identificadores (UUIDv7, ordenados por tiempo). */
export interface IdGenerator {
  generate(): string;
}
