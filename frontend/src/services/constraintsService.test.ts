import { describe, expect, it, vi } from 'vitest';
import type { components } from '../api/generated/schema';
import { constraintsService } from './constraintsService';

type Constraint = components['schemas']['SchedulingConstraint'];

const constraint: Constraint = {
  id: '0192f5a0-0000-7000-8000-0000000000f1',
  type: 'MAX_PER_DAY',
  course: { id: '0192f5a0-0000-7000-8000-0000000000d1', name: '1º Primaria' },
  subject: {
    id: '0192f5a0-0000-7000-8000-0000000000e1',
    name: 'Inglés',
    code: 'ING',
    color: 'blue',
    status: 'ACTIVE',
  },
  maxPerDay: 2,
  blockSize: null,
  slotCount: null,
  warnings: [{ code: 'SUBJECT_DOES_NOT_FIT' }],
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const errorBody = (code: string) => ({ success: false, error: { code, message: 'x' } });

function clientReturning(response: Response | Error) {
  return vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
}

const listing = (...constraints: unknown[]) =>
  jsonResponse(200, { success: true, data: { constraints } });

describe('constraintsService.list', () => {
  it('asks for GET /api/constraints through the authenticated client', async () => {
    const client = clientReturning(listing());

    await constraintsService.list(client);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/constraints');
    expect(client.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it('returns the constraints as they come', async () => {
    const forbidden: Constraint = {
      ...constraint,
      id: 'rule-2',
      type: 'FORBIDDEN_SLOTS',
      subject: { ...constraint.subject, code: null, status: 'INACTIVE' },
      maxPerDay: null,
      slotCount: 18,
      warnings: [{ code: 'SLOTS_OUTSIDE_CALENDAR', count: 2 }],
    };

    const outcome = await constraintsService.list(clientReturning(listing(constraint, forbidden)));

    expect(outcome).toEqual({ status: 'loaded', constraints: [constraint, forbidden] });
  });

  it('returns an empty list', async () => {
    expect(await constraintsService.list(clientReturning(listing()))).toEqual({
      status: 'loaded',
      constraints: [],
    });
  });

  it.each([
    ['BLOCK', { maxPerDay: null, blockSize: 3, slotCount: null }],
    ['PREFERRED_SLOTS', { maxPerDay: null, blockSize: null, slotCount: 0 }],
  ])('accepts a %s rule with only its own value', async (type, values) => {
    const rule = { ...constraint, type, ...values };

    const outcome = await constraintsService.list(clientReturning(listing(rule)));

    expect(outcome).toEqual({ status: 'loaded', constraints: [rule] });
  });

  it('is unauthenticated on 401', async () => {
    const outcome = await constraintsService.list(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  const withRule = (changes: Record<string, unknown>) => listing({ ...constraint, ...changes });

  it.each([
    ['503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 200 without constraints', jsonResponse(200, { success: true, data: {} })],
    ['a 200 that is not JSON', new Response('<html>', { status: 200 })],
    ['a rule with a type that does not exist', withRule({ type: 'OTHER' })],
    ['a rule without a course', withRule({ course: undefined })],
    ['a rule whose course has no name', withRule({ course: { id: 'x' } })],
    ['a rule without a subject', withRule({ subject: undefined })],
    [
      'a subject with a color outside the palette',
      withRule({ subject: { ...constraint.subject, color: 'magenta' } }),
    ],
    [
      'a subject with a status that does not exist',
      withRule({ subject: { ...constraint.subject, status: 'ARCHIVED' } }),
    ],
    [
      'a subject whose code is not text or null',
      withRule({ subject: { ...constraint.subject, code: 5 } }),
    ],
    ['a maximum out of range', withRule({ maxPerDay: 6 })],
    ['a block out of range', withRule({ type: 'BLOCK', maxPerDay: null, blockSize: 4 })],
    [
      'a negative slot count',
      withRule({ type: 'FORBIDDEN_SLOTS', maxPerDay: null, slotCount: -1 }),
    ],
    ['a maximum rule with a block value too', withRule({ blockSize: 2 })],
    ['a maximum rule without its maximum', withRule({ maxPerDay: null })],
    ['a block rule without its block', withRule({ type: 'BLOCK', maxPerDay: null })],
    ['a slots rule without its count', withRule({ type: 'PREFERRED_SLOTS', maxPerDay: null })],
    ['a slots rule with a maximum', withRule({ type: 'PREFERRED_SLOTS', slotCount: 3 })],
    ['a rule without warnings', withRule({ warnings: undefined })],
    ['a warning with a code that does not exist', withRule({ warnings: [{ code: 'OTHER' }] })],
    [
      'an outside-calendar warning without count',
      withRule({ warnings: [{ code: 'SLOTS_OUTSIDE_CALENDAR' }] }),
    ],
    ['a rule without id', withRule({ id: undefined })],
  ])('is unavailable on %s', async (_name, response) => {
    expect(await constraintsService.list(clientReturning(response))).toEqual({
      status: 'unavailable',
    });
  });

  it('is unavailable when the request fails', async () => {
    const outcome = await constraintsService.list(clientReturning(new Error('network')));

    expect(outcome).toEqual({ status: 'unavailable' });
  });
});
