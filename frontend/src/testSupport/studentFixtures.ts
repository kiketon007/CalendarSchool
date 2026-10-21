import fixtures from '../../../test-fixtures/student-fields.json';

/**
 * Valor de la tabla compartida: texto, ausente (`null`), texto generado por repetición o un valor
 * literal (`{ raw }`) para los campos que no son texto (listas, números).
 */
type FixtureValue =
  | string
  | null
  | { repeat: string; times: number; prefix?: string; suffix?: string }
  | { raw: unknown };

export type StudentFieldName =
  | 'firstName'
  | 'lastName'
  | 'courseId'
  | 'classId'
  | 'cafeteria'
  | 'scholarship'
  | 'foodType'
  | 'observations';

export interface InvalidCase {
  /** `undefined` si el campo está ausente. */
  value: unknown;
  code: string;
}

interface FieldFixture {
  valid: FixtureValue[];
  invalid: { value: FixtureValue; code: string }[];
}

function expand(value: FixtureValue): unknown {
  if (value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if ('raw' in value) {
    return value.raw;
  }
  return `${value.prefix ?? ''}${value.repeat.repeat(value.times)}${value.suffix ?? ''}`;
}

/**
 * Ejemplos válidos e inválidos de un campo, de la tabla `test-fixtures/student-fields.json` que
 * comparte con los tests del backend para que ambos validen igual.
 */
export function studentFieldCases(field: StudentFieldName): {
  valid: unknown[];
  invalid: InvalidCase[];
} {
  const { valid, invalid } = (fixtures as unknown as Record<string, FieldFixture>)[
    field
  ] as FieldFixture;
  return {
    valid: valid.map(expand),
    invalid: invalid.map(({ value, code }) => ({ value: expand(value), code })),
  };
}
