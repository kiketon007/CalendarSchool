import { spawn } from 'node:child_process';
import type { OrToolsRequest, OrToolsTransport } from '../domain/schedule/orToolsTransport.js';

/** Margen, sobre el límite de CP-SAT, antes de matar un proceso que no lo respeta. */
const DEFAULT_GRACE_MS = 10_000;
/** Lo que se guarda de `stderr` para diagnosticar: el resto se descarta. */
const STDERR_LIMIT = 4_096;

/** El proceso de Python falló. El mensaje no lleva lo que escribió en `stderr` (va aparte, para el log). */
export class OrToolsProcessError extends Error {
  constructor(
    message: string,
    readonly stderr = '',
  ) {
    super(message);
    this.name = 'OrToolsProcessError';
  }
}

export interface ChildProcessOrToolsTransportOptions {
  /** El ejecutable de Python (`SCHEDULE_ORTOOLS_PYTHON`). */
  python: string;
  /** `solver-ortools/cli.py`. */
  script: string;
  /** Margen sobre `limitSeconds` antes de matar el proceso. */
  graceMs?: number;
  /** Se llama con el pid al lanzar el proceso (los tests comprueban que muere). */
  onSpawn?: (pid: number) => void;
}

/**
 * Lanza el motor de Python como proceso hijo (desarrollo, tests y CI): escribe la petición en `stdin` y lee la
 * respuesta de `stdout`. Mata el proceso si se aborta la señal o si no termina pasado el límite de CP-SAT más un
 * margen, y rechaza si no se puede lanzar o termina con un código distinto de 0.
 */
export class ChildProcessOrToolsTransport implements OrToolsTransport {
  constructor(private readonly options: ChildProcessOrToolsTransportOptions) {}

  solve(request: OrToolsRequest, signal: AbortSignal): Promise<unknown> {
    const { python, script, graceMs = DEFAULT_GRACE_MS, onSpawn } = this.options;
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Se abortó antes de lanzar el motor', 'AbortError'));
        return;
      }
      const child = spawn(python, [script], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      if (child.pid !== undefined) {
        onSpawn?.(child.pid);
      }
      const stdout: Buffer[] = [];
      let stderr = '';
      let settled = false;

      const finish = (settle: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        settle();
      };
      const onAbort = () => {
        child.kill();
        finish(() => reject(new DOMException('Se abortó la espera del motor', 'AbortError')));
      };
      const timer = setTimeout(
        () => {
          child.kill();
          finish(() =>
            reject(new OrToolsProcessError('El motor de OR-Tools superó el tiempo máximo', stderr)),
          );
        },
        request.limitSeconds * 1000 + graceMs,
      );
      signal.addEventListener('abort', onAbort, { once: true });

      child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < STDERR_LIMIT) {
          stderr = (stderr + chunk.toString()).slice(0, STDERR_LIMIT);
        }
      });
      // Si el proceso muere antes de leer la petición, escribirla da EPIPE: lo cuenta el código de salida.
      child.stdin.on('error', () => undefined);
      child.on('error', (error) => {
        finish(() =>
          reject(new OrToolsProcessError(`No se pudo lanzar el motor de OR-Tools (${error.name})`)),
        );
      });
      child.on('close', (code) => {
        finish(() => {
          if (code !== 0) {
            reject(
              new OrToolsProcessError(
                `El motor de OR-Tools terminó con el código ${String(code)}`,
                stderr,
              ),
            );
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(stdout).toString('utf8')));
          } catch {
            reject(
              new OrToolsProcessError('El motor de OR-Tools no devolvió un JSON válido', stderr),
            );
          }
        });
      });

      child.stdin.end(JSON.stringify(request));
    });
  }
}
