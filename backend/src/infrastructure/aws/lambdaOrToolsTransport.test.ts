import { InvokeCommand } from '@aws-sdk/client-lambda';
import { describe, expect, it, vi } from 'vitest';
import type { OrToolsRequest } from '../../domain/schedule/orToolsTransport.js';
import {
  createOrToolsLambdaClient,
  LambdaOrToolsTransport,
  OrToolsInvokeError,
  type LambdaInvoker,
} from './lambdaOrToolsTransport.js';

const request: OrToolsRequest = {
  version: 1,
  limitSeconds: 60,
  courses: [{ id: 'c1', cells: [{ sessionNumber: 1, startMinute: 540, endMinute: 585 }] }],
  lessons: [
    { index: 0, courseId: 'c1', classId: 'a', professorId: 'p1', maxPerDay: 1, blockSize: null },
  ],
  units: [{ index: 0, lessonIndex: 0, size: 1, placements: [{ dayOfWeek: 1, firstSession: 1 }] }],
};

const solved = { version: 1, status: 'solved', placements: [] };
const payloadOf = (value: unknown) => Buffer.from(JSON.stringify(value));

type Send = (command: unknown, options?: { abortSignal?: AbortSignal }) => Promise<unknown>;

function build(
  send: Send = () => Promise.resolve({ StatusCode: 200, Payload: payloadOf(solved) }),
) {
  const client = { send: vi.fn(send) };
  return {
    client,
    transport: new LambdaOrToolsTransport(client as unknown as LambdaInvoker, 'ortools-fn'),
  };
}

describe('LambdaOrToolsTransport', () => {
  it('invokes the function and waits for its answer, with the request as the payload', async () => {
    const { transport, client } = build();

    const answer = await transport.solve(request, new AbortController().signal);

    expect(answer).toEqual(solved);
    expect(client.send).toHaveBeenCalledTimes(1);
    const command = client.send.mock.calls[0]?.[0] as InvokeCommand;
    expect(command).toBeInstanceOf(InvokeCommand);
    expect(command.input.FunctionName).toBe('ortools-fn');
    expect(command.input.InvocationType).toBe('RequestResponse');
    expect(JSON.parse(Buffer.from(command.input.Payload as Uint8Array).toString('utf8'))).toEqual(
      request,
    );
  });

  it('passes the abort signal to the client', async () => {
    const { transport, client } = build();
    const controller = new AbortController();

    await transport.solve(request, controller.signal);

    expect(client.send.mock.calls[0]?.[1]).toEqual({ abortSignal: controller.signal });
  });

  it('rejects with the abort error as soon as the signal is aborted', async () => {
    const { transport } = build(
      (_command, options) =>
        new Promise((_resolve, reject) => {
          options?.abortSignal?.addEventListener('abort', () =>
            reject(new DOMException('abortado', 'AbortError')),
          );
        }),
    );
    const controller = new AbortController();

    const pending = transport.solve(request, controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not invoke the function when the signal is already aborted', async () => {
    const { transport, client } = build();
    const controller = new AbortController();
    controller.abort();

    await expect(transport.solve(request, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(client.send).not.toHaveBeenCalled();
  });

  it('rejects, without the text of the function error in the message, when the function fails', async () => {
    const { transport } = build(() =>
      Promise.resolve({
        StatusCode: 200,
        FunctionError: 'Unhandled',
        Payload: payloadOf({ errorMessage: 'Ana Ruiz no cabe en ningún sitio' }),
      }),
    );

    const failure = transport.solve(request, new AbortController().signal);

    await expect(failure).rejects.toBeInstanceOf(OrToolsInvokeError);
    await expect(failure).rejects.not.toThrow(/Ana Ruiz/);
    await expect(failure).rejects.toThrow(/Unhandled/);
  });

  it('rejects when Lambda does not answer with a 200', async () => {
    const { transport } = build(() => Promise.resolve({ StatusCode: 429 }));

    const failure = transport.solve(request, new AbortController().signal);

    await expect(failure).rejects.toBeInstanceOf(OrToolsInvokeError);
    await expect(failure).rejects.toThrow(/429/);
  });

  it.each([
    ['no payload', undefined],
    ['text that is not JSON', Buffer.from('no es json')],
  ])('rejects when the answer has %s', async (_name, payload) => {
    const { transport } = build(() => Promise.resolve({ StatusCode: 200, Payload: payload }));

    await expect(transport.solve(request, new AbortController().signal)).rejects.toBeInstanceOf(
      OrToolsInvokeError,
    );
  });

  it('rejects with the error of the client when the invocation fails', async () => {
    const failure = new Error('AccessDeniedException');
    const { transport } = build(() => Promise.reject(failure));

    await expect(transport.solve(request, new AbortController().signal)).rejects.toBe(failure);
  });
});

describe('createOrToolsLambdaClient', () => {
  it('does not retry: a retry would run CP-SAT twice', async () => {
    const client = createOrToolsLambdaClient('eu-central-1');

    await expect(client.config.maxAttempts()).resolves.toBe(1);
  });

  it('waits for the 60 seconds of CP-SAT plus a margin for the cold start', async () => {
    const client = createOrToolsLambdaClient('eu-central-1');

    // La configuración del manejador HTTP se resuelve de forma perezosa; no es parte de la API tipada del SDK.
    const handler = client.config.requestHandler as unknown as {
      configProvider: Promise<{ requestTimeout: number }>;
    };
    await expect(handler.configProvider).resolves.toMatchObject({ requestTimeout: 90_000 });
  });
});
