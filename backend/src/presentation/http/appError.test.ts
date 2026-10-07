import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { ERROR_CODES } from './appError.js';

/** Contrato de la API (docs/api-spec.yml), resuelto desde este fichero y no desde el cwd. */
const apiSpecUrl = new URL('../../../../docs/api-spec.yml', import.meta.url);

interface ApiSpec {
  components: { schemas: { ErrorCode: { enum: string[] } } };
}

function contractErrorCodes(): string[] {
  const spec = parse(readFileSync(apiSpecUrl, 'utf8')) as ApiSpec;
  return spec.components.schemas.ErrorCode.enum;
}

describe('ERROR_CODES', () => {
  it('contains exactly the ErrorCode enum of docs/api-spec.yml', () => {
    expect([...ERROR_CODES].sort()).toEqual([...contractErrorCodes()].sort());
  });
});
