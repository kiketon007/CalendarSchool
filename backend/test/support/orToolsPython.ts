import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repositoryRoot = new URL('../../../', import.meta.url);

/** `solver-ortools/cli.py`, el punto de entrada del motor de Python. */
export const ORTOOLS_SCRIPT = fileURLToPath(new URL('solver-ortools/cli.py', repositoryRoot));

/**
 * El Python con OR-Tools instalado para los tests: el de `SCHEDULE_ORTOOLS_PYTHON`, si no el entorno virtual de
 * `solver-ortools/.venv` (Windows o Linux) y, si no, `python3` (el que instala el CI).
 */
export function orToolsPython(): string {
  const fromEnvironment = process.env['SCHEDULE_ORTOOLS_PYTHON'];
  if (fromEnvironment !== undefined && fromEnvironment !== '') {
    return fromEnvironment;
  }
  for (const relative of [
    'solver-ortools/.venv/Scripts/python.exe',
    'solver-ortools/.venv/bin/python',
  ]) {
    const candidate = fileURLToPath(new URL(relative, repositoryRoot));
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return 'python3';
}

/** Si ese Python puede importar `ortools`. */
export function hasOrTools(): boolean {
  return spawnSync(orToolsPython(), ['-c', 'import ortools'], { stdio: 'ignore' }).status === 0;
}

/**
 * Los tests que lanzan el motor real necesitan Python con `ortools`. En local, sin él, se saltan con un aviso; en CI
 * (`CI=true`) fallan, para que una configuración rota del job no pase desapercibida.
 */
export function orToolsAvailable(): boolean {
  if (hasOrTools()) {
    return true;
  }
  if (process.env['CI'] === 'true') {
    throw new Error(
      `Los tests de OR-Tools necesitan Python con ortools y ${orToolsPython()} no puede importarlo`,
    );
  }
  console.warn(
    'Se saltan los tests de OR-Tools: instala solver-ortools/requirements-dev.txt en un entorno virtual',
  );
  return false;
}
