import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger.js';

function captureStream(): { stream: Writable; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  const lines = () =>
    chunks
      .join('')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  return { stream, lines };
}

describe('createLogger', () => {
  it('writes structured JSON lines with the message and level', () => {
    const { stream, lines } = captureStream();
    const logger = createLogger('info', stream);

    logger.info({ requestId: 'abc' }, 'Servidor arrancado');

    expect(lines()).toEqual([
      expect.objectContaining({ level: 'info', msg: 'Servidor arrancado', requestId: 'abc' }),
    ]);
  });

  it('discards messages below the configured level', () => {
    const { stream, lines } = captureStream();
    const logger = createLogger('warn', stream);

    logger.info('Mensaje informativo');
    logger.warn('Aviso');

    expect(lines().map((line) => line.msg)).toEqual(['Aviso']);
  });

  it('writes to stdout when no destination is given', () => {
    const logger = createLogger('debug');

    expect(logger.level).toBe('debug');
  });

  it('serializes errors with their stack trace', () => {
    const { stream, lines } = captureStream();
    const logger = createLogger('info', stream);

    logger.error({ err: new Error('fallo de conexión') }, 'Error inesperado');

    const [line] = lines();
    expect(line?.err).toEqual(
      expect.objectContaining({ message: 'fallo de conexión', stack: expect.any(String) }),
    );
  });
});
