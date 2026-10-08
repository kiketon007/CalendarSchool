import fixtures from '../../../test-fixtures/registration-fields.json' with { type: 'json' };

/** Valor de la tabla compartida: texto, ausente (`null`) o texto generado por repetición. */
type FixtureValue =
  string | null | { repeat: string; times: number; prefix?: string; suffix?: string };

export type RegistrationFieldName =
  'schoolName' | 'municipalityCode' | 'firstName' | 'lastName' | 'email' | 'password';

export interface InvalidCase {
  /** `undefined` si el campo está ausente. */
  value: string | undefined;
  code: string;
}

interface FieldFixture {
  valid: FixtureValue[];
  invalid: { value: FixtureValue; code: string }[];
}

function expand(value: FixtureValue): string | undefined {
  if (value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  return `${value.prefix ?? ''}${value.repeat.repeat(value.times)}${value.suffix ?? ''}`;
}

/** Ejemplos válidos e inválidos de un campo de la tabla compartida con el frontend. */
export function fieldCases(field: RegistrationFieldName): {
  valid: (string | undefined)[];
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
