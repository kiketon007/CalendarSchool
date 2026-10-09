// Orquestador del E2E (design.md D7). Es el mismo en local y en CI: `npm run test:e2e`.
//
// 1. Lee solo TEST_DATABASE_URL (entorno o backend/.env); nunca la DATABASE_URL de desarrollo.
// 2. Comprueba que los puertos del backend de E2E y de `vite preview` están libres.
// 3. Compila backend y frontend, para no probar nunca un build desactualizado.
// 4. Migra el esquema `public` de la base de test y vacía sus datos (salvo el historial de
//    migraciones y los municipios): cada ejecución parte de cero, y los datos de una ejecución
//    fallida quedan hasta la siguiente (design.md D13).
// 5. Arranca el backend compilado con variables explícitas (sin cargar `.env`).
// 6. Arranca `vite preview` con el proxy de /api apuntando al backend de E2E.
// 7. Espera a /api/health a través del proxy, ejecuta Cypress (con los argumentos que reciba el
//    script, p. ej. `--spec`) y cierra los procesos.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { assertTestDatabaseUrl, cleanE2eData } from './e2eData.mjs';

const E2E_BACKEND_PORT = 3001;
const PREVIEW_PORT = 4173;
const HEALTH_URL = `http://localhost:${PREVIEW_PORT}/api/health`;
const STARTUP_TIMEOUT_MS = 60_000;

/**
 * Tiempo máximo de Cypress: con poca memoria, su navegador puede caerse sin que el proceso
 * termine, y sin este límite el E2E esperaría indefinidamente (design.md D7).
 */
const DEFAULT_CYPRESS_TIMEOUT_MS = 10 * 60_000;
const CYPRESS_TIMEOUT_MS = /^[1-9]\d*$/.test(process.env.E2E_CYPRESS_TIMEOUT_MS ?? '')
  ? Number(process.env.E2E_CYPRESS_TIMEOUT_MS)
  : DEFAULT_CYPRESS_TIMEOUT_MS;

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = join(rootDir, 'backend');
const frontendDir = join(rootDir, 'frontend');
const requireFrom = (dir) => createRequire(join(dir, 'package.json'));

/**
 * Ruta del ejecutable de un paquete, leída de su campo `bin`. Algunos paquetes (vite, cypress)
 * no exportan la ruta de su bin, así que se resuelve a partir de su package.json.
 */
function resolveBin(dir, packageName) {
  const packageJsonPath = requireFrom(dir).resolve(`${packageName}/package.json`);
  const { bin } = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const binPath = typeof bin === 'string' ? bin : bin[packageName];
  return join(dirname(packageJsonPath), binPath);
}

const log = (message) => console.log(`[e2e] ${message}`);
const children = [];

// --- 1. URL de la base de test -------------------------------------------------------------

function readTestDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }
  const envFile = join(backendDir, '.env');
  const fromFile = existsSync(envFile)
    ? parseEnv(readFileSync(envFile, 'utf8')).TEST_DATABASE_URL
    : undefined;
  if (!fromFile) {
    throw new Error('Falta TEST_DATABASE_URL: defínela en backend/.env o en el entorno');
  }
  return fromFile;
}

// --- 2. Puertos libres ---------------------------------------------------------------------

/** Intenta escuchar en el puerto: EADDRINUSE significa ocupado; otros errores se ignoran. */
function isFreeOn(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (error) => resolve(error.code !== 'EADDRINUSE'));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

/**
 * En Windows un puerto ocupado en una interfaz no impide escuchar en otra, así que se
 * comprueban todas: comodín y loopback, en IPv4 e IPv6.
 */
async function assertPortFree(port, description) {
  for (const host of ['::', '0.0.0.0', '127.0.0.1', '::1']) {
    if (!(await isFreeOn(port, host))) {
      throw new Error(
        `El puerto ${port} (${description}) está ocupado; libéralo y vuelve a lanzar el E2E`,
      );
    }
  }
}

// --- Ejecución de procesos -----------------------------------------------------------------

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
}

async function runOrFail(description, command, args, options) {
  log(description);
  const code = await run(command, args, options);
  if (code !== 0) {
    throw new Error(`${description}: terminó con código ${code}`);
  }
}

/** Ejecuta un script de npm sin shell (requiere lanzar el orquestador con `npm run`). */
function npm(args, options) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error('Ejecuta el E2E con `npm run test:e2e`');
  }
  return runOrFail(`npm ${args.join(' ')}`, process.execPath, [npmCli, ...args], options);
}

function startBackground(name, command, args, options) {
  log(`Arrancando ${name}`);
  const child = spawn(command, args, {
    stdio: 'inherit',
    // En Linux se crea un grupo de procesos propio para poder cerrarlo entero.
    detached: process.platform !== 'win32',
    ...options,
  });
  child.name = name;
  children.push(child);
  return child;
}

/** Espera a que el proceso termine; si supera `timeoutMs`, falla (stopAll lo cerrará después). */
function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${child.name} no terminó en ${timeoutMs / 1000} s; se cierra el proceso`));
    }, timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function stopAll() {
  for (const child of children) {
    if (child.exitCode !== null || child.pid === undefined) {
      continue;
    }
    if (process.platform === 'win32') {
      // /T cierra también los procesos hijos. Síncrono: debe terminar antes de process.exit.
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // El proceso ya había terminado.
      }
    }
  }
}

// --- 7. Espera a que todo responda ---------------------------------------------------------

async function waitForHealth() {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const exited = children.find((child) => child.exitCode !== null);
    if (exited) {
      throw new Error(`${exited.name} terminó antes de estar listo (código ${exited.exitCode})`);
    }
    try {
      const response = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) {
        return;
      }
    } catch {
      // Todavía arrancando.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${HEALTH_URL} no respondió en ${STARTUP_TIMEOUT_MS / 1000} s`);
}

// --- Flujo principal -----------------------------------------------------------------------

async function main() {
  const testDatabaseUrl = readTestDatabaseUrl();
  // Antes de compilar, migrar o borrar nada: solo se trabaja sobre una base `*_test`.
  assertTestDatabaseUrl(testDatabaseUrl);

  await assertPortFree(E2E_BACKEND_PORT, 'backend de E2E');
  await assertPortFree(PREVIEW_PORT, 'vite preview');

  await npm(['run', 'build', '-w', 'backend']);
  await npm(['run', 'build', '-w', 'frontend']);

  // Entorno del backend de E2E: sin la DATABASE_URL de desarrollo que pudiera heredar.
  const { DATABASE_URL: _devDatabaseUrl, ...inheritedEnv } = process.env;
  const backendEnv = {
    ...inheritedEnv,
    DATABASE_URL: testDatabaseUrl,
    PORT: String(E2E_BACKEND_PORT),
    NODE_ENV: 'test',
    LOG_LEVEL: 'warn',
    // Secreto fijo y exclusivo del E2E: firma tokens que solo viven durante la ejecución.
    JWT_SECRET: 'e2e-only-jwt-secret-0123456789abcdef',
    // El navegador de Cypress abre la aplicación en vite preview: ese es el origen permitido.
    APP_ORIGIN: `http://localhost:${PREVIEW_PORT}`,
    // Todas las peticiones de Cypress llegan desde la misma IP y la suite hace más altas de las que
    // admite el límite real (5 cada 15 minutos): el límite real se prueba en los tests de integración.
    REGISTRATION_ATTEMPTS_MAX: '1000',
  };

  const prismaCli = resolveBin(backendDir, 'prisma');
  await runOrFail(
    'Migrando el esquema public de la base de test',
    process.execPath,
    [prismaCli, 'migrate', 'deploy'],
    {
      cwd: backendDir,
      env: backendEnv,
    },
  );

  log('Vaciando los datos de la base de test');
  const emptied = await cleanE2eData(testDatabaseUrl);
  log(`Tablas vaciadas: ${emptied.length > 0 ? emptied.join(', ') : 'ninguna'}`);

  startBackground('backend de E2E', process.execPath, ['dist/server.js'], {
    cwd: backendDir,
    env: backendEnv,
  });

  const viteCli = resolveBin(frontendDir, 'vite');
  startBackground('vite preview', process.execPath, [viteCli, 'preview'], {
    cwd: frontendDir,
    env: { ...process.env, API_PROXY_TARGET: `http://localhost:${E2E_BACKEND_PORT}` },
  });

  log(`Esperando a ${HEALTH_URL}`);
  await waitForHealth();

  // Cypress se lanza como proceso gestionado para poder cerrar todo su árbol si se cuelga.
  const cypressCli = resolveBin(frontendDir, 'cypress');
  // Los argumentos tras `--` se pasan a Cypress (p. ej. `npm run test:e2e -- --spec cypress/e2e/session.cy.ts`).
  const cypressArgs = ['run', ...process.argv.slice(2)];
  const cypress = startBackground('Cypress', process.execPath, [cypressCli, ...cypressArgs], {
    cwd: frontendDir,
  });
  return waitForExit(cypress, CYPRESS_TIMEOUT_MS);
}

process.on('SIGINT', () => {
  stopAll();
  process.exit(130);
});

let exitCode = 1;
try {
  exitCode = await main();
} catch (error) {
  console.error(`[e2e] Error: ${error.message}`);
} finally {
  stopAll();
}
process.exit(exitCode);
