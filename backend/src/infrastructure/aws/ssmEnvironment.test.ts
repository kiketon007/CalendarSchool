import type {
  GetParametersByPathCommand,
  GetParametersByPathCommandOutput,
} from '@aws-sdk/client-ssm';
import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../logger.js';
import { loadSsmEnvironment, loadSsmEnvironmentOrLog, type SsmClient } from './ssmEnvironment.js';

const PATH = '/calendarschool/prod/';

type Page = Pick<GetParametersByPathCommandOutput, 'Parameters' | 'NextToken'>;

/** Cliente de SSM simulado que devuelve las páginas indicadas, en orden. */
function clientWithPages(...pages: Page[]) {
  const send = vi.fn((_command: GetParametersByPathCommand) =>
    Promise.resolve(pages.shift() ?? { Parameters: [] }),
  );
  return { client: { send } as unknown as SsmClient, send };
}

describe('loadSsmEnvironment', () => {
  it('names each variable after the last segment of its parameter', async () => {
    const { client } = clientWithPages({
      Parameters: [
        { Name: '/calendarschool/prod/DATABASE_URL', Value: 'postgresql://x' },
        { Name: '/calendarschool/prod/JWT_SECRET', Value: 'jwt-value' },
      ],
    });

    await expect(loadSsmEnvironment(client, PATH)).resolves.toEqual({
      DATABASE_URL: 'postgresql://x',
      JWT_SECRET: 'jwt-value',
    });
  });

  it('follows NextToken until every page has been read', async () => {
    const { client, send } = clientWithPages(
      { Parameters: [{ Name: '/calendarschool/prod/A', Value: '1' }], NextToken: 'page-2' },
      { Parameters: [{ Name: '/calendarschool/prod/B', Value: '2' }] },
    );

    await expect(loadSsmEnvironment(client, PATH)).resolves.toEqual({ A: '1', B: '2' });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[0].input.NextToken).toBeUndefined();
    expect(send.mock.calls[1]?.[0].input.NextToken).toBe('page-2');
  });

  it('asks for decrypted values under the path only, not for nested ones', async () => {
    const { client, send } = clientWithPages({ Parameters: [] });

    await loadSsmEnvironment(client, PATH);

    expect(send.mock.calls[0]?.[0].input).toMatchObject({
      Path: PATH,
      WithDecryption: true,
      Recursive: false,
    });
  });

  it('ignores parameters without a value', async () => {
    const { client } = clientWithPages({
      Parameters: [{ Name: '/calendarschool/prod/EMPTY' }, { Value: 'orphan' }],
    });

    await expect(loadSsmEnvironment(client, PATH)).resolves.toEqual({});
  });

  it('propagates the SSM error', async () => {
    const client = {
      send: () => Promise.reject(new Error('AccessDeniedException')),
    } as unknown as SsmClient;

    await expect(loadSsmEnvironment(client, PATH)).rejects.toThrow('AccessDeniedException');
  });
});

describe('loadSsmEnvironmentOrLog', () => {
  function capturedLogger() {
    const lines: string[] = [];
    return {
      lines,
      logger: createLogger('info', { write: (line: string) => void lines.push(line) }),
    };
  }

  it('returns the parameters without logging when SSM answers', async () => {
    const { client } = clientWithPages({
      Parameters: [{ Name: '/calendarschool/prod/JWT_SECRET', Value: 'jwt-value' }],
    });
    const { logger, lines } = capturedLogger();

    await expect(loadSsmEnvironmentOrLog(client, PATH, logger)).resolves.toEqual({
      JWT_SECRET: 'jwt-value',
    });
    expect(lines).toEqual([]);
  });

  it('writes one fatal line with the path and the error name, and rethrows', async () => {
    const error = Object.assign(new Error('not authorized to perform ssm:GetParametersByPath'), {
      name: 'AccessDeniedException',
    });
    const client = { send: () => Promise.reject(error) } as unknown as SsmClient;
    const { logger, lines } = capturedLogger();

    await expect(loadSsmEnvironmentOrLog(client, PATH, logger)).rejects.toBe(error);

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      level: 'fatal',
      path: PATH,
      errorName: 'AccessDeniedException',
    });
  });
});
