/** Motivo por el que un campo no es válido; coincide con `FieldErrorCode` de docs/api-spec.yml. */
export type FieldErrorCode =
  'REQUIRED' | 'INVALID_LENGTH' | 'INVALID_FORMAT' | 'INVALID_CHARACTERS' | 'WEAK_PASSWORD';

/** Un campo de la petición que no es válido, con su motivo. */
export interface FieldError {
  field: string;
  code: FieldErrorCode;
}

/** La entrada no es válida: lleva un elemento por cada campo inválido. */
export class ValidationError extends Error {
  constructor(public readonly details: FieldError[]) {
    super('La petición contiene campos no válidos');
    this.name = 'ValidationError';
  }
}
