import { InvokeCommand } from '@aws-sdk/client-lambda';
import { describe, expect, it, vi } from 'vitest';
import { LambdaGenerationLauncher } from './lambdaGenerationLauncher.js';

function build(
  send: (command: unknown) => Promise<unknown> = () => Promise.resolve({ StatusCode: 202 }),
) {
  const client = { send: vi.fn(send) };
  return { client, launcher: new LambdaGenerationLauncher(client, 'schedule-worker-fn') };
}

describe('LambdaGenerationLauncher', () => {
  it('invokes the worker function asynchronously with only the id of the generation', async () => {
    const { launcher, client } = build();

    await launcher.launch('generation-1');

    expect(client.send).toHaveBeenCalledTimes(1);
    const command = client.send.mock.calls[0]?.[0] as InvokeCommand;
    expect(command).toBeInstanceOf(InvokeCommand);
    expect(command.input.FunctionName).toBe('schedule-worker-fn');
    expect(command.input.InvocationType).toBe('Event');
    expect(JSON.parse(Buffer.from(command.input.Payload as Uint8Array).toString('utf8'))).toEqual({
      generationId: 'generation-1',
    });
  });

  it('rejects when the invocation fails, so the generation is not left queued', async () => {
    const failure = new Error('AccessDeniedException');
    const { launcher } = build(() => Promise.reject(failure));

    await expect(launcher.launch('generation-1')).rejects.toBe(failure);
  });

  it('rejects when Lambda does not accept the event', async () => {
    const { launcher } = build(() => Promise.resolve({ StatusCode: 500 }));

    await expect(launcher.launch('generation-1')).rejects.toThrow(/500/);
  });
});
