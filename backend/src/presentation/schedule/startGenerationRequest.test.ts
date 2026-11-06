import { describe, expect, it } from 'vitest';
import { parseStartGenerationRequest } from './startGenerationRequest.js';

describe('parseStartGenerationRequest', () => {
  it.each([
    ['without a body', undefined],
    ['with an empty object', {}],
    ['with improve true', { improve: true }],
  ])('improves by default and when asked to, %s', (_name, body) => {
    expect(parseStartGenerationRequest(body)).toEqual({ success: true, data: { improve: true } });
  });

  it('does not improve when improve is false', () => {
    expect(parseStartGenerationRequest({ improve: false })).toEqual({
      success: true,
      data: { improve: false },
    });
  });

  it.each([
    ['a text', 'si'],
    ['a number', 1],
    ['null', null],
    ['an object', {}],
    ['an array', []],
  ])('rejects an improve that is %s, naming the field', (_name, improve) => {
    expect(parseStartGenerationRequest({ improve })).toEqual({
      success: false,
      details: [{ field: 'improve', code: 'INVALID_FORMAT' }],
    });
  });

  it('rejects an unknown field, naming it, so a client cannot send the school or the author', () => {
    expect(parseStartGenerationRequest({ other: true })).toEqual({
      success: false,
      details: [{ field: 'other', code: 'NOT_ALLOWED' }],
    });
    expect(parseStartGenerationRequest({ schoolId: 'x', actorId: 'y' })).toEqual({
      success: false,
      details: [
        { field: 'schoolId', code: 'NOT_ALLOWED' },
        { field: 'actorId', code: 'NOT_ALLOWED' },
      ],
    });
  });

  it('reports every invalid field, improve first', () => {
    expect(parseStartGenerationRequest({ other: 1, improve: 'no' })).toEqual({
      success: false,
      details: [
        { field: 'improve', code: 'INVALID_FORMAT' },
        { field: 'other', code: 'NOT_ALLOWED' },
      ],
    });
  });

  it.each([
    ['an array', [true]],
    ['a text', 'improve'],
    ['a number', 3],
  ])('rejects a body that is %s', (_name, body) => {
    expect(parseStartGenerationRequest(body)).toEqual({
      success: false,
      details: [{ field: 'body', code: 'INVALID_FORMAT' }],
    });
  });
});
