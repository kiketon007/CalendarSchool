## Context

El repositorio solo tiene documentación y un `package.json` raíz con Cypress 16.1.1. Este cambio crea el esqueleto ejecutable descrito en US00 (`docs/User_Stories_MVP.md`), cuyas decisiones técnicas se cerraron durante la exploración y quedaron incorporadas a la historia (PR #1).

Restricciones de partida:

- Desarrollo en Windows con enlaces simbólicos activos (`core.symlinks=true`) en `.claude/` y `.cursor/`, que apuntan a `ai-specs/`. CI en Linux.
- `.gitattributes` fuerza `eol=lf`.
- Versiones verificadas: Node 24.14, Docker 29, Cypress 16.1.1 (admite Node 22, 24 y 26 o superior), Prisma 7 (generador `prisma-client`, adaptadores obligatorios, `prisma.config.ts`), Vitest 5, Vite con `preview.proxy` heredado de `server.proxy`, PostgreSQL 18 (la imagen guarda los datos en `/var/lib/postgresql/18/docker`, por lo que el volumen se monta en `/var/lib/postgresql`).
- `packages/specboot/` existe solo en local, con su propio `package.json`.

## Goals / Non-Goals

**Goals:**

- Un clon limpio arranca con cinco comandos y sin pasos implícitos.
- Los tests son deterministas, paralelos y no pueden tocar la base de desarrollo.
- Local y CI ejecutan exactamente los mismos scripts.
- Fijar los patrones que heredarán las historias siguientes: capas DDD, inyección de dependencias en `createApp()`, formato de respuesta y de errores, migraciones explícitas y aislamiento de tests.

**Non-Goals:**

- Despliegue en AWS, `lambda.ts` y cualquier tabla, entidad o pantalla del dominio.
- Autenticación y aislamiento por colegio: llegan con US01. `/api/health` es público.
- Limpieza de los datos de E2E en el esquema `public` de test: se decide en US01.
- Rendimiento del solver: no aplica a este cambio.

## Decisions

### D1. Salud con puerto en la capa de aplicación

`DatabasePing` (interfaz) y el caso de uso `CheckHealth` viven en `src/application`; `PrismaDatabasePing` en `src/infrastructure`; el controlador y la ruta en `src/presentation`. `createApp({ config, databasePing, logger })` compone las dependencias.

- **Alternativa descartada: controlador que llama a Prisma directamente.** Obliga a mockear Prisma en los unitarios y crea un precedente contrario a la arquitectura en el primer endpoint.
- **Alternativa descartada: puerto en `src/domain`.** "Salud del sistema" no es un concepto de negocio y contradice CA7.
- **Desviación consciente:** `README.md` §2.3 sitúa las interfaces en el dominio. Se mantiene para las abstracciones de negocio (repositorios, solver); los puertos puramente técnicos van en aplicación.

El ping usa `SELECT 1` con un timeout de 2 s mediante `Promise.race`; ante error o timeout devuelve `{ up: false }`. Ante un error, el adaptador registra la causa en el log. Ante un timeout el adaptador no llega a recibir ningún error, así que es `CheckHealth` quien registra un aviso (`warn`): sin él, un `503` por base de datos colgada no dejaría rastro (hallado en la tarea 17.3). Para no depender de infraestructura, la capa de aplicación define su propio puerto mínimo de log (`ApplicationLogger`, con `warn(contexto, mensaje)`), que el logger de pino satisface sin adaptador.

### D2. Formato de respuesta y middlewares de errores

Se adopta el formato de `docs/backend-standards.md` (`success`, `data`, `error.code`, `error.message`, `error.details`). Una clase de error de aplicación con `code` y `httpStatus` permite que el middleware central traduzca cualquier error a ese formato. El orden en `createApp()` es: timeout → `express.json()` → rutas `/api` → 404 de `/api` → manejador de errores.

- `INVALID_JSON`: el manejador detecta el `SyntaxError` de `express.json()` (tipo `entity.parse.failed`).
- `REQUEST_TIMEOUT`: un middleware propio arma un temporizador de 10 s que responde `503` y lo cancela en `finish`/`close`. Antes de responder comprueba `res.headersSent`; la respuesta del manejador tras el timeout se descarta.
- **Alternativa descartada: `connect-timeout`.** Paquete sin mantenimiento activo; la lógica propia es corta y queda cubierta por tests.
- **Alternativas descartadas para el timeout: `408` y `504`.** `408` indica que el cliente tardó en enviar; `504` es de pasarelas y lo emitirá API Gateway en AWS.

### D3. Configuración

`loadConfig(env)` es una función pura que valida con Zod un objeto de entorno recibido como parámetro (testeable sin tocar `process.env`). Solo `server.ts` la llama con `process.env`. Variables: `NODE_ENV`, `PORT`, `DATABASE_URL`, `LOG_LEVEL`.

- En desarrollo: `node --watch --env-file-if-exists=.env --import tsx src/server.ts` (watcher nativo de Node 24 con tsx solo como cargador de TypeScript). **Descartado `tsx watch`**: en Windows, lanzado a través de `concurrently` (`npm run dev` de la raíz), el proceso hijo se queda colgado antes de ejecutar el servidor, sin error ni sockets abiertos; funciona solo, pero no combinado. Comprobado en la tarea 17.6 aislando variables: `concurrently` + `tsx` sin watch funciona, y `concurrently` + `node --watch --import tsx` arranca y recarga al cambiar un fichero.
- `prisma.config.ts`: `import "dotenv/config"` y `url: process.env.DATABASE_URL`. **Descartado `env()`**: lanza error sin la variable y rompe `prisma generate` en clon limpio y en CI (confirmado en la documentación de Prisma 7.2).
- **Alternativa descartada: `dotenv` también en la app.** Node 24 lo hace de forma nativa y en producción las variables llegan del entorno.

### D4. TypeScript y ESM

Backend con `"type": "module"`, `module`/`moduleResolution: NodeNext` (imports relativos con `.js`), `tsx` en desarrollo y `tsc` para el build en `dist/`.

- **Alternativa descartada: `moduleResolution: bundler` con esbuild/tsup.** Introduce un bundler antes de necesitarlo; Serverless empaquetará en `despliegue-aws`.
- El riesgo de un `.js` omitido (Vitest lo tolera, Node no) se cubre ejecutando el backend compilado en el E2E.
- **TypeScript fijado a `~6.0`** en ambos workspaces, aunque la última versión es la 7.0: `typescript-eslint` (8.71) solo admite `typescript >=4.8.4 <6.1.0`, y las reglas con información de tipos (D9) lo necesitan. Se revisará cuando `typescript-eslint` admita TypeScript 7.

### D5. Prisma 7

Generador `prisma-client` con `output = "../src/infrastructure/prisma/generated"` y `moduleFormat = "esm"`, ignorado por git y generado en el `postinstall` del workspace `backend` (Prisma 7 eliminó su hook). El cliente solo se importa desde `src/infrastructure`. Una fábrica `createPrismaClient({ connectionString, schema? })` construye el cliente con `new PrismaPg({ connectionString }, { schema })`. Cuando se indica un esquema, además fija el `search_path` de la conexión (`options: -c search_path=<schema>`): la opción `schema` del adaptador solo cualifica las consultas de modelo, y sin el `search_path` el SQL crudo (`$queryRaw`) caería en `public` (comprobado en la tarea 8.4).

- **Alternativa descartada: generar en `src/generated`.** Quedaría fuera de las capas y cualquier capa podría importarlo.

### D6. Aislamiento de tests por esquema de worker

```
calendarschool_test
 ├─ test_1 … test_N   ← integración (un esquema por worker de Vitest)
 └─ public            ← E2E
```

- `backend/vitest.config.ts` define dos proyectos (`unit` e `integration`) y una constante `MAX_WORKERS` compartida. Lee `TEST_DATABASE_URL` con `loadEnv(mode, cwd, '')`.
- `globalSetup` (solo en `integration`): para cada `n` de 1 a `MAX_WORKERS`, `DROP SCHEMA IF EXISTS test_n CASCADE`, `CREATE SCHEMA test_n` y `prisma migrate deploy` con `DATABASE_URL=<TEST_DATABASE_URL>?schema=test_n`.
- `setupFile`: construye el cliente para `test_<VITEST_POOL_ID>` y registra `beforeEach(resetDatabase)`.
- `resetDatabase()` lee `pg_tables` del esquema actual, excluye `_prisma_migrations` y hace un único `TRUNCATE ... RESTART IDENTITY CASCADE`. La salvaguarda comprueba el nombre de la base (`_test`) y el del esquema (`/^test_\d+$/`).

Alternativas descartadas:

- **Solo truncate con `fileParallelism: false`.** Más simple, pero serializa la integración y no escala con las historias.
- **Rollback de transacción por test.** Choca con las operaciones transaccionales del dominio (alta atómica de colegio y usuario en US01).
- **Base por worker.** Multiplica bases y contradice la regla de dos bases.
- **Migrar en `setupFiles`.** Vitest los ejecuta por fichero, no por worker: arrancaría la CLI de Prisma una vez por fichero.

### D7. Orquestador E2E

`scripts/e2e.mjs` (Node, sin dependencias salvo las del repo) sustituye a `start-server-and-test` porque el flujo tiene siete pasos con entorno explícito. Usa `child_process.spawn`, comprueba el puerto con `net.createServer().listen()`, espera con un bucle de `fetch` con timeout global, y cierra los procesos con `taskkill /T /F` en Windows y señales al grupo de procesos en Linux. Puertos: backend de desarrollo 3000, backend de E2E 3001, Vite 5173 y preview 4173, todos estrictos.

`frontend/vite.config.ts` define `server.proxy['/api'].target = process.env.API_PROXY_TARGET ?? 'http://localhost:3000'`; `preview.proxy` lo hereda.

- **Alternativa descartada: `cypress-io/github-action` con `start`.** Diverge entre local y CI.
- **Alternativa descartada: `preview.proxy` fijo al puerto de E2E.** Ata `vite preview` al E2E.

### D8. Cobertura

Proveedor `v8`. Umbrales en la raíz de `backend/vitest.config.ts` (90 %) y de `frontend/vite.config.ts` o `vitest.config.ts` (80 %), con la lista de exclusiones comentada. La cobertura de Vitest es global: los proyectos no pueden declarar umbrales propios.

### D9. Lint, formato y hooks

- ESLint en *flat config*, una por workspace, con `typescript-eslint`, `eslint-config-prettier` y, en el frontend, reglas de React Hooks y `eslint-plugin-cypress` solo para `cypress/**`. Las reglas con información de tipos se activan en `npm run lint`; el hook usa una configuración sin ellas para ser rápido.
- `.lintstagedrc.json` en `backend/` y `frontend/`, ninguno en la raíz. lint-staged usa la configuración más cercana y su directorio como `cwd`, así que los ficheros fuera de los workspaces quedan sin configuración y no se procesan.
- `"prepare": "husky"` y `.husky/pre-commit` con `npx lint-staged`.

### D10. CI

`.github/workflows/ci.yml` con dos jobs en `ubuntu-latest`, Node desde `.nvmrc`, `actions/setup-node` con caché de npm, `HUSKY=0`, servicio `postgres:18` con `healthcheck` y `TEST_DATABASE_URL` en el entorno.

- `quality`: `npm ci` con `CYPRESS_INSTALL_BINARY=0`, `npm run lint`, `npm run typecheck --workspaces` (Vitest no comprueba tipos, y el build solo compila `src/` sin tests; así los errores de tipos en tests y en los specs de Cypress también rompen CI), `npm test`, `npm run build` y `find .claude .cursor -xtype l` (falla si lista algo).
- Acciones fijadas a su versión mayor actual: `actions/checkout@v7`, `actions/setup-node@v7` (Node desde `.nvmrc`) y `actions/cache@v6`. El workflow solo tiene permiso de lectura del repositorio.
- `e2e`: `npm ci` con caché de `~/.cache/Cypress` y `npm run test:e2e`.

El checkout en Linux crea enlaces simbólicos reales, por lo que la comprobación es fiable allí.

### D11. Scripts de instalación de dependencias (npm 11)

npm 11 bloquea por defecto los scripts `install`/`postinstall` de las dependencias y solo ejecuta los aprobados en el campo `allowScripts` del `package.json` raíz (los de los workspaces se ignoran). Se aprueba **Cypress** con `npm approve-scripts cypress`, fijado a la versión instalada, para que su `postinstall` descargue el binario en un clon limpio y en el job `e2e`; en el job `quality` la descarga se evita con `CYPRESS_INSTALL_BINARY=0`. Cualquier otra dependencia que pida scripts se revisa y se aprueba o deniega de forma explícita (`npm approve-scripts` / `npm deny-scripts`), nunca con `--all`.

- **Alternativa descartada: mantener Cypress bloqueado y ejecutar `npx cypress install`.** Evita scripts de terceros, pero añade un paso manual a la instalación local y otro en CI.
- Los scripts propios del proyecto (`postinstall` del workspace `backend`, `prepare` de la raíz) no son de dependencias; se verifica que se ejecutan al configurarlos (tareas 7.3 y 12.5). Verificado para el `postinstall` del backend.
- Decisiones tomadas al instalar: **`@prisma/engines` aprobado** (descarga el *schema engine* en la instalación y no dentro de los tests; la CLI lo descargaría igualmente bajo demanda), **`esbuild` denegado** (el binario llega por su dependencia opcional de plataforma) y **`prisma` denegado** (su `preinstall` solo comprueba la versión de Node, ya fijada por `engines` y `.nvmrc`).

## Risks / Trade-offs

- **[`prisma migrate deploy` podría no respetar `?schema=test_n` en Prisma 7]** → **Resuelto en el spike (tarea 7.6):** con Prisma 7.10.0, `migrate deploy` con `?schema=test_1` crea el esquema y su `_prisma_migrations` dentro de `test_1` sin tocar `public`. La alternativa del SQL con `search_path` no es necesaria.
- **[`npm audit`: 4 vulnerabilidades altas en la CLI de Prisma 7.10.0]** (`deepmerge-ts` vía `@prisma/config` y `mysql2`) → Riesgo aceptado: son dependencias transitivas de una herramienta solo de desarrollo, `deepmerge-ts` solo fusiona nuestra configuración local y el proyecto no usa MySQL. La única corrección que propone npm es bajar a Prisma 6, incompatible con el diseño. Se revisará al publicarse una versión estable de Prisma que las corrija.
- **[Versión de Prisma]** → El tag `latest` de `prisma` apunta a una *release candidate* de la 8 (`8.0.0-rc.20`) mientras `@prisma/client` sigue en 7.10.0; se fijan `prisma`, `@prisma/client` y `@prisma/adapter-pg` a la estable 7.10.0.
- **[`npm test` requiere PostgreSQL]** → `test:unit` para iterar sin base; documentado en `README.md` §1.4 y en `CLAUDE.md`.
- **[Cerrar procesos hijos en Windows]** → `taskkill /T /F`; se verifica ejecutando `test:e2e` en local y comprobando que los puertos quedan libres.
- **[Hook rápido frente a lint completo]** → Las reglas con tipos solo se detectan en `npm run lint` y CI, no al hacer commit. Aceptado por velocidad.
- **[Volumen de Docker previo sin `calendarschool_test`]** → Documentado: `docker compose down -v`.
- **[El orquestador E2E es código sin cobertura]** → Excluido por ser un script; se valida por su propia ejecución en local y en CI, incluido el escenario de puerto ocupado.
- **[Comprobaciones abiertas de lint-staged]** → **Verificadas en la tarea 12.6:** lint-staged encuentra `eslint` y `prettier` de la raíz desde el `cwd` de cada workspace, y un commit que solo toca ficheros sin configuración termina con código 0 sin modificarlos. Las tareas usan `--ignore-path ../.prettierignore` porque Prettier solo busca el fichero de ignorados en el `cwd`.
- **[lint-staged en Windows puede dejar su copia de seguridad]** → Cuando el hook bloquea un commit, lint-staged restaura el estado correctamente pero puede no borrar su `stash` de respaldo ("Failed to clean up temporary files"). No se pierde nada; si aparece en `git stash list` como `lint-staged automatic backup`, se comprueba que coincide con el árbol de trabajo y se elimina. Se documenta en `README.md` §1.4.

## Migration Plan

No hay datos ni despliegue previos. El único cambio sobre algo existente es mover Cypress del `package.json` raíz a `frontend` (`npm uninstall cypress` y `npm install -D cypress -w frontend`); el binario sigue en la caché global y no se vuelve a descargar. Rollback: revertir la rama.

## Open Questions

- Ninguna de diseño. Pendiente fuera del cambio: reestimar US00 (8 puntos) o dividirla.
