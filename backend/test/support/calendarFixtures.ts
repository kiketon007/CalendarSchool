import fixtures from '../../../test-fixtures/calendar-fields.json' with { type: 'json' };

/**
 * Valor de la tabla compartida: texto, ausente (`null`), texto generado por repetición o un valor
 * literal (`{ raw }`) para los campos que no son texto (listas, números).
 */
type FixtureValue =
  | string
  | null
  | { repeat: string; times: number; prefix?: string; suffix?: string }
  | { raw: unknown };

export type CalendarFieldName = 'calendarName' | 'time' | 'periodType' | 'periods' | 'courseIds';

export interface InvalidCase {
  /** `undefined` si el campo está ausente. */
  value: unknown;
  /** El código de campo, en los campos de un solo error. */
  code: string;
  /** Los errores exactos `{ field, code }` en orden, en las listas (`periods` y `courseIds`). */
  issues: { field: string; code: string }[];
}

interface FieldFixture {
  valid: FixtureValue[];
  invalid: {
    value: FixtureValue;
    code?: string;
    issues?: { field: string; code: string }[];
  }[];
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
export function calendarFieldCases(field: CalendarFieldName): {
  valid: unknown[];
  invalid: InvalidCase[];
} {
  const { valid, invalid } = (fixtures as unknown as Record<string, FieldFixture>)[
    field
  ] as FieldFixture;
  return {
    valid: valid.map(expand),
    invalid: invalid.map(({ value, code, issues }) => ({
      value: expand(value),
      code: code ?? '',
      issues: issues ?? [],
    })),
  };
}
