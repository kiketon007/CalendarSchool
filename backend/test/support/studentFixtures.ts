import fixtures from '../../../test-fixtures/student-fields.json' with { type: 'json' };

/**
 * Valor de la tabla compartida: texto, ausente (`null`), texto generado por repetición o un valor
 * literal (`{ raw }`) para los campos que no son texto (booleanos, números).
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

/** Ejemplos válidos e inválidos de un campo de la tabla compartida con el frontend. */
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

interface ComedorFixture {
  valid: Record<string, FixtureValue>[];
  invalid: {
    body: Record<string, FixtureValue>;
    errors: { field: string; code: string }[];
  }[];
}

function expandBody(body: Record<string, FixtureValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, expand(value)]));
}

/** Combinaciones de comedor, beca y tipo de comida, válidas e inválidas, de la tabla compartida. */
export function comedorCases(): {
  valid: Record<string, unknown>[];
  invalid: { body: Record<string, unknown>; errors: { field: string; code: string }[] }[];
} {
  const { valid, invalid } = (fixtures as unknown as { comedor: ComedorFixture }).comedor;
  return {
    valid: valid.map(expandBody),
    invalid: invalid.map(({ body, errors }) => ({ body: expandBody(body), errors })),
  };
}
