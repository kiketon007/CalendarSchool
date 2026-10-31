# User Stories - CalendarSchool MVP

> **Producto**: CalendarSchool
> **Versión del documento**: 1.0 · Julio 2026
> **Total de historias en este lote**: 21
> **Fase MVP**: Sprint 1-3

---

## Módulo: Infraestructura Técnica

### US00: Arranque del proyecto (bootstrap-proyecto)

**Épica:** 0. Infraestructura técnica (habilitadora, sin valor funcional directo para el usuario final)

**Estimación:** 10 puntos de historia (reestimada tras la exploración y la implementación del cambio `bootstrap-proyecto`).

**Historia:**
Como equipo de desarrollo, quiero disponer de un esqueleto ejecutable del proyecto (backend, frontend, base de datos, tests y CI), para poder implementar las historias funcionales a partir de US01 sin mezclar la puesta en marcha técnica con la lógica de negocio.

---

#### Casos de uso y reglas de negocio

* **Sin lógica de dominio:**
* Esta historia no contiene entidades, tablas ni endpoints de negocio. Las tablas del dominio llegan con cada historia (`schools` y `users` con US01).
* Termina cuando un endpoint `GET /api/health` y una página vacía pasan los tests unitarios, de API y E2E, en local y en CI.

* **Estructura del repositorio (monorepo con npm workspaces):**
* `package.json` raíz como orquestador de los workspaces, declarados de forma explícita (`["backend", "frontend"]`, sin patrones como `packages/*`), con scripts comunes (`dev`, `build`, `lint`, `format`, `test`, `test:unit`, `test:e2e`, `db:migrate`). `npm run dev` arranca backend y frontend **en paralelo** (`concurrently`), porque `npm run dev --workspaces` los ejecutaría uno tras otro y el primero nunca termina.
* Formato con **Prettier** y hooks de pre-commit con **husky + lint-staged** (lint y formato solo de los ficheros modificados de `backend/` y `frontend/`; nunca de `.claude/`, `.cursor/`, `ai-specs/` ni `docs/`). Detalle en *Calidad y tests*.
* Los scripts `lint` y `format` se invocan siempre con rutas explícitas (`backend`, `frontend`), nunca sobre `.`; `.prettierignore` y la configuración de ESLint ignoran además `.claude`, `.cursor`, `ai-specs`, `docs`, `openspec` y `packages` (doble protección: los enlaces simbólicos de `.claude/` y `.cursor/` exponen los mismos ficheros por dos rutas).
* La dependencia de Cypress del `package.json` raíz actual se traslada al workspace `frontend` (`npm uninstall cypress` en la raíz y `npm install -D cypress -w frontend`, conservando `^16.1.1`). Sigue habiendo un único `package-lock.json`, en la raíz.
* Versión de Node.js fijada a **24 LTS** mediante `.nvmrc` y el campo `engines`.

* **Backend (`backend/`):**
* Express + TypeScript en modo `strict`.
* Carpetas de las cuatro capas DDD creadas: `src/domain`, `src/application`, `src/presentation`, `src/infrastructure` (estructura de `README.md` §2.3). `src/domain` queda vacía (con `.gitkeep`); las demás contienen solo la infraestructura técnica de esta historia (salud, logger, configuración, cliente Prisma, middlewares), sin lógica de negocio.
* Toda la API se sirve bajo el prefijo `/api`.
* Formato de respuesta de toda la API (el de `docs/backend-standards.md`): éxito `{ "success": true, "data": { ... } }`; error `{ "success": false, "error": { "code": "ERROR_CODE", "message": "...", "details": [ ... ] } }`. El `message` es para desarrolladores y va en castellano; el frontend nunca lo muestra: traduce a partir de `code` mediante i18n.
* Endpoint `GET /api/health` que responde `200` con `{ "success": true, "data": { "status": "ok", "database": "up" } }`, sin exponer detalles internos (versión de PostgreSQL, host, credenciales). Si la base de datos no responde en 2 segundos (timeout propio del ping, menor que el de 10 segundos de la petición), responde `503` con el código `DATABASE_UNAVAILABLE`; el detalle del error se registra en el log y nunca en la respuesta.
* La comprobación de salud sigue el patrón puerto/adaptador: el puerto `DatabasePing` y su caso de uso viven en `src/application` (no es una abstracción de negocio, por lo que `src/domain` queda vacío; desviación deliberada respecto a `README.md` §2.3, que se documenta en `design.md`), el adaptador Prisma en `src/infrastructure` y el controlador en `src/presentation`. La composición de dependencias se hace en `app.ts`: `createApp()` recibe el `DatabasePing` por parámetro, de modo que Supertest inyecta un fake y el arranque real inyecta el adaptador Prisma.
* Middleware de gestión de errores centralizado, siempre con respuesta JSON en el formato común (nunca la página HTML por defecto de Express):
  * Ruta desconocida bajo `/api`: `404` con `NOT_FOUND`.
  * JSON mal formado en el cuerpo: `400` con `INVALID_JSON`.
  * Error no controlado: `500` con `INTERNAL_ERROR`, sin traza en la respuesta (la traza va al log).
* Middleware de timeout de petición (10 segundos): responde `503` con `REQUEST_TIMEOUT` (distinto de `DATABASE_UNAVAILABLE`). Como el handler original sigue ejecutándose, se comprueba `res.headersSent` para no intentar responder dos veces.
* Logger centralizado con **pino** (logs JSON estructurados) en `src/infrastructure/logger.ts`.
* Configuración por variables de entorno validadas al arrancar con **Zod**; el proceso no arranca si falta o es inválida alguna. Plantilla en `backend/.env.example` (nunca `.env` versionado), con `DATABASE_URL` (desarrollo), `TEST_DATABASE_URL` (solo para los tests; la configuración Zod de la app no la conoce) y el resto de variables; sus credenciales coinciden con las de `docker-compose.yml` (son solo de desarrollo local). En desarrollo la app carga `.env` con el soporte nativo de Node (`--env-file-if-exists=.env`), sin `dotenv`; en producción las variables llegan del entorno.
* Solo `server.ts` llama a `loadConfig()`. `createApp()` nunca lee `process.env`: recibe la configuración y las dependencias por parámetro, de modo que los tests unitarios no necesitan variables de entorno (en CI no existe `DATABASE_URL`).
* Backend en ESM (`"type": "module"`) con `moduleResolution: NodeNext` (imports relativos con extensión `.js`); `tsx` en desarrollo y `tsc` en build, con salida ejecutable mediante `node dist/server.js`. La app Express se exporta separada del arranque del servidor (`app.ts` / `server.ts`) para poder probarla con Supertest y envolverla más adelante para Lambda. `server.ts` no contiene lógica: solo `loadConfig()` → `createApp()` → `listen()`.

* **Base de datos:**
* PostgreSQL en Docker Compose (`docker-compose.yml`; 18 en US00 y 17 desde `despliegue-aws`, la misma versión mayor que Supabase) con dos bases de datos en el mismo contenedor: `calendarschool` (desarrollo) y `calendarschool_test` (tests). Los tests nunca usan la base de desarrollo.
* La imagen de PostgreSQL solo crea una base (`POSTGRES_DB`); la de test se crea con un script en `docker-entrypoint-initdb.d`. Ese script **solo se ejecuta al crear el volumen por primera vez**: si el volumen ya existía, hay que recrearlo (`docker compose down -v`). Se documenta en `README.md` §1.4.
* Prisma en su versión estable actual: generador `prisma-client` con `output` explícito en `src/infrastructure/prisma/generated/` (ignorado por git; se genera en el `postinstall` del workspace `backend`, ya que Prisma 7 eliminó su propio hook), adaptador `@prisma/adapter-pg` y `prisma.config.ts`, con una migración inicial vacía.
* `prisma.config.ts` carga `.env` con `import "dotenv/config"` (Prisma 7 ya no lo carga solo) y usa `url: process.env.DATABASE_URL`, no el helper `env()`: `env()` lanza un error si la variable falta y haría fallar `prisma generate` en un clon limpio o en CI, donde todavía no hay `.env`. Los comandos que sí necesitan base (`migrate deploy`) fallan con un mensaje claro de Prisma si falta la URL. `dotenv` no sobrescribe variables ya definidas, por lo que una `DATABASE_URL` pasada por el entorno tiene prioridad sobre el `.env`.
* Quién aplica las migraciones (nunca de forma implícita):
  * Base de desarrollo: `npm run db:migrate` (`prisma migrate deploy` contra `calendarschool`), paso explícito de la instalación (CA1).
  * Esquemas `test_1…test_N` de `calendarschool_test`: el `globalSetup` de Vitest.
  * Esquema `public` de `calendarschool_test`: el script `test:e2e`, antes de arrancar el backend.
* **Aislamiento entre tests de integración:** esquema por worker dentro de `calendarschool_test` (`test_1…test_N`; se mantienen las dos bases) más vaciado dinámico de tablas antes de cada test.
  * La URL de la base de test sale de la variable explícita `TEST_DATABASE_URL` (en `backend/.env` en local y en el entorno de los jobs en CI). La configuración de Vitest del backend la lee con `loadEnv(mode, cwd, '')` de Vite, porque Vitest no vuelca `.env` en `process.env`.
  * El `globalSetup`, que pertenece solo al proyecto de integración, crea y migra (`prisma migrate deploy` con `DATABASE_URL` igual a `TEST_DATABASE_URL`) los esquemas `test_1…test_N`, con N igual a la constante `maxWorkers` compartida entre la configuración de Vitest y el setup. Los `setupFiles` no migran: Vitest los ejecuta por fichero de test, no por worker.
  * El `setupFile` elige el esquema `test_<VITEST_POOL_ID>`; el cliente Prisma de test se construye con `new PrismaPg({ connectionString }, { schema })` y se inyecta en `createApp()`.
  * Helper `resetDatabase()`: lee las tablas del esquema del worker desde `pg_tables`, excluye `_prisma_migrations` y ejecuta `TRUNCATE ... RESTART IDENTITY CASCADE` en `beforeEach`, de modo que las historias siguientes no tienen que modificarlo al añadir tablas. Se niega a ejecutarse si la base no termina en `_test` o el esquema no es `test_<n>`.
  * Como la migración inicial está vacía, el helper se verifica con un test de integración que crea una tabla temporal, inserta una fila, llama a `resetDatabase()` y comprueba que la tabla queda vacía, que `_prisma_migrations` sigue intacta y que no se tocan otros esquemas.
* El DDL MySQL (`MODELO_DATOS_SQL_DDAL.sql`) queda como referencia histórica; no se usa para generar el esquema.

* **Frontend (`frontend/`):**
* Vite + React 19 + TypeScript + Bootstrap 5 (react-bootstrap).
* Enrutado básico con una página inicial vacía.
* i18n con **react-i18next**, recursos `es.json` y `en.json` (sin textos *hardcoded*).
* Proxy de Vite: las peticiones a `/api/*` se redirigen al backend, de modo que en local frontend y API comparten origen (sin CORS y con el mismo comportamiento de cookies que en producción). El destino del proxy se lee de una variable de entorno (p. ej. `API_PROXY_TARGET`), con el backend de desarrollo como valor por defecto, por lo que el frontend no necesita `.env`. `preview.proxy` hereda `server.proxy`, y `test:e2e` fija la variable al backend de E2E: sin ella, `vite preview` enviaría las peticiones del E2E al backend de desarrollo (falso verde contra `calendarschool`).

* **Calidad y tests:**
* Backend: Vitest + Supertest con umbral de cobertura del 90% (ramas, funciones, líneas y sentencias). Tests unitarios (sin base de datos) y de integración (contra `calendarschool_test`) en proyectos de Vitest separados. La cobertura se mide sobre la unión de ambos y los umbrales se declaran en `backend/vitest.config.ts`, no en cada proyecto de Vitest (la cobertura es global, no por proyecto). Por ello `npm test` requiere PostgreSQL levantado; `test:unit` ejecuta solo el proyecto unitario y no necesita base de datos.
* Frontend: Vitest + React Testing Library con umbral de cobertura del 80%, sin `globals` (los tests importan `describe`, `it` y `expect`) para no chocar con los tipos de Cypress.
* Exclusiones de cobertura: cliente Prisma generado, `*.d.ts`, ficheros de configuración (`*.config.ts`, `prisma.config.ts`), tests, `cypress/`, `scripts/`, `.gitkeep` y los puntos de entrada `server.ts` y `main.tsx`. Regla: los puntos de entrada no contienen lógica; cualquier lógica que aparezca en ellos se extrae a un módulo que sí se mide. La lista se documenta con un comentario en `vitest.config.ts`.
* Antes de configurar Prisma, Vite, Vitest y Cypress se consulta su documentación actual (Context7): los patrones antiguos (p. ej. `prisma-client-js` o `import { PrismaClient } from '@prisma/client'`) ya no son válidos.
* E2E: Cypress en `frontend/cypress/`, ejecutado en modo headless, con `cypress/tsconfig.json` propio, `eslint-plugin-cypress` solo en `cypress/**` y `cypress/` excluido de Vitest y del `tsconfig` de la aplicación. Dos specs: la página inicial carga (se localiza por `data-testid`, no por texto traducido) y `/api/health` responde `200` con la forma esperada a través del proxy. Sin *component testing* (lo cubren Vitest y React Testing Library).
* Un único script `test:e2e`, compartido entre local y CI, implementado como orquestador Node multiplataforma (`scripts/e2e.mjs` en la raíz, en lugar de `start-server-and-test`). En orden:
  1. Lee **solo** `TEST_DATABASE_URL` de `backend/.env` (o del entorno en CI), sin heredar la `DATABASE_URL` de desarrollo.
  2. Comprueba que el puerto del backend de E2E está libre; si está ocupado, falla sin ejecutar los tests.
  3. Compila backend y frontend, para no probar nunca un build desactualizado.
  4. Aplica `prisma migrate deploy` sobre el esquema `public` de `calendarschool_test`.
  5. Arranca el backend compilado (`node dist/server.js`, sin `--env-file-if-exists`) con variables explícitas: `DATABASE_URL` igual a `TEST_DATABASE_URL`, el puerto de E2E y `NODE_ENV=test`. El backend compilado actúa además como comprobación de que el build ESM arranca.
  6. Sirve el **build del frontend con `vite preview`** (puerto 4173) con el destino del proxy apuntando al backend de E2E.
  7. Espera a `http://localhost:4173/api/health` (valida a la vez preview, proxy y base de datos), ejecuta Cypress y cierra los procesos que arrancó, también en Windows.
* Los puertos del backend de desarrollo, del backend de E2E y de `vite preview` son estrictos: si están ocupados, el proceso falla en vez de saltar en silencio a otro puerto.
* ESLint en ambos workspaces. El hook de pre-commit usa solo reglas sin información de tipos (las demás las ejecutan `npm run lint` y CI).
* Hooks de pre-commit: `"prepare": "husky"` en la raíz, `.husky/pre-commit` con `npx lint-staged`, un `.lintstagedrc` por workspace y ninguno en la raíz (los ficheros fuera de `backend/` y `frontend/` no tienen configuración y no se procesan). Tareas: `eslint --fix --max-warnings=0` y después `prettier --write` para `*.{ts,tsx,js,mjs,cjs}`; solo `prettier --write` para `*.{json,css,md,yml}`. Sin tests ni `tsc` en el hook y sin commitlint.
* GitHub Actions, en cada push a `main` y en cada pull request (no en los push a otras ramas, para no duplicar ejecuciones), con caché de npm y `HUSKY=0`, en dos jobs:
  * `quality`: instalación con `CYPRESS_INSTALL_BINARY=0` (el `postinstall` genera el cliente Prisma), lint, tests (unitarios y de integración, con PostgreSQL como contenedor de servicio (17 desde `despliegue-aws`) con `POSTGRES_DB=calendarschool_test` y `TEST_DATABASE_URL` en el entorno del job), build y comprobación de enlaces simbólicos rotos en `.claude/` y `.cursor/` (`find .claude .cursor -xtype l`).
  * `e2e`: PostgreSQL como contenedor de servicio (17 desde `despliegue-aws`) con `POSTGRES_DB=calendarschool_test`, `TEST_DATABASE_URL` en el entorno del job, caché del binario de Cypress y ejecución de `npm run test:e2e` (que compila y migra por sí mismo).

* **Contrato API:**
* `docs/api-spec.yml` arrancado en OpenAPI 3 con el endpoint `/api/health` (respuestas `200` y `503`) y el formato de error definido como componente reutilizable (`ErrorResponse`), con los códigos `NOT_FOUND`, `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `INTERNAL_ERROR`, `REQUEST_TIMEOUT` y `DATABASE_UNAVAILABLE`, para que las historias siguientes lo referencien en lugar de redefinirlo.

* **Fuera de alcance:**
* Despliegue en AWS (Lambda, API Gateway, RDS, dominios), incluido el envoltorio `lambda.ts`: irá en un cambio posterior `despliegue-aws`.
* Cualquier tabla, entidad o pantalla del dominio.

---

#### Criterios de Aceptación

* **CA1 (Instalación y arranque local):** Dado un clon limpio del repositorio con Node.js 24 y Docker instalados, cuando ejecuto `npm install`, copio `backend/.env.example` a `backend/.env`, ejecuto `docker compose up -d`, `npm run db:migrate` y `npm run dev`, entonces `npm install` termina sin errores aunque todavía no exista `.env`, el backend y el frontend arrancan en paralelo sin errores, existen las bases `calendarschool` y `calendarschool_test`, y desde el frontend en `localhost:5173` una petición a `/api/health` llega al backend a través del proxy.
* **CA2 (Endpoint de salud):** Dado que el backend está en marcha, cuando hago `GET /api/health`, entonces recibo `200` con `{ "success": true, "data": { "status": "ok", "database": "up" } }`; si la base de datos no está disponible o no responde en 2 segundos, recibo `503` con el código `DATABASE_UNAVAILABLE` en el formato de error común, sin esperar al timeout de 10 segundos de la petición. En ningún caso la respuesta expone detalles internos. Una ruta desconocida bajo `/api` devuelve `404` con `NOT_FOUND` en JSON, un cuerpo JSON mal formado devuelve `400` con `INVALID_JSON`, un cuerpo de más de 100 KB devuelve `413` con `PAYLOAD_TOO_LARGE`, un `charset` o `Content-Encoding` no soportado devuelve `415` con `UNSUPPORTED_MEDIA_TYPE`, un error no controlado devuelve `500` con `INTERNAL_ERROR` sin traza, y una petición que supera los 10 segundos devuelve `503` con `REQUEST_TIMEOUT`.
* **CA3 (Tests en verde):** Dado el proyecto instalado, cuando ejecuto `npm test` desde la raíz, entonces se ejecutan los tests de backend y frontend, todos pasan, los tests de integración usan `calendarschool_test` (un esquema por worker) y la cobertura, medida sobre tests unitarios más de integración y con las exclusiones documentadas, alcanza el 90% en el backend y el 80% en el frontend. `npm test` requiere PostgreSQL levantado.
* **CA4 (E2E):** Dado el proyecto instalado, PostgreSQL levantado y el puerto del backend de E2E libre, cuando ejecuto `npm run test:e2e`, entonces el script compila backend y frontend, migra el esquema `public` de `calendarschool_test`, arranca ambos (el frontend con `vite preview` y el proxy apuntando al backend de E2E) y Cypress en modo headless carga la página inicial y comprueba `/api/health` a través del proxy. Si el puerto del backend de E2E está ocupado, el script falla sin ejecutar los tests. El mismo script se usa en local y en CI.
* **CA5 (Lint):** Dado el proyecto instalado, cuando ejecuto `npm run lint`, entonces ESLint no reporta errores en ningún workspace y Prettier no detecta ficheros sin formatear, ambos invocados con rutas explícitas (`backend`, `frontend`) y nunca sobre la raíz.
* **CA6 (Integración continua):** Dado que abro o actualizo una pull request, o hago push a `main`, cuando se ejecuta GitHub Actions, entonces se ejecutan los jobs `quality` (lint, tests unitarios y de integración, build y comprobación de enlaces simbólicos rotos en `.claude/` y `.cursor/`) y `e2e`, y el workflow falla si cualquiera de ellos falla.
* **CA7 (Arquitectura):** Dado el backend generado, cuando reviso `backend/src`, entonces existen las carpetas de las cuatro capas DDD y ninguna contiene lógica de negocio.
* **CA8 (Hook de pre-commit):** Dado que modifico un fichero de `backend/` o `frontend/` con errores de lint o sin formatear, cuando intento hacer commit, entonces el hook de husky + lint-staged formatea el fichero y bloquea el commit si quedan errores de lint; los ficheros fuera de esos workspaces no se procesan. Se verifica manualmente con tres escenarios: (1) un fichero de `backend/` mal formateado se formatea y el commit pasa; (2) un fichero de `backend/` con un error de lint que no se corrige solo bloquea el commit; (3) un fichero de `docs/` mal formateado se confirma sin tocarlo.
* **CA9 (Aislamiento de tests):** Dado el proyecto instalado y PostgreSQL levantado, cuando se ejecutan los tests de integración en paralelo, entonces cada worker usa su propio esquema `test_<n>` de `calendarschool_test`, `resetDatabase()` vacía las tablas del esquema del worker sin tocar `_prisma_migrations` ni otros esquemas, y se niega a ejecutarse si la base no termina en `_test` o el esquema no es `test_<n>`.

---

#### Requisitos Técnicos, QA y Riesgos

* **Documentación a actualizar al completarla:** `CLAUDE.md` (comandos reales de build, lint y tests), `README.md` §1.4 (instalación, enlazando a la explicación existente de los enlaces simbólicos en lugar de duplicarla) y `docs/api-spec.yml`.
* **Riesgos:**
* **Runtime de Lambda:** comprobar que `nodejs24.x` está disponible al abordar `despliegue-aws`; si no, usar una imagen de contenedor.
* **PostgreSQL 18 en RDS (resuelto en `despliegue-aws`):** la base de producción es Supabase, que ofrece PostgreSQL 17. Docker Compose y CI bajaron a la 17; las migraciones no usan nada exclusivo de la 18.
* **Volumen de Docker existente:** si el volumen de PostgreSQL ya existía, no se crea `calendarschool_test` (ver regla de la base de datos).
* **Enlaces simbólicos en Windows:** los workspaces no deben romper los enlaces de `.claude/` y `.cursor/` (ver `README.md` §1.4). Se mitiga con workspaces explícitos, herramientas con rutas explícitas, la comprobación manual (listar `.claude/skills` tras `npm install` y confirmar que los enlaces siguen vivos) y el paso de CI contra enlaces rotos.
* **Migración por esquema (a verificar en un spike):** la documentación de Prisma 7 no confirma que `prisma migrate deploy` respete `?schema=test_N` en la `DATABASE_URL`. Si no lo respeta, hay que cambiar el mecanismo de migración por esquema antes de seguir con el aislamiento entre tests.
* **Comprobaciones técnicas pendientes en las tareas:** que las tareas de lint-staged encuentren `eslint` y `prettier` en el `node_modules/.bin` de la raíz desde el `cwd` del workspace; qué código de salida devuelve lint-staged con un commit que solo toca ficheros sin configuración; y que Prisma no regenera el cliente tras `migrate` (se asume que no; el cliente se genera siempre en `postinstall`).
* **Datos acumulados en el E2E:** desde US01 los E2E escribirán datos en el esquema `public` de `calendarschool_test`, que `resetDatabase()` rechaza a propósito. La estrategia de limpieza de esos datos se decide en la primera historia que escriba datos (US01), no en esta.
* **Imports ESM:** un `.js` omitido en un import relativo pasa en Vitest (resolvedor de Vite) y rompe en `node dist/server.js`; lo detecta el E2E, que ejecuta el backend compilado.

#### Tareas pendientes tras la revisión adversarial de US00

Hallazgos Minor y preguntas de la revisión adversarial del cambio `bootstrap-proyecto` (2026-10-07) que no bloquean su archivo. Cada tarea indica en qué cambio se aborda; al hacerlo, se incorpora a sus artefactos OpenSpec y se marca aquí.

* **Para US00_b (`despliegue-aws`):**
  * [x] **Timeouts del pool de PostgreSQL** (resuelto en `despliegue-aws`: `connectionTimeoutMillis` de 5000 por defecto y `poolMax`; la Lambda usa 2 conexiones): con la base colgada, cada `GET /api/health` responde `503` a los 2 s, pero su consulta queda pendiente sin límite, porque el pool de `pg` no tiene `connectionTimeoutMillis`. Con las comprobaciones periódicas del balanceador las consultas se acumularían. Fijar `connectionTimeoutMillis` (y valorar `statement_timeout`) en `createPrismaClient.ts`.
  * [x] **`prisma` en producción** (resuelto en `despliegue-aws`: `prisma` sigue en desarrollo, porque la Lambda se empaqueta con esbuild sobre un `npm ci` completo y lleva dentro el cliente ya generado; nunca se instala con `--omit=dev`): `prisma` es dependencia de desarrollo, pero el `postinstall` del backend ejecuta `prisma generate`, así que una instalación de producción (`npm ci --omit=dev`) fallaría. Decidir si se genera el cliente en el build o si `prisma` pasa a `dependencies`.
  * [x] **Log estructurado de la configuración inválida** (resuelto en `despliegue-aws`: `loadConfigOrLog` escribe una línea JSON `fatal` con los nombres de las variables, y `server.ts` sale con código 1): si la configuración es inválida, `server.ts` termina por una excepción no capturada (traza de Node en stderr) y no con una línea JSON de pino. Capturar `ConfigError`, registrarlo con pino y salir con `process.exit(1)`, para que CloudWatch lo trate como el resto de logs.
* **Cuando estén implementadas US00_b y US01_b:**
  * [ ] **Prueba de carga del registro (aplazada desde US01):** 1000 registros simultáneos con mediana de respuesta `< 800ms` y sin *starvation* de CPU por Bcrypt cost 12, contra el entorno desplegado. Tenerla en cuenta al elegir la librería de hash.
* **Para US01_b (primera parte de US01 con endpoints de negocio):**
  * [ ] **Handlers y timeout de petición:** solo se descarta sin error la respuesta tardía de un handler `async`. Si un handler responde tarde desde un callback, `ERR_HTTP_HEADERS_SENT` sale como excepción no capturada y tumba el proceso. **Decidido:** fijar en `docs/backend-standards.md` que los handlers de Express son siempre `async`.
  * [ ] **Método no permitido:** `POST /api/health` responde `404 NOT_FOUND` y no `405`. **Decidido:** se mantiene `404 NOT_FOUND` para cualquier combinación de método y ruta que no exista; documentar la convención en `docs/backend-standards.md` y en la descripción general de `docs/api-spec.yml`.
* **Mejoras de tests y CI (sin cambio asignado):**
  * [ ] **Cypress de la página inicial:** `home.cy.ts` comprueba que el `h1` no está vacío, lo que también pasa si i18n falla y se pinta la clave cruda. Comprobar el texto de `es.json`.
  * [ ] **Salud sin detalles internos:** el test «never exposes internal details» usa un `DatabasePing` falso; añadir un caso con el adaptador real y un error de conexión.
  * [ ] **Enlaces simbólicos en CI:** `find .claude .cursor -xtype l` solo detecta enlaces rotos, no enlaces convertidos en ficheros de texto (el fallo típico al clonar en Windows) ni enlaces con un destino equivocado pero existente. Comprobar también que esas rutas son enlaces y apuntan a `ai-specs/`.

---

### US00_b: Despliegue en AWS (despliegue-aws)

**Épica:** 0. Infraestructura técnica (habilitadora, sin valor funcional directo para el usuario final)

**Estimación:** pendiente.

**Historia:**
Como equipo de desarrollo, quiero desplegar automáticamente en AWS lo que hay en `main` cada vez que se integra un cambio, para validar la infraestructura de producción antes de que las historias funcionales dependan de ella.

**Fuentes:** `README.md` §2.4 (*Infraestructura y despliegue*), `docs/arquitectura/ARQUITECTURA_COMPLETA.md` §11, las decisiones y tareas aplazadas de US00 y US01_d, y la exploración `despliegue-aws` (2026-10-11). El PRD no trata el despliegue, pero acota el MVP a un colegio piloto durante 2-3 semanas (§211), por lo que se prioriza un **coste fijo cercano a 0** y la simplicidad frente a la arquitectura objetivo de §11. Donde §11 contradice a US00 (Node.js 18 en CI, plugin de Python, workflow sobre `develop`), prevalece US00. Esta historia se aparta además de §11 y de `README.md` §2.4 en la herramienta de infraestructura (AWS CDK en lugar de Serverless Framework), la base de datos (Supabase en lugar de Aurora Multi-AZ) y la región (`eu-central-1` en lugar de `us-east-1`); esos documentos se actualizan al completarla.

---

#### Casos de uso y reglas de negocio

* **Alcance: la infraestructura y el despliegue continuo, con el registro cerrado:**
* Despliega el contenido de `main`, que ya incluye el registro (US01). Termina cuando la página inicial y `GET /api/health` responden en `https://app.calendarschools.es` contra la base de datos gestionada, y el despliegue se ejecuta automáticamente desde `main`.
* **El registro queda cerrado en producción:** `/api/auth/*` no es accesible desde internet hasta el cambio que implemente US02 (inicio de sesión). El cambio `publicacion-registro` dejó resueltos la política de seguridad de contenidos (CSP) con reCAPTCHA, la prueba del secreto v2 contra Google y el consentimiento con la página `/privacidad`, pero **no abre el registro**: abrirlo es parte de US02 (ver allí). El mecanismo de cierre (p. ej. una CloudFront Function que responde `404` a `/api/auth/*`) se fija en el diseño; debe poder retirarse sin cambiar la aplicación. La página `/registro` puede cargarse, pero su envío falla. **Actualización (`inicio-sesion`, US02):** el cambio retiró la función de cierre y `/api/auth/*` llega al backend desde su despliegue.
* Aunque el registro esté cerrado, la función recibe la configuración completa de producción (`JWT_SECRET`, `RECAPTCHA_V3_SECRET`, `RECAPTCHA_V2_SECRET`), porque `loadConfig` la exige con `NODE_ENV=production`. El frontend se compila con `VITE_RECAPTCHA_SITE_KEY_V3` y `_V2`, que son públicas.
* Las piezas de la arquitectura objetivo ligadas a funcionalidades posteriores (ElastiCache/Redis y SQS para la generación de horarios, capa de OR-Tools, S3 para exportaciones, WebSockets y X-Ray) quedan fuera: cada una llega con la historia que la necesite. La caché y la monitorización avanzada quedan para cuando la aplicación esté más madura (`README.md` §2.4).

* **Región:** `eu-central-1` (Fráncfort) para todos los recursos de AWS y para el proyecto de Supabase, de modo que los datos de los colegios permanecen en la UE y la Lambda y la base de datos están en la misma región. La única excepción es el certificado de ACM para CloudFront, que AWS exige en `us-east-1`. Se descarta `eu-south-2` (España) porque Supabase no la ofrece.

* **Arquitectura:**
```
navegador ──HTTPS──▶ CloudFront ──┬── /*      ──▶ S3 (build de Vite)
 (app.calendarschools.es)          └── /api/*  ──▶ API Gateway (HTTP API) ──▶ Lambda ──TLS──▶ Supabase (pooler, modo transacción)
GitHub Actions ──TLS──▶ Supabase (pooler, modo sesión): migraciones y copias de seguridad
```
* **Backend:** AWS Lambda con Node.js 24 (`nodejs24.x`) detrás de una **HTTP API** de API Gateway, mediante el envoltorio `backend/src/lambda.ts` sobre la app Express de `createApp()`. El handler es `async` (el runtime de Node.js 24 ya no admite handlers con callback). Como `server.ts`, `lambda.ts` es un punto de entrada: no contiene lógica y queda excluido de la cobertura. La regla de US00 «solo `server.ts` llama a `loadConfig()`» pasa a ser «solo los puntos de entrada (`server.ts` y `lambda.ts`) llaman a `loadConfig()`». La arquitectura de la función (`arm64` o `x86_64`) se fija en el diseño y determina el binario precompilado de `@node-rs/bcrypt` que se empaqueta.
* **Base de datos:** **Supabase, plan gratuito**, con la versión mayor de PostgreSQL que ofrezca al crear el proyecto. Se descarta RDS (unos 20 $/mes con `db.t4g.micro` y su almacenamiento) por coste. La Lambda se conecta por el *pooler* de Supabase (Supavisor) en **modo transacción** (puerto 6543) y las migraciones y copias de seguridad en **modo sesión** (puerto 5432), los dos por IPv4 (la conexión directa de Supabase es solo IPv6). Aurora Multi-AZ con réplicas de lectura (§11) queda para cuando el uso lo justifique.
* **Frontend:** el build de Vite se sirve desde un bucket de S3 privado a través de CloudFront (control de acceso al origen, OAC). Una CloudFront Function devuelve `index.html` para las rutas de la SPA (p. ej. `/registro`), sin afectar a `/api/*` ni a los ficheros estáticos.
* **Mismo origen:** CloudFront sirve el frontend y redirige `/api/*` a API Gateway, de modo que en producción frontend y API comparten origen, igual que con el proxy de Vite en local (US00): sin CORS y con el mismo comportamiento de cookies. El comportamiento de `/api/*` no usa caché (`CachingDisabled`) y reenvía al origen todas las cabeceras, cookies y parámetros salvo `Host` (`AllViewerExceptHostHeader`).
* **Dominio:** `https://app.calendarschools.es` (`APP_ORIGIN`). El dominio `calendarschools.es` está registrado en DonDominio y sus DNS se gestionan allí, sin Route 53: el CNAME de validación del certificado de ACM y el CNAME de `app` hacia la distribución de CloudFront se crean a mano y quedan documentados. Las dos claves de reCAPTCHA deben incluir `calendarschools.es` entre sus dominios.
* **Infraestructura como código:** **AWS CDK en TypeScript**, en el directorio `infrastructure/`. Supabase (proyecto, roles y ajustes) y los DNS de DonDominio quedan fuera de CDK y se configuran a mano con pasos documentados.

* **Acceso a la API sin pasar por CloudFront:**
* La URL `*.execute-api` de API Gateway es pública. Quien la llame directamente se salta CloudFront y puede escribir lo que quiera en `X-Forwarded-For`, y con ello elegir la IP que ve el límite de intentos de US01_d.
* CloudFront añade a las peticiones de `/api/*` una cabecera con un valor secreto, y el backend rechaza las que no la traen. Dónde se comprueba (p. ej. un middleware de Express que solo se activa si la configuración incluye el secreto) se fija en el diseño.
* `TRUST_PROXY_HOPS` se fija en producción **midiendo** qué cabecera `X-Forwarded-For` llega a Express a través de CloudFront y API Gateway, no deduciéndolo de la documentación.

* **Base de datos expuesta a internet (riesgo aceptado):**
* Supabase es accesible desde internet y no se puede restringir por IP, porque ni Lambda ni los runners de GitHub tienen IPs fijas. A cambio, la Lambda se ejecuta fuera de una VPC y sale a internet sin el coste fijo de una salida NAT (la verificación de reCAPTCHA de US01_e lo necesita).
* Mitigaciones obligatorias:
  * **SSL obligatorio** en Supabase (*Enforce SSL*) y `ssl` activado en el cliente de `pg`.
  * **La *Data API* de Supabase desactivada** (por defecto expone el esquema `public` por REST); sin ella, el único acceso a los datos es por PostgreSQL.
  * Contraseñas generadas y guardadas solo en Supabase y en AWS.
  * Un **usuario propietario del esquema**, que solo usan las migraciones, y un **usuario de aplicación**, con el que se conecta la Lambda, sin privilegios para modificar el esquema.
* Revisar esta decisión antes de ampliar el uso más allá del colegio piloto.

* **Copias de seguridad y pausa del proyecto:**
* El plan gratuito de Supabase no incluye copias de seguridad descargables. Un workflow programado de GitHub Actions hace cada día un `pg_dump` por el *pooler* en modo sesión y lo guarda en un bucket de S3 privado y cifrado, con una regla de ciclo de vida que elimina las copias de más de 30 días. El workflow se autentica en AWS por OIDC, como el despliegue.
* Supabase pausa los proyectos gratuitos tras 7 días sin actividad. Se asume que la copia diaria cuenta como actividad. Hay que comprobarlo en la documentación de Supabase antes del diseño y, si no basta, añadir una petición periódica a `GET /api/health`.
* La restauración de una copia en una base vacía se prueba una vez y queda documentada.

* **Conexiones y timeouts:**
* Cada instancia de la Lambda usa un pool de como máximo 2 conexiones, con `connectionTimeoutMillis` (tarea heredada de US00). El total de conexiones queda acotado por la concurrencia de la función. Si la cuota de concurrencia de la cuenta es la inicial de 10, no se puede reservar concurrencia, y la propia cuota hace de límite. El *pooler* de Supabase admite muchas más conexiones de cliente que las que abre la base de datos.
* Timeout de la Lambda de unos 15 s: por encima de los 10 s de la petición (US00) y por debajo de los 30 s máximos de la HTTP API. Los 900 s de §11 corresponden a la generación de horarios (fase 2, asíncrona) y quedan fuera.

* **Configuración y secretos:**
* Los secretos de producción (`DATABASE_URL`, `JWT_SECRET`, `RECAPTCHA_V3_SECRET`, `RECAPTCHA_V2_SECRET` y el de la cabecera de CloudFront) se guardan cifrados en AWS y nunca se versionan. Para no tener coste fijo se prefiere SSM Parameter Store `SecureString` (nivel estándar, gratuito) frente a Secrets Manager (0,40 $/mes por secreto). Como CloudFormation no admite `SecureString` en las variables de entorno de una Lambda, `lambda.ts` los lee al arrancar en frío y se los pasa a `loadConfig`. El código que los lee vive en `infrastructure/` y tiene tests. El mecanismo exacto se fija en el diseño.
* La configuración que no es secreta (`NODE_ENV`, `APP_ORIGIN`, `TRUST_PROXY_HOPS`, `REGISTRATION_ATTEMPTS_MAX`) va en variables de entorno normales de la función.
* Se mantiene la validación Zod de US00: con una configuración inválida, la función no atiende peticiones.

* **Despliegue continuo (GitHub Actions):**
* El despliegue se ejecuta en cada push a `main` y solo si pasan los jobs `quality` y `e2e` de CI. En orden: build → migraciones → despliegue del backend → publicación del frontend en S3 e invalidación de CloudFront → smoke test de `GET /api/health` contra `https://app.calendarschools.es`.
* **Migraciones:** `prisma migrate deploy` contra la base de producción, con el usuario propietario del esquema y por el *pooler* en modo sesión, es un paso explícito del despliegue, previo a publicar la nueva versión del backend (regla de US00: nunca se aplican de forma implícita). Si falla, no se publica nada.
* **Credenciales de despliegue:** GitHub Actions se autentica en AWS mediante **OIDC** con un rol de IAM limitado al repositorio y a `main`, sin claves de acceso de larga duración en los secretos de GitHub. La cadena de conexión de migraciones se guarda como secreto del entorno `prod` de GitHub.
* **Entornos:** solo producción (`prod`). El nombre del entorno es un parámetro de la infraestructura, para poder añadir `staging` más adelante sin rehacerla. Los E2E siguen ejecutándose en CI antes de desplegar.
* **Rollback:** se despliega de nuevo un commit anterior mediante una ejecución manual del workflow (`workflow_dispatch`) indicando su referencia. Como las migraciones no se revierten, toda migración debe ser **compatible con la versión anterior del código** (patrón *expand/contract*: primero se añade, después se retira lo que ya no se usa), de modo que volver a la versión anterior sea siempre seguro.

* **Requisitos previos (manuales, fuera del código):**
* **Cuenta de AWS:** MFA en el usuario raíz, un usuario de IAM Identity Center para el trabajo diario, un presupuesto de AWS Budgets con alerta por email, la CLI v2 configurada con `aws configure sso`, el *bootstrap* de CDK en `eu-central-1` y `us-east-1`, y la comprobación de la cuota de concurrencia de Lambda. Si la cuenta es nueva, puede que AWS pida verificarla antes de dejar crear distribuciones de CloudFront.
* **Supabase:** proyecto en Fráncfort con la *Data API* desactivada, el SSL obligatorio y el usuario de aplicación creado.
* **DonDominio:** los dos CNAME anteriores. El primer despliegue no termina hasta que ACM valida el certificado, así que el CNAME de validación se añade durante ese despliegue.
* **reCAPTCHA:** `calendarschools.es` añadido a los dominios de las dos claves.

* **Tareas heredadas de US00:** se incorporan las tareas pendientes de US00 marcadas para esta historia (timeouts del pool de PostgreSQL, `prisma` en producción y log estructurado de la configuración inválida). La comprobación del runtime ya está hecha: Lambda ofrece `nodejs24.x` en todas las regiones (comprobado el 2026-10-07).

---

#### Criterios de Aceptación

* **CA1 (Despliegue automático):** Dado un push a `main`, cuando los jobs `quality` y `e2e` pasan, entonces el workflow despliega backend y frontend sin pasos manuales y termina con un smoke test de `GET /api/health` contra `https://app.calendarschools.es`; si alguno de esos jobs falla, no se despliega nada.
* **CA2 (Aplicación accesible por HTTPS):** Dado un despliegue completado, cuando abro `https://app.calendarschools.es`, entonces se carga la página inicial; al recargar en una ruta de la SPA (p. ej. `/registro`) también se carga la aplicación; y `GET /api/health` desde ese mismo origen responde `200` con `{ "success": true, "data": { "status": "ok", "database": "up" } }` contra la base de Supabase. Una petición por HTTP se redirige a HTTPS.
* **CA3 (Migraciones explícitas):** Dado un despliegue que incluye una migración nueva, cuando se ejecuta el workflow, entonces la migración se aplica a la base de producción antes de publicar el nuevo backend; si falla, el despliegue se detiene y sigue en servicio la versión anterior.
* **CA4 (Secretos y configuración):** Dado el repositorio, ningún fichero versionado contiene credenciales de AWS, de Supabase ni de reCAPTCHA; y si en producción falta una variable de configuración o es inválida, la función registra el error como una línea JSON de pino en CloudWatch y no atiende peticiones.
* **CA5 (Logs en CloudWatch):** Dado el backend desplegado, cuando atiende peticiones o se produce un error, entonces los logs llegan a CloudWatch como JSON estructurado de pino y se conservan 30 días (regla de datos personales de US01_b).
* **CA6 (Rollback):** Dada una versión desplegada, cuando lanzo manualmente el workflow de despliegue con la referencia de un commit anterior de `main`, entonces se despliega esa versión sin pasos manuales adicionales y el smoke test de `GET /api/health` pasa.
* **CA7 (Acceso a la base de datos):** Dada la base de datos de producción, cuando se intenta conectar sin TLS, entonces la conexión se rechaza; el usuario con el que se conecta la Lambda no puede modificar el esquema; y la *Data API* de Supabase no responde.
* **CA8 (Solo a través de CloudFront):** Dada la URL `*.execute-api` de API Gateway, cuando hago `GET /api/health` directamente, sin la cabecera secreta, entonces la petición se rechaza; y a través de CloudFront, `req.ip` es la IP real del cliente aunque la petición traiga un `X-Forwarded-For` escrito por él.
* **CA9 (Registro cerrado):** Dado el entorno desplegado, cuando hago `POST /api/auth/register` o `POST /api/auth/refresh` a través de `https://app.calendarschools.es`, entonces la petición no llega al backend y no se crea ningún dato. **Actualización (`inicio-sesion`, US02):** este criterio dejó de aplicar al abrir la API de autenticación; ahora el smoke test comprueba que `POST /api/auth/login` con el cuerpo vacío llega al backend y responde `400 VALIDATION_ERROR`.
* **CA10 (Copias de seguridad):** Dado el workflow programado, cuando se ejecuta, entonces deja en S3 un `pg_dump` de la base de producción y las copias de más de 30 días se eliminan; y la restauración de una copia en una base vacía está probada y documentada.

---

#### Requisitos Técnicos, QA y Riesgos

* **Documentación a actualizar al completarla:** `README.md` §2.4, `CLAUDE.md` (estado del repositorio y comandos de despliegue), `docs/arquitectura/ARQUITECTURA_COMPLETA.md` §11 (CDK, Supabase y `eu-central-1` en lugar de lo que describen hoy) y una guía de los pasos manuales (AWS, Supabase, DonDominio y reCAPTCHA), con la restauración de copias incluida.
* **Coste:** coste fijo cercano a 0 $/mes, más el dominio. Lambda, API Gateway, CloudFront, S3 y CloudWatch quedan dentro de los niveles gratuitos o en céntimos con el uso del piloto. El presupuesto con alerta avisa si no es así.
* **Comprobaciones antes del diseño:**
* **Sentencias preparadas en modo transacción:** el modo transacción de Supavisor no admite sentencias preparadas con nombre. Comprobar que `@prisma/adapter-pg` no las usa; si las usa, decidir cómo evitarlas.
* **Versión de PostgreSQL (resuelto):** Supabase ofrece PostgreSQL 17, así que Docker Compose y CI usan la 17 para que los tests se ejecuten contra la misma versión mayor que producción.
* **Pausa por inactividad (resuelto):** cuentan las consultas reales; la copia diaria y su llamada a `GET /api/health` (que hace una consulta) mantienen la actividad. Ver *Copias de seguridad y pausa del proyecto*.
* **Riesgos:**
* **Base de datos accesible desde internet (aceptado):** ver *Base de datos expuesta a internet*. Los datos incluirán información personal de menores (alumnado, comedor, becas), por lo que la revisión antes de ampliar el piloto no es opcional.
* **Plan gratuito de Supabase:** sin SLA, sin copias de seguridad propias (se cubre con `pg_dump`) y con pausa por inactividad. Supabase actúa como encargado del tratamiento: su acuerdo de tratamiento de datos (DPA) debe revisarse antes de guardar datos reales de un colegio. Si el piloto lo exige, el plan de pago (unos 25 $/mes) o RDS son alternativas que no cambian la aplicación.
* **Conexiones a PostgreSQL desde Lambda:** cada instancia abre su propio pool. Se acota con el pool máximo y la concurrencia de la función. Si se sube la concurrencia, revisar los límites del *pooler* del plan gratuito.
* **Arranque en frío:** la primera petición tras un periodo sin uso tarda más (inicialización de la Lambda, lectura de los secretos y conexión a la base). Es aceptable para un colegio piloto.
* **Validación del certificado:** depende de que el CNAME de validación se cree en DonDominio. Mientras no se crea, el primer despliegue no termina.

---

## Módulo: Autenticación y Sesión

### US01: Registro de usuario con email y contraseña

**Épica:** [1. Autenticación y Gestión de Sesiones](#epica-1-autenticacion-y-gestion-de-sesiones)

**Historia:**
Como visitante no autenticado, quiero crear una cuenta indicando el nombre y el municipio de mi colegio, mi nombre, email y contraseña, para acceder a CalendarSchool, asegurar la privacidad de mis credenciales y comenzar la gestión de los datos de mi colegio.

Esta historia se divide en seis partes, que se especifican e implementan por separado en este orden: US01_a → US01_b → US01_c y, después, US01_d, US01_e y US01_f en cualquier orden. Las reglas comunes de esta sección se aplican a todas ellas. US01 está completa cuando lo están sus seis partes.

| Parte | Contenido | Criterios |
|---|---|---|
| [US01_a](#us01_a-contrato-de-registro-y-tipos-generados) | Contrato de registro y tipos generados | CA7 |
| [US01_b](#us01_b-alta-atómica-de-colegio-y-usuario) | Alta atómica de colegio y usuario | CA2, CA3, CA4, CA6, CA8, CA11, CA12, CA13 |
| [US01_c](#us01_c-sesión-iniciada-tras-el-registro) | Sesión iniciada tras el registro | CA1 |
| [US01_d](#us01_d-límite-de-intentos-de-registro) | Límite de intentos de registro | CA9 |
| [US01_e](#us01_e-verificación-anti-bot-con-recaptcha) | Verificación anti-bot con reCAPTCHA | CA5 |
| [US01_f](#us01_f-resiliencia-del-formulario-en-el-navegador) | Resiliencia del formulario en el navegador | CA10 |

Los criterios conservan la numeración original de US01 (CA1-CA6) para no romper las referencias desde otras historias; los nuevos continúan a partir de CA7.

---

#### Reglas comunes

* **Orden de procesamiento obligatorio en backend:** 1) rate limit (US01_d) → 2) verificación reCAPTCHA (US01_e) → 3) validación del payload (`400`) → 4) comprobación de email existente y, después, de colegio existente (`409`) → 5) alta del colegio y del usuario (`201`); los pasos 3 a 5 son de US01_b. La existencia del email y del colegio nunca se consulta antes de superar el rate limit y el captcha, para que el formulario no sirva como herramienta gratuita de consulta de emails ni de colegios. Cada parte inserta su paso en la posición indicada sin alterar el resto.
* **Control de Timeout:** Timeout de la petición HTTP configurado a 10 segundos en backend.
* **Publicación en producción:** el registro no se publica en producción (US00_b) hasta que estén implementadas US01_d (límite de intentos) y US01_e (reCAPTCHA), porque hasta entonces el endpoint no tiene protección frente a altas automatizadas. Con las dos implementadas, US00_b despliega el registro cerrado; `publicacion-registro` resuelve lo que faltaba para publicarlo, y lo abrió el cambio `inicio-sesion` (US02).
* **Internacionalización (i18n):** todos los mensajes de error y textos de interfaz se extraen a `es.json` y `en.json`, sin textos estáticos (*hardcoded*).
* **Aplazado hasta tener el entorno desplegado (US00_b):** la prueba de carga de **1000 registros simultáneos** (mediana de respuesta `< 800ms`, sin *starvation* de CPU por los cálculos de Bcrypt). Con Bcrypt cost 12 no es alcanzable en un único proceso de Node y solo tiene sentido medirla sobre la infraestructura real. Figura en las tareas pendientes de US00, para cuando estén implementadas US00_b y US01_b.

---

### US01_a: Contrato de registro y tipos generados

**Historia:**
Como equipo de desarrollo, quiero definir el contrato del registro en `docs/api-spec.yml` y generar a partir de él los tipos TypeScript del frontend, para que backend y frontend no diverjan ni dupliquen los DTOs.

---

#### Casos de uso y reglas de negocio

* El endpoint `POST /api/auth/register` y sus respuestas (`201`, `400`, `409`, `422`, `429`) se definen primero en `docs/api-spec.yml` (OpenAPI 3), reutilizando el formato de error común (`ErrorResponse`) y `components.responses`.
* Los tipos TypeScript del frontend se **generan automáticamente** desde `docs/api-spec.yml` (p. ej. con `openapi-typescript`) mediante un script del workspace `frontend`; no se escriben a mano ni se duplican los DTOs.
* CI comprueba que los tipos generados están al día con el contrato (falla si `api-spec.yml` cambia sin regenerarlos).
* **Respuestas de error del registro:**
  * `400` con `VALIDATION_ERROR` y un elemento en `details` por cada campo inválido, con la forma `{ field, code }`. Los códigos de campo son genéricos y reutilizables: `REQUIRED`, `INVALID_LENGTH`, `INVALID_FORMAT`, `INVALID_CHARACTERS` y `WEAK_PASSWORD`. El frontend traduce la pareja campo-código mediante i18n y muestra el mensaje bajo el campo.
  * `409` con `EMAIL_ALREADY_REGISTERED` (US01_b añade `SCHOOL_ALREADY_REGISTERED`).
  * `422` con `CAPTCHA_CHALLENGE_REQUIRED`: el score de reCAPTCHA v3 es menor que 0.6 y el frontend debe presentar el reto v2.
  * `422` con `CAPTCHA_FAILED`: el token falta, no es válido o ha caducado, o no se ha superado el reto v2. Como el captcha se verifica antes que el payload (paso 2 del orden de procesamiento), un token ausente se responde así y no con `400`.
  * `429` con `TOO_MANY_REQUESTS` y la cabecera `Retry-After` (segundos que faltan para poder reintentar).
* Los códigos nuevos se añaden al enum `ErrorCode`, y las respuestas `400` y `429` se definen en `components.responses` para que las reutilicen otras historias (p. ej. el inicio de sesión, US02).
* La petición indica, junto al token de reCAPTCHA, a qué versión corresponde (v3 o v2), porque cada versión se verifica con una clave secreta distinta.
* Esta parte solo define el contrato y la generación de tipos; el endpoint lo implementan US01_b a US01_e. US01_b amplía después el contrato con el municipio del colegio (ver *Contrato* en US01_b).

---

#### Criterios de Aceptación (MVP)

* **CA7 (Contrato y tipos sincronizados):** Dado que `POST /api/auth/register` está definido en `docs/api-spec.yml`, cuando ejecuto el script de generación del workspace `frontend`, entonces se generan los tipos de la petición y de las respuestas del registro; y si modifico `api-spec.yml` sin regenerarlos, CI falla.

---

### US01_b: Alta atómica de colegio y usuario

**Historia:**
Como visitante no autenticado, quiero crear una cuenta indicando el nombre y el municipio de mi colegio, mi nombre, apellidos, email y contraseña, para que mi colegio y mis credenciales queden registrados de forma segura.

---

#### Casos de uso y reglas de negocio

* **Orden de procesamiento:** implementa los pasos 3) validación del payload (`400`) → 4) comprobación de email existente y, después, de colegio existente (`409`) → 5) alta del colegio y del usuario (`201`) de las reglas comunes.

* **Alta del colegio:**
* El registro crea en una única operación atómica el colegio y su usuario: o se crean ambos o ninguno.
* El usuario registrado queda como administrador de su colegio (rol `ADMIN`). Un colegio puede tener varios usuarios, que se incorporan mediante un enlace de invitación (US02_b); el registro siempre crea un colegio nuevo y nunca da acceso a uno existente.
* **Colegio único por nombre y municipio:** no puede haber dos colegios con el mismo nombre normalizado en el mismo municipio. El nombre normalizado se obtiene pasando a minúsculas, quitando acentos y diacríticos y conservando solo letras y dígitos (p. ej. «C.E.I.P. Nº 3» y «ceip n 3» se consideran el mismo nombre). El nombre se guarda y se muestra tal como lo escribe el usuario. El mismo nombre en municipios distintos corresponde a colegios distintos.
* Los identificadores del colegio y del usuario son **UUIDv7** (ordenados por tiempo), coherentes con el `format: uuid` del contrato (US01_a).
* Los datos de un colegio (profesores, alumnos, cursos, restricciones, horarios, comedor) solo son visibles para los usuarios de ese colegio.

* **Estatus de la Cuenta:**
* La cuenta se crea directamente en estado `ACTIVE`. La verificación de email por enlace queda fuera del MVP (PRD §3.1), por lo que no se envía ningún correo de confirmación.

* **Almacenamiento seguro de credenciales:**
* Algoritmo **Bcrypt con Cost Factor 12**, con la sal aleatoria por hash que genera el propio algoritmo. El hash se calcula de forma **asíncrona, sin bloquear el event loop**, con una librería que funcione en AWS Lambda (US00_b).
* Normalización obligatoria: Emails siempre almacenados en **minúsculas** (`toLowerCase()`) y con eliminación de espacios al inicio/final (`trim()`).

* **Email ya registrado:**
* Re-registración con email usado: se informa explícitamente de que el email ya está registrado y se ofrece ir al login (CA3, PRD §3.1). Es un riesgo de enumeración aceptado y acotado (ver *Riesgos y Mitigaciones*).
* Si dos registros simultáneos usan el mismo email, solo uno se crea y el otro recibe la respuesta de CA3.
* Si el email y el colegio ya están registrados, se informa del email (se comprueba primero).

* **Colegio ya registrado:**
* Si el colegio ya existe en ese municipio, se informa de ello y se indica que hay que pedir una invitación a un administrador del colegio (CA12). Es un riesgo de enumeración aceptado, como el del email (ver *Riesgos y Mitigaciones*).
* Si dos registros simultáneos crean el mismo colegio, solo uno se crea y el otro recibe la respuesta de CA12.

* **Feedback Visual e Inline:**
* Los mensajes de error de validación se muestran inline, justo debajo de cada campo correspondiente (nombre del colegio, municipio, nombre, apellidos, email, contraseña).

* **Contrato (amplía US01_a):** `RegisterRequest` añade `municipalityCode` (código INE); `RegisteredSchool` añade el municipio; el `409` admite también `SCHOOL_ALREADY_REGISTERED`; y se añade el endpoint público `GET /api/municipalities` (sin autenticación y cacheable), del que el formulario obtiene la lista. La tabla de municipios es la única fuente de verdad: la usan el endpoint y la validación del backend.

* **reCAPTCHA:** US01_b creó el puerto de verificación del captcha con un adaptador provisional que aceptaba cualquier token, y el formulario enviaba un token fijo. US01_e lo sustituye por la verificación real de reCAPTCHA y el widget en el formulario, sin cambiar el resto del registro.

* **Tras el alta:** US01_b sustituía el formulario por un mensaje de confirmación de que el colegio y la cuenta se habían creado. Desde US01_c el alta inicia la sesión y redirige a Onboarding, sin ese mensaje intermedio.

* **Normalización Unicode:** todos los textos de entrada se normalizan a NFC antes de validarlos, para que un texto con acentos descompuestos (NFD, habitual al pegar desde macOS) no falle las reglas de caracteres permitidos.

* **Validación en el backend y en el formulario:** las reglas de cada campo se implementan en los dos lados (Zod en el backend; validación inline en el formulario). Para que no diverjan, los tests de ambos usan la misma tabla de ejemplos válidos e inválidos de *Restricciones de campos y formatos*.

* **Fuera de alcance:** el inicio de sesión tras el registro y la redirección a Onboarding (US01_c), y la invitación de otros usuarios (US02_b).

---

#### Restricciones de campos y formatos

##### 0. Nombre del colegio

* **Obligatorio.** Se eliminan los espacios al inicio y al final (`trim()`) antes de validar.
* **Caracteres permitidos:** A-Z, a-z, 0-9, acentos y caracteres del castellano y el valenciano (á, é, í, ó, ú, à, è, ò, ï, ü, ç, ñ, · y sus mayúsculas), espacios, guiones, apóstrofos, puntos y `º`/`ª`.
* **Límite:** entre 2 y 150 caracteres.
* **Ejemplos permitidos:**
* `"CEIP Lluís Vives"` ✓
* `"C.E.I.P. Nº 3"` ✓
* `"Escola Mare de Déu"` ✓
* Fuera del MVP: código de centro de la Conselleria.

##### 0.1. Municipio

* **Obligatorio.** Se elige de la lista cerrada de los municipios de la Comunitat Valenciana, identificados por su código INE; no se admite texto libre, porque muchos municipios tienen dos nombres oficiales (p. ej. «Alicante/Alacant», «Elche/Elx»).
* El formulario ofrece un buscador sobre la lista, que muestra el nombre oficial del municipio y su provincia.
* La lista se carga en la base de datos como datos fijos a partir de la relación oficial de municipios del INE.

##### 1. Nombre y Apellidos (campos separados)

* **Caracteres permitidos:** A-Z, a-z, 0-9, acentos y caracteres del castellano y el valenciano (á, é, í, ó, ú, à, è, ò, ï, ü, ç, ñ, · y sus mayúsculas), espacios, guiones y apóstrofos.
* **Límite:** 100 caracteres por campo.
* **Ejemplos permitidos:**
* Nombre: `"José María"` ✓
* Apellidos: `"García-López"` ✓
* Nombre: `"Pere Lluís"` ✓
* Apellidos: `"Çanyelles i Col·lell"` ✓


##### 2. Email (RFC 5321 SMTP Compliance)

* **Longitud máxima:** 320 caracteres totales.
* **Regex de validación:**
```regex
^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$
```

* **Formatos Aceptados:**
* `usuario+tag@dominio.com` ✓
* `usuario@sub-dominio.com` ✓
* `usuario@dominio.co.uk` ✓

* **Formatos Rechazados:**
* `usuario@localhost` ✗
* `usuario@192.168.1.1` ✗
* `usuario@` ✗


##### 3. Contraseña (Estandarizada para Registro y Reset)

* **Longitud:** Mínimo **8 caracteres**, máximo **72 bytes en UTF-8** (límite de Bcrypt, que ignora el resto; las letras con acento y los símbolos fuera de ASCII ocupan 2 bytes o más) *(corregido el límite inferior de 12)*.
* **Variedad requerida:** Al menos una letra mayúscula, una minúscula, un número y un carácter especial/símbolo (`!@#$%^&*()_+-=[]{}|;:,.<>?`).

---

#### Criterios de Aceptación (MVP)

* **CA8 (Alta del colegio y de la cuenta):** Dado que estoy en la pantalla de registro, cuando envío un nombre de colegio, un municipio, un nombre, unos apellidos, un email y una contraseña válidos, entonces el sistema responde `201`, crea en una única operación el colegio y la cuenta asociada a él en estado `ACTIVE` y con rol `ADMIN`, almacena el email en minúsculas y sin espacios al inicio ni al final y la contraseña solo como hash Bcrypt (cost 12), y registra el evento `USER_REGISTER_SUCCESS`. Si falla la creación de cualquiera de los dos, no se crea ninguno.
* **CA2 (Error de longitud de contraseña):** Dado que intento registrarme con una contraseña fuera del rango permitido (menos de 8 caracteres o más de 72 bytes), cuando intento enviar el formulario, veo un error inline "La contraseña debe tener entre 8 y 72 caracteres (los acentos y los símbolos especiales cuentan por más de uno)" y el formulario no se envía.
* **CA3 (Manejo de Email existente y Privacidad):** Dado que intento registrarme con un email que ya existe en el sistema, cuando envío el formulario, el sistema responde `409` con el código `EMAIL_ALREADY_REGISTERED`, muestra el mensaje "Este email ya está registrado" con un enlace hacia la pantalla de login, no crea ni el colegio ni la cuenta, y registra el evento `USER_REGISTER_DUPLICATE`. Si dos registros simultáneos usan el mismo email, solo uno se crea y el otro recibe esta misma respuesta.
* **CA4 (Formato de email inválido):** Dado que ingreso un email con sintaxis inválida (sin `@`, dominio incompleto, caracteres prohibidos o dirección IP), cuando envío el formulario, veo un error inline "Formato de email inválido" y el formulario no se envía.
* **CA6 (Nombre del colegio inválido):** Dado que dejo vacío el nombre del colegio o introduzco uno con menos de 2 o más de 150 caracteres, o con caracteres no permitidos, cuando intento enviar el formulario, veo un error inline "El nombre del colegio debe tener entre 2 y 150 caracteres válidos" y el formulario no se envía.
* **CA11 (Contraseña sin la variedad requerida):** Dado que introduzco una contraseña de entre 8 caracteres y 72 bytes a la que le falta una mayúscula, una minúscula, un número o un símbolo, cuando intento enviar el formulario, veo un error inline "La contraseña debe contener al menos una mayúscula, una minúscula, un número y un símbolo" y el formulario no se envía; si la petición llega al backend, responde `400` con `VALIDATION_ERROR` y el código de campo `WEAK_PASSWORD` para `password`.
* **CA12 (Colegio ya registrado):** Dado que ya existe un colegio con el mismo nombre normalizado en el mismo municipio, cuando envío el formulario con un email no registrado, el sistema responde `409` con el código `SCHOOL_ALREADY_REGISTERED`, muestra el mensaje "Este colegio ya está registrado en ese municipio. Pide a un administrador del colegio que te invite.", no crea ni el colegio ni la cuenta, y registra el evento `USER_REGISTER_DUPLICATE` con `reason` `SCHOOL`. Si dos registros simultáneos crean el mismo colegio, solo uno se crea y el otro recibe esta misma respuesta.
* **CA13 (Municipio no válido):** Dado que no elijo ningún municipio de la lista, cuando intento enviar el formulario, veo un error inline "Selecciona el municipio del colegio en la lista" y el formulario no se envía; si la petición llega al backend sin municipio o con un código que no existe, responde `400` con `VALIDATION_ERROR` y el código de campo `REQUIRED` o `INVALID_FORMAT` para `municipalityCode`.

---

#### Requisitos Técnicos, QA y Riesgos

##### Requisitos de Testing

* **Unit Tests:** Validaciones de Regex de email, longitud/reglas de contraseña, sanitización `trim()`/`toLowerCase()` y generadores de hashing.
* **Tests de Seguridad:** Inyección SQL y XSS en campos de texto.
* **Tests de Accesibilidad:** Cumplimiento normativo **WCAG 2.1 AA** (foco en errores inline accesibles por lectores de pantalla via `aria-describedby` y `role="alert"`).
* **Datos de los E2E:** es la primera parte que escribe datos en los E2E. `scripts/e2e.mjs` vacía las tablas del esquema `public` de `calendarschool_test` (salvo `_prisma_migrations` y `municipalities`, datos fijos cargados por migración) después de migrar y antes de arrancar el backend, con la misma salvaguarda que `resetDatabase()` (solo bases cuyo nombre termina en `_test`). Cada ejecución parte de cero, y los datos de una ejecución fallida quedan disponibles para investigarla.

##### Riesgos y Mitigaciones

* **Protección XSS/SQLi:** Uso estricto de ORM/consultas preparadas y escape de variables HTML en frontend.
* **Enumeración de emails (riesgo aceptado):** el registro revela si un email ya está registrado (CA3), porque el registro con acceso inmediato (CA1) haría detectable cualquier respuesta genérica sin verificación por email, que queda fuera del MVP. Se acota con el orden de procesamiento (rate limit y reCAPTCHA antes de consultar la base de datos) y con el evento `USER_REGISTER_DUPLICATE` para detectar consultas masivas. Si en el futuro se añade la verificación por email, revisar esta decisión.
* **Enumeración de colegios (riesgo aceptado):** el registro revela si un colegio ya está registrado en un municipio (CA12), y con ello qué colegios usan CalendarSchool. Se acota igual que la enumeración de emails.
* **Ocupación del nombre de un colegio (riesgo aceptado):** sin verificación de identidad, cualquiera puede registrar el nombre de un colegio antes que el propio colegio, que ya no podría darse de alta. En el MVP, con un colegio piloto, se resuelve con soporte manual; revisar antes de ampliar el uso.
* **Observabilidad (Auditoría de Logs):**
* Registrar eventos estructurados: `USER_REGISTER_SUCCESS` (alta creada), `USER_REGISTER_FAILED` (entrada rechazada con `400 VALIDATION_ERROR`) y `USER_REGISTER_DUPLICATE` (`409`, con `reason` `EMAIL` o `SCHOOL`). Los rechazos por límite de intentos y por captcha los definen US01_d y US01_e; los errores internos ya los registra el manejador central.
* **Payload del log:** `timestamp` + `email` **enmascarado** + `ip` + `user_agent`.
* **Datos personales en los logs (RGPD, regla común a la autenticación: US01, US02 y US03):** el email se registra enmascarado (primer carácter y dominio, p. ej. `j***@example.com`); la IP y el user agent, completos, porque bastan para detectar consultas masivas. La contraseña nunca se registra (se elimina del log con `redact` de pino). Los logs se conservan 30 días (US00_b).

---

### US01_c: Sesión iniciada tras el registro

**Historia:**
Como usuario recién registrado, quiero que mi sesión se inicie automáticamente al terminar el registro, para empezar a configurar mi colegio sin tener que iniciar sesión.

---

#### Casos de uso y reglas de negocio

* **Gestión de Sesiones y Tokens:**
* **Cookie de Sesión / Refresh Token:** Configurada con `HttpOnly`, `Secure` y `SameSite=Lax` (permite conservar la sesión al llegar a la aplicación desde enlaces externos) con **TTL de 24 horas**.
* **Access Token (JWT en memoria):** **TTL de 15 minutos**.
* La infraestructura de tokens que se crea aquí la reutilizan el inicio de sesión (US02) y el cierre de sesión (US03).
* **Obtención del access token:** el registro fija la cookie de sesión pero no devuelve ningún access token. El frontend lo obtiene con `POST /api/auth/refresh`, que lee la cookie y devuelve el access token, el usuario y su colegio. Esa misma llamada comprueba que el navegador ha aceptado la cookie, y es la que recupera la sesión al recargar la página, porque el access token solo vive en memoria.
* **Protección CSRF y fijación de sesión:** `POST /api/auth/refresh` solo acepta peticiones cuya cabecera `Origin` coincide con el origen configurado de la aplicación (`403 ORIGIN_NOT_ALLOWED` en otro caso) y no se habilita CORS. El identificador de sesión lo genera siempre el servidor tras el alta: una cookie enviada por el cliente se ignora.

* **Onboarding:** tras el registro, el usuario es redirigido automáticamente a la pantalla de bienvenida (US04 - Onboarding).

* **Compatibilidad con cookies deshabilitadas:** si tras el alta el navegador no ha aceptado la cookie, se avisa en la propia página de que la cuenta está creada y se requieren cookies para mantener la sesión activa. Si la sesión no se puede comprobar por otra causa (sin conexión o error del servidor), se muestra un mensaje distinto («cuenta creada, sesión no iniciada»). En ambos casos no se vuelve a ofrecer el formulario, porque reenviarlo daría un `409`.

---

#### Criterios de Aceptación (MVP)

* **CA1 (Registro exitoso y Onboarding):** Dado que estoy en la pantalla de registro, cuando ingreso el nombre de mi colegio, un email válido, un nombre, apellidos y una contraseña válida de entre 8 caracteres y 72 bytes, entonces se crean el colegio y la cuenta asociada a él, se almacena el email en minúsculas sanitizado, se inicia la sesión mediante cookie segura y soy redirigido automáticamente a la pantalla de bienvenida (US04 - Onboarding).

---

#### Requisitos Técnicos, QA y Riesgos

* **E2E Tests (Cypress):** Flujo completo de Registro -> Redirección a Onboarding.
* **Tests de Seguridad:** validación de políticas CORS, ataques de fijación de sesión y bypass CSRF.
* **Cookies:** Flag `HttpOnly` activado, flag `Secure` activado, propiedad `SameSite=Lax`.

---

#### Decisiones tomadas

* **Persistencia de los refresh tokens:** la tabla `refresh_tokens` (`MODELO_DATOS.md`) se crea en esta parte, con el token opaco guardado solo como hash SHA-256 y con revocación (`revokedAt`), para que US02 y US03 reutilicen la infraestructura sin cambiar el formato de la cookie. **Actualización (`inicio-sesion`, US02):** la tabla ya no guarda la IP ni el user agent del cliente (columnas `ip_address` y `user_agent`, borradas por migración): ninguna funcionalidad los usaba y no se purgaban, así que la IP habría durado más de lo que declara la política de privacidad. Solo quedan en los logs (30 días).
* **Pantalla de Onboarding:** el registro redirige a `/onboarding`, que da la bienvenida con el nombre del usuario y del colegio (provisional hasta US04, que la convierte en la página de inicio definitiva); sin sesión redirige a `/login` (con `inicio-sesion`, US02; hasta entonces redirigía a `/registro`, porque el inicio de sesión aún no existía).
* **Fuera de esta parte:** la rotación de refresh tokens, el límite de sesiones simultáneas y la limpieza programada de tokens caducados.

---

### US01_d: Límite de intentos de registro

**Historia:**
Como responsable de CalendarSchool, quiero limitar los intentos de registro por origen, para que el formulario no sirva para ataques de fuerza bruta ni para consultar en masa qué emails o colegios están registrados.

---

#### Casos de uso y reglas de negocio

* **Gestión de tráfico y Brute Force:**
* Rate limiting por IP/Fingerprint (máximo 5 intentos de registro por cada 15 minutos, contando todos los intentos, también los que usan un email ya registrado). Si se supera, se devuelve HTTP `429 Too Many Requests`.
* Es el paso 1 del orden de procesamiento: se aplica antes de verificar el captcha, validar el payload o consultar la base de datos.

---

#### Criterios de Aceptación (MVP)

* **CA9 (Límite de intentos):** Dado que desde una misma IP se han hecho 5 intentos de registro en los últimos 15 minutos, usen o no un email ya registrado, cuando hago un sexto intento, entonces recibo `429` sin que se verifique el captcha, se valide el payload ni se consulte si el email existe, y veo un mensaje que me indica que lo intente más tarde.

---

#### Decisiones tomadas

* **Dónde se guarda el contador:** en una tabla de PostgreSQL (`rate_limit_attempts`), compartida entre las instancias de AWS Lambda (US00_b). El throttling de API Gateway limita por ruta y no por IP, y las reglas de tasa de WAF no admiten «5 intentos en 15 minutos»; pueden añadirse después como protección extra. Cada intento aceptado es una fila y la ventana es deslizante; una transacción con un bloqueo consultivo por clave (`pg_advisory_xact_lock`) impide que peticiones simultáneas superen el máximo.
* **El `429` no cuenta como intento:** así quien reintenta durante el bloqueo no lo alarga; `Retry-After` indica los segundos que faltan para que el intento más antiguo salga de la ventana. Cuentan los intentos con cuerpo JSON válido, se acepten o no después; un JSON mal formado responde `400 INVALID_JSON` sin contar.
* **"Fingerprint":** queda fuera del MVP, porque no está definida y el cliente puede falsearla. El límite es solo por IP.
* **Mecanismo reutilizable:** el limitador es genérico (clave `<operación>:<ip>` y política), para que el login (US02) y las invitaciones (US02_b y US02_c) lo reutilicen con su propia política.
* **Configuración:** `REGISTRATION_ATTEMPTS_MAX` (5 por defecto, y 1000 en el E2E, donde todas las peticiones llegan desde la misma IP) y `TRUST_PROXY_HOPS` (0 por defecto).
* **IP real del cliente:** detrás del proxy de Vite, o de CloudFront y API Gateway en producción (US00_b), la IP que ve Express no es la del cliente, que llega en `X-Forwarded-For`. Se resuelve con `trust proxy` de Express y la variable `TRUST_PROXY_HOPS`: con N proxies de confianza se toma la dirección que está N saltos desde la derecha de la cabecera, ignorando lo que el cliente haya escrito antes. **Resuelto en `despliegue-aws`:** `TRUST_PROXY_HOPS` vale `2` en producción, medido el 2026-10-12 (la cadena que llega a Express es `<IP escrita por el cliente>, <IP del visitante>, <IP de CloudFront>` y `req.ip` es la del visitante), y la llamada directa a API Gateway se rechaza con una cabecera secreta que añade CloudFront (`403 ORIGIN_NOT_ALLOWED`), porque quien llegara directamente podría elegir su IP. Además, el registro no debe publicarse hasta entonces (CA9 solo protege si la IP no se puede falsear).

---

### US01_e: Verificación anti-bot con reCAPTCHA

**Historia:**
Como responsable de CalendarSchool, quiero distinguir los registros hechos por personas de los automatizados, para impedir altas masivas sin molestar a los usuarios legítimos.

---

#### Casos de uso y reglas de negocio

* **Protección Anti-bot (Google reCAPTCHA v3):**
* Integración transparente en frontend. Score umbral: `≥ 0.6`.
* **Fallback:** Si el score es `< 0.6`, presentar de forma interactiva un reto **reCAPTCHA v2 / Challenge** explícito al usuario en lugar de reintentar en bucle en backend.
* Es el paso 2 del orden de procesamiento: se aplica después del rate limit y antes de validar el payload o consultar la base de datos.

---

#### Criterios de Aceptación (MVP)

* **CA5 (Fallos de Captcha y Reto Anti-bot):** Dado que un intento de registro obtiene un score de reCAPTCHA v3 menor a 0.6, el sistema solicita completar un reto visual secundario (reCAPTCHA v2 Checkbox) para verificar que soy un usuario humano antes de procesar el registro.

---

#### Decisiones tomadas

* **reCAPTCHA en desarrollo, tests y E2E:** un verificador falso, elegido por configuración: sin secretos de reCAPTCHA el backend lo usa y avisa en el log; con ellos, el real. `loadConfig` exige los dos secretos en producción, así que el falso nunca puede llegar allí. Acepta cualquier token salvo los reservados `fake-low-score` (con `v3`, pide el reto), `fake-fail` y `fake-unavailable`. En el frontend, un cliente falso equivalente sin claves de sitio, con un reto simulado. Así los tests no dependen de Google y pueden simular el score bajo, el fallo y la indisponibilidad.
* **Google no responde:** el registro **falla cerrado**: `503` con el código nuevo `CAPTCHA_UNAVAILABLE` (distinto de `CAPTCHA_FAILED`, para no decir al usuario que su verificación ha fallado), con un timeout de 3 segundos hacia Google. Se descartó dejar pasar el registro sin verificar: un bot que detectara la caída entraría, y el registro de colegios no es urgente al minuto.
* **Umbral y comprobaciones:** el score mínimo de v3 es 0,6 (constante). Además del score se comprueban la acción `register` y el dominio de la aplicación (`APP_ORIGIN`), y cada token sirve una sola vez y caduca a los 2 minutos, así que el frontend pide uno nuevo en cada envío.
* **Interacción con el límite de intentos (US01_d):** quien recibe el reto gasta dos de sus 5 intentos (el v3 con score bajo y el v2). Se considera aceptable.
* **Orden:** el captcha se verifica antes que la validación, así que un registro sin `captcha` responde `422 CAPTCHA_FAILED` y no `400`.
* **Privacidad:** el formulario muestra el aviso de privacidad y condiciones de Google, que la propia Google exige.

#### Resuelto en `publicacion-registro`

Lo que esta historia dejaba pendiente antes de publicar quedó resuelto en el cambio `publicacion-registro` (informes en `openspec/changes/publicacion-registro/reports/`):

* **Claves reales de Google Cloud:** creadas en un proyecto de Google Cloud, sus secretos funcionan con `siteverify` y `RecaptchaCaptchaVerifier` sirve sin cambios (no hace falta la API de evaluaciones). El flujo completo se probó en el navegador, y el reto v2 se comprobó pintando la casilla desde la consola (informe `2026-10-14-spike-recaptcha-keys.md`). El procedimiento para validar el secreto v2 sin crear datos está en `docs/despliegue/PUESTA_EN_MARCHA.md`. Un secreto mal configurado sigue sin detectarse hasta usarlo (Google valida primero el token y daría `503`), por eso se comprueba en local antes de publicar.
* **Consentimiento:** el formulario lleva una casilla obligatoria para aceptar la política de privacidad, con una página propia (`/privacidad`) que informa de reCAPTCHA y de Google como proveedor. El backend exige `privacyPolicyAccepted: true` y guarda la fecha y la versión aceptadas.
* **`Content-Security-Policy`:** publicada en modo estricto con los orígenes de reCAPTCHA que la validación en un navegador real mostró necesarios (informe `2026-10-14-step-8-csp-local-validation.md`).
* **Revisión legal del texto de `/privacidad`:** la confirmó la persona responsable antes de abrir el registro con el cambio `inicio-sesion` (US02), ya sobre el texto ampliado al inicio de sesión.

---

### US01_f: Resiliencia del formulario en el navegador

**Historia:**
Como visitante que se está registrando, quiero no perder lo que he escrito si se interrumpe el navegador y que un envío repetido no cree cuentas duplicadas, para completar el registro sin repetir trabajo.

---

#### Casos de uso y reglas de negocio

* **Flujos de resiliencia de navegador:**
* Manejo de registro tras crash/cierre de navegador: Conservación de datos de formulario mediante `sessionStorage` (excepto la contraseña) hasta que el usuario complete el proceso.
* Múltiples pestañas/navegadores simultáneos: Bloqueo de solicitudes duplicadas concurrentes mediante token de formulario único por sesión.

---

#### Criterios de Aceptación (MVP)

* **CA10 (Conservación del formulario):** Dado que he rellenado parte del formulario de registro, cuando recargo la página, entonces los campos conservan lo que escribí salvo la contraseña, que nunca se guarda; y tras un registro exitoso esos datos se borran.

---

#### Decisiones tomadas

* **Alcance del borrador:** `sessionStorage`, que sobrevive a las recargas y a la restauración de sesión del navegador tras un cierre inesperado, pero no al cierre deliberado de la pestaña. No se usa `localStorage`: el borrador contiene datos personales (nombre, apellidos, email) y en un colegio es habitual el equipo compartido (secretaría, sala de profesores). Cada pestaña tiene su propio borrador.
* **Qué se guarda:** el nombre del colegio, el municipio, el nombre, los apellidos y el email, en cada cambio. La contraseña nunca. Un borrador corrupto o manipulado se ignora, un municipio que no está en la lista se descarta y, si el navegador no permite usar el almacenamiento, el formulario funciona igual sin conservar nada.
* **Cuándo se borra:** tras un registro correcto (`201`), incluso si no se puede iniciar la sesión (la cuenta ya existe). Ante un `409`, `429`, fallo de captcha o error inesperado se conserva. El reto v2 y el aviso de demasiados intentos no se conservan.
* **Sin token de formulario único:** antes del registro no hay sesión, y la unicidad del email y del colegio en la base de datos (US01_b) ya impide que dos envíos simultáneos creen dos cuentas: el segundo recibe su `409`. El envío repetido desde la misma pestaña (doble clic, Enter repetido) se bloquea en el cliente con una guarda síncrona y el botón deshabilitado. Exigir un token habría supuesto un endpoint y una tabla nuevos para la misma garantía.

---


### US02: Inicio de sesión de usuario registrado

**Épica:** [1. Autenticación y Gestión de Sesiones](#epica-1-autenticacion-y-gestion-de-sesiones)

**Historia:** Como usuario registrado, quiero iniciar sesión con mi email y contraseña, para volver a acceder a mi colegio de forma segura.

**Depende de:** US01_b (usuarios y Bcrypt), US01_c (refresh token, cookie y `POST /api/auth/refresh`), US01_d (limitador de intentos) y `publicacion-registro` (CSP, consentimiento y `/privacidad`).

---

#### Casos de uso y reglas de negocio

* **Endpoint:** `POST /api/auth/login` con `{ email, password, captcha }` (`captcha` con el mismo formato que en el registro: versión y token). Si es correcto responde `204` y fija la cookie `refresh_token` (la misma de US01_c: `HttpOnly`, `Secure`, `SameSite=Lax`, `path=/api/auth`, 24 horas); no devuelve access token, porque `POST /api/auth/refresh` sigue siendo la única operación que los emite. El frontend lo llama justo después, igual que tras el registro, y con esa llamada comprueba también que el navegador ha aceptado la cookie.
* **Orden de procesamiento:**
  1. `Origin` igual a `APP_ORIGIN` (`requireAllowedOrigin`, como en `/refresh`; sin CORS) → si no, `403 ORIGIN_NOT_ALLOWED`.
  2. Validación Zod → `400 VALIDATION_ERROR`, sin contar como intento ni consultar la base de datos.
  3. Límite de intentos por IP (`login:<ip>`) → `429 TOO_MANY_REQUESTS` con `Retry-After`.
  4. reCAPTCHA con la acción `login` (el mismo verificador que el registro) → score bajo: `422 CAPTCHA_CHALLENGE_REQUIRED`; token inválido o ausente: `422 CAPTCHA_FAILED`; Google no responde: `503 CAPTCHA_UNAVAILABLE`. Cualquiera de ellos deja el intento contado.
  5. Búsqueda del usuario por email y comparación con Bcrypt (contra un hash ficticio si el email no existe).
  6. Credenciales incorrectas, email inexistente o usuario `DELETED` → `401 INVALID_CREDENTIALS` (el intento queda contado).
  7. Contraseña correcta y usuario `SUSPENDED` → `403 ACCOUNT_SUSPENDED` (el intento se libera).
  8. Contraseña correcta y usuario `ACTIVE` → se libera el intento, se crea un refresh token nuevo y se responde `204`.
* **Verificación anti-bot (reCAPTCHA, como en US01_e):** v3 invisible con score mínimo 0,6, acción `login` y dominio de `APP_ORIGIN`; con score bajo, reto v2. Frena los ataques distribuidos (muchas IP contra una cuenta o relleno de credenciales), que el límite por IP no detiene. El verificador deja de tener la acción `register` fija y recibe la acción esperada de cada operación. En desarrollo, tests y E2E se usa el verificador falso con sus tokens reservados.
* **Normalización y validación:** el email se recorta y se pasa a minúsculas, con el mismo formato y la misma longitud máxima que en el registro (`test-fixtures/registration-fields.json`). La contraseña solo se exige no vacía y de 72 bytes como máximo en UTF-8 (el límite de Bcrypt); no se aplican las reglas de variedad del registro, que solo valen para contraseñas nuevas.
* **Límite de intentos (solo fallidos):** como máximo 10 intentos fallidos por IP cada 15 minutos (ventana deslizante), con `LOGIN_ATTEMPTS_MAX` (10 por defecto). Reutiliza `AttemptLimiter`: el intento se **reserva** antes de comparar la contraseña (el mismo `consume` atómico con `pg_advisory_xact_lock` del registro) y se **libera** (se borra esa fila) cuando la contraseña es correcta. Así los intentos en vuelo cuentan y peticiones simultáneas no superan el máximo. Si la base de datos no responde al reservar, falla cerrado (`503`); si falla al liberar, el login sigue adelante y el intento queda contado (se registra en el log).
* **Tiempo constante frente a enumeración:** si el email no existe se compara la contraseña contra un hash ficticio con el mismo coste de Bcrypt, de modo que las respuestas `401` cuesten lo mismo exista o no el email. No se añaden esperas artificiales.
* **Sesión:**
  * Cada login crea una fila nueva en `refresh_tokens`; las sesiones de otros dispositivos no se tocan (varias sesiones simultáneas).
  * **Fijación de sesión:** una cookie `refresh_token` enviada con el login se ignora y se sustituye por la nueva; la anterior no se revoca (la revocación es de US03).
  * El refresh token caduca a las 24 horas desde el login, sin rotación (US01_c); pasado ese tiempo, la siguiente renovación responde `401 INVALID_SESSION` y el usuario vuelve a `/login`.
* **Frontend (`/login`, `LoginPage`):**
  * Email y contraseña, con errores inline accesibles y validación previa en el cliente (obligatorios y formato de email).
  * `401` → mensaje genérico «Email o contraseña incorrectos», sin indicar cuál falla, conservando el email y vaciando la contraseña.
  * `403 ACCOUNT_SUSPENDED` → «Tu cuenta está desactivada. Contacta con el administrador de tu colegio».
  * `429` → minutos de espera (`Retry-After` redondeado hacia arriba, mínimo 1), como en el registro.
  * Captcha como en `RegisterPage`: un token v3 nuevo en cada envío (después de validar el formulario); con `422 CAPTCHA_CHALLENGE_REQUIRED`, el reto v2 conservando la contraseña y con el envío bloqueado hasta resolverlo; un script de Google que no carga se trata como indisponibilidad sin llamar al backend. Se muestra el aviso de privacidad y condiciones de Google que Google exige.
  * `503` (incluido `CAPTCHA_UNAVAILABLE`) u otro error → mensaje de error temporal.
  * Tras el `204` llama a `refresh()` del contexto: con sesión navega a `/onboarding`; si la cookie no se acepta, muestra el aviso de cookies necesarias; si la sesión no se puede comprobar por otra causa, un aviso de error temporal.
  * Guarda síncrona contra envíos repetidos y botón deshabilitado durante el envío, como en el registro.
  * Enlace a `/registro` («¿Tu colegio aún no está registrado?»).
  * Con sesión iniciada, `/login` redirige a `/onboarding`.
* **Redirecciones:** tras el login, `/onboarding` (provisional entonces; definitiva desde US04). `/onboarding` sin sesión redirige a `/login` en lugar de a `/registro`. El enlace «email ya registrado» del registro, que ya apunta a `/login`, pasa a funcionar.
* **Política de privacidad:** `/privacidad` informa hoy de reCAPTCHA solo en el registro. Su texto se amplía al inicio de sesión, con una fecha nueva en `privacyPolicy.lastUpdated` (`es.json` y `en.json`) y en `PRIVACY_POLICY_VERSION`. Nadie ha aceptado aún la versión anterior en producción (el registro está cerrado), así que no hace falta pedir una nueva aceptación.
* **Apertura del registro en producción:** `/api/auth/*` está cerrado en CloudFront desde US00_b y se abre como **última tarea** de esta historia, cuando el E2E de vuelta a la sesión (CA1) está en verde. **Condición:** la revisión legal del texto ampliado de `/privacidad` por quien sea responsable del tratamiento; sin ella no se abre. Abrirlo consiste en:
  * se elimina la CloudFront Function `apiGuard.js` (su única función era cerrar `/api/auth/*`), con su asociación en `appStack.ts` y sus tests;
  * el smoke test (`scripts/smoke.mjs`) deja de esperar `404` y comprueba `POST /api/auth/login` con un cuerpo vacío y el `Origin` de la aplicación: `400 VALIDATION_ERROR` (llega al backend sin consultar la base de datos ni contar intentos).
* **Logs (regla común de US01_b):** email enmascarado, IP y user agent completos, sin contraseña ni tokens, conservados 30 días. Son el único sitio donde queda la IP y el user agent de una sesión, y la política de privacidad lo declara.

---

#### Criterios de Aceptación (MVP)

* **CA1 (Login correcto):** Dado que tengo una cuenta `ACTIVE` y no tengo sesión, cuando introduzco mi email y mi contraseña en `/login` y envío el formulario, entonces el backend responde `204` con una cookie `refresh_token` nueva (`HttpOnly`, `Secure`, `SameSite=Lax`), el frontend obtiene el access token con `POST /api/auth/refresh`, soy redirigido a `/onboarding` y se registra `USER_LOGIN_SUCCESS`.
* **CA2 (Contraseña incorrecta):** Dado que introduzco un email registrado con una contraseña incorrecta, cuando envío el formulario, entonces recibo `401 INVALID_CREDENTIALS`, veo «Email o contraseña incorrectos», el intento cuenta para el límite y se registra `USER_LOGIN_FAILED` con `reason` `PASSWORD`.
* **CA3 (Email no registrado):** Dado que introduzco un email que no está registrado, cuando envío el formulario, entonces recibo exactamente la misma respuesta que en CA2, se ha ejecutado una comparación de Bcrypt contra el hash ficticio, el intento cuenta para el límite y se registra `USER_LOGIN_FAILED` con `reason` `NOT_FOUND`.
* **CA4 (Email con mayúsculas y espacios):** Dado que introduzco mi email en mayúsculas o con espacios alrededor (`  JUAN@COLEGIO.ES  `), cuando envío el formulario con la contraseña correcta, entonces el login funciona como en CA1.
* **CA5 (Límite de intentos fallidos):** Dado que desde una misma IP se han producido 10 intentos fallidos de login en los últimos 15 minutos, cuando hago otro intento, aunque la contraseña sea correcta, entonces recibo `429` con `Retry-After` sin que se consulte la base de datos de usuarios, veo cuántos minutos debo esperar y se registra `USER_LOGIN_RATE_LIMITED`. Los logins correctos no cuentan: diez logins correctos seguidos desde la misma IP no bloquean el siguiente.
* **CA6 (Cuenta suspendida):** Dado que mi cuenta está `SUSPENDED`, cuando envío mi contraseña correcta, entonces recibo `403 ACCOUNT_SUSPENDED`, veo «Tu cuenta está desactivada. Contacta con el administrador de tu colegio», no se crea ninguna sesión, el intento no cuenta para el límite y se registra `USER_LOGIN_FAILED` con `reason` `SUSPENDED`. Con una contraseña incorrecta la respuesta es la de CA2, de modo que el estado de la cuenta solo lo ve quien conoce la contraseña.
* **CA7 (Campos obligatorios y formato):** Dado que dejo vacío el email o la contraseña, o escribo un email con formato inválido, cuando intento enviar el formulario, entonces veo el error inline correspondiente («El email es obligatorio», «La contraseña es obligatoria», «Formato de email inválido») y no se envía; si la petición llega al backend, responde `400 VALIDATION_ERROR` sin contar como intento.
* **CA8 (Fijación de sesión):** Dado que envío el login con una cookie `refresh_token` existente, cuando el login es correcto, entonces recibo una cookie con un token distinto creado por el servidor.
* **CA9 (Varias sesiones):** Dado que tengo una sesión abierta en un navegador, cuando inicio sesión en otro, entonces las dos sesiones siguen siendo válidas.
* **CA10 (Origen no permitido):** Dado que una petición de login llega con un `Origin` distinto del de la aplicación o sin él, cuando el backend la recibe, entonces responde `403 ORIGIN_NOT_ALLOWED` sin validar, contar ni consultar nada.
* **CA11 (Cookies deshabilitadas):** Dado que mi navegador no acepta cookies, cuando el login es correcto, entonces la página muestra que se necesitan cookies para mantener la sesión en lugar de navegar a `/onboarding`.
* **CA12 (Redirecciones):** Dado que no tengo sesión, cuando abro `/onboarding`, entonces se me redirige a `/login`; y dado que tengo sesión, cuando abro `/login`, entonces se me redirige a `/onboarding`.
* **CA13 (Reto anti-bot):** Dado que mi intento de login obtiene un score de reCAPTCHA v3 menor que 0,6, cuando lo envío, entonces recibo `422 CAPTCHA_CHALLENGE_REQUIRED` sin que se compruebe la contraseña, veo el reto v2 con mi email y mi contraseña conservados y, al resolverlo y reenviar, el login continúa como en CA1. Un token inválido responde `422 CAPTCHA_FAILED`; ambos cuentan como intento fallido.
* **CA14 (Google no disponible):** Dado que Google no responde en 3 segundos o el script de reCAPTCHA no carga, cuando envío el login, entonces no se inicia sesión (falla cerrado: `503 CAPTCHA_UNAVAILABLE` en el backend, o sin llamar al backend si el script no carga) y veo un mensaje de error temporal.
* **CA15 (Registro abierto en producción):** Dado que esta historia está desplegada, cuando se llama a `/api/auth/*` en producción, entonces la petición llega al backend (ya no hay `404` de CloudFront) y el smoke test lo comprueba con `POST /api/auth/login` → `400 VALIDATION_ERROR`.

---

#### Requisitos Técnicos, QA y Riesgos

##### Ficheros y módulos afectados

* **Contrato:** `docs/api-spec.yml` primero: `POST /api/auth/login` (`204`, `400`, `401`, `403`, `429`, `503`, reutilizando `components.responses`) y los códigos `INVALID_CREDENTIALS` y `ACCOUNT_SUSPENDED`, a la vez en `ERROR_CODES` (`appError.ts`); tipos regenerados con `npm run api:types -w frontend`.
* **Backend:** caso de uso `LogIn` en `application/session/` (o `application/login/`, según el diseño); el puerto `PasswordHasher` añade la comparación (Bcrypt, con el hash ficticio); un repositorio para buscar el usuario por email; el puerto de intentos añade `release`; el `errorHandler` traduce `InvalidCredentials` (`401`) y `AccountSuspended` (`403`); la ruta en `authRouter` y el cableado en `composeApp`; `LOGIN_ATTEMPTS_MAX` en `loadConfig` (1000 en `realApp` y en el E2E); `CaptchaVerifier` recibe la acción esperada (`register` o `login`) en lugar de tenerla fija; `PRIVACY_POLICY_VERSION` con la fecha nueva.
* **Frontend:** `pages/LoginPage.tsx`, `services/loginService.ts` (interpreta la respuesta por `error.code` y nunca lanza), validación de login (reutiliza la regla de email de la tabla compartida), ruta en `App.tsx`, cambio de redirección en `OnboardingPage`, el cliente de `captcha/` con la acción `login` (reutilizando el reto v2 de `RegisterPage`, extraído a un componente si hace falta), textos en `es.json` y `en.json` (incluido el texto ampliado de `privacyPolicy` y su `lastUpdated`).
* **Infraestructura:** eliminar `functions/apiGuard.js`, su asociación en `appStack.ts` y sus tests; actualizar `scripts/smoke.mjs` y sus tests.
* **Base de datos:** una migración que borra `ip_address` y `user_agent` de `refresh_tokens` (ver «Decisiones tomadas»); reutiliza `users`, `refresh_tokens` y `rate_limit_attempts`.

##### Requisitos de Testing

* **Unit Tests:** `LogIn` con dobles (orden de procesamiento, cada rama de CA2–CA6 y CA13–CA14, el verificador llamado con la acción `login`, `release` solo con contraseña correcta, comparación con el hash ficticio cuando el email no existe), validación compartida, `loginService` y `LoginPage` (cada estado de la respuesta, CA11, CA12).
* **Integración (`*.int.test.ts`):** login contra la base de datos real; reserva y liberación del intento (un login correcto no deja fila; uno fallido sí); peticiones fallidas simultáneas no superan el máximo.
* **E2E (Cypress):** registro → borrar cookies → `/login` → `/onboarding`; contraseña incorrecta; reto v2 con el token falso `fake-low-score`; cuenta suspendida (preparada directamente en la base de datos); redirecciones de CA12.
* **Infraestructura:** tests de CDK sin `apiGuard` y del smoke test con la nueva expectativa.
* **Tests de Seguridad:** fijación de sesión (CA8), `Origin` (CA10), misma respuesta para CA2 y CA3, ningún dato sensible en los logs.
* **Tests de Accesibilidad:** errores inline con `aria-describedby` y `role="alert"`.

##### Riesgos y Mitigaciones

* **Enumeración de usuarios:** el login no revela si un email existe (mismo `401` y mismo coste de Bcrypt). El registro sí lo revela (US01_b, CA3, riesgo aceptado), así que estas medidas son buena práctica más que una protección completa.
* **Ataques distribuidos (muchas IP contra una cuenta, relleno de credenciales):** el límite por IP no los frena; los frena reCAPTCHA, porque cada intento necesita un token de Google y un bot obtiene score bajo y el reto v2. Sin límite por email (bloquear una cuenta sin poder avisar a su dueño solo serviría para dejarlo fuera), el resto se acota con la política de contraseñas del registro y con los eventos `USER_LOGIN_FAILED`. El límite por cuenta se revisará cuando haya avisos por email.
* **Caída de Google (riesgo aceptado):** el login falla cerrado igual que el registro: mientras Google no responda nadie puede iniciar sesión, aunque las sesiones abiertas siguen funcionando. Se descartó dejar pasar el login sin verificar para mantener una sola regla; revisar si las caídas resultan frecuentes.
* **IP compartida en los colegios:** la sala de profesores suele salir por una sola IP; por eso cuentan solo los fallos, el máximo es 10 y es configurable.
* **Apertura del registro:** se hace en la última tarea, tras el E2E de vuelta a la sesión, para que un fallo del login no deje el registro abierto sin forma de volver a entrar.

##### Observabilidad

* Eventos estructurados: `USER_LOGIN_SUCCESS`, `USER_LOGIN_FAILED` (`reason`: `PASSWORD`, `NOT_FOUND` o `SUSPENDED`) y `USER_LOGIN_RATE_LIMITED`.
* **Payload del log:** `timestamp` + `email` enmascarado + `ip` + `user_agent` + `reason` (regla común de US01_b; 30 días de retención).

##### Definición de hecho

* Contrato, código y tests en verde (`npm test`, `npm run test:e2e`, `npm test -w infrastructure`, `npm run lint`, `npm run typecheck --workspaces`, `api:types:check`), con la cobertura mínima.
* Documentación actualizada: `README.md`, `CLAUDE.md` (el registro deja de estar cerrado; `/login`), `docs/arquitectura/ARQUITECTURA_COMPLETA.md` (sin `apiGuard`), `docs/despliegue/PUESTA_EN_MARCHA.md`, `docs/backend-standards.md` y `docs/frontend-standards.md` si cambian sus patrones, y esta historia (US00_b y la nota de revisión legal de US01_e).
* Revisión legal del texto ampliado de `/privacidad` confirmada antes de la tarea de apertura.
* Desplegado: smoke test en verde con la nueva expectativa y, tras el despliegue, comprobación del dominio y del secreto v2 de reCAPTCHA en producción con el procedimiento de `PUESTA_EN_MARCHA.md`.

---

#### Decisiones tomadas

* **Decidido: fuera de alcance** los avisos por email (intentos fallidos, dispositivo desconocido, «asegurar mi cuenta»), la verificación de email (el MVP no tiene ese dato), el límite de intentos por email, la prueba de carga de 1000 logins simultáneos y la retención de logs de 90 días (se mantienen los 30 días de la regla común).
* **Decidido: solo cuentan los intentos fallidos**, 10 por IP cada 15 minutos, con el mecanismo de reservar y liberar sobre `AttemptLimiter`.
* **Decidido: el registro se abre en este cambio**, como última tarea.
* **Decidido: redirección a `/onboarding`** hasta que exista US04 (el dashboard y la comprobación de onboarding completado son de US04).
* **Decidido: reCAPTCHA también en el login** (v3 en cada intento y reto v2 con score bajo), por los ataques distribuidos que el límite por IP no frena. Se descartaron pedirlo solo tras varios fallos sobre la misma cuenta (devolvía el contador por email y no frena el relleno de credenciales) y no usarlo.
* **Decidido: la sesión no guarda la IP ni el user agent.** `refresh_tokens.ip_address` y `user_agent` se escribían desde US01_c y nadie los leía ni los purgaba, así que la IP quedaba en la base de datos mientras existiera la cuenta, en contra de la política de privacidad («unas 48 horas»). Se borran las dos columnas con una migración y la política declara que los logs de actividad (30 días) contienen la IP y el user agent. Se descartaron solo documentarlo y purgar los tokens caducados; si US03 necesita la IP o el navegador por sesión, se reintroducen entonces con su purga y su texto.
* **Hecho: apertura de `/api/auth/*`.** Se eliminó `apiGuard.js` y el smoke test comprueba `POST /api/auth/login` → `400 VALIDATION_ERROR`; la persona responsable confirmó el texto final de `/privacidad` justo antes de abrir. La comprobación de reCAPTCHA real en producción (dominio y secreto) está descrita en `docs/despliegue/PUESTA_EN_MARCHA.md`.
* **Decidido: nueva revisión legal.** El texto de `/privacidad` revisado para el registro se amplía al login, y su revisión vuelve a ser condición para abrir.
* **Respuesta del login sin access token:** `204` y cookie; el access token sale solo de `/refresh`, como tras el registro. Evita un segundo camino de emisión de tokens.
* **El estado de la cuenta se comprueba después de la contraseña:** un `SUSPENDED` con contraseña incorrecta recibe el `401` genérico, y un `DELETED` siempre se trata como inexistente.
* **Sin renovación transparente tras un `401` en peticiones protegidas:** todavía no hay ningún endpoint protegido por access token; el reintento automático llega con el primero (US04). La sesión se recupera al cargar la página con `/refresh`, como hoy.
* **Fuera de esta parte:** el cierre de sesión y la revocación de tokens (US03), la rotación de refresh tokens y el límite de sesiones simultáneas.

---


### US02_b: Invitar y gestionar usuarios del colegio

**Épica:** [1. Autenticación y Gestión de Sesiones](#epica-1-autenticacion-y-gestion-de-sesiones)

**Historia:**
Como administrador de un colegio, quiero invitar a otras personas con un enlace de acceso y gestionar los usuarios del colegio, para que varias personas puedan trabajar con los datos del colegio, cada una con el rol adecuado.

**Depende de:** US01_b (colegios, usuarios y roles), US02 (inicio de sesión y autenticación de las peticiones) y US01_d (límite de intentos, que se reutiliza al aceptar invitaciones).

---

#### Casos de uso y reglas de negocio

* **Roles (PRD §3.1):**
* `ADMIN`: acceso completo, incluida la gestión de usuarios, el calendario base y la generación, oficialización y exportación de horarios.
* `MEMBER`: gestiona profesores, alumnos, cursos, restricciones y comedor, y visualiza los horarios; no gestiona usuarios, no configura el calendario base, no genera ni oficializa horarios y no los exporta.
* Esta historia define los roles y la gestión de usuarios. Cada historia funcional aplica los permisos de sus propias acciones.
* Todo lo que describe esta historia, salvo aceptar la invitación, está reservado a los usuarios `ADMIN` del colegio. Un `MEMBER` recibe `403` con el código `FORBIDDEN`, y la interfaz no le muestra estas opciones.

* **Generar una invitación:**
* El administrador elige el rol (`ADMIN` o `MEMBER`) y el sistema genera un enlace de invitación para su colegio.
* El token del enlace es aleatorio (generador criptográfico, al menos 128 bits). Solo se guarda su hash, junto con el colegio, el rol, quién lo generó y la caducidad (72 horas).
* El enlace completo se muestra **una sola vez**, con un botón para copiarlo y un aviso de que no se volverá a mostrar. No hay forma de recuperarlo después: si se pierde, se revoca y se genera otro.
* El administrador lo envía por su cuenta (mensajería, su propio correo). CalendarSchool no envía correos.
* El token va en el **fragmento** de la URL (`<origen>/invitacion#<token>`), que el navegador no envía al servidor, para que no quede en los logs de CloudFront y API Gateway ni en la cabecera `Referer`.

* **Invitaciones pendientes:**
* El administrador ve las invitaciones pendientes de su colegio (rol, quién la generó, fecha de creación y de caducidad), sin el enlace.
* Puede **revocar** una invitación pendiente; el enlace deja de funcionar.

* **Aceptar una invitación:**
* Abrir el enlace **no consume** la invitación: solo muestra el formulario. Así, la vista previa que generan WhatsApp y otros servicios al recibir un enlace no lo invalida.
* El formulario muestra el nombre del colegio y el rol, que obtiene enviando el token en el cuerpo de una petición que tampoco consume la invitación.
* El invitado indica nombre, apellidos, email y contraseña, con las mismas reglas de campo que el registro (US01_b), incluida la normalización NFC.
* Al enviarlo, se crea el usuario en estado `ACTIVE`, en el colegio y con el rol de la invitación, y la invitación queda usada. Ambas cosas ocurren en una única operación: si dos personas envían el mismo enlace a la vez, solo una crea su cuenta.
* El email es único en todo el sistema: si ya está registrado, responde `409` con `EMAIL_ALREADY_REGISTERED` y la invitación **no** se consume.
* Un enlace caducado, usado, revocado o inexistente responde `410` con el código `ACCESS_LINK_INVALID`, sin indicar cuál de los casos es.
* Tras aceptar, el invitado llega a la pantalla de inicio de sesión con un mensaje de que su cuenta se ha creado.
* El endpoint de aceptación aplica un límite de intentos por IP, con el mismo mecanismo que US01_d.

* **Gestionar los usuarios del colegio:**
* El administrador ve los usuarios de su colegio: nombre, apellidos, email, rol, estado y fecha de alta.
* Puede **cambiar el rol** de un usuario (`ADMIN` ↔ `MEMBER`).
* Puede **dar de baja** a un usuario: pasa a estado `SUSPENDED` (US02), ya no puede iniciar sesión y sus sesiones abiertas se invalidan.
* Puede **reactivar** a un usuario dado de baja: vuelve a `ACTIVE` con el rol que tenía y su contraseña. Si no la recuerda, el administrador le genera un enlace de restablecimiento (US02_c). Como el email es único, reactivar es la única forma de que vuelva con ese email.
* **Siempre debe quedar al menos un administrador activo:** no se puede pasar a `MEMBER` ni dar de baja al último `ADMIN` activo del colegio, tampoco a uno mismo. Se responde `409` con el código `LAST_ADMIN_REQUIRED`.
* Un administrador solo ve y gestiona los usuarios y las invitaciones de su propio colegio. Un identificador de otro colegio responde `404` con `NOT_FOUND`, como si no existiera.

* **Fuera de alcance:** el restablecimiento de contraseña (US02_c), el envío de correos y los permisos de cada acción funcional, que aplica cada historia.

---

#### Criterios de Aceptación

* **CA1 (Generar una invitación):** Dado que soy `ADMIN`, cuando genero una invitación eligiendo el rol `MEMBER`, entonces veo el enlace completo con un botón para copiarlo y un aviso de que no se volverá a mostrar, y la invitación aparece como pendiente, con caducidad a las 72 horas.
* **CA2 (El enlace solo se muestra una vez):** Dado que he generado una invitación, cuando vuelvo a la lista de invitaciones o recargo la página, entonces la invitación aparece como pendiente, pero el enlace ya no se muestra.
* **CA3 (Aceptar una invitación):** Dado un enlace de invitación válido con rol `MEMBER`, cuando lo abro, veo el nombre del colegio y el rol, y envío nombre, apellidos, email y contraseña válidos, entonces se crea mi usuario en ese colegio con rol `MEMBER` y estado `ACTIVE`, la invitación queda usada y llego a la pantalla de inicio de sesión con un mensaje de que mi cuenta se ha creado.
* **CA4 (Abrir el enlace no lo consume):** Dado un enlace de invitación válido, cuando se abre una o varias veces sin enviar el formulario (p. ej. por la vista previa de una aplicación de mensajería), entonces la invitación sigue pendiente y el enlace sigue sirviendo.
* **CA5 (Enlace no válido):** Dado un enlace caducado, ya usado o revocado, cuando lo abro o envío el formulario, entonces veo el mensaje "Este enlace no es válido o ha caducado. Pide uno nuevo a un administrador del colegio." y no se crea ningún usuario; la API responde `410` con `ACCESS_LINK_INVALID`.
* **CA6 (Email ya registrado al aceptar):** Dado un enlace válido, cuando envío el formulario con un email ya registrado (en este o en otro colegio), entonces veo el mensaje "Este email ya está registrado", la API responde `409` con `EMAIL_ALREADY_REGISTERED`, no se crea el usuario y la invitación sigue pendiente.
* **CA7 (Revocar una invitación):** Dado que soy `ADMIN` y tengo una invitación pendiente, cuando la revoco, entonces desaparece de las pendientes y su enlace responde como en CA5.
* **CA8 (Cambiar el rol):** Dado que soy `ADMIN` y el colegio tiene otro usuario `MEMBER`, cuando le cambio el rol a `ADMIN`, entonces la lista de usuarios muestra el nuevo rol y el usuario tiene los permisos de `ADMIN` desde su siguiente petición.
* **CA9 (Dar de baja):** Dado que soy `ADMIN`, cuando doy de baja a otro usuario, entonces su estado pasa a `SUSPENDED`, no puede iniciar sesión y sus sesiones abiertas dejan de ser válidas.
* **CA10 (Último administrador):** Dado que soy el único `ADMIN` activo del colegio, cuando intento cambiar mi rol a `MEMBER`, entonces veo el mensaje "El colegio debe tener al menos un administrador" y la API responde `409` con `LAST_ADMIN_REQUIRED` sin cambiar nada. Darse de baja a uno mismo no se permite nunca (`409` con `CANNOT_SUSPEND_SELF`, decisión de US02_b2), así que tampoco el último administrador puede hacerlo.
* **CA11 (Un miembro no gestiona usuarios):** Dado que soy `MEMBER`, cuando entro en la aplicación, entonces no veo las opciones de usuarios e invitaciones, y si llamo directamente a sus endpoints la API responde `403` con `FORBIDDEN`.
* **CA12 (Aislamiento entre colegios):** Dado que soy `ADMIN` de un colegio, cuando intento ver, cambiar o dar de baja un usuario, o revocar una invitación, de otro colegio, entonces la API responde `404` con `NOT_FOUND` y no se modifica nada.
* **CA13 (Aceptaciones simultáneas):** Dado un enlace de invitación válido, cuando se envía el formulario dos veces a la vez con emails distintos, entonces solo se crea un usuario y el otro envío recibe la respuesta de CA5.
* **CA14 (Reactivar un usuario):** Dado que soy `ADMIN` y el colegio tiene un usuario `SUSPENDED` con rol `MEMBER`, cuando lo reactivo, entonces vuelve a estado `ACTIVE` con rol `MEMBER` y puede iniciar sesión con su contraseña de antes.

---

#### Requisitos Técnicos, QA y Riesgos

* **Enlaces de acceso:** las invitaciones y los enlaces de restablecimiento de contraseña (US02_c) comparten el mismo mecanismo (tabla y lógica): token aleatorio guardado como hash, propósito (invitación o restablecimiento), caducidad de 72 horas, un solo uso y revocación.
* **Página del enlace:** se sirve con `Referrer-Policy: no-referrer` y no carga recursos de terceros. *US02_b4 sustituye la `no-referrer` específica por la política global y el borrado del token de la URL (ver sus decisiones).*
* **Sesiones invalidadas al instante (decisión B de US03):** la baja revoca los refresh tokens del usuario, y el middleware de autenticación, que llega con la primera porción (US02_b1), rechaza los access tokens cuya sesión (`sid`) esté revocada o caducada, o cuyo usuario no esté `ACTIVE`.
* **Contrato:** los endpoints de invitaciones y usuarios y los códigos `FORBIDDEN`, `ACCESS_LINK_INVALID` y `LAST_ADMIN_REQUIRED` se definen primero en `docs/api-spec.yml` (con su `ERROR_CODES` en el backend).
* **Tests:** unitarios de la generación y verificación del token, de la caducidad y de la regla del último administrador; integración de la aceptación concurrente (CA13) y del aislamiento entre colegios (CA12); E2E del flujo completo: generar, copiar, aceptar e iniciar sesión.
* **Observabilidad:** eventos `INVITATION_CREATED`, `INVITATION_REVOKED`, `INVITATION_ACCEPTED`, `USER_ROLE_CHANGED`, `USER_SUSPENDED` y `USER_REACTIVATED`, con el colegio y el usuario que actúa. Datos personales según la regla común de US01_b; el token nunca se registra.
* **Riesgos:**
* **Enlace reenviado a quien no debe:** cualquiera con el enlace puede crear una cuenta en el colegio. Se acota con el uso único, la caducidad de 72 horas, la revocación y la lista de usuarios, en la que el administrador ve quién se ha unido y puede darlo de baja.
* **Fuerza bruta sobre los tokens:** se acota con la longitud del token y el límite de intentos.
* **Conservación de los datos de usuarios dados de baja (RGPD):** un usuario `SUSPENDED` conserva sus datos para poder reactivarlo y para mantener la trazabilidad. Cuánto tiempo se conservan y cuándo se suprimen es una decisión general del proyecto, pendiente y fuera de esta historia.

---

#### Decisiones tomadas

* **Decidido: la historia se implementa en cuatro porciones**, cada una desplegable por separado y en este orden (b2 y b3 son independientes entre sí):
  * **US02_b1 (Usuarios del colegio, lectura):** listado de usuarios del colegio y los cimientos de los endpoints protegidos: middleware de autenticación, autorización por rol (`FORBIDDEN`), aislamiento por colegio y cliente HTTP autenticado en el frontend. CA11 y la parte de lectura de CA12.
  * **US02_b2 (Gestión de usuarios):** cambio de rol, baja, reactivación y regla del último administrador. CA8, CA9, CA10, CA14 y el resto de CA12.
  * **US02_b3 (Invitaciones, lado del administrador):** tabla de enlaces de acceso, generar, listar y revocar invitaciones. CA1, CA2 y CA7.
  * **US02_b4 (Aceptar una invitación):** página pública del enlace, consulta del colegio y el rol, alta atómica y límite de intentos. CA3, CA4, CA5, CA6 y CA13.
* **Decidido: el rol y el colegio se leen de la base de datos en cada petición, no del access token.** El middleware lee la sesión (`sid`) y su usuario en una única consulta por clave primaria y obtiene de ahí `role`, `status` y `schoolId`. Así un cambio de rol se aplica desde la siguiente petición (CA8) sin cerrar las sesiones del usuario, y una baja surte efecto al instante (CA9) aunque fallase la revocación de sus sesiones. Se descartó dejar el rol en el access token y revocar las sesiones del usuario al cambiarle el rol: también es seguro, pero obliga al usuario a volver a iniciar sesión, incluso cuando se le asciende, y no aporta ahorro, porque la lectura de la sesión ya se hace en cada petición (decisión B de US03).
* **Decidido: de momento `role` y `schoolId` se mantienen en los claims del access token**, pero ninguna decisión de autorización del backend los lee: la fuente es siempre la fila del usuario que obtiene el middleware.
* **Comprobado: `RefreshSession` ya rechaza a un usuario que no esté `ACTIVE`** (`INVALID_SESSION` con la causa `USER_INACTIVE` en el log), así que un usuario dado de baja tampoco puede renovar su access token.
* **Decidido: US02_b1 introduce la estructura de las pantallas autenticadas y US04 solo decide su contenido.** Las rutas protegidas cuelgan de una ruta de layout común (`AuthenticatedLayout`) que hace la única guarda de sesión (mientras carga, un indicador; sin sesión, a `/login`) y contiene la cabecera, la navegación y el contenido de cada página. `/onboarding` pasa a colgar de ella y pierde su guarda propia. Las páginas solo para administradores cuelgan además de una guarda de rol (`RequireRole`). Las rutas públicas (`/`, `/registro`, `/login`, `/privacidad` y la página del enlace de invitación de US02_b4) quedan fuera del layout. Se descartó un enlace suelto en la cabecera provisional (duplicaba la guarda en cada página) y hacer antes US04 (aún no define la navegación de la aplicación y sus destinos no existen).
* **Decidido: la página de usuarios es `/usuarios`** y la navegación solo muestra su enlace a un `ADMIN`. Las invitaciones pendientes (US02_b3) son una sección de esa misma página, no una ruta propia.
* **Decidido: un `MEMBER` que entra en `/usuarios` se redirige a `/onboarding` sin mensaje.** La guarda de rol del cliente es solo una comodidad: la autorización la decide el backend. Si la API responde `403 FORBIDDEN` porque el rol cambió mientras la página estaba abierta, la página renueva la sesión y redirige igualmente a `/onboarding`.
* **Decidido (US02_b2): la regla del último administrador se garantiza bloqueando el colegio.** Cada cambio de rol, baja o reactivación se hace en una transacción que bloquea la fila del colegio (`SELECT … FOR UPDATE`), cuenta los `ADMIN` en estado `ACTIVE` y después escribe. Así, dos administradores que se quitan el rol el uno al otro a la vez no dejan el colegio sin administradores. La regla («¿deja esta operación el colegio sin administradores activos?») es una función pura de dominio. Se descartaron `SERIALIZABLE` (exige reintentos y es difícil de probar de forma determinista) y un `UPDATE` condicional con subconsulta (con `READ COMMITTED` los dos recuentos ven la misma instantánea).
* **Decidido (US02_b2): un endpoint por acción.** `PUT /api/users/{id}/role` (`{ role }`), `POST /api/users/{id}/suspend` y `POST /api/users/{id}/reactivate`, solo `ADMIN`, que responden `200` con el usuario actualizado (los mismos campos que `GET /api/users`). Se descartó un `PATCH` genérico, porque cada acción tiene sus precondiciones, sus efectos y su evento de log, y porque dejaría escribir estados como `DELETED`.
* **Decidido (US02_b2): nadie puede darse de baja a sí mismo**, aunque haya otro administrador: `409` con el código `CANNOT_SUSPEND_SELF`. La baja la hace otro administrador. La interfaz no muestra «Dar de baja» en la fila propia. Pasarse a `MEMBER` uno mismo sí se permite si queda otro `ADMIN` activo; después, el frontend renueva la sesión y redirige a `/onboarding`.
* **Decidido (US02_b2): no se cambia el rol de un usuario `SUSPENDED`:** `409` con el código `USER_NOT_ACTIVE`, que nace en esta porción y reutiliza US02_c. Primero se reactiva, con el rol que tenía.
* **Decidido (US02_b2): las acciones son idempotentes.** Dar de baja a un `SUSPENDED`, reactivar a un `ACTIVE` o pedir el rol que ya tiene responde `200` sin cambios, sin evento de log y sin revocar sesiones.
* **Decidido (US02_b2): un identificador de otro colegio, de un usuario `DELETED` o que no es un UUID responde `404 NOT_FOUND`**, sin distinguir los casos.
* **Decidido (US02_b2): la baja revoca todas las sesiones del usuario en la misma transacción que el cambio de estado.** La reactivación no revive ninguna: el usuario vuelve a iniciar sesión.
* **Decidido (US02_b2): interfaz de `/usuarios`.** Las acciones van en cada fila; solo la baja pide confirmación (un modal que avisa de que se cerrarán sus sesiones). Una guarda síncrona por fila impide los envíos repetidos. `409 LAST_ADMIN_REQUIRED` muestra «El colegio debe tener al menos un administrador» en un `role="alert"` sin cambiar la fila, y un `404` avisa y vuelve a cargar la lista. No hay bloqueo optimista: con dos administradores en la página gana la última escritura, y la regla del último administrador la protege el servidor.
* **Decidido (US02_b3): la tabla `access_links` se crea completa,** tal como está diseñada en `MODELO_DATOS.md`: `purpose` con `INVITATION` y `PASSWORD_RESET`, la columna `user_id`, el `CHECK` que exige `role` solo en las invitaciones y `user_id` solo en los restablecimientos, y el índice único parcial de un solo restablecimiento pendiente por usuario. US02_b3 solo usa las invitaciones; US02_c añade el código de los restablecimientos sin migrar otra vez la tabla. Se descartó crear solo la parte de invitaciones, que obligaría a un `ALTER TYPE` y a tocar dos veces la misma tabla.
* **Decidido (US02_b3): endpoints de invitaciones,** solo `ADMIN` y con las guardas de US02_b1: `POST /api/invitations` (`{ role }`) responde `201` con la invitación y el enlace completo, que solo viaja en esa respuesta; `GET /api/invitations` devuelve las pendientes; `POST /api/invitations/{id}/revoke` responde `204` (mismo estilo de verbo que `suspend` y `reactivate`). El enlace lo construye el backend con `APP_ORIGIN` (`<origen>/invitacion#<token>`), para que el frontend no concatene secretos y US02_c reutilice el mecanismo con `/restablecer`. El token es de 256 bits y solo se guarda su SHA-256, como el de los refresh tokens.
* **Decidido (US02_b3): pendiente** es no usada, no revocada y no caducada (`expires_at` > ahora). Las caducadas no aparecen y no se escribe nada al caducar: se deduce de `expires_at`. La lista va de la más reciente a la más antigua, con `id`, rol, nombre de quien la generó, fecha de creación y de caducidad; nunca el hash ni el enlace.
* **Decidido (US02_b3): revocar es idempotente.** Una invitación que ya no está pendiente (revocada, usada o caducada) responde `204` sin cambios. Una de otro colegio, inexistente o con un identificador que no es un UUID responde `404 NOT_FOUND`, sin distinguir los casos, como en US02_b2.
* **Decidido (US02_b3): las invitaciones de un administrador dado de baja siguen valiendo.** Se ven en la lista con el nombre de quien las generó y cualquier otro administrador puede revocarlas. Se descartó revocarlas con la baja: mezclaría una regla de las invitaciones en US02_b2, y quien recibió un enlace repartido legítimamente se encontraría con un `410` sin entender por qué.
* **Decidido (US02_b3): se acepta el hueco hasta US02_b4.** Los enlaces apuntan a `/invitacion`, que no existe hasta US02_b4; mientras tanto, abrir uno muestra una página en blanco (la SPA no tiene esa ruta; aquí decía que llevaba a la página de inicio, y lo corrigió el informe de producción). Se acepta porque en producción no hay usuarios reales, solo cuentas de prueba, y se anota en el informe de producción. Se descartaron una página provisional y desplegar las dos porciones juntas.
* **Decidido (US02_b3): interfaz.** Una sección «Invitaciones pendientes» dentro de `/usuarios`, con un selector de rol y el botón «Generar invitación». El enlace generado se muestra en un panel con un campo de solo lectura, el botón «Copiar» y el aviso de que no se volverá a mostrar; el panel vive solo en memoria, así que al recargar desaparece (CA2). Si el portapapeles no está disponible, el texto queda seleccionado para copiarlo a mano.
* **Decidido (US02_b3): sin límite de invitaciones pendientes y sin purga** de los enlaces viejos. Quien genera es un administrador del propio colegio; un tope queda anotado como posible endurecimiento. Los enlaces caducados, usados o revocados solo guardan el hash (inútil tras caducar) y el id de quien los creó; su conservación entra en la decisión general de conservación de datos, pendiente. Eventos `INVITATION_CREATED` (rol e id de la invitación) e `INVITATION_REVOKED`, con el colegio y quien actúa; nunca el token ni el enlace.



### US02_b1: Ver los usuarios del colegio (cimientos de los endpoints protegidos)

**Épica:** [1. Autenticación y Gestión de Sesiones](#epica-1-autenticacion-y-gestion-de-sesiones) · **Historia madre:** US02_b

**Historia:** Como administrador de un colegio, quiero ver la lista de usuarios de mi colegio, para saber quién tiene acceso y con qué rol.

**Depende de:** US02 (inicio de sesión y access token con `sid`), US03 (decisión B) y US01_b (usuarios y roles).

---

#### Casos de uso y reglas de negocio

* **Autenticación de los endpoints protegidos** (primer uso; la reutilizan todas las historias siguientes):
  * El cliente envía `Authorization: Bearer <access token>`.
  * El middleware verifica la firma y la caducidad y después lee, en **una sola consulta por clave primaria**, la sesión `sid` con su usuario.
  * Responde `401 INVALID_SESSION`, con `WWW-Authenticate: Bearer` y sin indicar la causa al cliente (solo va al log), si falta la cabecera o no tiene el formato `Bearer`, el token no es válido o ha caducado, la sesión no existe, está revocada o caducada, pertenece a otro usuario (`sub`) o el usuario no está `ACTIVE`.
  * La identidad de la petición (`userId`, `schoolId`, `role`, `sessionId`) sale de la base de datos, **nunca** de los claims `role` y `schoolId` del token, que se mantienen solo por compatibilidad.
* **Autorización por rol:** una guarda `requireRole('ADMIN')` responde `403 FORBIDDEN` si el rol leído de la base de datos no es el exigido. Va siempre después de la autenticación: sin sesión la respuesta es `401`, no `403`.
* **Aislamiento por colegio:** los puertos que leen datos del colegio reciben `schoolId` como parámetro obligatorio, tomado de la identidad de la petición. Ningún endpoint acepta el colegio en la ruta ni en el cuerpo.
* **Listado de usuarios (`GET /api/users`, solo `ADMIN`):**
  * Devuelve los usuarios del colegio del administrador con `id`, `firstName`, `lastName`, `email`, `role`, `status` y `createdAt`.
  * Incluye los `ACTIVE` y los `SUSPENDED` (US02_b2 los reactiva) y excluye los `DELETED`, que ningún flujo usa y que el inicio de sesión trata como inexistentes.
  * Orden: apellidos, nombre y email. Sin paginación ni filtros: un colegio tiene decenas de usuarios.
* **Frontend:**
  * **Cliente autenticado:** añade el access token de la sesión en memoria. Ante un `401 INVALID_SESSION` renueva una sola vez con `refresh()` y repite la petición; si la renovación falla, la sesión pasa a `anonymous` y el layout redirige a `/login`. Varias peticiones que reciben `401` a la vez comparten una única renovación.
  * **`AuthenticatedLayout`:** ruta de layout de las páginas protegidas. Mientras la sesión carga, muestra un indicador `role="status"`; sin sesión, navega a `/login` con `replace`; con sesión, pinta la cabecera (la `AppHeader` actual, sin guarda propia), la navegación y el contenido de la página. `/onboarding` pasa a colgar de él.
  * **`RequireRole`:** si el rol de la sesión no es el exigido, navega a `/onboarding` con `replace` y sin mensaje.
  * **Navegación:** el enlace «Usuarios» solo aparece para un `ADMIN`.
  * **`UsersPage` (`/usuarios`):** tabla con nombre, apellidos, email, rol, estado y fecha de alta (fecha formateada con el idioma activo; rol y estado traducidos). Mientras carga muestra un indicador. Ante un `503` u otro error, un aviso `role="alert"` con el botón «Reintentar». Ante un `403`, llama a `refresh()` y navega a `/onboarding`.
* **Fuera de alcance:** las acciones sobre usuarios (US02_b2), las invitaciones (US02_b3 y US02_b4), la paginación, la búsqueda, la ordenación por columnas y el contenido definitivo de la navegación (US04).

---

#### Criterios de Aceptación

* **CA1 (El administrador ve los usuarios):** Dado que soy `ADMIN`, cuando pulso «Usuarios» en la navegación, entonces llego a `/usuarios` y veo a los usuarios `ACTIVE` y `SUSPENDED` de mi colegio, con nombre, apellidos, email, rol, estado y fecha de alta, ordenados por apellidos.
* **CA2 (Solo los de mi colegio):** Dado que existen usuarios en otro colegio, cuando pido la lista, entonces no aparece ninguno de ellos.
* **CA3 (Un miembro no ve la opción):** Dado que soy `MEMBER`, cuando entro en la aplicación, entonces no veo «Usuarios», y si abro `/usuarios` a mano llego a `/onboarding`.
* **CA4 (Un miembro no accede a la API):** Dado que soy `MEMBER`, cuando llamo a `GET /api/users` con mi access token, entonces la API responde `403` con `FORBIDDEN`.
* **CA5 (Sin sesión válida):** Dada una petición a `GET /api/users` sin `Authorization`, con un token mal formado, firmado con otra clave o caducado, entonces la API responde `401` con `INVALID_SESSION` y la cabecera `WWW-Authenticate: Bearer`.
* **CA6 (Sesión cerrada o usuario dado de baja):** Dado un access token aún vigente, cuando su sesión se ha cerrado o su usuario ha pasado a `SUSPENDED`, entonces la siguiente petición responde `401` con `INVALID_SESSION`.
* **CA7 (El rol se lee de la base de datos):** Dado un access token emitido con rol `ADMIN`, cuando el rol del usuario pasa a `MEMBER` en la base de datos, entonces la siguiente petición a `GET /api/users` responde `403` con `FORBIDDEN`, y la página abierta renueva la sesión y lleva a `/onboarding`.
* **CA8 (Renovación transparente):** Dado que mi access token ha caducado y mi sesión sigue viva, cuando abro `/usuarios`, entonces veo la lista sin hacer nada más: el cliente renueva una vez y repite la petición.
* **CA9 (Sesión perdida):** Dado que mi sesión ya no es válida, cuando abro `/usuarios`, entonces llego a `/login`.
* **CA10 (Servicio no disponible):** Dado que la base de datos no responde, cuando abro `/usuarios`, entonces veo un aviso de que no se ha podido cargar la lista y un botón para reintentar; la API responde `503` con `DATABASE_UNAVAILABLE`.
* **CA11 (Sin regresión en `/onboarding`):** `/onboarding` sigue mostrando la bienvenida con sesión y llevando a `/login` sin ella, ahora a través del layout.

---

#### Requisitos Técnicos, QA y Riesgos

* **Contrato primero (`docs/api-spec.yml`):**
  * Esquema de seguridad `bearerAuth` (HTTP bearer, JWT) en `components.securitySchemes`.
  * `GET /api/users` (`operationId: listSchoolUsers`, `security: [bearerAuth]`) con `200 SchoolUserListResponse`, `401`, `403`, `500` y `503`.
  * Respuestas reutilizables `Unauthorized` (con la cabecera `WWW-Authenticate`) y `Forbidden` en `components.responses`.
  * Código `FORBIDDEN` en `ErrorCode` y a la vez en `ERROR_CODES` de `appError.ts`. Después, `npm run api:types -w frontend`.
* **Backend:**
  * `application/authentication/`: caso de uso `AuthenticateRequest` (recibe el token y devuelve `AuthenticatedUser { userId, schoolId, role, sessionId }`, o lanza `InvalidSession` con la causa `TOKEN_INVALID`, `SESSION_NOT_FOUND`, `SESSION_REVOKED`, `SESSION_EXPIRED`, `SESSION_USER_MISMATCH` o `USER_INACTIVE`), el puerto `SessionLookup.findById(sessionId)` y el error `Forbidden`.
  * `infrastructure/prisma/PrismaSessionLookup`: `findUnique` de `refresh_tokens` con `include` del usuario y `translateDatabaseErrors` (un fallo de la base de datos es `503`, nunca `401`).
  * `presentation/http/requireAuthentication.ts` (lee la cabecera, ejecuta `AuthenticateRequest` y deja la identidad en `res.locals`, con el accesor tipado `getAuthenticatedUser(res)`) y `presentation/http/requireRole.ts`.
  * `errorHandler.ts` traduce `Forbidden` a `403` y añade `WWW-Authenticate: Bearer` al `401` de los endpoints protegidos.
  * `application/users/ListSchoolUsers` con el puerto `SchoolUserRepository.listBySchool(schoolId)` y su implementación `PrismaSchoolUserRepository` (excluye `DELETED` y ordena).
  * `presentation/users/usersRouter.ts`, montado en `app.ts` antes de `notFoundHandler`; cableado en `composeApp`, `AppDependencies` y `defaultDependencies`.
  * Estos endpoints no usan `requireAllowedOrigin`: no dependen de cookies, así que no hay riesgo de CSRF.
* **Frontend:**
  * Cliente autenticado en `session/` (renovación compartida y un único reintento).
  * `routes/AuthenticatedLayout.tsx` y `routes/RequireRole.tsx`; la guarda de `OnboardingPage` pasa al layout; rutas anidadas con `<Outlet/>` en `App.tsx`; navegación en `AppHeader`.
  * `services/usersService.ts`: devuelve un `UsersOutcome` (`loaded`, `forbidden`, `unauthenticated`, `unavailable`), nunca lanza y todo lo desconocido es `unavailable`.
  * `pages/UsersPage.tsx` y las claves de i18n en `es.json` y `en.json` (navegación, tabla, roles, estados, errores y reintentar).
* **Rendimiento:** cada petición protegida añade una consulta por clave primaria a través del *pooler*, coste asumido con la decisión B. La lista usa el índice `users.school_id`, que ya existe. No hay migración.
* **Seguridad:** el token nunca se registra; solo se admite HS256 (ya lo garantiza `JoseTokenIssuer`); `Cache-Control: no-store`, el valor por defecto de `/api`; la guarda de rol del cliente es solo una comodidad y la autorización la decide siempre el backend.
* **Observabilidad:** eventos `AUTHENTICATION_REJECTED` (`reason`, nivel `info`) y `AUTHORIZATION_DENIED` (`userId`, `schoolId`, rol actual y exigido, nivel `warn`). Los eventos que registre un endpoint protegido incluyen `userId` y `schoolId`. Listar no genera evento.
* **Tests:**
  * **Unitarios:** `AuthenticateRequest` (cada causa de rechazo y el caso válido, comprobando que el rol sale de la sesión aunque el token diga otro); `requireAuthentication` y `requireRole` con dobles (cabecera ausente, `Basic …`, `Bearer` vacío, `401` frente a `403` y su orden); `ListSchoolUsers`; el cliente autenticado (una sola renovación para varios `401` simultáneos, un único reintento y paso a `anonymous` si falla); `AuthenticatedLayout`, `RequireRole`, la navegación según el rol y `UsersPage` (carga, lista, error con reintento y `403` hacia `/onboarding`).
  * **Integración:** aislamiento con dos colegios (CA2), sesión revocada y usuario `SUSPENDED` (CA6), rol cambiado en la base de datos con el token antiguo (CA7), exclusión de `DELETED` y orden, y `503` con la base de datos caída (CA10).
  * **E2E:** el administrador entra, pulsa «Usuarios» y se ve en la lista (CA1); un `MEMBER` no ve el enlace y `/usuarios` lo lleva a `/onboarding` (CA3), creado con una tarea nueva `createUser` en `scripts/e2eData.mjs` (solo sobre bases `*_test`, porque aún no hay invitaciones); tras cerrar la sesión, `/usuarios` lleva a `/login` (CA9).
* **Documentación:** `docs/api-spec.yml`; `backend/CLAUDE.md` (la viñeta de sesión deja de decir que el middleware no existe y se añaden autenticación y autorización); `frontend/CLAUDE.md` (layout, guardas y cliente autenticado); specs de OpenSpec (capacidad nueva `user-directory` y deltas en `session-management` y `frontend-shell`). `MODELO_DATOS.md` no cambia.
* **Definición de hecho:** lint, typecheck, `api:types:check`, unitarios, integración, E2E y cobertura (90 % backend, 80 % frontend) en verde, y smoke test tras el despliegue.
* **Riesgos:**
  * **Latencia por petición:** la consulta de sesión pasa por el *pooler* en cada petición protegida. Se acota con la consulta única por clave primaria; si se nota, se mide antes de introducir cachés, que retrasarían las revocaciones.
  * **Olvidar el filtro de colegio:** se acota con `schoolId` obligatorio en la firma de los puertos y con el test de integración de aislamiento.

---

### US02_b2: Gestionar los usuarios del colegio (rol, baja y reactivación)

**Épica:** [1. Autenticación y Gestión de Sesiones](#epica-1-autenticacion-y-gestion-de-sesiones) · **Historia madre:** US02_b

**Historia:** Como administrador de un colegio, quiero cambiar el rol de los usuarios de mi colegio, darlos de baja y reactivarlos, para que cada persona tenga el acceso que le corresponde y nadie conserve un acceso que ya no debe tener.

**Depende de:** US02_b1 (autenticación de los endpoints protegidos, `requireRole`, aislamiento por colegio, `authorizedFetch` y `/usuarios`), US03 (revocación de sesiones) y US02 (un `SUSPENDED` no inicia sesión).

---

#### Casos de uso y reglas de negocio

* **Acceso:** los tres endpoints son solo para `ADMIN` y reutilizan `requireAuthentication` y `requireRole('ADMIN')`: sin sesión, `401 INVALID_SESSION`; un `MEMBER`, `403 FORBIDDEN`. El colegio y el usuario que actúa salen de la identidad de la petición, nunca de la ruta ni del cuerpo.
* **Endpoints** (todos responden `200` con el usuario actualizado, con los mismos siete campos que `GET /api/users`):
  * `PUT /api/users/{id}/role` con el cuerpo `{ "role": "ADMIN" | "MEMBER" }`. Un cuerpo no válido responde `400 VALIDATION_ERROR`.
  * `POST /api/users/{id}/suspend`, sin cuerpo.
  * `POST /api/users/{id}/reactivate`, sin cuerpo.
* **Orden de las comprobaciones** (la primera que falla decide la respuesta):
  1. **Usuario:** un `{id}` que no es un UUID, que no existe, que es de otro colegio o que está `DELETED` responde `404 NOT_FOUND`, sin distinguir los casos.
  2. **Baja propia:** `suspend` sobre uno mismo responde `409 CANNOT_SUSPEND_SELF`, aunque haya otros administradores.
  3. **Rol de un dado de baja:** `role` sobre un `SUSPENDED` responde `409 USER_NOT_ACTIVE`, aunque pida el rol que ya tiene.
  4. **Idempotencia:** pedir el rol que ya tiene, dar de baja a un `SUSPENDED` o reactivar a un `ACTIVE` responde `200` sin cambios, sin evento de log y sin revocar sesiones.
  5. **Último administrador:** si la operación deja el colegio sin ningún `ADMIN` en estado `ACTIVE`, responde `409 LAST_ADMIN_REQUIRED` sin cambiar nada. Afecta a pasar un `ADMIN` activo a `MEMBER`, también a uno mismo, y a dar de baja a un `ADMIN` activo. Reactivar nunca reduce los administradores.
* **Atomicidad:** cada operación es una transacción que primero bloquea la fila del colegio (`SELECT … FOR UPDATE`), después lee el usuario y cuenta los `ADMIN` activos, y por último escribe. Las operaciones del mismo colegio se ejecutan de una en una; las de otros colegios no esperan.
* **Efectos:**
  * **Cambio de rol:** solo actualiza `role`. El usuario conserva sus sesiones y tiene los permisos nuevos desde su siguiente petición, porque el middleware lee el rol de la base de datos.
  * **Baja:** `status = SUSPENDED` y, en la misma transacción, `revokedAt` en todas las sesiones del usuario que sigan sin revocar. A partir de ahí, ni inicia sesión (`403 ACCOUNT_SUSPENDED`), ni renueva su sesión, ni sus access tokens pasan el middleware.
  * **Reactivación:** `status = ACTIVE`, con el mismo rol y la misma contraseña. Las sesiones revocadas siguen revocadas: el usuario vuelve a iniciar sesión.
* **Frontend (`/usuarios`):**
  * **Acciones:** una columna «Acciones» por fila. Un `ACTIVE` tiene «Hacer administrador» o «Hacer miembro», según su rol, y «Dar de baja». Un `SUSPENDED` tiene solo «Reactivar». La fila propia lleva la marca «(tú)» y no muestra «Dar de baja».
  * **Confirmación:** solo la baja pide confirmación, con un modal que nombra al usuario y avisa de que se cerrarán sus sesiones. Cancelar no envía nada.
  * **Envíos repetidos:** mientras la petición de una fila está en curso, sus botones están deshabilitados, con una guarda síncrona (`ref`) además del estado. Las demás filas siguen activas.
  * **Respuestas:**
    * `200`: se sustituye la fila por el usuario devuelto, sin recargar la lista.
    * `409 LAST_ADMIN_REQUIRED`: muestra «El colegio debe tener al menos un administrador».
    * `409 CANNOT_SUSPEND_SELF` y `409 USER_NOT_ACTIVE`: cada uno muestra su mensaje.
    * `404`: muestra «Este usuario ya no está disponible» y recarga la lista.
    * `503` u otro error: muestra un aviso genérico.
    * Todos los avisos van en un `role="alert"` y dejan la fila como estaba.
    * `403`: el mismo camino que en US02_b1 (`refresh()` y `/onboarding`).
  * **Pasarse a `MEMBER` uno mismo:** tras el `200`, llama a `refresh()`, y `RequireRole` lo lleva a `/onboarding`.
  * **Sin bloqueo optimista:** con dos administradores en la página gana la última escritura. La regla del último administrador la garantiza el servidor.
* **Fuera de alcance:** invitaciones (US02_b3 y US02_b4); restablecer la contraseña de un reactivado (US02_c); eliminar usuarios (`DELETED`); acciones masivas; historial de cambios en la interfaz; avisar al usuario afectado.

---

#### Criterios de Aceptación

* **CA1 (Ascender a administrador):** Dado que soy `ADMIN` y el colegio tiene un `MEMBER` activo, cuando pulso «Hacer administrador» en su fila, entonces la fila muestra el rol `ADMIN`, y su siguiente petición a `GET /api/users` con su access token de antes responde `200`.
* **CA2 (Pasar a miembro):** Dado que el colegio tiene dos `ADMIN` activos, cuando paso al otro a `MEMBER`, entonces la fila muestra `MEMBER`, y su siguiente petición a `GET /api/users` responde `403 FORBIDDEN`.
* **CA3 (Pasarme a miembro):** Dado que soy `ADMIN` y hay otro `ADMIN` activo, cuando pulso «Hacer miembro» en mi fila, entonces la API responde `200` y llego a `/onboarding` sin el enlace «Usuarios».
* **CA4 (Último administrador):** Dado que soy el único `ADMIN` activo, cuando intento pasarme a `MEMBER`, entonces veo «El colegio debe tener al menos un administrador», la API responde `409 LAST_ADMIN_REQUIRED` y mi rol no cambia.
* **CA5 (Último administrador con peticiones simultáneas):** Dado que el colegio tiene exactamente dos `ADMIN` activos, cuando cada uno pasa al otro a `MEMBER` a la vez, entonces una petición responde `200`, la otra `409 LAST_ADMIN_REQUIRED`, y queda exactamente un `ADMIN` activo.
* **CA6 (Dar de baja):** Dado que soy `ADMIN`, cuando doy de baja a otro usuario y confirmo en el modal, entonces su fila muestra «Dado de baja», su access token anterior recibe `401 INVALID_SESSION`, su refresh token no renueva y su inicio de sesión responde `403 ACCOUNT_SUSPENDED`.
* **CA7 (Cancelar la baja):** Dado el modal de confirmación de la baja, cuando lo cancelo, entonces no se envía ninguna petición y la fila no cambia.
* **CA8 (No puedo darme de baja):** Dado que soy `ADMIN`, entonces mi fila no muestra «Dar de baja», y si llamo a `POST /api/users/{mi id}/suspend` la API responde `409 CANNOT_SUSPEND_SELF` sin cambiar nada, haya o no otros administradores.
* **CA9 (Reactivar):** Dado un `SUSPENDED` con rol `MEMBER`, cuando pulso «Reactivar», entonces la fila muestra «Activo» y `MEMBER`, y el usuario inicia sesión con su contraseña de antes.
* **CA10 (No se cambia el rol de un dado de baja):** Dado un usuario `SUSPENDED`, cuando llamo a `PUT /api/users/{id}/role`, entonces la API responde `409 USER_NOT_ACTIVE` y no cambia nada; en la interfaz su fila solo ofrece «Reactivar».
* **CA11 (Idempotencia):** Dado un usuario ya `SUSPENDED`, cuando vuelvo a darlo de baja, entonces la API responde `200` con el usuario sin cambios y no se registra `USER_SUSPENDED`. Lo mismo para reactivar a un `ACTIVE` o pedir el rol que ya tiene.
* **CA12 (Aislamiento entre colegios):** Dado un usuario de otro colegio, cuando llamo a cualquiera de los tres endpoints con su id, entonces la API responde `404 NOT_FOUND` y no se modifica nada. También responde `404` con un id que no es un UUID o de un usuario `DELETED`.
* **CA13 (Un miembro no gestiona usuarios):** Dado que soy `MEMBER`, cuando llamo a cualquiera de los tres endpoints, entonces la API responde `403 FORBIDDEN`; sin access token, `401 INVALID_SESSION`.
* **CA14 (Errores en la página):** Dada la página `/usuarios`, cuando una acción recibe `409`, `404` o `503`, entonces veo el mensaje de su caso en un `role="alert"` y la fila conserva su estado anterior; con `404` la lista se recarga.

---

#### Requisitos Técnicos, QA y Riesgos

* **Contrato primero (`docs/api-spec.yml`):**
  * Rutas `PUT /api/users/{id}/role` (`operationId: changeUserRole`), `POST /api/users/{id}/suspend` (`suspendUser`) y `POST /api/users/{id}/reactivate` (`reactivateUser`), con `security: [bearerAuth]` y el parámetro `id` (`format: uuid`).
  * Esquemas `ChangeUserRoleRequest` y `SchoolUserResponse`.
  * Respuestas `200`, `400` (solo en `role`), `401`, `403`, `404`, `409`, `500` y `503`. El `404` es `NOT_FOUND`, que ya existe; se añade a `components.responses` si no está.
  * Códigos `LAST_ADMIN_REQUIRED`, `CANNOT_SUSPEND_SELF` y `USER_NOT_ACTIVE` en `ErrorCode` y a la vez en `ERROR_CODES` de `appError.ts`. Después, `npm run api:types -w frontend`.
* **Backend:**
  * **Dominio (`domain/user/`):** una función pura `leavesSchoolWithoutActiveAdmin(activeAdminCount, target, change)` con sus tests, y los errores de dominio `UserNotFound`, `LastAdminRequired`, `CannotSuspendSelf` y `UserNotActive`. Solo `errorHandler` los traduce a HTTP.
  * **Aplicación (`application/users/`):** los casos de uso `ChangeUserRole`, `SuspendUser` y `ReactivateUser`. Reciben `{ schoolId, actorId, userId }` (más `role` en el primero), aplican el orden de comprobaciones y registran `USER_ROLE_CHANGED` (`previousRole`, `newRole`), `USER_SUSPENDED` (`revokedSessions`) y `USER_REACTIVATED` con `schoolId`, `actorId` y `userId`, solo cuando hay cambio.
  * **Puerto:** la gestión necesita leer y escribir dentro de la misma transacción con el colegio bloqueado. Propuesta, a concretar en el `design.md`: un método del repositorio por operación que recibe la regla como función, frente a una unidad de trabajo genérica, que aún no hace falta. Por ejemplo, `SchoolUserRepository.updateWithinSchoolLock(schoolId, userId, decide)`: bloquea, lee el usuario y el recuento, llama a `decide` (que devuelve el cambio o lanza el error de dominio) y escribe. `schoolId` es obligatorio, como en US02_b1.
  * **Infraestructura (`PrismaSchoolUserRepository`):** un `$transaction` interactivo con `$executeRaw\`SELECT 1 FROM schools WHERE id = ${schoolId}::uuid FOR UPDATE\``, el mismo patrón que el bloqueo de `PrismaAttemptRepository`. La baja hace un `refreshToken.updateMany({ where: { userId, revokedAt: null } })` en la misma transacción. Todo pasa por `translateDatabaseErrors`, para que un fallo de la base de datos sea `503`.
  * **Presentación (`usersRouter`):** las tres rutas detrás de las guardas que ya existen. La validación del cuerpo y del UUID se hace con zod: un UUID no válido es `NotFound`, no `VALIDATION_ERROR`. El cableado va en `composeApp`, `AppDependencies`, `defaultDependencies` y `test/support/appDoubles.ts`.
* **Frontend:**
  * **`services/usersService.ts`:** `changeRole`, `suspend` y `reactivate` reciben `authorizedFetch` y devuelven un `UserActionOutcome`: `updated` (con el usuario), `lastAdminRequired`, `cannotSuspendSelf`, `userNotActive`, `notFound`, `forbidden`, `unauthenticated` o `unavailable`. Nunca lanzan, y lo desconocido es `unavailable`.
  * **`pages/UsersPage.tsx`:** la columna de acciones, la marca «(tú)» (por `session.user.id`), la guarda por fila, el aviso por fila o de página, y la llamada a `refresh()` tras pasarse uno mismo a `MEMBER`.
  * **`components/ConfirmSuspendModal.tsx`:** usa el `Modal` de react-bootstrap, con el foco en «Cancelar» al abrir y devuelto al botón de la fila al cerrar.
  * **i18n (`es.json` y `en.json`):** las acciones, el modal, «(tú)» y los cinco mensajes de error.
* **Base de datos:** no hay migración. El bloqueo usa la clave primaria de `schools`, y el recuento usa el índice `users.school_id`, que ya existe.
* **Seguridad:** la autorización la decide siempre el backend (la fila propia sin «Dar de baja» es solo comodidad); el `schoolId` sale de la identidad; los ids de otros colegios no se distinguen de los inexistentes; las respuestas llevan `Cache-Control: no-store`, el valor por defecto de `/api`.
* **Observabilidad:** los tres eventos, a nivel `info`, solo cuando hay cambio. Los rechazos `409` se registran a nivel `info` como `USER_MANAGEMENT_REJECTED` (`reason`, `actorId`, `userId`, `schoolId`), sin datos personales. No se registran emails ni nombres (regla común de US01_b).
* **Tests:**
  * **Unitarios:** la regla del último administrador (cada combinación de rol, estado y cambio); cada caso de uso con dobles (orden de comprobaciones, idempotencia sin evento, eventos con sus campos); el router con dobles (`401` antes de `403`, `400` del cuerpo, `404` del UUID no válido y traducción de cada error); `usersService` (cada código y lo desconocido); `UsersPage` (acciones según el estado y la fila propia, modal confirmar y cancelar, guarda contra el doble clic, cada aviso y el `refresh()` tras pasarse uno mismo a `MEMBER`); el modal (foco y accesibilidad).
  * **Integración:** CA5 con dos peticiones concurrentes reales contra PostgreSQL (exactamente un `200`, un `409` y un `ADMIN` activo al final); aislamiento con dos colegios en los tres endpoints (CA12); la baja revoca todas las sesiones y el access token deja de valer (CA6); la reactivación conserva el rol y no revive sesiones; `503` con la base de datos caída.
  * **E2E:** un `ADMIN` asciende a un `MEMBER` creado con `createUser`; lo da de baja (confirmando el modal), y ese usuario no puede iniciar sesión; lo reactiva, y vuelve a entrar; el único `ADMIN` intenta pasarse a `MEMBER` y ve el aviso; un `ADMIN` se pasa a `MEMBER` habiendo otro, y llega a `/onboarding`.
* **Documentación:** `docs/api-spec.yml`; `backend/CLAUDE.md` (gestión de usuarios, el bloqueo del colegio y el orden de comprobaciones); `frontend/CLAUDE.md` (las acciones de `UsersPage` y el modal); specs de OpenSpec (delta en `school-users` y en `api-error-handling` por los tres códigos). `MODELO_DATOS.md` no cambia.
* **Definición de hecho:** lint, typecheck, `api:types:check`, unitarios, integración, E2E y cobertura (90 % backend, 80 % frontend) en verde, despliegue, smoke test y una comprobación manual en producción con una cuenta de prueba.
* **Riesgos:**
  * **Dejar el colegio sin administradores:** se acota con el bloqueo del colegio y el test concurrente de CA5.
  * **Administrador degradado con una petición en curso:** su middleware ya pasó antes del cambio. No rompe la regla, porque el recuento se hace bajo el bloqueo; se acepta que esa única petición termine.
  * **Bloqueos largos:** la transacción solo hace lecturas por clave y una o dos escrituras; no se llama a nada externo dentro de ella.

---

### US02_b3: Invitar a usuarios al colegio (lado del administrador)

**Épica:** [1. Autenticación y Gestión de Sesiones](#epica-1-autenticacion-y-gestion-de-sesiones) · **Historia madre:** US02_b

**Historia:** Como administrador de un colegio, quiero generar enlaces de invitación con el rol que elija, ver las invitaciones pendientes y revocarlas, para incorporar a otras personas al colegio sin que CalendarSchool envíe correos y sin dejar enlaces válidos que ya no deban usarse.

**Depende de:** US02_b1 (endpoints protegidos, `requireRole`, aislamiento por colegio, `authorizedFetch` y `/usuarios`) y US02_b2 (el estilo de las acciones y su `404` uniforme). **La completa:** US02_b4, que acepta el enlace.

---

#### Casos de uso y reglas de negocio

* **Acceso:** los tres endpoints son solo para `ADMIN`, con `requireAuthentication` y `requireRole('ADMIN')`: sin sesión, `401 INVALID_SESSION`; un `MEMBER`, `403 FORBIDDEN`. El colegio y quien actúa salen de la identidad de la petición.
* **Generar (`POST /api/invitations`, cuerpo `{ "role": "ADMIN" | "MEMBER" }`):**
  * Crea un enlace de acceso con `purpose = INVITATION`, el colegio de la identidad, el rol pedido, `created_by_id` = quien actúa y `expires_at` = ahora + 72 horas.
  * Token de 256 bits (32 bytes aleatorios en base64url), con el mismo adaptador que los refresh tokens. Solo se guarda su SHA-256 en `token_hash`; nunca el token.
  * Responde `201` con `{ invitation, url }`, donde `url` = `APP_ORIGIN` + `/invitacion#` + token. **Es la única respuesta que contiene el enlace**: no se puede recuperar después.
  * Un cuerpo sin `role` o con otro valor responde `400 VALIDATION_ERROR` (campo `role`, `REQUIRED` o `INVALID_FORMAT`); las propiedades desconocidas se ignoran, como en US02_b2.
* **Listar (`GET /api/invitations`):**
  * Devuelve las invitaciones **pendientes** del colegio: no usadas, no revocadas y con `expires_at` posterior a ahora. Las caducadas no aparecen y no se escribe nada al caducar.
  * Cada una con `id`, `role`, `createdBy` (`id`, `firstName`, `lastName`), `createdAt` y `expiresAt`. Nunca el hash ni el enlace.
  * Orden: de la más reciente a la más antigua. Sin paginación.
  * Las invitaciones de un administrador que ya está dado de baja siguen apareciendo, con su nombre, y siguen siendo válidas.
* **Revocar (`POST /api/invitations/{id}/revoke`):**
  * Una pendiente pasa a revocada (`revoked_at` = ahora) y responde `204`.
  * Una que ya no está pendiente (revocada, usada o caducada) responde `204` sin cambios (idempotente, sin evento).
  * Una de otro colegio, inexistente, con `purpose` distinto de `INVITATION` o con un id que no es un UUID responde `404 NOT_FOUND`, sin distinguir los casos.
* **Frontend: sección «Invitaciones pendientes» en `/usuarios`, debajo de la tabla de usuarios:**
  * **Generar:** un selector de rol («Miembro», por defecto, o «Administrador») y el botón «Generar invitación», con una guarda síncrona contra el doble clic.
  * **Enlace generado:** tras el `201` aparece un panel con el enlace en un campo de solo lectura, el botón «Copiar» y el aviso «Copia este enlace ahora: no se volverá a mostrar. Envíalo tú a la persona invitada.». Al copiar, se muestra «Enlace copiado» con `role="status"`. Si el portapapeles no está disponible o falla, el texto del campo queda seleccionado y se pide copiarlo a mano. El panel vive solo en memoria: se cierra con «Hecho», y al recargar o salir de la página desaparece (CA2).
  * **Lista:** una tabla con rol, quién la generó, fecha de creación y de caducidad (formateadas con el idioma activo), cada fila con el botón «Revocar». La nueva invitación aparece en la lista sin recargarla, con la `invitation` del `201`. Revocar no pide confirmación: si fue un error, se genera otra. Una guarda por fila impide el doble envío, y con el `204` la fila desaparece.
  * **Errores:** cada fallo muestra su aviso en un `role="alert"` y no cambia nada:
    * al generar: «No se ha podido generar la invitación»;
    * al revocar: «No se ha podido revocar la invitación»;
    * al cargar la lista: un aviso con «Reintentar»;
    * un `404` al revocar: el aviso y una recarga de la lista;
    * un `403`: el mismo camino que la página (`refresh()` y `/onboarding`).
* **Hueco aceptado hasta US02_b4:** los enlaces apuntan a `/invitacion`, que aún no existe; abrirlos muestra una página en blanco (la SPA no tiene esa ruta). Se anota en el informe de producción.
* **Fuera de alcance:** la página `/invitacion` y la aceptación (US02_b4), el límite de intentos, el código `ACCESS_LINK_INVALID` (US02_b4), los restablecimientos de contraseña (US02_c, aunque la tabla ya los admite), el envío de correos, un tope de invitaciones pendientes, la purga de enlaces viejos y revocar las invitaciones al dar de baja a quien las generó.

---

#### Criterios de Aceptación

* **CA1 (Generar una invitación):** Dado que soy `ADMIN`, cuando elijo «Miembro» y pulso «Generar invitación», entonces veo el enlace completo (`<origen>/invitacion#<token>`) con «Copiar» y el aviso de que no se volverá a mostrar, y la invitación aparece en la lista como pendiente, con rol «Miembro», mi nombre y caducidad a las 72 horas de su creación.
* **CA2 (El enlace solo se muestra una vez):** Dado que he generado una invitación, cuando recargo la página, entonces la invitación sigue en la lista de pendientes pero el enlace ya no se muestra, y `GET /api/invitations` no lo devuelve.
* **CA3 (Invitar a un administrador):** Dado que soy `ADMIN`, cuando genero una invitación con «Administrador», entonces aparece en la lista con rol «Administrador».
* **CA4 (Copiar):** Dado el enlace generado, cuando pulso «Copiar», entonces el enlace queda en el portapapeles y veo «Enlace copiado»; si el portapapeles no está disponible, el texto queda seleccionado y veo cómo copiarlo a mano.
* **CA5 (Revocar):** Dado que tengo una invitación pendiente, cuando pulso «Revocar», entonces desaparece de la lista, la API responde `204` y en la base de datos queda con `revoked_at`; revocarla otra vez responde `204` sin cambios.
* **CA6 (Las caducadas no aparecen):** Dada una invitación con `expires_at` ya pasado, cuando pido la lista, entonces no aparece.
* **CA7 (Aislamiento entre colegios):** Dado un administrador de otro colegio con invitaciones, cuando pido la lista, entonces no veo ninguna de las suyas; y cuando intento revocar una de ellas, la API responde `404 NOT_FOUND` y la invitación sigue pendiente.
* **CA8 (Un miembro no gestiona invitaciones):** Dado que soy `MEMBER`, cuando llamo a cualquiera de los tres endpoints, entonces la API responde `403 FORBIDDEN`; sin access token, `401 INVALID_SESSION`.
* **CA9 (Rol no válido):** Dado que soy `ADMIN`, cuando llamo a `POST /api/invitations` sin `role` o con `role: "OWNER"`, entonces la API responde `400 VALIDATION_ERROR` y no se crea nada.
* **CA10 (Quien la generó está dado de baja):** Dado que otro administrador generó una invitación y después fue dado de baja, cuando pido la lista, entonces la invitación sigue pendiente con su nombre y puedo revocarla.
* **CA11 (El token no se guarda ni se registra):** Dada una invitación generada, entonces la base de datos solo tiene su SHA-256 en `token_hash`, y ni los logs ni ninguna otra respuesta contienen el token o el enlace.
* **CA12 (Errores en la sección):** Dado que la API responde `503` al generar, revocar o cargar la lista, entonces veo el aviso de su caso en un `role="alert"` y no cambia nada.

---

#### Requisitos Técnicos, QA y Riesgos

* **Contrato primero (`docs/api-spec.yml`):**
  * Rutas `POST /api/invitations` (`createInvitation`, `201`, `400`, `401`, `403`, `500`, `503`), `GET /api/invitations` (`listPendingInvitations`, `200`, `401`, `403`, `500`, `503`) y `POST /api/invitations/{id}/revoke` (`revokeInvitation`, `204`, `401`, `403`, `404`, `500`, `503`), con `security: [bearerAuth]`.
  * Esquemas `CreateInvitationRequest`, `Invitation`, `InvitationCreatedResponse` (`invitation` y `url`) e `InvitationListResponse`, y la respuesta `InvitationNotFound`. La descripción del `201` dice que es la única vez que se devuelve el enlace.
  * No hay códigos de error nuevos. Después, `npm run api:types -w frontend`.
* **Base de datos (migración de Prisma):**
  * Enum `AccessLinkPurpose` (`INVITATION`, `PASSWORD_RESET`) y la tabla `access_links`, con las columnas de `MODELO_DATOS.md` en `snake_case`: `id`, `school_id`, `purpose`, `token_hash` (`CHAR(64)`, único), `role` (reutiliza `UserRole`), `user_id`, `created_by_id`, `expires_at`, `used_at`, `revoked_at` y `created_at`.
  * Claves foráneas a `schools` y `users`, sin borrado en cascada: los usuarios no se borran físicamente.
  * Índice (`school_id`, `purpose`).
  * En SQL dentro de la migración, porque Prisma no los expresa: el `CHECK` (`role` obligatorio solo en `INVITATION`, `user_id` solo en `PASSWORD_RESET`) y el índice único parcial de un restablecimiento pendiente por usuario.
  * `resetDatabase()` y la limpieza del E2E vacían la tabla sin cambios, porque recorren todas las tablas salvo las conservadas.
* **Backend:**
  * **Dominio (`domain/accessLink/`):** tipo `AccessLink`, la constante `ACCESS_LINK_TTL_HOURS = 72`, la función pura `accessLinkStatus(link, now)` (`PENDING`, `USED`, `REVOKED` o `EXPIRED`, con prioridad usado → revocado → caducado), el error `InvitationNotFound` y el puerto `AccessLinkRepository`. El puerto tiene `createInvitation`, `listPendingInvitations(schoolId, now)` (con el nombre de quien la creó) y `revokeInvitation(schoolId, id, now)`; esta última devuelve `revoked`, `notPending` o `null` si no es del colegio. `schoolId` es obligatorio en todos.
  * **Aplicación (`application/invitations/`):** `CreateInvitation` (genera el token, guarda el hash, construye el `url` con `appOrigin` inyectado y registra `INVITATION_CREATED` con `invitation_id`, `role`, `school_id` y `actor_id`), `ListPendingInvitations` y `RevokeInvitation` (lanza `InvitationNotFound` con `null` y registra `INVITATION_REVOKED` solo si revocó). La validación del cuerpo sigue el patrón de `parseChangeRoleRequest`. El generador de tokens reutiliza el adaptador de 256 bits de los refresh tokens; el nombre del puerto compartido se decide en el `design.md`.
  * **Infraestructura:** `PrismaAccessLinkRepository`, con `translateDatabaseErrors`. El listado filtra en SQL por `purpose`, `used_at` y `revoked_at` nulos y `expires_at > now`. La revocación es un `updateMany` condicionado al estado pendiente, atómico ante dos revocaciones simultáneas.
  * **Presentación:** `presentation/invitations/invitationsRouter.ts`, montado en `/api/invitations` con las guardas de US02_b1. El `id` se valida antes como UUID (`404`). `errorHandler` traduce `InvitationNotFound` a `404 NOT_FOUND`. El cableado va en `composeApp`, `AppDependencies`, `defaultDependencies` y `appDoubles`.
* **Frontend:**
  * `services/invitationsService.ts`: `create`, `list` y `revoke` reciben `authorizedFetch`, devuelven un resultado por estado (`created` con la invitación y el enlace, `loaded`, `revoked`, `notFound`, `forbidden`, `unauthenticated` o `unavailable`) y nunca lanzan.
  * `components/InvitationsSection.tsx`, con `GeneratedInvitationPanel` (campo de solo lectura, «Copiar» con `navigator.clipboard.writeText` y la selección como alternativa, el aviso y «Hecho»). La monta `UsersPage` debajo de la tabla.
  * Claves de i18n `invitations.*` en `es.json` y `en.json`.
* **Seguridad:**
  * El token nunca se guarda, nunca se registra y solo viaja en el `201`, con `Cache-Control: no-store`, el valor por defecto de `/api`.
  * El enlace usa el fragmento, que el navegador no envía al servidor.
  * La ruta de las peticiones no lleva el token, así que los logs de acceso de CloudFront, API Gateway y pino no lo ven.
  * Solo un `ADMIN` del propio colegio genera, ve y revoca.
* **Rendimiento:** el listado usa el índice (`school_id`, `purpose`); la revocación es una escritura por clave primaria. Con decenas de invitaciones por colegio no hace falta paginar.
* **Observabilidad:** `INVITATION_CREATED` e `INVITATION_REVOKED` a nivel `info`, con `school_id`, `actor_id` e `invitation_id` (y `role` al crear). Nunca el token, el hash, el enlace ni datos personales.
* **Tests:**
  * **Unitarios:**
    * dominio: `accessLinkStatus` en cada estado y en el instante exacto de `expires_at`;
    * casos de uso: hash guardado y no el token, `url` con `appOrigin` y fragmento, caducidad a 72 h con el reloj inyectado, eventos y su ausencia en la revocación idempotente;
    * router: `401` antes de `403`, `400` del rol, `404` del UUID no válido, `201` con `no-store` y `204`;
    * `invitationsService` y `InvitationsSection`: generar, panel, copiar con y sin portapapeles, «Hecho», lista, revocar, guardas, avisos y `403`, sin violaciones de `axe`.
  * **Integración:** la migración (el `CHECK` rechaza una invitación sin rol y un restablecimiento sin usuario; el índice parcial); el repositorio (solo las pendientes, orden, nombre de quien la creó, aislamiento con dos colegios y revocación condicionada); la app real (CA1, CA2, CA5 a CA11 y `503` con la base de datos caída).
  * **E2E:** un administrador genera una invitación de miembro, ve el enlace y lo copia (con el portapapeles simulado en Cypress); recarga y el enlace ya no está pero la invitación sigue en la lista; la revoca y desaparece; `csp.cy.ts` con la sección y el panel abiertos.
* **Documentación:**
  * `docs/api-spec.yml`.
  * `MODELO_DATOS.md`: `access_links` pasa a implementada, con los nombres reales en `snake_case` y la migración.
  * `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `CLAUDE.md` (estado y endpoints) y `README.md`.
  * Specs de OpenSpec: capacidad nueva `school-invitations`.
* **Definición de hecho:** lint, typecheck, `api:types:check`, unitarios, integración, E2E y cobertura (90 % backend, 80 % frontend) en verde; despliegue con la migración aplicada; smoke test; comprobación en producción con una cuenta de prueba.
* **Riesgos:**
  * **Enlaces que aún no llevan a ninguna página:** aceptado hasta US02_b4, con la mitigación de que no hay usuarios reales.
  * **Pérdida del enlace:** no se puede recuperar por diseño; se revoca y se genera otro. El aviso del panel lo dice.
  * **Portapapeles bloqueado** (permisos o contexto no seguro): la selección del texto es la alternativa; producción es HTTPS.
  * **Un enlace reenviado a quien no debe:** se acota con la caducidad, la revocación y, en US02_b4, el uso único.

---

### US02_b4: Aceptar una invitación al colegio

**Épica:** [1. Autenticación y Gestión de Sesiones](#epica-1-autenticacion-y-gestion-de-sesiones) · **Historia madre:** US02_b

**Historia:** Como persona invitada a un colegio, quiero abrir el enlace que me han enviado, ver a qué colegio y con qué rol me invitan y crear mi cuenta, para empezar a trabajar con los datos del colegio sin que nadie tenga que darme de alta a mano.

**Depende de:** US02_b3 (tabla `access_links`, invitaciones y `SecretTokenGenerator`), US01_b (reglas de campo del registro, unicidad del email y consentimiento de privacidad), US01_d (`AttemptLimiter`) y US02 (página `/login`). **Cierra:** el hueco aceptado en US02_b3 (hoy el enlace abre una página en blanco).

---

#### Casos de uso y reglas de negocio

* **Acceso:** los dos endpoints son **públicos** (sin `Authorization` ni cookies) y la página `/invitacion` queda fuera de `AuthenticatedLayout`. El colegio y el rol nunca salen del cliente: salen de la invitación.
* **Consultar (`POST /api/invitations/lookup`, cuerpo `{ "token": string }`):**
  * Busca por el SHA-256 del token una invitación (`purpose = INVITATION`) **pendiente**: no usada, no revocada y con `expires_at` posterior a ahora.
  * Si la encuentra, responde `200` con `{ school: { name }, role }`. **No escribe nada** (CA3).
  * Si no la encuentra, responde `410 ACCESS_LINK_INVALID`, sin distinguir entre caducada, usada, revocada, inexistente o restablecimiento. Lo mismo ocurre con un `token` ausente o mal formado (CA4).
* **Aceptar (`POST /api/invitations/accept`):**
  * **Cuerpo:** `{ token, firstName, lastName, email, password, privacyPolicyAccepted: true }`.
  * **Orden de las comprobaciones (fijo y probado):**
    1. Límite de intentos (`429`).
    2. Enlace pendiente (`410`). Va antes que la validación para que nadie sin un enlace válido pueda preguntar si un email existe.
    3. Validación de campos (`400 VALIDATION_ERROR`).
    4. Hash de la contraseña, fuera de la transacción.
    5. Alta atómica (`409`/`410`/`201`).
  * **Reglas de campo:** las mismas del registro, de la tabla `test-fixtures/registration-fields.json`: normalización NFC, email con `trim()` y minúsculas, y contraseña de 8 caracteres a 72 bytes. Se ignoran las propiedades desconocidas: un `role` o un `schoolId` del cuerpo no se usan nunca.
  * **Consentimiento:** `privacyPolicyAccepted` debe ser `true` (`REQUIRED` en otro caso). Se guardan `privacyPolicyAcceptedAt` y `privacyPolicyVersion` como en el registro.
  * **Alta atómica** (una `$transaction`):
    * Un `UPDATE access_links SET used_at = now()` condicionado a «pendiente».
    * Si actualiza 0 filas: rollback y `410` (otra aceptación ganó la carrera, CA6).
    * Si actualiza 1 fila: `INSERT` del usuario `ACTIVE`, con el colegio y el rol de la invitación.
    * Si el `INSERT` choca con el email único: rollback, la invitación sigue pendiente y `409 EMAIL_ALREADY_REGISTERED` (CA5).
    * No hace falta `FOR UPDATE`: con `READ COMMITTED`, el segundo `UPDATE` espera el bloqueo de fila y vuelve a evaluar el `WHERE` tras el commit del primero.
  * **Respuesta:** `201` con `{ user: { id, firstName, lastName, email, role }, school: { id, name } }`.
  * **Sin sesión:** no crea sesión ni fija cookies. El invitado inicia sesión después (CA1).
  * **Invitación de un administrador dado de baja:** sigue siendo válida (decisión de US02_b3).
* **Límite de intentos:**
  * **Política:** una para los dos endpoints, con la clave `invitation:<ip>`.
  * **Qué cuenta:** solo los intentos fallidos por enlace no válido (`410`), con reserva y liberación como en el login. No cuentan `400` ni `409`.
  * **Valores:** máximo `INVITATION_ATTEMPTS_MAX`, por defecto 10, en una ventana de 15 minutos.
  * **Al superarlo:** `429 TOO_MANY_REQUESTS` con `Retry-After`. Si la base de datos no responde, falla cerrado (`503`).
* **Frontend: página pública `/invitacion`:**
  * **Al montar:**
    * Lee el token de `location.hash` y lo borra de la URL con `history.replaceState`, para que no quede en el historial ni en capturas.
    * Lo guarda solo en memoria y no lo escribe en ningún almacenamiento.
    * Consulta una vez, aunque `StrictMode` ejecute el efecto dos veces.
  * **Estados de la consulta:**
    * Mientras carga, un `role="status"`.
    * Sin token o con `410`: la vista «Este enlace no es válido o ha caducado. Pide uno nuevo a un administrador del colegio.», sin formulario (CA4).
    * `429`: «Demasiados intentos. Vuelve a intentarlo dentro de N minutos.» (N redondeado hacia arriba con `retryAfterMinutes`).
    * `503` o fallo de red: aviso con «Reintentar».
  * **Formulario:**
    * Muestra «Te han invitado a {colegio} como {rol}» y los campos nombre, apellidos, email, contraseña y la casilla de la política de privacidad (enlace a `/privacidad`).
    * La validación en línea es la del registro.
    * Una `ref` síncrona impide el doble envío.
  * **Respuestas al enviar:**
    * `201`: navega a `/login` con `replace` y `state: { accountCreated: true, email }`. `LoginPage` muestra «Tu cuenta se ha creado. Inicia sesión para entrar.» en un `role="status"` y rellena el email.
    * `409`: error en el campo email («Este email ya está registrado»), conservando el resto.
    * `410`: la vista de enlace no válido.
    * `400`: los errores de campo.
    * `429`: el aviso de espera.
    * `503` o fallo de red: «No se ha podido crear la cuenta. Inténtalo de nuevo.»
  * **Sesión abierta en el navegador:** la página la ignora y funciona igual. Tras el `201`, `/login` redirige a `/onboarding` de quien ya tenía sesión y el mensaje no se ve; la cuenta se ha creado igualmente (caso aceptado).
* **Fuera de alcance:** restablecer la contraseña (US02_c, que reutilizará el patrón con `/restablecer`), iniciar sesión automáticamente tras aceptar, avisar al administrador de que alguien aceptó, reenviar o recuperar enlaces, y un tope de cuentas por invitación (es de un solo uso).

---

#### Criterios de Aceptación

* **CA1 (Aceptar una invitación):** Dado un enlace válido con rol `MEMBER`, cuando lo abro, veo «Te han invitado a {colegio} como Miembro», envío nombre, apellidos, email y contraseña válidos y acepto la política de privacidad, entonces se crea mi usuario en ese colegio con rol `MEMBER` y estado `ACTIVE`, con la fecha y la versión de la política; la invitación queda con `used_at`; llego a `/login` con «Tu cuenta se ha creado» y mi email ya escrito, y puedo iniciar sesión con mi contraseña.
* **CA2 (Invitación de administrador):** Dado un enlace válido con rol `ADMIN`, cuando lo acepto, entonces mi usuario tiene rol `ADMIN` y, tras iniciar sesión, veo «Usuarios».
* **CA3 (Abrir el enlace no lo consume):** Dado un enlace válido, cuando se abre o se consulta (`lookup`) varias veces sin enviar el formulario, entonces la invitación sigue pendiente y el enlace sigue sirviendo.
* **CA4 (Enlace no válido):** Dado un enlace caducado, usado, revocado, inexistente, de un restablecimiento o sin token, cuando lo abro o envío el formulario, entonces veo «Este enlace no es válido o ha caducado. Pide uno nuevo a un administrador del colegio.», no se crea ningún usuario y la API responde `410 ACCESS_LINK_INVALID`, sin distinguir el caso.
* **CA5 (Email ya registrado):** Dado un enlace válido, cuando envío un email ya registrado (en este o en otro colegio, en cualquier estado), entonces veo «Este email ya está registrado» en el campo, la API responde `409 EMAIL_ALREADY_REGISTERED`, no se crea el usuario y la invitación sigue pendiente.
* **CA6 (Aceptaciones simultáneas):** Dado un enlace válido, cuando se envía dos veces a la vez con emails distintos, entonces solo se crea un usuario y la otra petición recibe `410 ACCESS_LINK_INVALID`.
* **CA7 (Enlace antes que los campos):** Dado un enlace no válido, cuando envío campos no válidos o un email ya registrado, entonces la API responde `410`, no `400` ni `409`.
* **CA8 (Validación y consentimiento):** Dado un enlace válido, cuando envío campos que no cumplen las reglas del registro o sin aceptar la política, entonces veo los errores en línea, la API responde `400 VALIDATION_ERROR` con un `{ field, code }` por campo y no se consume la invitación.
* **CA9 (El cliente no elige rol ni colegio):** Dado un enlace válido de `MEMBER`, cuando envío además `role: "ADMIN"` o un `schoolId`, entonces se ignoran y el usuario se crea como `MEMBER` en el colegio de la invitación.
* **CA10 (Límite de intentos):** Dada una IP que ha superado el máximo de enlaces no válidos en 15 minutos, cuando consulta o acepta, entonces la API responde `429 TOO_MANY_REQUESTS` con `Retry-After` y la página muestra los minutos de espera. Los `400` y `409` no cuentan.
* **CA11 (El token no deja rastro):** Dado que abro un enlace, entonces la URL de la barra deja de contener el token nada más cargar la página; el token no aparece en ningún almacenamiento del navegador, en los logs ni en ninguna respuesta; y la página no carga recursos de terceros ni viola la CSP.
* **CA12 (Base de datos caída):** Dado que la base de datos no responde, cuando consulto o acepto, entonces la API responde `503 DATABASE_UNAVAILABLE` y veo el aviso de su caso.

---

#### Requisitos Técnicos, QA y Riesgos

* **Contrato primero (`docs/api-spec.yml`):**
  * Rutas sin `security`: `POST /api/invitations/lookup` (`lookupInvitation`: `200`, `410`, `429`, `500`, `503`) y `POST /api/invitations/accept` (`acceptInvitation`: `201`, `400`, `409`, `410`, `429`, `500`, `503`).
  * Esquemas `InvitationLookupRequest`, `InvitationLookupResponse`, `AcceptInvitationRequest` e `InvitationAcceptedResponse`, y la respuesta reutilizable `AccessLinkInvalid`.
  * Código nuevo `ACCESS_LINK_INVALID`, a la vez en el enum `ErrorCode` y en `ERROR_CODES` de `appError.ts`. Después, `npm run api:types -w frontend`.
* **Base de datos:** sin migración. `access_links.used_at` se escribe por primera vez y `users` reutiliza sus columnas de consentimiento.
* **Backend:**
  * **Dominio (`domain/accessLink/`):** error `AccessLinkInvalid`. El puerto `AccessLinkRepository` suma `findPendingInvitation(tokenHash, now)` (`{ schoolName, role }` o `null`) y `acceptInvitation({ tokenHash, now, newUser })`, que devuelve el usuario creado o `null` si el enlace ya no estaba pendiente, y lanza `EmailAlreadyRegistered`.
  * **Aplicación (`application/invitations/`):** `LookupInvitation`; `AcceptInvitation` (límite, comprobación previa del enlace, validación, hash, alta y evento); `acceptInvitationRequest.ts` (Zod, con las reglas de usuario de `registerSchoolRequest.ts` sin el bloque del colegio, extraídas a un módulo común si hace falta); `LimitInvitationAttempts` sobre `AttemptLimiter`. Reloj inyectado.
  * **Infraestructura:** en `PrismaAccessLinkRepository`, la consulta con `select` explícito y el `$transaction` con `updateMany` condicionado y `user.create`; la unicidad se distingue por el nombre del índice, como en el registro. `config.ts` suma `INVITATION_ATTEMPTS_MAX`.
  * **Presentación:** `presentation/invitations/publicInvitationsRouter.ts`, montado en `app.ts` **antes** del router protegido de `/api/invitations` (que aplica las guardas con `router.use` y no debe ver estas rutas). `errorHandler` traduce `AccessLinkInvalid` a `410`. Cableado en `composeApp`, `AppDependencies`, `defaultDependencies` y `appDoubles`. `realApp` y `scripts/e2e.mjs` fijan `INVITATION_ATTEMPTS_MAX=1000`.
* **Frontend:**
  * `services/invitationAcceptanceService.ts`, con `fetch` normal (es público, sin `authorizedFetch`): `lookup` y `accept` devuelven un resultado por estado (`found`, `accepted`, `invalid`, `emailAlreadyRegistered`, `validationError`, `tooManyAttempts` con minutos y `unavailable`) y nunca lanzan.
  * `pages/AcceptInvitationPage.tsx`, en la ruta pública `/invitacion` de `App.tsx`. La validación se reutiliza de `validation/registrationValidation.ts` (campos de usuario y consentimiento).
  * `LoginPage` lee `location.state` (`accountCreated`, `email`).
  * Claves de i18n `acceptInvitation.*` y `login.accountCreated` en `es.json` y `en.json`.
* **Seguridad:**
  * El token solo viaja en cuerpos `POST`, nunca en la ruta ni en la consulta: los logs de CloudFront, API Gateway y pino no lo ven. Respuestas con `Cache-Control: no-store`.
  * Un solo uso por la transacción; el límite de intentos frena la fuerza bruta; el `410` no distingue causas.
  * Sin captcha ni scripts de terceros en la página.
  * El email sigue siendo enumerable solo por quien tiene un enlace válido, el mismo riesgo aceptado del registro.
* **Rendimiento:** consulta por `token_hash` (índice único). El hash Bcrypt (coste 12) se calcula **fuera** de la transacción y solo tras comprobar el enlace, para que un token falso no cueste CPU ni alargue el bloqueo.
* **Observabilidad:** `INVITATION_ACCEPTED` (`info`) con `school_id`, `invitation_id`, `user_id` y `role`; `INVITATION_ACCEPT_REJECTED` (`warn`) con `reason` (`LINK_INVALID`, `EMAIL_ALREADY_REGISTERED`) e IP. El email va enmascarado como en el login; nunca el token, el hash ni la contraseña.
* **Tests:**
  * **Unitarios:** casos de uso (orden de las comprobaciones, el hash no se calcula con un enlace no válido, consentimiento, propiedades ignoradas, eventos sin token); router (`410` del token ausente, `400`, `409`, `429` y `201` con `no-store`); servicio y página (lectura y borrado del fragmento, consulta única en `StrictMode`, cada estado, doble envío, `409` en el campo, navegación a `/login` con `state`, mensaje en `LoginPage`, sin violaciones de `axe`).
  * **Integración:** repositorio (consulta solo de pendientes y de `INVITATION`; alta atómica con rollback ante email duplicado y la invitación pendiente; **CA6 con dos `accept` simultáneos** y `Promise.allSettled`); la app real (CA1 a CA5, CA7 a CA10 y `503`; ningún log contiene el token).
  * **E2E (`invitation-acceptance.cy.ts`):** un administrador genera una invitación por la API; se abre el enlace, se ven el colegio y el rol, se crea la cuenta, se llega a `/login` con el mensaje y se inicia sesión como `MEMBER`; un enlace revocado muestra la vista no válida; un email registrado muestra el error del campo. `csp.cy.ts` ampliado con `/invitacion`.
* **Documentación:** `api-spec.yml`; `MODELO_DATOS.md` (`used_at` en uso y consentimiento de los invitados); `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `CLAUDE.md` (estado y endpoints) y `README.md`; la capacidad `school-invitations` en OpenSpec.
* **Definición de hecho:** lint, typecheck, `api:types:check`, unitarios, integración, E2E y cobertura (90 % backend, 80 % frontend) en verde; despliegue y smoke test; en producción, con una cuenta de prueba: generar, abrir, aceptar e iniciar sesión.
* **Riesgos:**
  * **Enlace reenviado a quien no debe:** se acota con el uso único, las 72 h, la revocación y la lista de usuarios (el administrador ve quién se unió y puede darlo de baja).
  * **Fuerza bruta:** inviable con 256 bits, y el límite de intentos la frena igualmente.
  * **Enumeración de emails:** solo con un enlace válido.
  * **Sesión abierta al aceptar:** se pierde el mensaje de «cuenta creada»; caso aceptado.

---

#### Decisiones tomadas

* **Decidido (US02_b4): rutas públicas bajo `/api/invitations`** (`lookup` y `accept`) en un router propio montado antes del protegido. Se descartó una raíz genérica `/api/access-links/...`: US02_c tendrá cuerpos distintos (una contraseña nueva, no un alta) y el contrato queda más claro con una operación por propósito.
* **Decidido (US02_b4): el enlace se comprueba antes que los campos.** Así un email solo se puede sondear con un enlace válido. Se descartó validar primero los campos, que es más cómodo pero abre una enumeración de emails sin enlace.
* **Decidido (US02_b4): el invitado acepta la política de privacidad al crear su cuenta,** con la misma casilla, fecha y versión que el registro. Las columnas eran nullable pensando en que los invitados aceptarían después; un invitado también entrega sus datos personales al crear la cuenta, así que acepta aquí.
* **Decidido (US02_b4): sin captcha en la aceptación.** El token de 256 bits ya filtra a los bots, el límite de intentos frena la fuerza bruta y la página no carga recursos de terceros, un requisito de la historia madre que reCAPTCHA incumpliría.
* **Decidido (US02_b4): un límite de intentos para la consulta y la aceptación, que solo cuenta los enlaces no válidos.** La consulta es el oráculo de la fuerza bruta, así que también se limita; los `400` y `409` no cuentan para no bloquear a quien corrige el formulario.
* **Decidido (US02_b4): se mantiene la `Referrer-Policy` global** (`strict-origin-when-cross-origin`) en lugar de `no-referrer` solo para `/invitacion`, como pedía la historia madre. El fragmento no viaja nunca en `Referer` en ningún navegador; el riesgo real, que el token quede en el historial, se cubre borrándolo de la URL con `history.replaceState` al cargar la página. Una política propia para esa ruta exigiría otro comportamiento de CloudFront.
* **Decidido (US02_b4): aceptar no inicia sesión,** como dice CA3 de US02_b: el invitado llega a `/login` con su email escrito. Se descartó crear la sesión en el alta, que es más cómodo pero añade cookies a un endpoint público.
* **Decidido (US02_b4): la página ignora una sesión abierta** en el navegador; se acepta que en ese caso no se vea el mensaje de «cuenta creada».

---

### US02_c: Restablecer la contraseña con un enlace del administrador

**Épica:** [1. Autenticación y Gestión de Sesiones](#epica-1-autenticacion-y-gestion-de-sesiones)

**Historia:** Como administrador de un colegio, quiero generar un enlace para que un usuario del colegio defina una contraseña nueva, para que pueda recuperar el acceso sin que CalendarSchool envíe correos.

**Depende de:** US02_b3 (tabla `access_links` con `PASSWORD_RESET`, su `CHECK` y su índice único parcial, y el panel del enlace), US02_b4 (el patrón público: token en el cuerpo, enlace antes que campos, `UPDATE` condicionado, `replaceState` y aviso en `/login`), US02_b2 (gestión por fila en `/usuarios` y `USER_NOT_ACTIVE`), US01_b (reglas de contraseña y `maskEmail`) y US03 (sesiones invalidadas al instante por `sid`).

---

#### Casos de uso y reglas de negocio

* **Generar (`POST /api/users/{id}/password-reset`, sin cuerpo; solo `ADMIN`, con las guardas de US02_b1):**
  * El usuario debe ser del colegio de la identidad y `ACTIVE`; puede ser otro administrador o el propio administrador. Otro colegio, un id inexistente, un usuario `DELETED` o un id que no es un UUID responden `404 NOT_FOUND`, sin distinguir; un `SUSPENDED`, `409 USER_NOT_ACTIVE`.
  * En una transacción: revoca (`revoked_at` = ahora) cualquier restablecimiento **abierto** del usuario (`used_at` y `revoked_at` nulos, **aunque haya caducado**: el índice único parcial los cuenta como pendientes) y crea el enlace nuevo con `purpose = PASSWORD_RESET`, `user_id`, `created_by_id` = quien actúa, `expires_at` = ahora + 72 h y el SHA-256 de un token de 256 bits.
  * Si dos administradores generan a la vez para el mismo usuario y el `INSERT` choca con `access_links_pending_reset_user_key`, se reintenta la transacción **una vez**.
  * Responde `201` con `{ passwordReset: { userId, createdAt, expiresAt }, url }`, donde `url` = `APP_ORIGIN` + `/restablecer#` + token. Es la única respuesta con el enlace.
* **Revocar (`POST /api/users/{id}/password-reset/revoke`, sin cuerpo; solo `ADMIN`):** revoca el restablecimiento pendiente del usuario y responde `204`. Es idempotente: sin pendiente, `204` sin cambios ni evento. El `404` como en Generar.
* **Lista de usuarios (`GET /api/users`):** cada usuario suma `passwordResetPending: boolean` (de 7 a 8 campos): `true` si tiene un `PASSWORD_RESET` no usado, no revocado y no caducado en el instante de la petición.
* **Consultar (`POST /api/password-resets/lookup`, público, `{ "token": string }`):** busca un `PASSWORD_RESET` pendiente cuyo usuario esté `ACTIVE`. Si lo encuentra, `200` con `{ school: { name }, email }`, con el email **enmascarado** por `maskEmail` (`j***@example.com`). No escribe nada. En otro caso (caducado, usado, revocado, inexistente, una invitación, el usuario ya no está `ACTIVE` o falta el token), `410 ACCESS_LINK_INVALID`, sin distinguir.
* **Confirmar (`POST /api/password-resets/confirm`, público, `{ token, password }`):**
  * Orden fijo: límite de intentos (`429`) → enlace pendiente y usuario `ACTIVE` (`410`) → contraseña con las reglas del registro (`400 VALIDATION_ERROR`, campo `password`) → hash Bcrypt (fuera de la transacción) → cambio atómico.
  * Una transacción: `UPDATE access_links SET used_at` condicionado a «pendiente» (0 filas → rollback y `410`); `UPDATE users SET password_hash` condicionado a `status = ACTIVE` (0 filas → rollback y `410`); y `UPDATE refresh_tokens SET revoked_at` de **todas** las sesiones abiertas del usuario (el mismo `updateMany` que la baja de US02_b2), cuyos access tokens dejan de valer en la petición siguiente (decisión B de US03).
  * Responde `204`, sin cuerpo, sesión ni cookies. Las propiedades desconocidas se ignoran.
* **Límite de intentos:** clave `password-reset:<ip>`, compartida por la consulta y la confirmación, con `PASSWORD_RESET_ATTEMPTS_MAX` (10 por defecto) y ventana de 15 minutos; solo cuentan los enlaces no válidos (`410`): el intento se reserva y se libera en cuanto el enlace resulta válido, como en US02_b4. Agotado, `429` con `Retry-After`.
* **Frontend, `/usuarios`:**
  * Cada fila `ACTIVE`, incluida la propia, ofrece «Restablecer contraseña»; con `passwordResetPending`, la fila muestra «Restablecimiento pendiente» y «Revocar restablecimiento». Las filas `SUSPENDED` no ofrecen generar.
  * Tras el `201`, el panel del enlace (el de US02_b3, generalizado) con el aviso «Copia este enlace ahora: no se volverá a mostrar. Si el usuario tenía otro enlace pendiente, ha dejado de funcionar.»; la fila pasa a pendiente sin volver a pedir la lista. Guarda por fila, como en US02_b2.
  * Errores: `409 USER_NOT_ACTIVE` → «Reactiva el usuario antes de restablecer su contraseña»; `404` → el aviso y una recarga de la lista; `403` → el camino de la página (`refresh()` y `/onboarding`); otros → «No se ha podido generar el enlace» o «No se ha podido revocar el restablecimiento».
* **Frontend, página pública `/restablecer`:**
  * Lee el token del fragmento, lo quita de la URL con `history.replaceState` (como US02_b4), lo guarda solo en una `ref` y consulta una vez aunque `StrictMode` ejecute el efecto dos veces.
  * Vistas de la consulta: cargando (`role="status"`); enlace no válido («Este enlace no es válido o ha caducado. Pide uno nuevo a un administrador del colegio.», también sin token); `429` con los minutos; `503` con «Reintentar».
  * Formulario: «Vas a cambiar la contraseña de {email enmascarado} en {colegio}.», «Contraseña nueva» y «Repite la contraseña». La contraseña se valida con `validateField('password')`; si la confirmación no coincide, «Las contraseñas no coinciden», en el cliente y sin enviar nada. Guarda síncrona contra el doble envío.
  * `204` → `/login` con `replace` y `state: { passwordChanged: true }`; `LoginPage` muestra «Tu contraseña se ha cambiado. Inicia sesión con la nueva.» en un `role="status"`. `410` → la vista no válida; `400` → el error en el campo; `429` y `503` → sus avisos.
  * No usa la sesión ni carga recursos de terceros. Si el propio usuario tenía una sesión abierta en ese navegador, queda revocada y el `AuthenticatedLayout` lo lleva a `/login` en su siguiente petición.
* **Fuera de alcance:** recuperación por correo; cambiar la contraseña desde el perfil sabiendo la actual; revocar los restablecimientos pendientes al dar de baja (se cubre comprobando `ACTIVE` al usar el enlace); historial de restablecimientos en la interfaz; recuperar el acceso si todos los administradores están bloqueados (soporte manual).

---

#### Criterios de Aceptación

* **CA1 (Generar el enlace):** Dado que soy `ADMIN` y el colegio tiene un usuario `ACTIVE`, cuando pulso «Restablecer contraseña» en su fila, entonces veo el enlace completo (`<origen>/restablecer#<token>`) con «Copiar» y el aviso de que no se volverá a mostrar, y la fila indica «Restablecimiento pendiente» con «Revocar restablecimiento».
* **CA2 (El enlace solo se muestra una vez):** Dado que he generado un enlace, cuando recargo `/usuarios`, entonces la fila sigue indicando el restablecimiento pendiente, el enlace ya no se muestra y `GET /api/users` solo devuelve `passwordResetPending: true`.
* **CA3 (Definir la contraseña nueva):** Dado un enlace válido, cuando lo abro, veo el colegio y mi email enmascarado, y envío una contraseña nueva válida dos veces, entonces la API responde `204`, llego a `/login` con «Tu contraseña se ha cambiado. Inicia sesión con la nueva.», puedo entrar con la nueva y no con la anterior, y el enlace queda usado.
* **CA4 (Se cierran todas las sesiones):** Dado que el usuario tiene dos sesiones abiertas, cuando restablece la contraseña, entonces sus dos sesiones quedan revocadas, sus access tokens reciben `401` en la siguiente petición y tiene que volver a iniciar sesión.
* **CA5 (Abrir el enlace no lo consume):** Dado un enlace válido, cuando se abre o se consulta varias veces sin enviar el formulario, entonces sigue sirviendo y la contraseña no cambia.
* **CA6 (Enlace no válido):** Dado un enlace caducado, usado, revocado, inexistente, de una invitación o sin token, cuando lo abro o confirmo, entonces veo «Este enlace no es válido o ha caducado. Pide uno nuevo a un administrador del colegio.», la contraseña no cambia y la API responde `410 ACCESS_LINK_INVALID`.
* **CA7 (Contraseña nueva no válida):** Dado un enlace válido, cuando envío una contraseña fuera de 8 caracteres a 72 bytes o sin la variedad requerida, entonces veo el error en línea y no se envía nada; por la API, `400 VALIDATION_ERROR` con el campo `password` y el enlace sigue sirviendo. Con una confirmación distinta, veo «Las contraseñas no coinciden» y no se envía nada.
* **CA8 (Un enlace nuevo invalida el anterior):** Dado un restablecimiento pendiente, **incluso caducado**, cuando genero otro para el mismo usuario, entonces el anterior responde como en CA6 y solo sirve el nuevo.
* **CA9 (Usuario dado de baja):** Dado un usuario `SUSPENDED`, cuando intento generar un enlace para él, entonces la API responde `409 USER_NOT_ACTIVE` y veo «Reactiva el usuario antes de restablecer su contraseña»; y dado un enlace generado antes de que lo dieran de baja, cuando se usa, entonces responde `410` y la contraseña no cambia.
* **CA10 (Permisos y aislamiento):** Dado que soy `MEMBER`, cuando llamo a generar o revocar, la API responde `403 FORBIDDEN` (sin token, `401`); y dado que soy `ADMIN`, cuando lo intento para un usuario de otro colegio, inexistente, `DELETED` o con un id que no es un UUID, la API responde `404 NOT_FOUND` y no se crea nada.
* **CA11 (Revocar):** Dado un restablecimiento pendiente, cuando pulso «Revocar restablecimiento», entonces la API responde `204`, la fila deja de indicarlo y el enlace responde como en CA6; revocar otra vez responde `204` sin cambios.
* **CA12 (Generaciones simultáneas):** Dado un usuario `ACTIVE`, cuando dos administradores generan a la vez un enlace para él, entonces las dos peticiones responden `201` y solo el último enlace creado sirve (como mucho un pendiente por usuario).
* **CA13 (Límite de intentos):** Dada una IP que ha superado el máximo de enlaces no válidos en 15 minutos, cuando consulta o confirma, entonces la API responde `429 TOO_MANY_REQUESTS` con `Retry-After`; los `400` no cuentan.
* **CA14 (El token no deja rastro):** Dado que abro un enlace, entonces la URL pierde el fragmento al cargar; el token, su hash y la contraseña no aparecen en ningún almacenamiento del navegador, log ni respuesta; y la página no carga recursos de terceros ni viola la CSP.

---

#### Requisitos Técnicos, QA y Riesgos

* **Contrato primero (`docs/api-spec.yml`):**
  * Rutas protegidas (`bearerAuth`): `POST /api/users/{id}/password-reset` (`createPasswordReset`: `201`, `401`, `403`, `404`, `409`, `500`, `503`) y `POST /api/users/{id}/password-reset/revoke` (`revokePasswordReset`: `204`, `401`, `403`, `404`, `500`, `503`).
  * Rutas públicas: `POST /api/password-resets/lookup` (`lookupPasswordReset`: `200`, `410`, `429`, `500`, `503`) y `POST /api/password-resets/confirm` (`confirmPasswordReset`: `204`, `400`, `410`, `429`, `500`, `503`).
  * Esquemas `PasswordReset` (`userId`, `createdAt`, `expiresAt`), `PasswordResetCreatedResponse` (`passwordReset`, `url`), `PasswordResetLookupRequest`/`Response` (`school.name`, `email` enmascarado) y `ConfirmPasswordResetRequest` (`token`, `password`); `SchoolUser` suma `passwordResetPending` (obligatorio).
  * Sin códigos de error nuevos: se reutilizan `ACCESS_LINK_INVALID`, `USER_NOT_ACTIVE`, `NOT_FOUND`, `FORBIDDEN` y `TOO_MANY_REQUESTS`. Después, `npm run api:types -w frontend`.
* **Base de datos:** sin migración; la tabla, el `CHECK` y el índice parcial existen desde US02_b3.
* **Backend:**
  * **Dominio (`domain/accessLink/`):** el puerto suma `createPasswordReset({ schoolId, userId, actorId, tokenHash, now })` (el restablecimiento, `notFound`, `notActive` y el número de anteriores revocados), `revokePasswordReset(schoolId, userId, now)` (`revoked`, `none` o `notFound`), `findPendingPasswordReset(tokenHash, now)` (`{ schoolName, email }` o `null`) y `resetPassword({ tokenHash, now, passwordHash })` (`{ userId, schoolId, revokedSessions }` o `null`).
  * **Aplicación (`application/passwordResets/`):** `CreatePasswordReset`, `RevokePasswordReset`, `LookupPasswordReset` y `ConfirmPasswordReset`; la contraseña se valida con `USER_FIELD_SCHEMAS.password` de `userFields.ts`, el email se enmascara con `maskEmail` y el límite se aplica con un módulo como `invitationAttempts.ts` (generalizado si encaja sin forzarlo). Reloj inyectado.
  * **Infraestructura:** los métodos de `PrismaAccessLinkRepository` con `$transaction`, `updateMany` condicionados y el reintento único ante `access_links_pending_reset_user_key` (`violatedUniqueIndex`); `ListSchoolUsers` y `PrismaSchoolUserRepository.listBySchool` reciben `now` y calculan `passwordResetPending` con un `select` del pendiente del usuario; `config.ts` suma `PASSWORD_RESET_ATTEMPTS_MAX`.
  * **Presentación:** las dos rutas de administrador en `usersRouter` (el `{id}` se valida como UUID antes de nada), `presentation/passwordResets/publicPasswordResetsRouter.ts` montado en `/api/password-resets`, y el cableado en `composeApp`, `AppDependencies`, `appDoubles` y `realApp`; `scripts/e2e.mjs` fija el máximo a 1000.
* **Frontend:**
  * `usersService.generatePasswordReset(fetch, userId)` (`created` con `url` y `expiresAt`, `notFound`, `userNotActive`, `forbidden`, `unauthenticated`, `unavailable`) y `revokePasswordReset`; `SchoolUser` con `passwordResetPending`.
  * `GeneratedInvitationPanel` se generaliza en `GeneratedLinkPanel` (título, aviso y etiqueta por parámetro), que usan las dos secciones; `UsersPage` suma las acciones y la marca por fila.
  * `services/passwordResetService.ts` (`lookup` y `confirm`, públicos), `pages/PasswordResetPage.tsx` en la ruta `/restablecer`, y `LoginPage` amplía la lectura de `location.state` a `passwordChanged` (una guarda por tipo de aviso).
  * Claves `passwordReset.*`, `users.passwordReset.*` y `login.passwordChanged` en `es.json` y `en.json`.
* **Seguridad:** el token solo viaja en el `201` y en los cuerpos `POST`; solo se guarda su SHA-256 y no se registra nunca; el cambio de contraseña y la revocación de las sesiones son atómicos; un usuario que ya no está `ACTIVE` no puede usar el enlace; la consulta solo muestra el email enmascarado; la confirmación no admite emails ni ids del cliente; sin captcha ni recursos de terceros.
* **Rendimiento:** consultas por `token_hash` y por (`user_id`, propósito); `passwordResetPending` sale en la misma consulta de la lista; Bcrypt fuera de la transacción y solo con un enlace válido.
* **Observabilidad:** `PASSWORD_RESET_LINK_CREATED` (`school_id`, `actor_id`, `user_id`, `replaced` si revocó uno anterior), `PASSWORD_RESET_LINK_REVOKED` (`school_id`, `actor_id`, `user_id`), `PASSWORD_RESET_COMPLETED` (`school_id`, `user_id`, número de sesiones revocadas) y `PASSWORD_RESET_REJECTED` (`reason`, IP). Nunca el token, su hash, la contraseña ni el email en claro.
* **Tests:**
  * **Unitarios:** casos de uso (orden de las comprobaciones, el hash no se calcula con un enlace no válido, eventos sin secretos, liberación del intento); routers (`401` antes de `403`, `404` del id no válido, `409`, `201` con `no-store`, `204`, `410`, `429`); servicios, `UsersPage`, `GeneratedLinkPanel`, `PasswordResetPage` y el aviso de `LoginPage`, sin violaciones de `axe`.
  * **Integración:** generar revoca el anterior **caducado** sin chocar con el índice; dos generaciones simultáneas dejan un solo pendiente; la confirmación cambia el hash, usa el enlace y revoca todas las sesiones (los access tokens anteriores dan `401`); un usuario dado de baja tras generar da `410`; dos confirmaciones simultáneas: una gana; aislamiento entre colegios; el límite con un máximo bajo; `503` con la base de datos caída; ningún log contiene secretos.
  * **E2E (`password-reset.cy.ts`):** un administrador genera el enlace en `/usuarios` y lo copia; se abre en otra sesión, la URL pierde el fragmento, se define la contraseña nueva, `/login` con el aviso, se entra con la nueva y no con la anterior; un enlace revocado o sustituido muestra la vista no válida. `csp.cy.ts` con `/restablecer`.
* **Documentación:** `api-spec.yml`; `MODELO_DATOS.md` (los restablecimientos en uso); `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `CLAUDE.md` y `README.md`; las specs de OpenSpec `school-users` (el campo nuevo), una capacidad nueva `password-reset`, `app-configuration`, `test-infrastructure` y `user-login`.
* **Definición de hecho:** lint, typecheck, `api:types:check`, unitarios, integración, E2E y cobertura (90 % backend, 80 % frontend) en verde; despliegue y smoke test; en producción, con una cuenta de prueba: generar, abrir, cambiar la contraseña y entrar con la nueva.
* **Riesgos:**
  * **Un administrador puede tomar el control de la cuenta de otro usuario:** es inherente a la recuperación sin correo; los eventos registran quién lo generó y el usuario lo nota porque su contraseña deja de funcionar.
  * **Todos los administradores bloqueados:** soporte manual (aceptado).
  * **Enlace reenviado a quien no debe:** uso único, 72 h, revocación y el email enmascarado en la página, que permite notar que no es el propio.
  * **Un administrador que restablece su propia contraseña cierra también su sesión actual:** es esperado; la página de destino es `/login`.

---

#### Decisiones tomadas

* **Decidido (US02_c): la lista de usuarios lleva `passwordResetPending`.** `GET /api/users` pasa de 7 a 8 campos y se calcula en la misma consulta. Se descartó un endpoint aparte, que obligaría a la tabla a hacer dos peticiones con dos estados de error.
* **Decidido (US02_c): generar revoca primero cualquier restablecimiento abierto del usuario, caducado o no, y reintenta una vez ante el índice único.** El índice parcial cuenta como pendientes los caducados sin revocar, así que un `INSERT` sin revocar antes fallaría. Se descartó bloquear la fila del usuario (`FOR UPDATE`): para una carrera tan rara, el reintento sobre la violación de unicidad, que ya se sabe detectar, es más sencillo.
* **Decidido (US02_c): el usuario tiene que estar `ACTIVE` también al usar el enlace,** no solo al generarlo; un enlace de un usuario dado de baja responde `410`. Se descartó revocar los restablecimientos en la baja de US02_b2, que mezclaría reglas de dos historias.
* **Decidido (US02_c): el cambio de contraseña, el uso del enlace y la revocación de todas las sesiones van en una transacción,** con el mismo `updateMany` de sesiones que la baja. Se descartó revocar las sesiones después: un fallo entre medias dejaría sesiones vivas con la contraseña ya cambiada.
* **Decidido (US02_c): límite de intentos propio (`password-reset:<ip>`, `PASSWORD_RESET_ATTEMPTS_MAX`).** Se descartó compartir la clave de las invitaciones: agotar una función bloquearía la otra.
* **Decidido (US02_c): se mantiene la `Referrer-Policy` global, como en US02_b4,** en lugar de `no-referrer` para `/restablecer`: el token se quita de la URL al cargar la página.
* **Decidido (US02_c): la confirmación de la contraseña solo se compara en el cliente;** el servidor recibe `{ token, password }` y responde `204`, sin crear sesión.
* **Decidido (US02_c): generar no pide confirmación aunque sustituya un enlace pendiente:** se deshace generando otro, y el aviso del panel dice que el anterior ha dejado de funcionar.
* **Decidido (US02_c): el panel del enlace se generaliza (`GeneratedLinkPanel`)** y lo comparten las invitaciones y los restablecimientos.



### US03: Cierre de sesión

**Épica:** [1. Autenticación y Gestión de Sesiones](#epica-1-autenticacion-y-gestion-de-sesiones)

**Historia:** Como usuario autenticado, quiero cerrar sesión de forma segura, para desconectarme de CalendarSchool y proteger mi cuenta.

**Depende de:** US01_c (refresh token, cookie, `POST /api/auth/refresh` y `SessionProvider`) y US02 (inicio de sesión y `/login`).

---

#### Casos de uso y reglas de negocio

* **Endpoint:** `POST /api/auth/logout`, sin cuerpo. Lee la cookie `refresh_token`, revoca esa sesión (`refresh_tokens.revoked_at = now()`, solo si aún es `NULL`), borra la cookie (`Set-Cookie` con `Max-Age=0` y los mismos atributos: `clearedRefreshTokenCookie()`) y responde `204`.
* **Orden de procesamiento:**
  1. `Origin` igual a `APP_ORIGIN` (`requireAllowedOrigin`, como en `/login` y `/refresh`; sin CORS) → si no, `403 ORIGIN_NOT_ALLOWED`. Impide que otra web cierre la sesión del usuario (CSRF de logout).
  2. Sin cookie, con un token desconocido, ya revocado o caducado → `204` y la cookie borrada, sin cambiar nada en la base de datos. El cierre de sesión es **idempotente** y nunca responde `401`.
  3. Token válido → se revoca la sesión y se responde `204` con la cookie borrada.
  4. Si la base de datos no responde → `503 DATABASE_UNAVAILABLE` y la cookie **no** se borra: el usuario sigue con su sesión y puede reintentar. Borrarla dejaría un token válido en el servidor y el navegador creería que ha cerrado la sesión.
* **Solo esa sesión:** se revoca únicamente la sesión de la cookie. Las de otros navegadores y dispositivos siguen siendo válidas.
* **Access token (decisión B: sesión comprobada en cada petición):**
  * El access token pasa a llevar el id de su sesión (claim `sid`, el id de `refresh_tokens`), que `RefreshSession` añade al emitirlo.
  * El middleware de autenticación de los endpoints protegidos, que llega con la primera historia que los tenga (US02_b o US04), comprobará la firma, la caducidad y que la sesión `sid` siga sin revocar ni caducar. Así un cierre de sesión, una baja (US02_b) o un restablecimiento de contraseña (US02_c) invalidan los access tokens al instante, sin listas de exclusión.
  * Mientras no haya endpoints protegidos, el access token solo vive en la memoria de la pestaña y el frontend lo descarta al cerrar la sesión.
* **Cabecera mínima (`components/AppHeader.tsx`):** visible solo con sesión iniciada, en todas las páginas. Muestra el nombre de la aplicación, el nombre del usuario y el del colegio, y el botón «Cerrar sesión». Fue provisional hasta US04, que convierte su nombre de aplicación en el enlace a `/onboarding`.
* **Cierre de sesión en el frontend:**
  * Sin diálogo de confirmación: el botón cierra la sesión directamente.
  * `SessionProvider` expone `logout()`, que llama a `sessionService.logout()` (interpreta la respuesta por `error.code` y nunca lanza). Mientras tanto el botón está deshabilitado y una guarda síncrona impide envíos repetidos.
  * Con `204`: descarta el access token y el usuario de la memoria, pasa la sesión a `anonymous`, avisa a las demás pestañas y navega a `/login` (con `replace`). Una renovación de sesión que estuviera en curso se descarta.
  * Con `503`, un error de red u otra respuesta: la sesión sigue abierta y la cabecera muestra «No se ha podido cerrar la sesión. Inténtalo de nuevo».
* **Sincronización entre pestañas:** un `BroadcastChannel` (`calendarschool:session`) avisa a las demás pestañas del mismo navegador. Al recibir el aviso, cada pestaña pasa su sesión a `anonymous` sin llamar al backend y su página la lleva a `/login`. Si el navegador no tiene `BroadcastChannel`, la otra pestaña lo descubre en su siguiente renovación (`401 INVALID_SESSION`).
* **Botón «Atrás» tras cerrar sesión:** la sesión ya no está en memoria, así que `/onboarding` redirige a `/login`.
* **Caché del navegador:** todas las respuestas de `/api/*` llevan `Cache-Control: no-store` por defecto, con un middleware en `createApp`. Una ruta puede declarar su propia caché: `GET /api/municipalities` mantiene la suya, de un día, porque son datos públicos y fijos.
* **Logs (regla común de US01_b):** `USER_LOGOUT` (`info`) con el id del usuario, la IP y el user agent cuando se revoca una sesión, y `USER_LOGOUT_WITHOUT_SESSION` (`info`) con `reason` `MISSING`, `UNKNOWN`, `REVOKED` o `EXPIRED` cuando no había sesión que revocar. Nunca el token ni la cookie; 30 días de retención.

---

#### Criterios de Aceptación (MVP)

* **CA1 (Cerrar sesión):** Dado que tengo la sesión iniciada, cuando pulso «Cerrar sesión» en la cabecera, entonces el backend responde `204`, revoca mi sesión y borra la cookie `refresh_token`, llego a `/login` y se registra `USER_LOGOUT`.
* **CA2 (La sesión cerrada no vuelve):** Dado que he cerrado sesión, cuando recargo la página o abro `/onboarding`, entonces se me redirige a `/login`; y si alguien reenvía mi refresh token anterior a `POST /api/auth/refresh`, recibe `401 INVALID_SESSION`.
* **CA3 (Otras sesiones intactas):** Dado que tengo sesión en dos navegadores, cuando cierro sesión en uno, entonces la sesión del otro sigue siendo válida.
* **CA4 (Otras pestañas):** Dado que tengo CalendarSchool abierto en dos pestañas del mismo navegador, cuando cierro sesión en una, entonces la otra pasa a `/login` sin que yo haga nada.
* **CA5 (Idempotente):** Dado que no tengo cookie de sesión, o mi sesión ya está revocada o caducada, cuando se llama a `POST /api/auth/logout`, entonces responde `204` con la cookie borrada, no cambia nada en la base de datos y se registra `USER_LOGOUT_WITHOUT_SESSION` con su `reason`.
* **CA6 (Origen no permitido):** Dado que una petición de cierre de sesión llega con un `Origin` distinto del de la aplicación o sin él, cuando el backend la recibe, entonces responde `403 ORIGIN_NOT_ALLOWED` y la sesión sigue válida.
* **CA7 (Fallo al cerrar sesión):** Dado que la base de datos no responde, cuando pulso «Cerrar sesión», entonces el backend responde `503 DATABASE_UNAVAILABLE` sin borrar la cookie, sigo con la sesión iniciada y veo «No se ha podido cerrar la sesión. Inténtalo de nuevo».
* **CA8 (Cabecera):** Dado que tengo la sesión iniciada, cuando abro cualquier página, entonces veo la cabecera con mi nombre, el de mi colegio y el botón «Cerrar sesión»; y sin sesión no veo la cabecera.
* **CA9 (Sin caché):** Dado cualquier respuesta de `/api/*` salvo `GET /api/municipalities`, cuando el backend la envía, entonces lleva `Cache-Control: no-store`.
* **CA10 (Access token con su sesión):** Dado que renuevo la sesión con `POST /api/auth/refresh`, cuando recibo el access token, entonces lleva el claim `sid` con el id de mi sesión.

---

#### Requisitos Técnicos, QA y Riesgos

##### Ficheros y módulos afectados

* **Contrato:** `docs/api-spec.yml` primero: `POST /api/auth/logout` (`204`, `403`, `503`, reutilizando `components.responses`). No hay códigos de error nuevos. Tipos regenerados con `npm run api:types -w frontend`.
* **Backend:** caso de uso `LogOut` en `application/session/`; `RefreshTokenRepository` añade la revocación (solo si `revoked_at` es `NULL`); ruta en `authRouter` con `requireAllowedOrigin` y cableado en `composeApp`; `AccessTokenClaims` añade `sessionId` (claim `sid`) y `RefreshSession` lo rellena; middleware `Cache-Control: no-store` en `createApp`, que sustituye los `no-store` sueltos de `authRouter`; `municipalityRouter` mantiene su caché propia.
* **Frontend:** `components/AppHeader.tsx` (montado en `App.tsx`), `logout()` en `SessionProvider` con el `BroadcastChannel`, `sessionService.logout()`, textos en `es.json` y `en.json`.
* **Base de datos:** sin migración: `refresh_tokens.revoked_at` existe desde US01_c y `isRefreshTokenUsable` ya rechaza los revocados.

##### Requisitos de Testing

* **Unit Tests:** `LogOut` con dobles (cada rama de CA1, CA5 y CA7, sin token en los logs); el claim `sid` en el emisor de tokens y en `RefreshSession`; el middleware de caché; `sessionService.logout()`; `SessionProvider` (`logout()` en cada resultado, renovación en curso descartada, aviso recibido de otra pestaña, navegador sin `BroadcastChannel`); `AppHeader` (CA8, botón deshabilitado durante el envío, mensaje de error).
* **Integración (`*.int.test.ts`):** cierre de sesión contra la base de datos real (revoca solo esa sesión, idempotente, `/refresh` con el token revocado responde `401`).
* **E2E (Cypress):** login → cerrar sesión → `/login`; recargar sigue sin sesión; el refresh token anterior responde `401`. CA4 se prueba en el test de `SessionProvider`, porque Cypress no maneja dos pestañas.
* **Tests de Seguridad:** `Origin` (CA6), cookie borrada con los mismos atributos con los que se creó, ningún token en los logs.
* **Tests de Accesibilidad:** cabecera con `axe`; botón accesible por teclado; mensaje de error con `role="alert"`.

##### Riesgos y Mitigaciones

* **Robo del refresh token antes del cierre:** el cierre de sesión lo revoca en el servidor, así que deja de servir aunque se haya copiado.
* **Access token robado:** hoy no protege nada. Con la decisión B, el middleware lo rechazará en cuanto la sesión se revoque.
* **Coste de la decisión B:** una consulta por clave primaria a `refresh_tokens` en cada petición protegida. Es asumible en el MVP y se puede combinar con la carga del usuario que hará el middleware.
* **Cierre de sesión fallido:** si el servidor no confirma la revocación, la sesión se mantiene a la vista del usuario (CA7) en lugar de fingir un cierre que no ha ocurrido.

##### Observabilidad

* Eventos estructurados: `USER_LOGOUT` y `USER_LOGOUT_WITHOUT_SESSION` (`reason`: `MISSING`, `UNKNOWN`, `REVOKED` o `EXPIRED`).
* **Payload del log:** `timestamp` + `user_id` (si lo hay) + `ip` + `user_agent` + `reason` (regla común de US01_b; 30 días de retención).

##### Definición de hecho

* Contrato, código y tests en verde (`npm test`, `npm run test:e2e`, `npm run lint`, `npm run typecheck --workspaces`, `api:types:check`), con la cobertura mínima.
* Documentación actualizada: `README.md`, `CLAUDE.md` (logout, cabecera, `sid`, `no-store`), `docs/arquitectura/ARQUITECTURA_COMPLETA.md`, `docs/Modelo_de_Datos/MODELO_DATOS.md` (uso de `revoked_at`), `docs/backend-standards.md` y `docs/frontend-standards.md` si cambian sus patrones.
* Desplegado: smoke test en verde y comprobación en producción de login → cerrar sesión → recargar sin sesión.

---

#### Decisiones tomadas

* **Decidido: opción B para el access token.** Lleva el id de su sesión (`sid`) y el middleware de los endpoints protegidos comprobará en cada petición que la sesión siga válida. Se descartaron el JWT sin estado (un token revocado seguiría valiendo hasta 15 minutos, lo que no cumple la baja de US02_b ni el restablecimiento de US02_c) y una lista de exclusión de tokens (mismo coste por petición y además necesita purga).
* **Decidido: el middleware de autenticación no se construye en esta historia.** Aún no hay endpoints protegidos que lo usen; llega con el primero (US02_b o US04). Esta historia solo añade el `sid`.
* **Decidido: sin diálogo de confirmación.** Cerrar sesión por error solo cuesta volver a entrar.
* **Decidido: cabecera mínima con «Cerrar sesión»**, provisional hasta US04 (que añade el enlace de vuelta a la bienvenida).
* **Decidido: sincronización entre pestañas** del mismo navegador con `BroadcastChannel`.
* **Decidido: `Cache-Control: no-store`** en `/api/*`, salvo las rutas con caché propia.
* **Decidido: fuera de alcance** los correos (CalendarSchool no los envía), el cierre forzado por un administrador (lo cubre la baja de US02_b), el cierre sin conexión con sincronización posterior (la cookie es `HttpOnly` y solo el servidor puede borrarla), el aviso de cambios sin guardar y la cancelación de peticiones en curso (aún no hay formularios ni peticiones autenticadas; los pondrá cada historia que los tenga), «cerrar todas mis sesiones», la retención de logs de 90 días (se mantienen 30) y guardar la IP o el user agent en la sesión (solo están en los logs, decisión de US02).
* **Sin limpieza de `localStorage` ni `sessionStorage`:** la sesión nunca se guarda ahí (US01_c). El único dato guardado, el borrador del registro, se borra tras el alta (US01_f).
* **Sin mensaje propio para un refresh token revocado:** sigue siendo `401 INVALID_SESSION` sin causa (US01_c); la causa (`REVOKED`) solo va al log.
* **Hallazgo de las pruebas manuales (arreglado en este cambio):** con la base de datos parada, el cierre de sesión (y también `/refresh`) respondía `500` en lugar de `503`, porque `pg` lanza un error sin código (`Connection terminated unexpectedly`) cuando el servidor corta la conexión y `translateDatabaseErrors` solo reconocía códigos. Ahora se reconoce por su mensaje fijo, y el CA7 se cumple también en ese caso. Afectaba a todos los endpoints.

---

### US04: Pantalla de bienvenida

**Épica:** [1. Autenticación y Gestión de Sesiones](#epica-1-autenticacion-y-gestion-de-sesiones)

**Estimación:** 3 puntos de historia. Solo frontend: no hay endpoint, tabla ni cambio en `docs/api-spec.yml`.

**Historia:** Como usuario autenticado, quiero ver una pantalla de bienvenida con las dos funcionalidades principales de CalendarSchool (gestión de horarios y gestión de comedor) y, si soy administrador, un acceso a la gestión de usuarios, para saber qué puedo hacer y llegar rápidamente a lo que necesito.

**Depende de:** US01_c (la sesión tras el registro y la página provisional `/onboarding`), US02 (el login lleva a `/onboarding`), US02_b1 (`AuthenticatedLayout`, `RequireRole`, `AppHeader` y `/usuarios`). Los destinos reales de las dos tarjetas llegan con US05 en adelante.

---

#### Casos de uso y reglas de negocio

* **La pantalla es la página de inicio de la aplicación, en `/onboarding`.** Sustituye a la página provisional de US01_c: mantiene la ruta, el `data-testid="onboarding-page"`, el saludo con el nombre y el nombre del colegio, de los que dependen el registro, el login, `RequireRole` (un `MEMBER` en `/usuarios` vuelve aquí), `UsersPage` y los E2E. No existe `/welcome` ni `/dashboard`: ninguna historia define un dashboard.
* **Se llega a ella desde todas partes**, no solo tras el registro: tras el registro (US01_c), tras el login (US02), al pulsar el nombre de la aplicación en la cabecera y cuando la guarda de rol saca a un `MEMBER` de `/usuarios`. Es siempre la misma pantalla: no se guarda si el usuario ya la vio ni lo que eligió (el PRD pide «indicar con qué funcionalidad quieres trabajar», pero la elección no se persiste en esta historia).
* **No es un onboarding obligatorio.** No bloquea nada: el usuario puede ir directamente a cualquier ruta que su rol permita (por ejemplo, abrir `/usuarios` escribiendo la dirección).
* **Contenido:**
  * `h1` con el saludo (`onboarding.title`, «Te damos la bienvenida, {{name}}») y una línea con el nombre del colegio (`onboarding.message`, sin la promesa de «muy pronto podrás configurarlo»).
  * `h2` «Elige con qué quieres trabajar» y dos tarjetas: **Gestión de horarios** (cursos, profesores, restricciones y generación automática de horarios) y **Gestión de comedor** (alumnos, inscripciones al comedor y registro de asistencia). Cada tarjeta lleva un icono decorativo, un `h3` con su nombre, su descripción breve y, mientras no tenga destino, la insignia **«Próximamente»**.
  * **Las tarjetas sin destino no son enlaces ni botones:** ni `href` a una ruta que da `404`, ni `button` deshabilitado. Son bloques de texto no interactivos, sin foco, y el estado se dice con texto visible, no solo con color.
  * **Punto de extensión:** las funcionalidades son una lista de datos (`clave`, icono, ruta opcional). Cuando una historia posterior crea su módulo, pone la ruta y la tarjeta pasa a ser un enlace sin la insignia (el test cubre una funcionalidad con ruta, aunque hoy ninguna la tenga). US05 en adelante activan «horarios»; las de alumnos y comedor, «comedor».
  * **Solo para `ADMIN`:** `h2` «Administración» y una tarjeta **Usuarios** que sí es un enlace a `/usuarios` (usuarios, invitaciones y restablecimientos de contraseña). Un `MEMBER` no ve la sección. Es una comodidad de la interfaz: la autorización de `/usuarios` y de su API sigue decidiéndola el backend.
* **Cabecera (`AppHeader`):** el nombre de la aplicación pasa a ser un enlace a `/onboarding` (desde cualquier página autenticada se vuelve a la bienvenida; en `/onboarding` lleva `aria-current="page"`). La navegación «Usuarios» para administradores y el resto de la cabecera no cambian. Se retira la etiqueta «provisional» de los comentarios.
* **Protección de ruta:** sin sesión se redirige a `/login` (ya lo hace `AuthenticatedLayout`; no se repite en la página).
* **Textos:** todos por i18n en castellano e inglés (`onboarding.*`); el nombre del usuario y del colegio se pintan como texto plano (nunca como HTML).
* **Responsive:** una columna en móvil y dos tarjetas por fila desde `md` (cuadrícula de Bootstrap); sin desplazamiento horizontal; el texto es legible sin zoom.
* **Accesibilidad (WCAG 2.1 AA):** jerarquía `h1` → `h2` → `h3`, regiones con nombre, iconos con `aria-hidden`, la tarjeta de `Usuarios` alcanzable con Tab y con foco visible, el estado «Próximamente» como texto (con contraste suficiente) y sin `role="alert"` ni `role="status"` (no hay mensajes dinámicos).
* **Fuera de alcance:** persistir la elección del usuario o si ya vio la pantalla, un dashboard, una bienvenida distinta la primera vez, un asistente de configuración del colegio, los módulos de horarios y de comedor (sus rutas), y cualquier cambio en la API o en la base de datos.

---

#### Criterios de Aceptación

* **CA1 (Bienvenida tras el registro):** Dado que acabo de registrarme, cuando llego a `/onboarding`, entonces veo «Te damos la bienvenida, {nombre}», el nombre de mi colegio y dos tarjetas, «Gestión de horarios» y «Gestión de comedor», cada una con su icono, su descripción y la insignia «Próximamente».
* **CA2 (Bienvenida tras el login):** Dado que inicio sesión, cuando se me redirige, entonces veo la misma pantalla que tras el registro.
* **CA3 (Tarjetas no interactivas):** Dado que veo las tarjetas de horarios y de comedor, cuando intento pulsarlas o recorro la página con Tab, entonces no son enlaces ni botones, no reciben foco y no llevan a ninguna ruta.
* **CA4 (Acceso a Usuarios para el administrador):** Dado que soy `ADMIN`, cuando veo la pantalla, entonces aparece la sección «Administración» con la tarjeta «Usuarios», y al pulsarla voy a `/usuarios`.
* **CA5 (El miembro no ve la sección):** Dado que soy `MEMBER`, cuando veo la pantalla, entonces no aparece «Administración» ni «Usuarios» (ni en la tarjeta ni en la cabecera), y abrir `/usuarios` me devuelve aquí sin mensaje (US02_b1).
* **CA6 (Volver al inicio):** Dado que estoy en cualquier página autenticada, cuando pulso el nombre «CalendarSchool» de la cabecera, entonces voy a `/onboarding`; y en `/onboarding` ese enlace está marcado como página actual.
* **CA7 (Sin sesión):** Dado que no tengo sesión, cuando abro `/onboarding`, entonces se me redirige a `/login` (comportamiento existente, sin regresión).
* **CA8 (No obliga a nada):** Dado que estoy en la pantalla, cuando recargo la página o abro directamente otra ruta permitida, entonces todo funciona igual: la pantalla no guarda estado ni bloquea la navegación.
* **CA9 (Funcionalidad con destino):** Dado que una funcionalidad tiene ruta (en un test), cuando se pinta la pantalla, entonces su tarjeta es un enlace a esa ruta, sin la insignia «Próximamente».
* **CA10 (Responsive):** Dado un móvil de 360 px de ancho, cuando abro la pantalla, entonces las tarjetas se apilan en una columna, no hay desplazamiento horizontal y los enlaces tienen al menos 44 × 44 px; desde `md` hay dos tarjetas por fila.
* **CA11 (Accesibilidad):** Dado que navego con el teclado, cuando recorro la página, entonces solo se enfocan los controles reales (cabecera y, si soy administrador, la tarjeta «Usuarios»), con foco visible; los encabezados siguen `h1` → `h2` → `h3`; y `axe` no detecta violaciones A ni AA.
* **CA12 (Texto plano e i18n):** Dado un nombre o un colegio con marcas HTML o apóstrofos, cuando se pintan, entonces salen como texto; y todos los textos están en `es.json` y `en.json` con las mismas claves.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* `frontend/src/pages/OnboardingPage.tsx`: contenido nuevo, con la lista de funcionalidades como datos (`clave`, icono, `to?`). Los iconos son SVG en línea (`aria-hidden`), sin dependencias nuevas, sin recursos de terceros y compatibles con la CSP estricta.
* `frontend/src/components/AppHeader.tsx`: el nombre de la aplicación es un enlace a `/onboarding` (`NavLink`/`Link`); se retira lo de «provisional» del comentario y de `OnboardingPage` y `RequireRole`.
* `frontend/src/i18n/es.json` y `en.json`: claves `onboarding.*` (título, mensaje, encabezados de las secciones, nombre y descripción de cada funcionalidad, «Próximamente», «Usuarios»).
* Contrato, API, base de datos y `docs/api-spec.yml`: **sin cambios**.

##### Requisitos de Testing (Pre-release)

* **Unitarios (Vitest + RTL):**
  * `OnboardingPage.test.tsx`: el saludo y el colegio, texto plano con marcas y apóstrofos, las dos tarjetas con la insignia y sin enlaces ni botones, la sección de administración solo para `ADMIN` (con el enlace a `/usuarios`), una funcionalidad con ruta que se pinta como enlace (CA9) y sin violaciones de `axe`.
  * `AppHeader.test.tsx`: el nombre es un enlace a `/onboarding` y lleva `aria-current` en esa ruta.
  * `App.test.tsx`, `RequireRole.test.tsx` y los de `LoginPage` y `RegisterPage` siguen pasando (el `data-testid` y la ruta no cambian).
* **E2E (Cypress):** `onboarding.cy.ts`: un administrador recién registrado ve las dos tarjetas con «Próximamente», entra en «Usuarios» desde la tarjeta y vuelve con el nombre de la aplicación; un `MEMBER` (creado con `createUser`) entra y no ve «Administración». Los asertos de los E2E existentes sobre `onboarding-page` y el nombre del colegio deben seguir pasando.
* **Accesibilidad:** `axe` en la pantalla de administrador y de miembro, y comprobación manual del contraste de la insignia y del orden del foco.
* **Responsive:** con el navegador a 360 px y a 768 px.

##### Documentación

* `frontend/CLAUDE.md` (la pantalla definitiva, las tarjetas como datos y el enlace del nombre de la aplicación), `README.md` (árbol de ficheros), y las referencias a «provisional hasta US04» de las fichas US01_c, US02 y US02_b1.
* `docs/frontend-standards.md` solo si aparece una regla nueva (p. ej. «una funcionalidad aún inexistente se muestra como texto no interactivo con su estado, nunca como un enlace roto o un botón deshabilitado»).

##### Riesgos y Mitigaciones

* **Seguridad:** la pantalla no expone datos sensibles: solo el nombre del usuario y del colegio, que ya están en la sesión. La tarjeta «Usuarios» es solo comodidad; `/usuarios` y su API siguen protegidas por `RequireRole` y por el backend.
* **Regresiones:** 28 ficheros (código, tests y E2E) dependen de `/onboarding` y de `onboarding-page`. Por eso la ruta, el identificador de test y el texto del saludo y del colegio no cambian.
* **Enlaces rotos:** las tarjetas sin módulo no apuntan a ninguna ruta. El riesgo inverso es dejarlas desactivadas cuando el módulo exista: la historia que cree cada módulo debe activar su tarjeta (anotado en sus tareas).
* **Accesibilidad:** una insignia solo de color o un botón deshabilitado serían confusos; se evita con texto visible y con bloques no interactivos.
* **i18n:** `locales.test.ts` falla si `es.json` y `en.json` no coinciden.

---

#### Decisiones tomadas

* **Decidido: se mantiene `/onboarding`.** Renombrar a `/welcome` o `/bienvenida` tocaría unos 28 ficheros sin valor para el usuario, y US01_c, US02 y US02_b1 ya la nombran como destino. Tampoco cambia el `data-testid`.
* **Decidido: no hay `/dashboard`.** Ninguna historia lo define, así que desaparecen «Ir al dashboard» y la regla del botón «Atrás» de la ficha original (el navegador no vuelve a una ruta fija). El nombre de la aplicación en la cabecera lleva a la bienvenida, que hace de página de inicio.
* **Decidido: las dos funcionalidades, desactivadas con «Próximamente».** Se descartó enlazar a `/horarios`, `/cursos`, `/comedor` y `/alumnos` (darían `404` en la primera pantalla) y ocultarlas (la pantalla quedaría sin objeto). Se muestran como bloques no interactivos con el estado en texto, y se activan una a una con una ruta en la lista de funcionalidades.
* **Decidido: atajo a «Usuarios» para el administrador,** en una sección propia «Administración», además del enlace de la cabecera. El `MEMBER` no lo ve.
* **Decidido: sin backend ni persistencia.** No se guarda lo que el usuario eligió ni si ya vio la pantalla: la bienvenida es la misma cada vez.
* **Decidido: sin dependencias nuevas.** Iconos en SVG en línea; nada que cargar de terceros, para no tocar la CSP.

---

## Módulo: Gestión de Cursos

### US05: Crear un curso con sus clases (y listado mínimo)

**Épica:** [2. Gestión de Cursos y Estructura Base](#epica-2-gestion-de-cursos-y-estructura-base)

**Estimación:** 5 puntos de historia. Primera historia del módulo funcional: dos tablas nuevas, dos endpoints y dos páginas.

**Historia:** Como usuario del colegio (`ADMIN` o `MEMBER`), quiero crear un curso (ej. «1º Primaria») con sus clases (A, B…) y ver los cursos del colegio, para estructurar la organización del centro.

**Depende de:** US02_b1 (`AuthenticatedLayout`, `AppHeader`, `requireAuthentication` y aislamiento por colegio) y US04 (la bienvenida). **Ya no depende de US09:** el tutor se asigna después.

---

#### Decisiones (validadas por la persona usuaria)

* **Tutor opcional.** Una clase puede existir «Sin tutor» (cambia el PRD §3.4). Como todavía no existen profesores, **US05 no muestra ningún selector de tutor** y el listado indica «Sin tutor» en cada clase. La asignación del tutor, la regla «un profesor tutoriza una sola clase» y el desplegable filtrable pasan a US09 (crear profesor con «tutor de clase») y US07 (editar curso); la cascada al borrar un profesor, a US13. La columna `classes.tutor_id` la añade la migración de US09, junto con la tabla `professors`.
* **Alcance: crear y un listado mínimo** en `/cursos` (curso y sus clases con el tutor o «Sin tutor»). Búsqueda, paginación, fechas, número de alumnos y las acciones de editar y borrar quedan para US06, US07 y US08.
* **La bienvenida no cambia:** la tarjeta «Gestión de horarios» sigue «Próximamente». La cabecera gana un enlace **«Cursos»** para `ADMIN` y `MEMBER`, antes de «Usuarios», que sigue siendo solo para `ADMIN`.
* **Máximo de 12 clases por curso.**

#### Casos de uso y reglas de negocio

* **Acceso:** cualquier usuario autenticado del colegio crea y lista cursos (`requireAuthentication`, sin `requireRole`). El `schoolId` sale siempre de la identidad; un curso de otro colegio nunca se ve.
* **Curso:** nombre obligatorio, de 1 a 100 caracteres tras recortar espacios; letras (también acentuadas y ñ), dígitos, `º`, `ª`, `-`, `/` y espacios (los repetidos se colapsan). **Único por colegio**, sin distinguir mayúsculas ni espacios sobrantes («1º primaria» choca con «1º Primaria»).
* **Clases:** al menos 1 y como máximo 12 por curso; el formulario empieza con una fila. Nombre obligatorio, de 1 a 10 caracteres; letras, dígitos, `º`, `ª`, `-` y espacio («A», «1ªA», «Grupo A»). **Único dentro del curso** con la misma comparación. Se pueden añadir y quitar filas antes de guardar, salvo la última.
* **Alta atómica:** el curso y sus clases se crean en una transacción; o todo o nada.
* **Doble envío y concurrencia:** el frontend usa una guarda síncrona (`ref`) y deshabilita «Guardar» durante el envío; en el servidor, el índice único `(school_id, normalized_name)` hace que un segundo envío idéntico (otra pestaña u otro usuario) responda `409 COURSE_ALREADY_EXISTS` sin crear un duplicado.
* **Tras crear:** navega a `/cursos` con `replace` y muestra «Curso «{nombre}» creado» en un `role="status"`; el curso aparece en el listado.
* **Listado (`/cursos`):** cursos ordenados por nombre (`localeCompare('es', { numeric: true })`: «2º» antes que «10º»); cada uno con sus clases, ordenadas igual, y «Sin tutor». Sin cursos: «Todavía no hay cursos» y el botón «Crear curso». El botón «Crear curso» está siempre visible y lleva a `/cursos/nuevo`.
* **Errores:** los de validación, bajo su campo (los de clase, bajo su fila); un `409`, en el nombre del curso («Ya existe un curso con este nombre. Usa otro»); `503`, error de red o `500`: «No se pudo crear el curso. Inténtalo de nuevo» en un `role="alert"`, conservando lo escrito. Nunca mensajes técnicos.
* **Textos:** todos por i18n en `es.json` y `en.json` (`courses.*`, `header.courses`); los nombres se pintan como texto plano.

#### Contrato de la API (`docs/api-spec.yml`, primero)

* **`POST /api/courses`** (Bearer). Cuerpo: `{ "name": "1º Primaria", "classes": [{ "name": "A" }, { "name": "B" }] }`; se ignoran las propiedades desconocidas (también un `tutorId`).
  * `201`: `{ course: { id, name, classes: [{ id, name, tutor: null }] } }` (el campo `tutor` ya está en el contrato, `null` hasta US09).
  * `400 VALIDATION_ERROR` con `details[]` (`name`, `classes`, `classes[i].name`; códigos `REQUIRED`, `INVALID_LENGTH` —también para 0 o más de 12 clases—, `INVALID_CHARACTERS` y el nuevo `DUPLICATE` para una clase repetida en el curso).
  * `401 INVALID_SESSION`; `409 COURSE_ALREADY_EXISTS` (código nuevo: al enum `ErrorCode` y a `ERROR_CODES` a la vez); `503 DATABASE_UNAVAILABLE`.
* **`GET /api/courses`** (Bearer). `200`: `{ courses: [{ id, name, classes: [{ id, name, tutor: null }] }] }`, solo los del colegio de la identidad; `401`; `503`. `Cache-Control: no-store` (el de la API).
* Se regeneran los tipos (`npm run api:types -w frontend`).

#### Modelo de datos (migración nueva en `backend/prisma/schema.prisma`)

* **`courses`:** `id` (UUIDv7), `school_id` (FK `schools`), `name` (`varchar(100)`), `normalized_name` (`varchar(100)`: recortado, espacios colapsados y en minúsculas), `created_at`, `updated_at`. `UNIQUE (school_id, normalized_name)` (`courses_school_id_normalized_name_key`).
* **`classes`** (modelo Prisma `SchoolClass`, `@@map("classes")`): `id`, `course_id` (FK `courses`, `ON DELETE CASCADE`), `name` (`varchar(10)`), `normalized_name`, `created_at`, `updated_at`. `UNIQUE (course_id, normalized_name)` (sirve también de índice por `course_id`).
* Sin columnas de auditoría (`created_by`: la traza va en el log) ni `academic_year`, `code`, `level` o `status` (ninguna historia los usa aún). Se actualiza `MODELO_DATOS.md` (Módulo 2) con estas tablas y la nota de que `tutor_id` llega con US09.
* `resetDatabase()` y `scripts/e2eData.mjs` vacían las tablas nuevas (el test que compara sus listas lo comprueba).

#### Criterios de Aceptación

* **CA1 (Crear un curso):** Dado que estoy en `/cursos/nuevo`, cuando creo «1º Primaria» con las clases «A» y «B», entonces vuelvo a `/cursos`, veo «Curso «1º Primaria» creado» y el curso con «A — Sin tutor» y «B — Sin tutor».
* **CA2 (Nombre obligatorio):** Dado el formulario sin nombre, cuando pulso «Guardar», entonces veo «El nombre del curso es obligatorio» bajo el campo y no se envía nada.
* **CA3 (Al menos una clase, como máximo 12):** Dado el formulario, cuando intento quitar la única clase, entonces no puedo; con 12 clases no puedo añadir otra. La API responde `400` con `INVALID_LENGTH` en `classes` a `classes: []` y a más de 12 clases.
* **CA4 (Nombre de clase obligatorio y válido):** Dada una clase vacía, de más de 10 caracteres o con caracteres no permitidos, cuando guardo, entonces veo el error bajo esa fila.
* **CA5 (Listado del colegio):** Dado que mi colegio y otro tienen cursos, cuando abro `/cursos`, entonces solo veo los míos, ordenados por nombre («2º» antes que «10º»), cada uno con sus clases.
* **CA6 (Curso único por colegio):** Dado que existe «1º Primaria», cuando creo «1º primaria», entonces veo «Ya existe un curso con este nombre. Usa otro» bajo el nombre (`409`). Otro colegio sí puede tener su «1º Primaria».
* **CA7 (Clase única en el curso):** Dadas dos clases «A» y «a» en el mismo curso, cuando guardo, entonces la segunda muestra «Ya existe una clase con este nombre en el curso» (`DUPLICATE`) y no se crea nada.
* **CA8 (Sin doble envío):** Dado que pulso «Guardar» dos veces seguidas, cuando se envía, entonces el botón se deshabilita y solo se crea un curso; dos peticiones simultáneas idénticas dan un `201` y un `409`.
* **CA9 (Atomicidad):** Dado que falla la creación de una clase, cuando se procesa la petición, entonces no queda ni el curso ni ninguna clase.
* **CA10 (Caracteres especiales):** «1º Primaria», «Infantil 3 años», «6ª Primaria», «2º ESO-A/B» y la clase «1ªA» se aceptan.
* **CA11 (Error del servidor):** Dado que la base de datos no responde, cuando guardo, entonces veo «No se pudo crear el curso. Inténtalo de nuevo», sin mensajes técnicos, y conservo lo escrito.
* **CA12 (Listado vacío):** Dado un colegio sin cursos, cuando abro `/cursos`, entonces veo «Todavía no hay cursos» y «Crear curso».
* **CA13 (Acceso y navegación):** Un `ADMIN` y un `MEMBER` ven «Cursos» en la cabecera y pueden crear cursos; sin sesión, `/cursos` y `/cursos/nuevo` llevan a `/login`; la API sin token responde `401`. La tarjeta «Gestión de horarios» de la bienvenida sigue «Próximamente».
* **CA14 (Accesibilidad, responsive e i18n):** sin violaciones de `axe` en las dos páginas; cada fila de clase tiene su etiqueta y «Quitar clase» indica cuál; a 360 px no hay desplazamiento horizontal; todos los textos están en `es.json` y `en.json` y los nombres se pintan como texto plano.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Backend:** `domain/course/` (puerto `CourseRepository` y errores, p. ej. `CourseAlreadyExists`), `application/courses/` (`CreateCourse`, `ListCourses` y `createCourseRequest.ts` con Zod), `infrastructure/prisma/prismaCourseRepository.ts` (transacción y traducción de `courses_school_id_normalized_name_key` con `violatedUniqueIndex`), `presentation/courses/coursesRouter.ts`, `app.ts`, `composeApp.ts`, `presentation/http/appError.ts` y el `errorHandler` para el `409`, y `test/support/{appDoubles,realApp}.ts`.
* **Validación compartida:** `test-fixtures/course-fields.json` (ejemplos válidos e inválidos de cada campo), que recorren el backend y `frontend/src/validation/courseValidation.ts`.
* **Frontend:** `services/coursesService.ts` (`list` y `create` con `authorizedFetch`; un resultado por caso, nunca lanza), `pages/CoursesPage.tsx` (`/cursos`) y `pages/CreateCoursePage.tsx` (`/cursos/nuevo`) bajo `AuthenticatedLayout` sin `RequireRole`, `App.tsx`, `components/AppHeader.tsx` (la navegación se muestra a todos los roles: «Cursos» para todos y «Usuarios» solo para `ADMIN`), `es.json` y `en.json`.
* **E2E:** `cypress/e2e/courses.cy.ts`.

##### Requisitos de Testing (Pre-release)

* **Unitarios:** validación compartida (recorriendo `course-fields.json` en backend y frontend), normalización de nombres, `CreateCourse` y `ListCourses` con dobles, router (`app.test.ts`); servicio, páginas, cabecera y `axe` en el frontend.
* **Integración (`courses.int.test.ts`, PostgreSQL real):** `201` y persistencia; aislamiento entre colegios; `409` por nombre normalizado y el mismo nombre en otro colegio; atomicidad; concurrencia con `Promise.all` (un `201` y un `409`); `401` sin token; `503` con la base de datos caída.
* **E2E (`courses.cy.ts`):** un administrador crea un curso con dos clases y lo ve en el listado; nombre duplicado; un `MEMBER` (creado con `createUser`) crea un curso; listado vacío; 360 px. Se revisan los E2E que miran la cabecera (`users.cy.ts`, `csp.cy.ts`, `invitation-acceptance.cy.ts`, que comprueba que un `MEMBER` no ve enlaces en la navegación).

##### Documentación

* PRD §3.4 (tutor opcional), fichas de US06, US07, US09 y US13 (tutor y cascada movidos), `MODELO_DATOS.md`, `docs/api-spec.yml`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `CLAUDE.md` raíz (estado del repositorio), `README.md`, y `ARQUITECTURA_COMPLETA.md` (secciones 0 y 2.0.3), `DIAGRAMA_C4.md` (parte A) y el DSL (tablas y módulo de cursos).

##### Riesgos y Mitigaciones

* **Seguridad:** `schoolId` siempre de la identidad; Prisma con parámetros; límite de tamaño del cuerpo (el de `express.json()`) y máximo de 12 clases.
* **Rendimiento:** el listado es una consulta con las clases incluidas y usa los índices por `school_id` y `course_id`; sin paginación hasta US06.
* **Concurrencia:** el índice único resuelve el doble envío entre pestañas o usuarios; la transacción evita cursos sin clases.
* **Observabilidad:** eventos `COURSE_CREATED` (`school_id`, `actor_id`, `course_id`, `class_count`) y `COURSE_CREATION_REJECTED` (`reason: duplicate`); los nombres no van al log.
* **Regresiones:** la navegación de la cabecera pasa a mostrarse a los `MEMBER`; se revisan los tests y E2E que lo asumían.

##### Definición de hecho

* Tests en verde con la cobertura mínima (90 % backend, 80 % frontend), `lint`, `typecheck` y `api:types:check`; pruebas con `curl`; E2E completo; PR integrada; despliegue con la migración aplicada y comprobación en producción.

---

### US06: Ver el listado de cursos con búsqueda

**Épica:** [2. Gestión de Cursos y Estructura Base](#epica-2-gestion-de-cursos-y-estructura-base)

**Estimación:** 3 puntos de historia. Un campo nuevo en el contrato (`createdAt`) y el rediseño de `/cursos`; sin tablas ni migraciones.

**Historia:** Como usuario del colegio (`ADMIN` o `MEMBER`), quiero ver todos los cursos de mi colegio con sus clases, su tutor y su fecha de creación, y buscarlos por nombre, para tener una visión rápida de la estructura del centro.

**Depende de:** US05 (`/cursos`, `GET /api/courses`, el alta y el listado mínimo, ya construidos).

---

#### Decisiones (validadas por la persona usuaria)

* **Solo lo que existe.** Cada fila muestra nombre, clases, tutor y fecha de creación. Los botones **Editar** y **Borrar** (US07, US08), el **nombre del tutor** (US09, US07), el **número de alumnos** (US14) y **«Ver horario»** (US-ALGO-VIEW) los añade cada historia cuando se construya: no se muestran columnas vacías ni botones deshabilitados.
* **Búsqueda en el navegador.** Se cargan todos los cursos del colegio (decenas) y se filtran al escribir, sin paginación. `GET /api/courses` sigue sin parámetros.
* **Tabla en escritorio y tarjetas en móvil**, con las clases y su tutor visibles sin abrir nada (sin acordeón ni modal: un curso tiene como mucho 12 clases).
* **Sin recarga automática:** la lista se pide al abrir la página.
* **La fecha va en el formato del idioma activo** (no DD/MM/YYYY), como en `/usuarios`; **la búsqueda filtra desde el primer carácter** (no hay coste de red) y **solo por el nombre del curso**.

#### Casos de uso y reglas de negocio

* **Acceso:** el de US05: cualquier usuario autenticado del colegio; solo los cursos de su colegio.
* **Datos de cada curso:**
  * **Nombre.**
  * **Clases:** «2 clases: A, B» (singular: «1 clase: A»), en el orden natural que da el servidor.
  * **Tutores:** «Sin tutor» mientras ninguna clase lo tenga (hoy, siempre). US09 y US07 decidirán cómo se listan los nombres.
  * **Fecha de creación** con el idioma activo (`Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' })`, p. ej. «19 oct 2026»).
* **Presentación:** desde el punto de corte `md` (768 px), una **tabla** con las columnas **Curso | Clases | Tutores | Creado**; el nombre del curso es la cabecera de su fila (`th scope="row"`). Por debajo, una **tarjeta por curso** con el nombre como `h2` y los mismos datos en una lista de definiciones. Solo se pinta una de las dos estructuras según el ancho, para que los lectores de pantalla no lean el contenido dos veces.
* **Orden:** el natural del servidor, sin distinguir mayúsculas ni acentos («2º» antes que «10º»); el filtro lo conserva.
* **Búsqueda:** campo `type="search"` con la etiqueta visible «Buscar por nombre», encima del listado y solo si el colegio tiene algún curso. Filtra al escribir, desde el primer carácter, por el **nombre del curso**, sin distinguir mayúsculas, acentos ni espacios sobrantes («primaria» encuentra «1º Primaria»; «educacion», «Educación Infantil»); `º` y `ª` cuentan. Mientras hay búsqueda, un `role="status"` dice «Mostrando N de M cursos». Sin coincidencias: «No hay cursos que coincidan con «X»» y un botón «Limpiar búsqueda» que vacía el campo y le devuelve el foco. La búsqueda vive solo en el estado de la página (ni en la URL ni en almacenamiento).
* **Sin cursos:** como en US05: «Todavía no hay cursos» con «Crear curso», sin campo de búsqueda.
* **Se mantienen de US05:** «Crear curso» siempre visible, el aviso «Curso «X» creado», la carga única, el error con «Reintentar» y los textos como texto plano.

#### Contrato de la API (`docs/api-spec.yml`, primero)

* `Course` gana **`createdAt`** (`string`, `date-time`, ISO 8601), obligatorio: lo devuelven `GET /api/courses` (cada curso) y el `201` de `POST /api/courses`. Es aditivo, pero el servicio del frontend valida la forma, así que backend y frontend cambian a la vez. No hay parámetros ni endpoints nuevos.

#### Criterios de Aceptación

* **CA1 (Tabla en escritorio):** Dado un colegio con cursos y una ventana de 1280 px, cuando abro `/cursos`, entonces veo una tabla con las columnas Curso, Clases, Tutores y Creado y una fila por curso.
* **CA2 (Tarjetas en móvil):** Dado una ventana de 360 px, cuando abro `/cursos`, entonces veo una tarjeta por curso con los mismos datos, sin desplazamiento horizontal.
* **CA3 (Orden natural):** Dados «10º Curso», «Infantil 3 años», «2º Primaria» y «1º Primaria», cuando abro `/cursos`, entonces aparecen en el orden 1º Primaria, 2º Primaria, 10º Curso, Infantil 3 años.
* **CA4 (Clases):** Dado «1º Primaria» con las clases A y B, cuando lo veo, entonces su fila muestra «2 clases: A, B»; con una sola clase, «1 clase: A».
* **CA5 (Tutores):** Dado que ninguna clase tiene tutor, cuando veo un curso, entonces la columna Tutores muestra «Sin tutor».
* **CA6 (Fecha de creación):** Dado un curso creado el 19/10/2026, cuando veo el listado en castellano, entonces muestra la fecha con el formato del idioma activo («19 oct 2026»); en inglés, con el formato inglés.
* **CA7 (Búsqueda en tiempo real):** Dado que escribo «primaria», cuando escribo cada letra, entonces solo veo los cursos cuyo nombre la contiene, sin distinguir mayúsculas ni acentos («educacion» encuentra «Educación Infantil»), en el mismo orden, y un `role="status"` dice «Mostrando 2 de 4 cursos».
* **CA8 (Búsqueda sin resultados):** Dado que busco «XYZ», cuando no hay coincidencias, entonces veo «No hay cursos que coincidan con «XYZ»» y «Limpiar búsqueda»; al pulsarlo, el campo se vacía, vuelven todos los cursos y el foco vuelve al campo.
* **CA9 (Sin cursos):** Dado un colegio sin cursos, cuando abro `/cursos`, entonces veo «Todavía no hay cursos» y «Crear curso», sin campo de búsqueda.
* **CA10 (Acceso y aislamiento):** Un `MEMBER` ve los cursos de su colegio y ninguno de otro; sin sesión, `/cursos` lleva a `/login` y la API responde `401`.
* **CA11 (Caracteres especiales y texto plano):** Los nombres con `º`, `ª`, `ñ` o marcas HTML se ven como texto; buscar «1º» encuentra «1º Primaria» y no «1ª Primaria».
* **CA12 (Accesibilidad):** La tabla tiene nombre (el título de la página), cabeceras de columna y el nombre del curso como cabecera de fila; el campo de búsqueda tiene etiqueta visible; sin violaciones de `axe` en la tabla, en las tarjetas, sin resultados y vacía; el contenido no se duplica en el árbol de accesibilidad.
* **CA13 (Contrato):** `GET /api/courses` y el `201` de `POST /api/courses` incluyen `createdAt` en ISO 8601 en cada curso.
* **CA14 (i18n):** Todos los textos (también el número de clases con su plural y el indicador de resultados) están en `es.json` y `en.json`.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Backend:** `domain/course/course.ts` (`createdAt: Date`), `prismaCourseRepository.ts` (lee `created_at`; tras crear, devuelve la fecha que guarda la base de datos), `coursesRouter.ts` (serializa con `toISOString()`), y los tests de repositorio, router e integración.
* **Contrato:** `docs/api-spec.yml`, `npm run api:types -w frontend` y `api/schema.test.ts`.
* **Frontend:** `services/coursesService.ts` (exige `createdAt`), `pages/CoursesPage.tsx` (búsqueda, tabla y tarjetas), un hook `hooks/useMediaQuery.ts` (`matchMedia`, simulado en los tests) u otra técnica que fije el diseño, una función pura de búsqueda (`matchesCourseSearch(name, query)`) con sus tests, y `es.json`/`en.json` (`courses.search.*`, `courses.table.*`, `courses.classCount`).
* **E2E:** `cypress/e2e/courses.cy.ts` (ampliado) o `courses-list.cy.ts`.

##### Requisitos de Testing (Pre-release)

* **Unitarios backend:** el repositorio y el router devuelven `createdAt`; integración (`courses.int.test.ts`): `createdAt` en el `201` y en el `GET`.
* **Frontend:** el servicio rechaza un curso sin `createdAt`; la función de búsqueda (mayúsculas, acentos, espacios, `º` frente a `ª`, vacía); `CoursesPage` en los dos anchos (con `matchMedia` simulado): columnas, cabeceras de fila, clases con su plural, «Sin tutor», fecha según el idioma, filtro, indicador, sin resultados con «Limpiar búsqueda» y el foco, vacío sin búsqueda, y `axe` en cada estado. Los tests de US05 de `CoursesPage` se actualizan a la nueva estructura conservando su cobertura de comportamiento.
* **E2E:** crear tres cursos y comprobar la tabla a 1280 px y las tarjetas a 360 px sin desbordes; buscar con y sin acentos, sin resultados y limpiar; la fecha visible. Revisar los pasos de `courses.cy.ts` que buscaban `h2` y la lista «Clases de …».

##### Documentación

* `docs/api-spec.yml`, `frontend/CLAUDE.md` (listado, búsqueda y técnica responsive), `docs/frontend-standards.md` (si la técnica de tabla y tarjetas sin duplicar contenido es una regla nueva), `README.md`, y las notas de US07, US08, US09, US14 y US-ALGO-VIEW con lo que añaden al listado.

##### Riesgos y Mitigaciones

* **Seguridad:** sin superficie nueva: `createdAt` no es un dato sensible y el filtro no envía nada al servidor.
* **Rendimiento:** el filtro es lineal sobre decenas de cursos; sin paginación ni índices nuevos; `GET /api/courses` sigue siendo una consulta.
* **Observabilidad:** sin eventos nuevos (leer no deja traza, como en US05).
* **Regresiones:** cambia la estructura de `/cursos` que probaban los tests y el E2E de US05; se revisan y se actualizan conservando lo que comprobaban.

##### Fuera de alcance

* Paginación y búsqueda en el servidor, Editar y Borrar, nombres de tutores, alumnos, «Ver horario», recarga automática y guardar la búsqueda en la URL o en almacenamiento.

##### Definición de hecho

* Tests en verde con la cobertura mínima (90 % backend, 80 % frontend), `lint`, `typecheck` y `api:types:check`; pruebas con `curl`; E2E completo; PR integrada; despliegue y comprobación en producción.

---

### US07: Editar un curso

**Épica:** [2. Gestión de Cursos y Estructura Base](#epica-2-gestion-de-cursos-y-estructura-base)

**Estimación:** 5 puntos de historia. Dos endpoints nuevos, una página nueva y el formulario de US05 extraído a un componente común; sin tablas ni migraciones.

**Historia:** Como usuario del colegio (`ADMIN` o `MEMBER`), quiero cambiar el nombre de un curso y renombrar, añadir o quitar sus clases, para mantener la estructura del centro al día.

**Depende de:** US05 (alta, validación compartida y `CreateCoursePage`) y US06 (listado de `/cursos`, que gana la acción «Editar»).

---

#### Decisiones (validadas por la persona usuaria)

* **Solo lo que existe.** Se editan el nombre del curso y sus clases. La asignación y el cambio de tutor (con la regla «un profesor tutoriza una sola clase» y el desplegable de profesores `ACTIVE`) pasan a **US09**; la gestión de alumnos por clase, a **US14**. No se muestran columnas ni controles vacíos.
* **Las clases conservan su identidad por `id`.** Cada clase existente viaja con su `id`: con `id` se renombra, sin `id` se crea, y la que no aparece se borra. Así los alumnos, los tutores y los horarios que lleguen después siguen apuntando a la misma clase aunque cambie de nombre.
* **Un solo `PUT`, atómico.** El curso y todas sus clases se guardan en una transacción: o todo o nada.
* **Concurrencia:** si el `PUT` trae el `id` de una clase que ya no pertenece al curso (otra persona la borró mientras editabas), responde **`409 COURSE_CHANGED`** («el curso ha cambiado, recarga») y no guarda nada. En todo lo demás gana el último guardado.
* **Página `/cursos/:id/editar`**, no modal (igual que `/cursos/nuevo`), rellenada con **`GET /api/courses/{id}`**: funciona también al recargar y con un enlace directo.
* **El nombre duplicado se detecta al guardar** (`409`), como en US05, no en tiempo real.

#### Casos de uso y reglas de negocio

* **Acceso:** cualquier usuario autenticado del colegio (`requireAuthentication`, sin `requireRole`). El `schoolId` sale siempre de la identidad. Un curso inexistente, de otro colegio o con un `id` que no es un UUID responde **`404 NOT_FOUND`** (sin revelar si existe en otro colegio).
* **Acción «Editar» en `/cursos`:** la tabla gana una última columna «Acciones» con un enlace «Editar» por fila, y cada tarjeta lleva el suyo. El nombre accesible incluye el curso («Editar 1º Primaria»). Es un enlace (`<Link>`), porque navega, y lo ven los dos roles.
* **Nombre del curso:** las reglas de US05 (recorriendo `test-fixtures/course-fields.json`). Único por colegio **sin contar el propio curso**: cambiar solo mayúsculas o espacios («1º primaria» → «1º Primaria») se acepta.
* **Clases:** las reglas de US05 (de 1 a 12; nombre de 1 a 10 caracteres; único dentro del curso tras normalizar). El formulario empieza con las clases actuales en el orden natural del servidor; se pueden renombrar, añadir filas (hasta 12) y quitarlas (salvo la última). Quitar una fila no borra nada hasta pulsar «Guardar», así que no pide confirmación (llegará con US14, cuando una clase pueda tener alumnos).
* **Orden dentro de la transacción:** 1) borrar las clases ausentes; 2) renombrar en dos fases las que cambian de nombre (primero a un nombre temporal que no puede coincidir con uno válido y después al definitivo), para que un intercambio A↔B no choque con el índice único; 3) crear las nuevas; 4) actualizar el curso (`name`, `normalized_name`, `updated_at`). Así también se puede borrar «C» y añadir otra «C» en el mismo guardado (la nueva tiene otro `id`).
* **Validación del cuerpo:** se valida el conjunto final antes de tocar la base de datos: `id` repetido en el cuerpo → `DUPLICATE` en `classes[i].id`; `id` que no es un UUID → `INVALID_FORMAT` en `classes[i].id`; nombres repetidos → `DUPLICATE` en `classes[i].name`.
* **«Guardar»:** deshabilitado mientras el formulario no tenga cambios reales respecto a lo cargado (tras recortar y colapsar espacios; escribir y volver al valor original cuenta como sin cambios) y durante el envío (guarda síncrona con `ref`, como en US05). Un `PUT` idéntico al estado guardado responde `200` sin cambiar los datos.
* **«Cancelar»:** vuelve a `/cursos` sin guardar ni pedir confirmación.
* **Tras guardar:** navega a `/cursos` con `replace` y muestra «Curso «{nombre}» actualizado» en un `role="status"` (mismo mecanismo de estado de navegación que el aviso de creación).
* **Errores al cargar `/cursos/:id/editar`:** `404` → «Este curso no existe o ya no está disponible» con un enlace a «Cursos»; `503` o red → «No se ha podido cargar el curso» con «Reintentar».
* **Errores al guardar:** los de validación, bajo su campo o fila; `409 COURSE_ALREADY_EXISTS`, bajo el nombre («Ya existe un curso con este nombre. Usa otro») con el foco en él; `409 COURSE_CHANGED`, en un `role="alert"`: «Otra persona ha cambiado este curso. Recárgalo para ver la versión actual», con el botón «Recargar» (vuelve a pedir el curso y descarta lo escrito; el aviso lo dice); `404`, el mensaje de curso no disponible; `503`, `500` o red: «No se pudo guardar el curso. Inténtalo de nuevo», conservando lo escrito. Nunca mensajes técnicos.
* **Textos:** todos por i18n (`courses.edit.*`, `courses.actions.*`); los nombres se pintan como texto plano.

#### Contrato de la API (`docs/api-spec.yml`, primero)

* **`GET /api/courses/{id}`** (Bearer). `200`: `{ course: Course }` (la forma del listado: `id`, `name`, `createdAt`, `classes: [{ id, name, tutor: null }]`); `401 INVALID_SESSION`; `404 NOT_FOUND`; `503 DATABASE_UNAVAILABLE`.
* **`PUT /api/courses/{id}`** (Bearer). Cuerpo: `{ "name": "1º Primaria", "classes": [{ "id": "<uuid>", "name": "A" }, { "name": "C" }] }`; se ignoran las propiedades desconocidas (también un `tutorId`).
  * `200`: `{ course: Course }` con el estado final (los `id` conservados, los de las clases nuevas y `createdAt` sin cambios).
  * `400 VALIDATION_ERROR` con `details[]` (los campos y códigos de US05, más `classes[i].id` con `INVALID_FORMAT` o `DUPLICATE`).
  * `401`; `404 NOT_FOUND` (también si el curso se borró); `409 COURSE_ALREADY_EXISTS`; **`409 COURSE_CHANGED`** (código nuevo: al enum `ErrorCode` y a `ERROR_CODES` a la vez); `503`.
* Se regeneran los tipos (`npm run api:types -w frontend`).

#### Modelo de datos

* Sin migración: se usan los índices únicos de US05 (`courses_school_id_normalized_name_key` y `(course_id, normalized_name)` en `classes`); `updated_at` se actualiza al guardar. `MODELO_DATOS.md` anota la identidad estable de las clases y el orden de operaciones.

#### Criterios de Aceptación

* **CA1 (Abrir la edición):** Dado el listado de `/cursos`, cuando pulso «Editar» en «1º Primaria» (en la tabla o en su tarjeta), entonces llego a `/cursos/<id>/editar` con el nombre y las clases actuales rellenos y «Guardar» deshabilitado.
* **CA2 (Cambiar el nombre):** Dado que cambio «1º Primaria» a «1º Primaria Tarde» y guardo, entonces vuelvo a `/cursos`, veo «Curso «1º Primaria Tarde» actualizado» y el listado muestra el nombre nuevo.
* **CA3 (Renombrar una clase conserva su identidad):** Dado que renombro la clase «A» a «Grupo A» y guardo, entonces la clase conserva su `id` (comprobado en la API).
* **CA4 (Añadir y quitar clases):** Dado «1º Primaria» con A, B y C, cuando quito C, añado D y guardo, entonces el curso tiene A, B y D; C ya no existe y D tiene un `id` nuevo.
* **CA5 (Intercambio y reutilización de nombres):** Dadas las clases A y B, cuando las intercambio (A→B, B→A) y guardo, entonces se guarda sin error y cada `id` tiene el nombre nuevo; quitar «C» y añadir otra «C» en el mismo guardado también se guarda.
* **CA6 (Límites de clases):** No puedo quitar la última clase ni añadir una 13.ª; la API responde `400` con `INVALID_LENGTH` en `classes` a `classes: []` y a más de 12.
* **CA7 (Nombre duplicado):** Dado que existe «6º Primaria», cuando renombro otro curso a «6º primaria», entonces veo «Ya existe un curso con este nombre. Usa otro» bajo el nombre (`409`) y no se guarda nada. Cambiar solo las mayúsculas del propio curso sí se guarda.
* **CA8 (Clase duplicada):** Dado que renombro «B» a «a» y existe «A», cuando guardo, entonces la fila muestra «Ya existe una clase con este nombre en el curso» (`DUPLICATE`) y no se envía nada.
* **CA9 (Curso cambiado por otra persona):** Dado que alguien borra la clase «B» mientras edito, cuando guardo con «B» renombrada, entonces veo «Otra persona ha cambiado este curso…» con «Recargar», la API responde `409 COURSE_CHANGED` y no se guarda ningún cambio; al recargar veo la versión actual.
* **CA10 (Atomicidad):** Dado un guardado con varios cambios en el que falla un paso, cuando se procesa, entonces el curso y todas sus clases quedan como estaban.
* **CA11 (Sin cambios y sin doble envío):** «Guardar» está deshabilitado mientras no haya cambios reales y durante el envío; dos pulsaciones seguidas envían una sola petición.
* **CA12 (Cancelar):** Dado que he cambiado campos, cuando pulso «Cancelar», entonces vuelvo a `/cursos` y el curso no ha cambiado.
* **CA13 (Curso inexistente o de otro colegio):** Abrir `/cursos/<id>/editar` con un curso de otro colegio, inexistente o con un `id` inválido muestra «Este curso no existe o ya no está disponible»; la API responde `404` al `GET` y al `PUT`.
* **CA14 (Error del servidor):** Dado que la base de datos no responde, cuando guardo, entonces veo «No se pudo guardar el curso. Inténtalo de nuevo» y conservo lo escrito.
* **CA15 (Acceso):** Un `ADMIN` y un `MEMBER` ven «Editar» y pueden editar; sin sesión, `/cursos/<id>/editar` lleva a `/login` y la API responde `401`.
* **CA16 (Accesibilidad, responsive e i18n):** sin violaciones de `axe` en la edición (cargada, con errores, no disponible y cambiado) ni en el listado con la columna «Acciones»; cada enlace «Editar» indica su curso; a 360 px no hay desplazamiento horizontal; textos en `es.json` y `en.json`.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Backend:** `domain/course/courseRepository.ts` (`findById`, `update`) y `courseErrors.ts` (`CourseNotFound`, `CourseChanged`); `application/courses/` (`GetCourse`, `UpdateCourse` y `updateCourseRequest.ts`, que reutiliza la validación de nombre y clases de `createCourseRequest.ts` y añade `id`); `infrastructure/prisma/prismaCourseRepository.ts` (transacción interactiva con el orden de operaciones y la traducción del índice único a `CourseAlreadyExists`); `presentation/courses/coursesRouter.ts` (`GET` y `PUT /:id`, `404` a un `id` que no es UUID sin llamar al caso de uso); `presentation/http/appError.ts` y `errorHandler.ts` (`COURSE_CHANGED`, `404`); `app.ts`, `composeApp.ts` y `test/support/appDoubles.ts`.
* **Frontend:** `services/coursesService.ts` (`get` y `update`; un resultado por caso, nunca lanza); un componente `components/CourseForm.tsx` extraído de `CreateCoursePage.tsx` (filas dinámicas con claves estables y el `id` de las existentes, foco en el primer campo inválido, errores del servidor), que pasa a usarlo; `pages/EditCoursePage.tsx` (nueva); `pages/CoursesPage.tsx` (columna «Acciones» y enlace en las tarjetas); `App.tsx` (ruta `/cursos/:id/editar`); `es.json` y `en.json`.
* **E2E:** `cypress/e2e/courses.cy.ts` (ampliado) o `course-edit.cy.ts`.

##### Requisitos de Testing (Pre-release)

* **Unitarios backend:** validación del `PUT` (`id` inválido o repetido, nombres repetidos, límites, recorriendo `course-fields.json`); `UpdateCourse` y `GetCourse` con dobles; router (`404` con un id que no es UUID, `409` de ambos tipos, `200`).
* **Integración (`courses.int.test.ts`, PostgreSQL real):** renombrar conserva el `id`; borrar + añadir; intercambio A↔B; quitar «C» y añadir «C»; renombrar el propio curso cambiando solo mayúsculas; `409 COURSE_ALREADY_EXISTS`; `409 COURSE_CHANGED` con un `id` borrado o de otro curso, sin cambios en la base; atomicidad; dos `PUT` simultáneos (uno borra una clase y otro la renombra: un `200` y un `409`); `404` de otro colegio; `401`; `503`.
* **Frontend:** servicio (cada resultado); `CourseForm` (los tests de US05 se trasladan sin perder cobertura); `EditCoursePage` (carga, rellenado, «Guardar» sin cambios, cada error con su foco o aviso, «Recargar», no disponible, `axe`); `CoursesPage` (columna y enlace en los dos anchos).
* **E2E:** un administrador renombra el curso y una clase, añade y quita clases y lo ve en el listado; nombre duplicado; un `MEMBER` edita; curso cambiado (borrar la clase por la API entre la carga y el guardado); 360 px.

##### Documentación

* `docs/api-spec.yml`, `docs/backend-standards.md` (colecciones hijas con identidad estable y orden borrar → renombrar en dos fases → crear, si se confirma como patrón), `frontend/CLAUDE.md`, `backend/CLAUDE.md`, `CLAUDE.md` raíz (estado y endpoints), `README.md`, `MODELO_DATOS.md`, `ARQUITECTURA_COMPLETA.md` (secciones 0 y 2.0.3), `DIAGRAMA_C4.md` (parte A) y el DSL, y las notas de US08, US09 y US14 con lo que heredan.

##### Riesgos y Mitigaciones

* **Seguridad:** `schoolId` siempre de la identidad y `404` para lo ajeno; un `id` de clase de otro curso nunca se toca (se trata como cambio ajeno, `409`); Prisma con parámetros, límite de tamaño de `express.json()` y máximo de 12 clases.
* **Concurrencia:** transacción más índices únicos como red de seguridad; `COURSE_CHANGED` evita resucitar o perder una clase borrada; en lo demás, last-write-wins documentado.
* **Integridad:** el renombrado en dos fases evita choques transitorios del índice; el nombre temporal usa caracteres no admitidos en un nombre válido, así que nunca coincide con uno real.
* **Rendimiento:** como mucho 12 clases: la transacción es corta; el `GET` por id es una consulta con las clases.
* **Observabilidad:** eventos `COURSE_UPDATED` (`school_id`, `actor_id`, `course_id`, `classes_added`, `classes_removed`, `classes_renamed`) y `COURSE_UPDATE_REJECTED` (`reason: duplicate | changed`); los nombres no van al log.
* **Regresiones:** la extracción de `CourseForm` toca `CreateCoursePage`: sus tests y su E2E deben seguir en verde; la columna nueva cambia la tabla de US06.

##### Fuera de alcance

* Tutores (US09) y alumnos (US14); confirmación al quitar una clase con alumnos (US14); comprobación del nombre en tiempo real; aviso de cambios sin guardar al salir; bloqueo optimista con `updatedAt`; límite de ediciones por minuto; borrar el curso (US08).

##### Definición de hecho

* Tests en verde con la cobertura mínima (90 % backend, 80 % frontend), `lint`, `typecheck` y `api:types:check`; pruebas con `curl`; E2E completo; PR integrada; despliegue y comprobación en producción.

---

### US08: Borrar un curso

**Épica:** [2. Gestión de Cursos y Estructura Base](#epica-2-gestion-de-cursos-y-estructura-base)

**Estimación:** 3 puntos de historia. Dos endpoints nuevos, un diálogo y la acción «Borrar» en el listado; sin tablas ni migraciones.

**Historia:** Como usuario del colegio (`ADMIN` o `MEMBER`), quiero borrar un curso que ya no se usa, sabiendo antes qué se va a perder, para mantener limpia la estructura del centro.

**Depende de:** US05 (el curso y sus clases), US06 (el listado) y US07 (la columna «Acciones» y la página de edición, que ya trata el curso borrado).

---

#### Decisiones (validadas por la persona usuaria)

* **Borrado real.** `DELETE` sin papelera ni estado «inactivo»: el curso y sus clases desaparecen. Se mitiga con un diálogo que informa del impacto antes de confirmar.
* **El diálogo informa del impacto y, si hay alumnos asignados, dice cuántos.** Hoy el impacto son las **clases** del curso; el número de **alumnos** ya está en el contrato (`studentCount`) y vale siempre `0` hasta que exista la tabla de alumnos (US14), que solo cambia cómo se calcula. La línea de alumnos del diálogo aparece solo cuando son más de 0. Horarios y tutores se añadirán con sus historias.
* **Una sola confirmación.** Se descartan la segunda confirmación con más de 50 alumnos y la advertencia del único curso: el diálogo ya informa del impacto, y al borrar el último curso el listado muestra «Todavía no hay cursos» con «Crear curso».
* **Sin límite de borrados por minuto** (no se aplica en ninguna historia del módulo).
* **La cascada ya existe:** `classes.course_id` es `ON DELETE CASCADE`. Sin migración.

#### Casos de uso y reglas de negocio

* **Acceso:** cualquier usuario autenticado del colegio (`requireAuthentication`, sin `requireRole`). El `schoolId` sale siempre de la identidad. Un curso de otro colegio, inexistente o con un `id` que no es UUID responde el mismo **`404 NOT_FOUND`** (`CourseNotFound`), sin llegar a la base de datos con un `id` mal formado.
* **Acción «Borrar» en `/cursos`:** un **botón** (no un enlace: no navega) junto a «Editar», en la columna «Acciones» de la tabla y en cada tarjeta. Su nombre accesible incluye el curso («Borrar 1º Primaria») y contiene el texto visible «Borrar». Lo ven los dos roles.
* **Diálogo de confirmación** (`DeleteCourseModal`, un `Modal` de react-bootstrap siempre montado y gobernado por `show`, como `ConfirmSuspendModal`: foco inicial en «Cancelar», sin «X» de cabecera):
  * Al abrirse pide el impacto con `GET /api/courses/{id}/impact` y muestra «Cargando…» (`role="status"`) con «Borrar curso» deshabilitado.
  * Con el impacto: título «¿Borrar «{nombre}»?», «Se borrarán sus {N} clases» (plural de `classCount`), «Tiene {M} alumnos asignados» solo si `studentCount > 0`, y «Esta acción no se puede deshacer». Botones «Cancelar» y «Borrar curso» (variante de peligro).
  * Si el impacto no se puede leer: `role="alert"` con «Reintentar», y «Borrar curso» sigue deshabilitado (no se confirma a ciegas).
  * Si el impacto responde `404` (el curso ya no existe): se cierra el diálogo, se vuelve a pedir la lista y se avisa «Ese curso ya no existe».
* **Al confirmar:** `DELETE /api/courses/{id}`. «Borrar curso» y «Cancelar» se deshabilitan con una guarda síncrona contra la doble pulsación (`ref`) y el texto pasa a «Borrando…».
  * `200`: el curso sale del listado sin volver a pedirlo, el diálogo se cierra y aparece «Curso «{nombre}» eliminado» en un `role="status"` (con «. {M} alumnos quedan sin clase» solo si `studentCount > 0`). El foco pasa al `h1` (con `tabIndex={-1}`), porque la fila ya no existe; al cancelar, vuelve al botón «Borrar» de esa fila.
  * `404`: como arriba (ya no existe), sin tratarlo como error.
  * `503`, `500` o red: «No se pudo borrar el curso. Inténtalo de nuevo» en un `role="alert"` dentro del diálogo, que sigue abierto y permite reintentar.
  * `401`: el layout lleva a `/login`.
* **Atomicidad y concurrencia:** el `DELETE` bloquea la fila del curso (`FOR UPDATE`), cuenta lo que se va a borrar y borra el curso con sus clases en la misma transacción. Una edición simultánea (US07) espera: si el borrado va primero, el `PUT` recibe `404` y la página de edición muestra «Este curso no existe o ya no está disponible»; si el `PUT` va primero, el borrado ve el estado final. El impacto del diálogo es el de ese momento; el que devuelve el `DELETE` (`deleted`) es el que realmente se borró, y es el que se registra y se muestra en el aviso.
* **Textos:** por i18n (`courses.delete.*`); los nombres se pintan como texto plano.

#### Contrato de la API (`docs/api-spec.yml`, primero)

* **`GET /api/courses/{id}/impact`** (`getCourseDeletionImpact`, Bearer): `200` con `{ impact: { classCount, studentCount } }` (enteros ≥ 0; `studentCount` siempre `0` hasta US14); `401`; `404 NOT_FOUND` (`CourseNotFound`); `503`. `Cache-Control: no-store`.
* **`DELETE /api/courses/{id}`** (`deleteCourse`, Bearer): `200` con `{ deleted: { classCount, studentCount } }` (lo que se borró de verdad); `401`; `404 NOT_FOUND`; `503`. Sin cuerpo en la petición.
* Sin códigos de error nuevos. Se regeneran los tipos (`npm run api:types -w frontend`).

#### Modelo de datos

* Sin migración. El curso se borra filtrando por `schoolId` y sus clases caen por la cascada de la base de datos. US09 y US14 revisarán sus claves ajenas hacia `classes` (`ON DELETE SET NULL` para el tutor y para la clase del alumno) para no bloquear este borrado; se anota en sus fichas.

#### Criterios de Aceptación

* **CA1 (Abrir el diálogo con el impacto):** Dado el listado, cuando pulso «Borrar» en «1º Primaria» (con 3 clases), entonces se abre un diálogo con «¿Borrar «1º Primaria»?», «Se borrarán sus 3 clases» y «Esta acción no se puede deshacer», con «Cancelar» (con el foco) y «Borrar curso».
* **CA2 (Borrar):** Dado el diálogo abierto, cuando pulso «Borrar curso», entonces el curso desaparece del listado, el diálogo se cierra, veo «Curso «1º Primaria» eliminado» y, al recargar, el curso no está; sus clases tampoco existen en la base de datos.
* **CA3 (Cancelar):** Dado el diálogo abierto, cuando pulso «Cancelar» o Escape, entonces se cierra sin borrar nada y el foco vuelve al botón «Borrar» de ese curso.
* **CA4 (Alumnos asignados):** Dado un curso con alumnos asignados, cuando abro el diálogo, entonces dice «Tiene {M} alumnos asignados» y, tras borrar, el aviso añade que quedan sin clase. Con el contrato actual (`studentCount = 0`) esa línea no aparece; los tests la comprueban con un impacto simulado.
* **CA5 (Sin doble borrado):** Dado que pulso «Borrar curso» dos veces seguidas, entonces se envía una sola petición y los botones quedan deshabilitados con «Borrando…».
* **CA6 (Impacto que no se puede leer):** Dado que `GET …/impact` falla, entonces el diálogo muestra el error con «Reintentar» y «Borrar curso» deshabilitado.
* **CA7 (Fallo al borrar):** Dado que el servidor no responde, cuando confirmo, entonces veo «No se pudo borrar el curso. Inténtalo de nuevo» dentro del diálogo, que sigue abierto, y puedo reintentar.
* **CA8 (Curso ya borrado):** Dado que otra persona borró el curso antes, cuando abro el diálogo o confirmo, entonces el diálogo se cierra, la lista se actualiza sin ese curso y veo «Ese curso ya no existe».
* **CA9 (Aislamiento):** Un curso de otro colegio, uno inexistente y un `id` que no es un UUID responden `404` al `GET …/impact` y al `DELETE`, y no se borra nada.
* **CA10 (Concurrencia con la edición):** Dada una página de edición abierta, cuando otra persona borra el curso y yo guardo, entonces veo «Este curso no existe o ya no está disponible». Dos borrados simultáneos dan un `200` y un `404`.
* **CA11 (Último curso):** Dado que borro el único curso, entonces el listado pasa a «Todavía no hay cursos» con «Crear curso» y sin campo de búsqueda.
* **CA12 (Acceso):** Un `ADMIN` y un `MEMBER` ven «Borrar» y pueden borrar; sin sesión, `/cursos` lleva a `/login` y la API responde `401`.
* **CA13 (Accesibilidad, responsive e i18n):** sin violaciones de `axe` (diálogo con impacto, cargando, con error, y el listado con el botón); el botón se llama «Borrar {curso}»; el diálogo atrapa el foco y se cierra con Escape; a 360 px no hay desplazamiento horizontal; textos en `es.json` y `en.json` con sus plurales.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Backend:** `domain/course/courseRepository.ts` (`impactOf` y `delete`, y el tipo `CourseImpact`); `application/courses/` (`GetCourseDeletionImpact` y `DeleteCourse`, evento `COURSE_DELETED`); `infrastructure/prisma/prismaCourseRepository.ts` (transacción interactiva con `FOR UPDATE`, recuento y borrado); `presentation/courses/coursesRouter.ts` (`GET /:id/impact` y `DELETE /:id`, con el mismo `parseCourseId`); `app.ts`, `composeApp.ts` y `test/support/appDoubles.ts`.
* **Frontend:** `services/coursesService.ts` (`getImpact` y `delete`; un resultado por caso, nunca lanzan); `components/DeleteCourseModal.tsx` (nuevo); `pages/CoursesPage.tsx` (botón «Borrar», curso a borrar, quitar la fila, aviso y foco); `es.json` y `en.json`.
* **E2E:** `cypress/e2e/courses.cy.ts` (ampliado).

##### Requisitos de Testing (Pre-release)

* **Unitarios backend:** `GetCourseDeletionImpact` y `DeleteCourse` con dobles (`CourseNotFound`, evento `COURSE_DELETED` solo con identificadores y recuentos); router (`404` con un id que no es UUID sin llamar al caso de uso, `200`, `401`, `503`, `MEMBER` admitido).
* **Integración (PostgreSQL real):** el repositorio cuenta y borra el curso y sus clases; otro colegio e inexistente dan `CourseNotFound` sin cambios; atomicidad; dos borrados simultáneos (un `200` y un `404`); un `PUT` y un `DELETE` simultáneos sin ningún `500`; HTTP de extremo a extremo.
* **Frontend:** el servicio en cada resultado; `DeleteCourseModal` en cada estado (cargando, impacto con y sin alumnos, error con «Reintentar», confirmando, error al borrar, `404`) con `axe`; `CoursesPage` en los dos anchos (nombre accesible del botón, borrar quita la fila sin volver a pedir la lista, aviso, foco, último curso).
* **E2E:** un administrador borra un curso con varias clases desde el diálogo y desaparece (también tras recargar); cancelar no borra; un curso borrado por la API entre la apertura y la confirmación da «Ese curso ya no existe»; un `MEMBER` borra; 360 px.

##### Documentación

* `docs/api-spec.yml`, `docs/backend-standards.md` (borrar un registro con hijos: bloqueo, recuento y borrado en la misma transacción), `docs/frontend-standards.md` (diálogo de confirmación con impacto para acciones destructivas en listados), `frontend/CLAUDE.md`, `backend/CLAUDE.md`, `CLAUDE.md` raíz, `README.md`, `MODELO_DATOS.md`, la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL) y las notas de US09 y US14 (`ON DELETE SET NULL` y el recuento de alumnos).

##### Riesgos y Mitigaciones

* **Borrado irreversible por error:** el diálogo informa antes y el foco empieza en «Cancelar»; no hay «deshacer». Una papelera sería otra historia si el producto la pide.
* **El impacto cambia entre la apertura y la confirmación:** el `DELETE` devuelve y registra lo realmente borrado y el aviso usa ese dato; no se bloquea el borrado por una diferencia.
* **Seguridad:** `schoolId` siempre de la identidad, `404` indistinguible para lo ajeno, Prisma con parámetros. El `DELETE` no lleva cuerpo ni cookies.
* **Concurrencia:** bloqueo de la fila del curso; el borrado y la edición se serializan.
* **Rendimiento:** un curso tiene como mucho 12 clases: la transacción es corta.
* **Observabilidad:** `COURSE_DELETED` con `school_id`, `actor_id`, `course_id`, `class_count` y `student_count`; nunca nombres.
* **Regresiones:** la columna «Acciones» gana un botón y el listado un diálogo; los tests de `CoursesPage` que esperan cero botones se actualizan.

##### Fuera de alcance

* Papelera o restauración; horarios y tutores en el impacto (US09 y las historias de horarios); segunda confirmación por número de alumnos o por ser el último curso; límite de borrados por minuto; borrado en lote.

##### Definición de hecho

* Tests en verde con la cobertura mínima (90 % backend, 80 % frontend), `lint`, `typecheck` y `api:types:check`; pruebas con `curl`; E2E completo; PR integrada; despliegue y comprobación en producción.

---

## Módulo: Gestión de Profesores

### US09: Crear un profesor (y listado mínimo)

**Épica:** [3. Gestión de Profesores](#epica-3-gestion-de-profesores)

**Estimación:** 8 puntos de historia. Una migración, dos endpoints, dos páginas y un cambio de contrato en las clases; sin asignaturas. La elección del tutor desde la edición del curso es la sub-historia **US09_b**.

**Historia:** Como usuario del colegio (`ADMIN` o `MEMBER`), quiero crear un profesor con su nombre, su apellido, su cargo y, si es tutor, la clase que tutoriza, y ver los profesores del colegio y el profesor de cada clase, para configurar la estructura docente del centro.

**Depende de:** US02_b1 (`AuthenticatedLayout`, `requireAuthentication`), US04 (la bienvenida) y US05 a US08 (cursos y clases).

---

#### Decisiones (validadas por la persona usuaria)

* **Un profesor es un registro del colegio**, no una persona con cuenta. Sin email ni DNI por ahora.
* **Las asignaturas se asignan después** (`US-PROF-ASSIGN`), pero el contrato ya lleva **`subjects: []`**, siempre vacío hasta entonces, igual que `studentCount` en US08. No existe `professor_subjects` ni selector.
* **La clase que tutoriza** se elige en la ficha del profesor (`classId`, opcional) y se ve en cada clase: `SchoolClass.tutor` pasa de `null` a `{ id, firstName, lastName } | null`. Elegirla desde la clase es **US09_b**.
* **Listado mínimo** `/profesores` con el enlace «Profesores» en la cabecera, como el listado mínimo de US05. US10 lo amplía (asignaturas, paginación, acciones) y US11 añade la búsqueda.
* **Sin `status` ni `deletedAt`** hasta que una historia los necesite; US13 decidirá cómo se borra, como en US08.
* **Esta historia se divide en US09 y US09_b** (profesor, listado y tutor visible, y después elegir el tutor desde la edición del curso), porque US09_b modifica el `PUT` de cursos, `planCourseUpdate` y `CourseForm` y suma sus propios errores.
* **Fuera de alcance:** asignaturas, disponibilidad, email, editar y borrar profesores, búsqueda, cambiar de tutor desde la clase (US09_b).

#### Casos de uso y reglas de negocio

* **Acceso:** cualquier usuario autenticado del colegio (`requireAuthentication`, sin `requireRole`). El `schoolId` sale siempre de la identidad.
* **Nombre y apellido:** obligatorios, de 1 a 100 caracteres tras recortar y colapsar espacios. Las **mismas reglas que el registro** (`userFields.ts`: letras con acentos, dígitos, `·`, espacios, apóstrofo y guion), compartidas por el backend y el frontend con una tabla de ejemplos nueva `test-fixtures/professor-fields.json`. **Sin unicidad**: puede haber varios «García López».
* **Cargo:** opcional, `DIRECTOR` o `JEFE_ESTUDIOS`. Es informativo y no concede permisos (PRD §3.2). Un valor distinto es `INVALID_FORMAT`.
* **Clase que tutoriza (`classId`):** opcional. Debe ser una clase de un curso **del colegio** y no tener tutor. Un profesor tutoriza como mucho una clase (índice único en la base de datos).
  * La asignación es un `UPDATE` condicionado (`tutor_id IS NULL`) en la misma transacción que el alta, así que dos personas que eligen la misma clase a la vez dan un `201` y un `409`, sin bloqueos.
  * Una clase inexistente, de otro colegio o con un `id` que no es UUID es un error del campo `classId` (`NOT_FOUND` o `INVALID_FORMAT`); una clase que ya tiene tutor es **`409 CLASS_ALREADY_HAS_TUTOR`**.
* **Alta atómica:** el profesor y su asignación se crean en una transacción; o todo o nada.
* **Formulario `/profesores/nuevo`:** nombre, apellido, cargo (desplegable «Sin cargo / Director / Jefe de estudios») y clase («Sin clase»; las clases sin tutor agrupadas por curso, salidas de `GET /api/courses`). Sin clases libres, el desplegable lo dice. Mismas pautas que `CourseForm`: validación compartida, foco en el primer error, guarda contra la doble pulsación, errores por campo, `409` en el campo de la clase y un aviso general sin detalles técnicos.
* **Tras crear:** navega a `/profesores` con `replace` y «Profesor «Ana García» creado» en un `role="status"`.
* **Listado `/profesores`:** tabla desde 768 px y tarjetas por debajo (la técnica de `/cursos`), con **Nombre** (apellido, nombre), **Cargo** y **Clase que tutoriza** («1º Primaria · A» o «Sin clase»). Orden por apellido y nombre con la comparación del castellano. Vacío: «Todavía no hay profesores» con «Crear profesor». «Crear profesor» siempre visible. Carga única, error con «Reintentar».
* **Tutor visible en las clases:** la columna «Tutores» de `/cursos` pasa de «Sin tutor» a «A: Ana García, B: Luis Pérez» (solo las clases con tutor; «Sin tutor» si ninguna lo tiene). En la edición del curso (US07) cada fila de clase muestra su tutor como texto, sin selector. Editar el curso **no pierde los tutores**: las clases conservan su `id` y el `PUT` no toca `tutor_id`.
* **Borrar un curso con tutores** (US08): sus clases caen y los profesores quedan sin clase, sin borrarse (`ON DELETE SET NULL`).
* **Creación del curso:** `POST /api/courses` no cambia; las clases nacen «Sin tutor» y el tutor se elige al editar (US09_b) o desde la ficha del profesor.
* **Cabecera:** el enlace «Profesores» para `ADMIN` y `MEMBER`, junto a «Cursos», antes de «Usuarios».
* **Textos:** todos por i18n (`professors.*`, `header.professors`); los nombres se pintan como texto plano.

#### Contrato de la API (`docs/api-spec.yml`, primero)

* **`POST /api/professors`** (`createProfessor`, Bearer). Cuerpo: `{ firstName, lastName, position?, classId? }`; se ignoran las propiedades desconocidas (también `subjectIds`).
  * `201`: `{ professor }`.
  * `400 VALIDATION_ERROR` con `details[]` (`firstName`, `lastName`, `position`, `classId`).
  * `401`; `409 CLASS_ALREADY_HAS_TUTOR`; `503`.
* **`GET /api/professors`** (`listProfessors`, Bearer): `200` con `{ professors: [Professor] }` del colegio; `401`; `503`; `Cache-Control: no-store`.
* **`Professor`:** `{ id, firstName, lastName, position: 'DIRECTOR' | 'JEFE_ESTUDIOS' | null, subjects: [], tutoredClass: { id, name, courseId, courseName } | null }`.
* **`SchoolClass.tutor`:** `{ id, firstName, lastName } | null` en `GET /api/courses`, `GET /api/courses/{id}` y las respuestas de `POST` y `PUT`.
* **Códigos nuevos:** `CLASS_ALREADY_HAS_TUTOR` (al enum `ErrorCode` y a `ERROR_CODES` a la vez) y el código de campo `NOT_FOUND` en `FieldErrorCode`. Se regeneran los tipos.

#### Modelo de datos (migración nueva en `backend/prisma/schema.prisma`)

* **`professors`:** `id` (UUIDv7), `school_id` (FK `schools`), `first_name` y `last_name` (`varchar(100)`), `position` (enum `ProfessorPosition`, nulo), `created_at`, `updated_at`; índice por `school_id`.
* **`classes.tutor_id`:** nulo, FK a `professors` con **`ON DELETE SET NULL`** y **`UNIQUE`** (`classes_tutor_id_key`).
* `resetDatabase()` y `scripts/e2eData.mjs` vacían la tabla nueva; se actualiza `MODELO_DATOS.md`.

#### Criterios de Aceptación

* **CA1 (Crear sin cargo ni clase):** Dado el formulario con nombre «José María» y apellido «García López», sin más, cuando guardo, entonces el profesor se crea y aparece en `/profesores` como «García López, José María · Sin cargo · Sin clase».
* **CA2 (Cargo):** Dado que elijo «Jefe de estudios», cuando guardo, entonces se guarda con ese cargo; sin elegirlo, queda sin cargo. El cargo no cambia permisos.
* **CA3 (Con clase):** Dado que elijo «1º Primaria · A», cuando guardo, entonces el profesor aparece con esa clase, y `/cursos` muestra «A: José María García López» en «Tutores» de «1º Primaria».
* **CA4 (Obligatorios):** Dado que dejo sin nombre o sin apellido, cuando guardo, entonces el error sale bajo el campo y no se envía nada.
* **CA5 (Caracteres):** «José María», «D'Angelo Müller» y «García-López» se aceptan; «<b>x</b>» no (`INVALID_CHARACTERS`).
* **CA6 (Solo espacios y longitud):** solo espacios es `REQUIRED`; más de 100 caracteres, `INVALID_LENGTH`.
* **CA7 (Homónimos):** se pueden crear dos «García López, José».
* **CA8 (Clase no válida):** una clase inexistente, de otro colegio o con un id inválido da un error en el campo de la clase y no se crea nada.
* **CA9 (Clase con tutor):** una clase que ya tiene tutor responde `409 CLASS_ALREADY_HAS_TUTOR` («Esa clase ya tiene tutor. Elige otra»), sin crear nada; dos altas simultáneas con la misma clase dan un `201` y un `409`.
* **CA10 (Una clase por profesor):** el índice único impide que un profesor tutorice dos clases.
* **CA11 (Atomicidad):** si falla la asignación de la clase, no queda el profesor.
* **CA12 (Acceso y aislamiento):** `ADMIN` y `MEMBER` crean y ven profesores; solo se ven los del propio colegio; sin sesión, `/profesores` lleva a `/login` y la API responde `401`.
* **CA13 (Listado):** ordenado por apellido y nombre en castellano; vacío con «Crear profesor»; error con «Reintentar»; tabla en escritorio y tarjetas en móvil.
* **CA14 (Tutor en `/cursos` y en la edición):** la columna «Tutores» y cada fila de la edición muestran el tutor; con ninguno, «Sin tutor».
* **CA15 (Editar el curso conserva tutores):** renombrar una clase o el curso no quita al tutor; quitar la clase sí deja al profesor sin clase.
* **CA16 (Borrar un curso con tutores):** el curso se borra y el profesor sigue existiendo, sin clase.
* **CA17 (Accesibilidad, responsive e i18n):** sin violaciones de `axe` en el listado (tabla, tarjetas, vacío, error) y en el formulario (vacío y con errores); campos con etiqueta; a 360 px sin desplazamiento horizontal; textos en `es.json` y `en.json`.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Backend:** `domain/professor/` (`Professor`, `ProfessorRepository`, errores `ClassNotFound` y `ClassAlreadyHasTutor`); `application/professors/` (`CreateProfessor`, `ListProfessors`, `createProfessorRequest.ts` sobre `userFields.ts`); `infrastructure/prisma/prismaProfessorRepository.ts` y el `tutor` en `LIST_FIELDS` de `prismaCourseRepository.ts`; `presentation/professors/professorsRouter.ts`; `app.ts`, `composeApp.ts`, `appError.ts`, `errorHandler.ts` y los dobles de test.
* **Frontend:** `professorsService.ts`, `ProfessorsPage`, `CreateProfessorPage`, el tipo `SchoolClass.tutor` en `coursesService.ts` (hoy exige `tutor === null`), `CoursesPage` («Tutores»), `EditCoursePage`/`CourseForm` (tutor de solo lectura), `AppHeader`, `App.tsx`, `es.json` y `en.json`.
* **E2E:** `cypress/e2e/professors.cy.ts`.

##### Requisitos de Testing (Pre-release)

* **Unitarios:** validación compartida (recorriendo `professor-fields.json` en backend y frontend), `CreateProfessor` y `ListProfessors` con dobles, router, servicios, páginas, cabecera y `axe`; se actualizan los tests que fijan `tutor: null`.
* **Integración (PostgreSQL real):** alta con y sin clase, clase con tutor, dos altas simultáneas con la misma clase (`201` y `409`), otro colegio, atomicidad, el índice único, borrar un curso con tutores (el profesor sigue) y editar un curso con tutores (se conservan).
* **E2E:** un administrador crea un profesor con clase y lo ve en el listado y en `/cursos`; un `MEMBER` crea otro; validación; 360 px.

##### Documentación

* Contrato, `MODELO_DATOS.md`, estándares, `CLAUDE.md` (los tres), `README.md`, arquitectura (tabla de datos y módulo de profesores), y las fichas de US10, US11, US12, US13 y US-PROF-ASSIGN con lo que heredan.

##### Riesgos y Mitigaciones

* **Seguridad:** `schoolId` siempre de la identidad; la clase se resuelve por el colegio de su curso; Prisma con parámetros.
* **Concurrencia:** la asignación es un `UPDATE` condicionado y el índice único respalda «un profesor, una clase».
* **Observabilidad:** `PROFESSOR_CREATED` (`school_id`, `actor_id`, `professor_id`, `has_class`, `position`) y `PROFESSOR_CREATION_REJECTED` (`reason`); nunca nombres.
* **Regresiones:** el cambio de `SchoolClass.tutor` en el contrato obliga a actualizar el servicio de cursos y sus tests a la vez.

##### Definición de hecho

* Tests en verde con la cobertura mínima (90 % backend, 80 % frontend), `lint`, `typecheck` y `api:types:check`; pruebas con `curl`; E2E completo; PR integrada; despliegue con la migración aplicada y comprobación en producción.

---

### US09_b: Elegir el tutor desde la edición del curso

**Épica:** [3. Gestión de Profesores](#epica-3-gestion-de-profesores)

**Estimación:** 5 puntos de historia. Un campo nuevo en el `PUT` de cursos, un código de error, el plan de cambios con los tutores y un desplegable por fila en el formulario compartido.

**Historia:** Como usuario del colegio (`ADMIN` o `MEMBER`), quiero elegir, cambiar o quitar el tutor de cada clase mientras edito su curso, para organizar las tutorías sin salir de la pantalla del curso.

**Depende de:** US09 (profesores, `classes.tutor_id` y `SchoolClass.tutor`) y US07 (la edición del curso, `planCourseUpdate`).

> **Nota (US09, 2026-10-20):** lo construido en US09 que esta historia usa. `SchoolClass.tutor` ya es `{ id, firstName, lastName }` o `null` en el contrato y en todas las lecturas de cursos (`TUTOR_FIELDS` en `PrismaCourseRepository`); `CourseForm` ya muestra el tutor de cada clase existente como texto de solo lectura en la prop aparte `classTutors` (por `id` de clase, fuera de `CourseDraft`), que esta historia completa con un desplegable; `planCourseUpdate` conserva el `tutor_id` al renombrar una clase y la base de datos lo libera (`ON DELETE SET NULL`) al quitarla. La lista de profesores sale de `GET /api/professors` (cada uno con `tutoredClass`, que trae `courseId`). Un profesor que ya tutoriza una clase de **otro curso no se mueve**: no se ofrece y, si llega en el `PUT`, `409 PROFESSOR_ALREADY_TUTOR` (`classes.tutor_id` es único).

#### Decisiones

* **Solo se cambia este curso.** Un profesor que ya tutoriza una clase de **otro curso** no aparece en el desplegable; si llega en el `PUT` (una carrera o un cliente que no es la SPA), **`409 PROFESSOR_ALREADY_TUTOR`** y no se guarda nada. Para cambiarlo de curso, primero se le quita desde el suyo. Nunca se deja sin tutor una clase de otro curso desde aquí.
* **Mover e intercambiar dentro del curso, en un solo guardado.** El desplegable ofrece «Sin tutor», los profesores **sin clase** y los que tutorizan **clases de este mismo curso** (estos como «Ana García · clase A»).
* **El mismo profesor en dos filas es un error de la segunda** (`DUPLICATE`), sin efectos ocultos: elegir en B a la tutora de A no vacía A. Para mover, se cambia A («Sin tutor» u otro profesor) y se elige en B.
* **Si los profesores no cargan, el tutor queda de solo lectura** («Tutor: Ana García», como en US09) con un aviso y «Reintentar»; se puede guardar el nombre y las clases: el `PUT` no envía `tutorId` y los tutores no cambian.
* **Compatible hacia atrás:** un `PUT` sin `tutorId` no toca ningún tutor. `POST /api/courses` no cambia: las clases nacen «Sin tutor».

#### Contrato (`docs/api-spec.yml`, contrato primero)

* `UpdateClassRequest` gana `tutorId` opcional: `string` (UUID) o `null`. **Omitido = sin cambios**, `null` = quitar, UUID = asignar; vale también en las clases nuevas (sin `id`).
* `PUT /api/courses/{id}` declara un `409` más: `PROFESSOR_ALREADY_TUTOR`, añadido a la vez al enum `ErrorCode` y a `ERROR_CODES` de `appError.ts`.
* Errores de campo en `classes[<i>].tutorId` con los códigos que ya existen: `INVALID_FORMAT`, `NOT_FOUND` y `DUPLICATE`.
* La respuesta `200` sigue siendo el curso con `tutor` en cada clase. Se regeneran los tipos del frontend y se actualiza `schema.test.ts`.

#### Reglas de negocio (backend)

* **Parser** (`updateCourseRequest.ts`, sin base de datos): `classes[<i>].tutorId` UUID o `null`, si no `INVALID_FORMAT`; el mismo profesor en dos filas, `DUPLICATE` desde la segunda (sin distinguir mayúsculas). Por clase, el orden de errores es `id` → `name` → `tutorId`. Distingue «omitido» (`undefined`) de `null`.
* **Plan puro** `planCourseUpdate(current, requested, professors)`: `current.classes` lleva el `tutorId` guardado y `professors` son los profesores pedidos que existen en el colegio, con la clase que tutorizan (los lee el repositorio dentro de la transacción).
  * Por cada clase con `tutorId !== undefined` y distinto del guardado, un cambio de tutor.
  * Un profesor que no está en `professors` → `ValidationError` con `classes[<i>].tutorId: NOT_FOUND` (inexistente y de otro colegio no se distinguen).
  * Un profesor que tutoriza una clase **que no es de este curso** → `ProfessorAlreadyTutor`. Si es de este curso, solo es válido si el plan la libera (se quita, cambia de tutor o pasa a `null`).
  * Devuelve `tutorsChanged` (`{ classId, tutorId | null }[]`) junto a lo de US07; un plan sin cambios no escribe.
* **Escritura** (`PrismaCourseRepository.update`), en la transacción de US07 con el curso bloqueado (`FOR UPDATE`): lee las clases (con `tutor_id`) y los profesores pedidos (`findMany` por `id` y `school_id`, con su clase), ejecuta el plan y escribe: nombre del curso → borrar → renombrar en dos fases → crear → **tutores en dos fases** (primero `tutor_id = NULL` en las clases cuyo tutor cambia, después el nuevo `tutor_id`), para que mover A→B e intercambiar A↔B no choquen con el índice único.
* **Concurrencia:** dos `PUT` de cursos distintos que asignan el mismo profesor chocan con `classes_tutor_id_key`; el repositorio traduce esa violación (por el nombre del índice, `violatedUniqueIndex`) a `ProfessorAlreadyTutor` y se deshace todo. Un `POST /api/professors` simultáneo con una clase de este curso: si el `PUT` asigna esa clase, gana el último que escribe, como el resto de la edición (US07); si el `PUT` la omite, no hay conflicto.
* **Errores:** `ProfessorAlreadyTutor` → `409 PROFESSOR_ALREADY_TUTOR` (solo `errorHandler.ts`). Orden: cuerpo (`400`) → curso (`404`) → clase de otro curso (`409 COURSE_CHANGED`) → profesor (`400 NOT_FOUND`, `409 PROFESSOR_ALREADY_TUTOR`) → nombre repetido (`409 COURSE_ALREADY_EXISTS`).
* **Observabilidad:** `COURSE_UPDATED` suma `tutors_changed`; `COURSE_UPDATE_REJECTED` suma `reason: professor_already_tutor | professor_not_found`. Nunca nombres.

#### Interfaz (frontend)

* **`EditCoursePage`:** pide el curso y, una sola vez (también con `StrictMode`), `professorsService.list`. Con los dos, pasa a `CourseForm` las opciones de tutor de este curso: «Sin tutor», los profesores con `tutoredClass === null` y los que tienen `tutoredClass.courseId` de este curso («Nombre Apellidos · clase X»). Si los profesores fallan, pasa `classTutors` como en US09 (solo lectura) y un aviso con «Reintentar».
* **`CourseForm`:** con opciones de tutor, cada fila (también las nuevas) gana un `Form.Select` con etiqueta visible «Tutor» y nombre accesible «Tutor de la clase N», que empieza con el tutor guardado o «Sin tutor». `CourseDraft.classes[i]` gana `tutorId?: string | null` (solo cuando hay opciones); `hasCourseChanges` compara también el `tutorId` (volver a elegir el mismo no es cambio); `validateCourse` da `DUPLICATE` en la segunda fila con el mismo profesor; `courseErrorsFromServer` traduce `classes[<i>].tutorId` a la fila. Sin profesores en el colegio, el desplegable solo tiene «Sin tutor» y un texto enlaza a «Crear profesor» (`/profesores/nuevo`).
* **`coursesService.update`:** envía `tutorId` solo si está en el draft e interpreta `409 PROFESSOR_ALREADY_TUTOR` como `professorAlreadyTutor`.
* **`409 PROFESSOR_ALREADY_TUTOR` en la interfaz:** un `role="alert"` («Uno de los profesores elegidos ya es tutor en otro curso. Se ha actualizado la lista de profesores.»), vuelve a pedir los profesores, marca con su error las filas cuyo profesor elegido ya no está entre las opciones, lleva el foco a la primera y conserva lo demás escrito.
* **Textos:** `courses.form.tutor*` y los errores `tutorId.*` en `es.json` y `en.json`.

#### Criterios de Aceptación

* **CA1 (Asignar):** Dado que edito «1º Primaria» y elijo a «Ana García» en la clase A, cuando guardo, entonces `/cursos` muestra «A: Ana García» y `/profesores` la muestra con «1º Primaria · A».
* **CA2 (Cambiar y quitar):** Dado que A tiene a Ana, cuando elijo a Luis (o «Sin tutor») en A y guardo, entonces A tiene a Luis (o nadie) y Ana queda «Sin clase».
* **CA3 (Mover e intercambiar):** pasar a Ana de A a B (A a «Sin tutor» u otro) e intercambiar Ana↔Luis entre A y B se guardan en un solo `PUT`, sin errores.
* **CA4 (Profesor de otro curso):** no se ofrecen los profesores que tutorizan clases de otro curso; si uno llega en el `PUT`, `409 PROFESSOR_ALREADY_TUTOR` y no se guarda nada (ni el nombre ni las clases). Dos `PUT` simultáneos de cursos distintos con el mismo profesor: un `200` y un `409`, nunca `500`.
* **CA5 (Validación):** un id que no es UUID (`INVALID_FORMAT`), un profesor inexistente o de otro colegio (`NOT_FOUND`) y el mismo profesor en dos filas (`DUPLICATE`, en la segunda) dan su error en la fila (`classes[<i>].tutorId`), en el cliente y en el servidor.
* **CA6 (Compatibilidad):** un `PUT` sin `tutorId` no cambia ningún tutor, aunque renombre, añada o quite clases.
* **CA7 (Quitar la clase):** quitar una clase con tutor deja al profesor sin clase (`ON DELETE SET NULL`), y puede elegirse en otra fila en el mismo guardado.
* **CA8 (Sin cambios):** «Guardar» sigue deshabilitado si solo se vuelve a elegir el tutor que ya tenía la fila.
* **CA9 (Profesores no disponibles):** si `GET /api/professors` falla, el tutor se muestra de solo lectura con aviso y «Reintentar»; guardar el nombre o las clases no envía `tutorId` ni cambia los tutores.
* **CA10 (`409` en la interfaz):** con `409 PROFESSOR_ALREADY_TUTOR`, la página avisa, vuelve a pedir los profesores, marca la fila afectada con el foco y conserva lo escrito.
* **CA11 (Accesibilidad, responsive e i18n):** desplegable con nombre por fila («Tutor de la clase 2»), sin violaciones de `axe`, a 360 px sin desplazamiento horizontal y con los textos en `es.json` y `en.json`.

#### Fuera de alcance

* Mover a un profesor desde otro curso en el mismo guardado; elegir el tutor al crear un curso; avisar de que un tutor cambió mientras se editaba (gana el último guardado, como en US07); la clase del profesor en su propia ficha (US12).

#### Archivos, pruebas y documentación

* **Contrato:** `docs/api-spec.yml`, `frontend/src/api/generated/schema.ts` (generado), `frontend/src/api/schema.test.ts`.
* **Backend:** `application/courses/updateCourseRequest.ts`, `domain/course/courseUpdate.ts`, `domain/course/courseErrors.ts` (`ProfessorAlreadyTutor`), `domain/course/courseRepository.ts`, `infrastructure/prisma/prismaCourseRepository.ts` (lectura de profesores, tutores en dos fases, traducción del índice), `application/courses/updateCourse.ts` (eventos), `presentation/http/appError.ts` y `errorHandler.ts`.
* **Frontend:** `components/CourseForm.tsx`, `pages/EditCoursePage.tsx`, `validation/courseValidation.ts`, `services/coursesService.ts` y los textos. `test-fixtures/course-fields.json` gana `tutorId`.
* **Pruebas unitarias:** parser (omitido, `null`, UUID, inválido, duplicado); plan (asignar, quitar, mover, intercambiar, profesor de otro curso, inexistente, clase quitada que libera a su profesor, sin cambios); rutas con dobles (`409 PROFESSOR_ALREADY_TUTOR`).
* **Integración con PostgreSQL real:** mover, intercambiar, quitar, profesor de otro curso y de otro colegio, atomicidad (un `409` no deja nada escrito), dos `PUT` simultáneos de cursos distintos con el mismo profesor (`200` y `409`), `PUT` sin `tutorId` y el evento con `tutors_changed`.
* **Frontend:** `CourseForm` (opciones, etiqueta por fila, `DUPLICATE`, sin cambios, cuerpo con `tutorId`, sin profesores, `axe`), `EditCoursePage` (carga única, fallo de profesores en solo lectura, `409` con recarga y foco) y `coursesService.update`.
* **E2E:** asignar desde la edición y verlo en `/cursos` y `/profesores`; intercambiar dos tutores en un guardado; un `409` provocado por la API entre abrir y guardar; 360 px. Pruebas manuales con curl de los mismos casos, con la base de datos verificada y restaurada.
* **Documentación:** contrato, estándares (si se confirma el patrón «escritura en dos fases de una relación 1:1 con índice único»), los tres `CLAUDE.md`, `README.md`, `MODELO_DATOS.md`, arquitectura y las notas de US12 y US13 (el tutor también se cambia desde el curso).

#### Requisitos no funcionales

* **Seguridad:** el colegio sale de la identidad; un profesor de otro colegio es `NOT_FOUND`, sin revelar que existe; sin `requireRole` (`ADMIN` y `MEMBER`).
* **Rendimiento:** una consulta de profesores por `PUT` (`findMany` por los ids pedidos) y, como mucho, dos `updateMany` por fase, en la misma transacción.
* **Observabilidad:** eventos sin nombres, con `tutors_changed` y `reason`.

#### Definición de hecho

* Contrato primero y tipos al día; TDD con los tests anteriores en verde; cobertura ≥ 90 % backend y ≥ 80 % frontend; lint, typecheck y build limpios; E2E completo en verde; pruebas manuales con curl con la base de datos restaurada; documentación actualizada; PR integrada, despliegue verificado y prueba en un navegador real.

---

### US10: Ver listado de profesores

**Épica:** [3. Gestión de Profesores](#epica-3-gestion-de-profesores)

**Estimación:** 2 puntos de historia. Solo frontend: paginación en el navegador, total de profesores y la columna «Tutoría» sobre la página `/profesores` de US09; sin cambios de contrato, backend ni base de datos.

**Historia:** Como usuario del colegio (`ADMIN` o `MEMBER`), quiero ver todos los profesores de mi colegio, cuántos son y qué clase tutoriza cada uno, para tener una referencia de todo el personal docente.

**Depende de:** US09 (`/profesores`, `ProfessorsPage` y `GET /api/professors`, ya construidos).

> **Nota (US09, 2026-10-20):** ya existe `/profesores` con un listado mínimo (`ProfessorsPage`: tabla desde 768 px o tarjetas, columnas Nombre, Cargo y Clase, orden por apellidos y nombre del servicio, sin búsqueda ni paginación ni acciones por fila) y `GET /api/professors`, que devuelve todos los del colegio con `{ id, firstName, lastName, position, subjects, tutoredClass }`. Esta historia lo **amplía**, no lo crea. `subjects` es siempre `[]` hasta `US-PROF-ASSIGN`, y la columna de asignaturas debe esperar a esa historia. `tutoredClass` (`{ id, name, courseId, courseName }` o `null`) ya trae el curso, así que la tutoría se pinta sin una segunda petición.

---

#### Decisiones (validadas por la persona usuaria, 2026-10-21)

* **Paginación en el navegador, 20 por página.** `GET /api/professors` sigue devolviendo todos los profesores del colegio (decenas, rara vez más de 100) y la página muestra 20 con «Anterior» y «Siguiente». Sin parámetros nuevos en la API, como la búsqueda de cursos (US06); deja preparada la búsqueda en el navegador de US11.
* **Columna «Tutoría»** (antes «Clase»): «Tutor de 1º Primaria A» o «Sin tutoría» en gris (CA6 de la ficha original).
* **La búsqueda es de US11**, que se construirá después sobre esta paginación.
* **Nombres largos:** se parten en varias líneas, sin truncar ni `title` (un tooltip no funciona en pantallas táctiles); la tabla sigue desde 768 px y las tarjetas por debajo, sin desplazamiento horizontal.
* **Solo lo que existe** (como US06): la columna de asignaturas y su filtro (`US-PROF-ASSIGN`), los botones Editar y Borrar (US12, US13) y el filtro por estado `ACTIVE` (el profesor no tiene estado; US13 decidirá cómo se borra) no se muestran vacíos ni deshabilitados; cada historia los añade.
* **Sin recarga automática** (ni sondeo cada 3 s ni WebSocket): la lista se pide al abrir la página, como en `/cursos`.

#### Casos de uso y reglas de negocio

* **Acceso:** el de US09: cualquier usuario autenticado del colegio (`ADMIN` o `MEMBER`), solo los profesores de su colegio; desde «Profesores» en la cabecera.
* **Datos de cada profesor:** nombre como «Apellidos, Nombre» (cabecera de fila), **Cargo** («Director», «Jefe de estudios» o «Sin cargo», como hoy) y **Tutoría**: «Tutor de {curso} {clase}» («Tutor de 1º Primaria A») o «Sin tutoría» con el color secundario del tema (`text-body-secondary`, con contraste AA). Los nombres se muestran como texto plano.
* **Orden:** el del servidor, por apellidos y después nombre con `Intl.Collator('es')` (no cambia: es el orden de la columna «Apellidos, Nombre»). La paginación lo conserva.
* **Total:** encima del listado, «N profesores» (singular: «1 profesor»), siempre que haya alguno.
* **Paginación:** solo si hay más de 20 profesores. Debajo del listado, una navegación (`nav` con `aria-label` «Paginación de profesores») con «Anterior», el indicador «Página X de N» y «Siguiente»; «Anterior» está deshabilitado en la primera página y «Siguiente» en la última. Al cambiar de página, el indicador se anuncia (`aria-live="polite"`), el foco se queda en el botón pulsado (o pasa al otro si el pulsado se deshabilita) y la vista vuelve al principio del listado. La página vive solo en el estado de la página (ni en la URL ni en almacenamiento): al volver a `/profesores` se empieza en la primera.
* **Tras crear un profesor:** se vuelve a `/profesores` en la primera página con el aviso «Profesor «X» creado», como hoy.
* **Sin profesores:** como hoy: «Todavía no hay profesores» con «Crear profesor», sin total ni paginación.
* **Se mantienen de US09:** «Crear profesor» siempre visible, la carga única (también con `StrictMode`), el error con «Reintentar», la tabla desde 768 px y las tarjetas por debajo (solo una estructura en el árbol de accesibilidad).

#### Contrato de la API

* Sin cambios: `GET /api/professors` ya devuelve todos los profesores del colegio, ordenados, con `tutoredClass`.

#### Criterios de Aceptación

* **CA1 (Tabla en escritorio):** Dado un colegio con profesores y una ventana de 1280 px, cuando abro `/profesores`, entonces veo una tabla con las columnas Nombre, Cargo y Tutoría, el nombre como cabecera de fila y el total «N profesores».
* **CA2 (Tarjetas en móvil):** Dado una ventana de 360 px, cuando abro `/profesores`, entonces veo una tarjeta por profesor con los mismos datos, los nombres largos partidos en varias líneas y sin desplazamiento horizontal.
* **CA3 (Tutoría):** Dado que Ana tutoriza la clase A de «1º Primaria» y Luis ninguna, cuando veo el listado, entonces Ana muestra «Tutor de 1º Primaria A» y Luis «Sin tutoría».
* **CA4 (Paginación):** Dados 45 profesores, cuando abro `/profesores`, entonces veo los 20 primeros en el orden del servidor, «45 profesores», «Página 1 de 3» y «Anterior» deshabilitado; con «Siguiente» veo los 20 siguientes y «Página 2 de 3», y en la página 3, los 5 últimos con «Siguiente» deshabilitado.
* **CA5 (Sin paginación con 20 o menos):** Dados 20 profesores, cuando abro `/profesores`, entonces los veo todos y no hay controles de paginación.
* **CA6 (Vacío):** Dado un colegio sin profesores, cuando abro `/profesores`, entonces veo «Todavía no hay profesores» y «Crear profesor», sin total ni paginación.
* **CA7 (Acceso y aislamiento):** Un `MEMBER` ve los profesores de su colegio y ninguno de otro; sin sesión, `/profesores` lleva a `/login` y la API responde `401`.
* **CA8 (Accesibilidad):** La paginación es una `nav` con nombre, los botones tienen texto visible, el cambio de página se anuncia y el foco no se pierde; sin violaciones de `axe` en la tabla, las tarjetas, con paginación y vacía.
* **CA9 (i18n):** Todos los textos (el total con su plural, «Tutor de…», «Sin tutoría» y la paginación) están en `es.json` y `en.json`.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Frontend:** `pages/ProfessorsPage.tsx` (columna «Tutoría», total y paginación), un componente reutilizable `components/Pagination.tsx` (`page`, `pageCount`, `onChange` y el nombre accesible por parámetro), una función pura de paginación (`paginate(items, page, pageSize)` y `pageCountOf(total, pageSize)`) con sus tests, y `es.json`/`en.json` (`professors.fields.tutorship`, `professors.tutorOf`, `professors.noTutorship`, `professors.count_one`/`_other`, `pagination.*`). Las claves `professors.fields.class`, `professors.classOf` y `professors.noClass` se retiran si nadie más las usa.
* **E2E:** `cypress/e2e/professors.cy.ts` (los pasos que buscan «1º Primaria · A» y «Sin clase» pasan a «Tutor de 1º Primaria A» y «Sin tutoría»; un caso nuevo con más de 20 profesores creados por la API).

##### Requisitos de Testing (Pre-release)

* **Unitarios:** la función de paginación (página primera, intermedia, última incompleta, fuera de rango, lista vacía, exactamente 20).
* **Componente:** `ProfessorsPage` en los dos anchos (`installMatchMedia`): columnas, «Tutor de…» y «Sin tutoría», total con su plural, paginación con 45 y con 20, botones deshabilitados en los extremos, el anuncio del indicador, el foco tras pulsar, vacío sin total, y `axe` en cada estado. Los tests de US09 se actualizan a los textos nuevos conservando lo que comprobaban.
* **E2E:** 25 profesores creados por la API: total, «Página 1 de 2», «Siguiente» y la segunda página con 5; la tutoría visible; a 360 px sin desbordes.

##### Documentación

* `frontend/CLAUDE.md` (listado de profesores con paginación), `docs/frontend-standards.md` (paginación en el navegador accesible, si se confirma como patrón), `CLAUDE.md` raíz y `README.md` si cambia el estado, y las notas de US11 (la búsqueda filtra sobre todos y vuelve a la página 1), US12, US13 y `US-PROF-ASSIGN` (dónde se añaden las acciones y la columna de asignaturas).

##### Riesgos y Mitigaciones

* **Seguridad:** sin superficie nueva: no hay endpoints, parámetros ni datos nuevos.
* **Rendimiento:** la lista entera son decenas de filas; paginar en el navegador es un `slice`. Si algún colegio superase varios cientos, la paginación pasaría al servidor en otra historia.
* **Observabilidad:** sin eventos nuevos (leer no deja traza).
* **Regresiones:** cambian textos que comprueban los tests y el E2E de US09 y US09_b; se actualizan conservando su cobertura.

##### Fuera de alcance

* Búsqueda (US11), asignaturas y su filtro (`US-PROF-ASSIGN`), Editar y Borrar (US12, US13), estados del profesor, paginación en el servidor, recarga automática y guardar la página en la URL o en almacenamiento.

##### Definición de hecho

* Tests en verde con la cobertura mínima (90 % backend, 80 % frontend), `lint`, `typecheck` y `api:types:check`; E2E completo; PR integrada; despliegue y comprobación en producción (la API no cambia: con `curl` basta comprobar que `/profesores` sirve la SPA y el bundle nuevo).

### US11: Buscar profesores por nombre/apellido

**Épica:** [3. Gestión de Profesores](#epica-3-gestion-de-profesores)

**Estimación:** 2 puntos de historia. Solo frontend: un campo de búsqueda y una función pura de filtrado sobre el listado paginado de US10; sin cambios de contrato, backend ni base de datos.

**Historia:** Como usuario del colegio (`ADMIN` o `MEMBER`), quiero buscar profesores por su nombre o sus apellidos, para encontrar rápidamente a un docente concreto.

**Depende de:** US10 (`/profesores` con total, tutoría y paginación en el navegador) y US06 (la técnica de búsqueda de `/cursos`: `normalizeForSearch`, «Mostrando N de M», «Limpiar búsqueda»).

> **Nota (US09, 2026-10-20):** la búsqueda se añade a `ProfessorsPage` sobre el listado de US10, que hoy no tiene campo de búsqueda. El nombre y el apellido siguen las reglas del registro, sin unicidad (puede haber dos «José García»), y el listado llega ya ordenado por apellidos y nombre con `Intl.Collator('es')`; si se filtra en el navegador, hay que reutilizar la técnica sin acentos ni mayúsculas de `matchesCourseSearch` (cursos, US06).

> **Nota (US10, 2026-10-21):** `/profesores` ya pagina en el navegador (20 por página, `utils/pagination.ts` y `components/Pagination`, con el indicador anunciado y el foco conservado) y muestra el total («N profesores»). La búsqueda de esta historia filtra sobre **todos** los profesores ya cargados y después pagina el resultado: al cambiar el texto, la página vuelve a la primera (la página vive en `useState` y se acota al pintar), el total pasa a «Mostrando N de M profesores» como en `/cursos` (US06) y `Pagination` se reutiliza sin cambios. `GET /api/professors` sigue sin parámetros (la ficha original proponía `/search` en el servidor; con decenas de profesores no hace falta).

---

#### Decisiones (validadas por la persona usuaria, 2026-10-21)

* **Busca por nombre y apellidos.** No busca por cargo ni por tutoría. La búsqueda por **asignatura** de la ficha original llega con `US-PROF-ASSIGN`, cuando existan las asignaturas.
* **Cada palabra, en cualquier orden.** El texto se parte en palabras y un profesor coincide si **todas** aparecen (como parte de una palabra) en su nombre o en sus apellidos: «ana garcia», «garcia ana» y «gar an» encuentran a «García, Ana».
* **Filtra al escribir, en el navegador, sin retraso**: todo está cargado, así que no hay debounce, spinner, límite de búsquedas por minuto ni endpoint `/search`.
* **Sin recarga automática** (ni sondeo ni WebSocket): como en US06 y US10.

#### Casos de uso y reglas de negocio

* **Acceso:** el de US10: cualquier usuario autenticado del colegio, solo los profesores de su colegio.
* **Campo:** `input type="search"` con la etiqueta visible «Buscar por nombre o apellidos», encima del listado y solo si el colegio tiene algún profesor; como mucho 100 caracteres (`maxLength`). El texto vive solo en el estado de la página (ni en la URL ni en almacenamiento).
* **Coincidencia:** sin distinguir mayúsculas, acentos ni espacios sobrantes (`normalizeForSearch` de US06: «garcia» encuentra «García»; la `ñ` busca como `n`); guiones y apóstrofos son texto normal («García-López» y «O'Neill» se encuentran escribiéndolos, y «lopez» encuentra «García-López»). Un texto vacío o solo con espacios no filtra.
* **Orden:** el del servicio (apellidos y nombre); el filtro lo conserva.
* **Resultado y paginación:** el filtro se aplica a **todos** los profesores y después se pagina de 20 en 20. Cada cambio del texto vuelve a la primera página. Mientras hay texto, la línea del total pasa a ser un `role="status"` con «Mostrando N de M profesores»; sin texto, vuelve a «M profesores».
* **Sin resultados:** «No hay profesores que coincidan con «X»» (el texto buscado como texto plano) y un botón «Limpiar búsqueda» que vacía el campo, vuelve a mostrar todos y devuelve el foco al campo. Sin paginación.
* **Sin profesores:** como hoy: «Todavía no hay profesores» con «Crear profesor», sin campo de búsqueda.
* **Se mantienen de US10:** tutoría, paginación, tabla o tarjetas, carga única, «Reintentar», aviso de creación.

#### Contrato de la API

* Sin cambios: `GET /api/professors` sigue devolviendo todos los profesores del colegio, sin parámetros.

#### Criterios de Aceptación

* **CA1 (Por nombre):** Dados «García, Ana», «López, Juana» y «Pérez, Juan», cuando escribo «juan», entonces veo «López, Juana» y «Pérez, Juan», en ese orden, y «Mostrando 2 de 3 profesores».
* **CA2 (Por apellido):** Cuando escribo «hern», entonces veo los profesores cuyo nombre o apellidos contienen «hern» («Hernández», «Hernán»).
* **CA3 (Mayúsculas y acentos):** «GARCIA», «garcía» y «Garcia» encuentran a «García, Ana».
* **CA4 (Varias palabras en cualquier orden):** «ana garcia» y «garcia ana» encuentran a «García, Ana» y no a «García, Luis» ni a «Pérez, Ana».
* **CA5 (Guiones y apóstrofos):** «garcía-lópez» y «lopez» encuentran a «García-López, José María»; «o'neill» encuentra a «O'Neill, Mary».
* **CA6 (Sin resultados):** Cuando busco «zzz», entonces veo «No hay profesores que coincidan con «zzz»» y «Limpiar búsqueda», sin paginación; al pulsarlo, el campo se vacía, vuelven todos los profesores y el foco vuelve al campo.
* **CA7 (Búsqueda y paginación):** Dados 45 profesores, 25 de ellos de apellido «Martín», cuando busco «martin», entonces veo los 20 primeros, «Mostrando 25 de 45 profesores» y «Página 1 de 2»; si estaba en la página 2 y cambio el texto, vuelvo a la página 1.
* **CA8 (Texto vacío):** Un texto vacío o solo con espacios muestra todos los profesores y «M profesores», sin `role="status"`.
* **CA9 (Límite):** El campo no admite más de 100 caracteres.
* **CA10 (Sin profesores):** Un colegio sin profesores no muestra el campo de búsqueda.
* **CA11 (Acceso):** Un `MEMBER` busca entre los profesores de su colegio; sin sesión, `/profesores` lleva a `/login`.
* **CA12 (Accesibilidad e i18n):** El campo tiene etiqueta visible, el resultado se anuncia, el texto buscado se muestra como texto plano; sin violaciones de `axe` con búsqueda, sin resultados y con paginación, en tabla y en tarjetas; todos los textos en `es.json` y `en.json`.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Frontend:** una función pura `utils/professorSearch.ts` (`matchesProfessorSearch({ firstName, lastName }, query)`, que reutiliza `normalizeForSearch` de `utils/courseSearch.ts`, parte el texto en palabras y exige todas) con sus tests; `pages/ProfessorsPage.tsx` (campo, filtro antes de paginar, vuelta a la página 1, «Mostrando N de M», sin resultados con «Limpiar búsqueda» y el foco); `es.json`/`en.json` (`professors.search.label`, `.results`, `.noResults`, `.clear`).
* **E2E:** `cypress/e2e/professors.cy.ts` (buscar con y sin acentos, varias palabras, sin resultados y limpiar, y la búsqueda con paginación).

##### Requisitos de Testing (Pre-release)

* **Unitarios:** `matchesProfessorSearch` (nombre, apellido, mayúsculas, acentos, `ñ`, varias palabras en cualquier orden, una palabra que no está, guiones, apóstrofos, texto vacío y solo espacios).
* **Componente:** `ProfessorsPage` en los dos anchos: el campo solo con profesores; filtrado al escribir en el orden del servicio; «Mostrando N de M» como `role="status"`; vuelta a la página 1; sin resultados con «Limpiar búsqueda» y el foco; el texto buscado como texto plano; `maxLength`; `axe` en cada estado.
* **E2E:** con profesores creados por la API: búsqueda con acentos y varias palabras, sin resultados y limpiar, y la búsqueda que reduce más de 20 a una página.

##### Documentación

* `frontend/CLAUDE.md` (búsqueda de profesores), `docs/frontend-standards.md` (búsqueda por palabras en cualquier orden, si se confirma como patrón), `README.md`, arquitectura (el componente de profesores) y la nota de `US-PROF-ASSIGN` (añadir las asignaturas a `matchesProfessorSearch`).

##### Riesgos y Mitigaciones

* **Seguridad:** sin superficie nueva: el filtro no envía nada al servidor y el texto buscado se pinta como texto plano.
* **Rendimiento:** filtro lineal sobre decenas de profesores en cada pulsación; sin coste de red.
* **Observabilidad:** sin eventos nuevos.
* **Regresiones:** el total de US10 cambia de forma mientras hay búsqueda; los tests de US10 se conservan.

##### Fuera de alcance

* Búsqueda por asignatura (`US-PROF-ASSIGN`), por cargo o por tutoría; búsqueda en el servidor; debounce, spinner y límite de búsquedas; recarga automática; guardar la búsqueda en la URL o en almacenamiento; tolerancia a erratas.

##### Definición de hecho

* Tests en verde con la cobertura mínima (90 % backend, 80 % frontend), `lint`, `typecheck` y `api:types:check`; E2E completo; PR integrada; despliegue y comprobación en producción (la API no cambia: con `curl` basta comprobar que `/profesores` sirve la SPA y el bundle nuevo, y la regresión de `GET /api/professors`).

### US12: Editar profesor

**Épica:** [3. Gestión de Profesores](#epica-3-gestion-de-profesores)

**Estimación:** 5 puntos de historia. Dos endpoints nuevos (`GET` y `PUT /api/professors/{id}`), el movimiento de la tutoría en una transacción, un formulario compartido con la creación y la página de edición; sin migraciones.

**Historia:** Como usuario del colegio (`ADMIN` o `MEMBER`), quiero editar el nombre, los apellidos, el cargo y la clase que tutoriza un profesor, para mantener su información al día.

**Depende de:** US09 (profesores, `classes.tutor_id`, `CreateProfessorPage`), US10 y US11 (el listado al que se vuelve) y US07 (el patrón de edición de cursos: página propia, estado final en el `PUT`, «Guardar» solo con cambios, «gana el último guardado»).

> **Nota (US09, 2026-10-20):** el profesor es un registro del colegio sin `status` ni `deletedAt`, con `position` opcional y **sin email**. La clase que tutoriza no es una columna suya sino `classes.tutor_id` (nulo, **único**, `ON DELETE SET NULL`): cambiarla es **mover** el `tutor_id` en una sola transacción, liberando la clase anterior y asignando la nueva con el mismo `UPDATE` condicionado de `PrismaProfessorRepository.create` (la clase existe, es del colegio y no tiene tutor; si no, `ClassNotFound` → `400` con `classId: NOT_FOUND` o `ClassAlreadyHasTutor` → `409 CLASS_ALREADY_HAS_TUTOR`). Quitar la tutoría es poner el `tutor_id` de esa clase a `NULL`. Reutilizar `validateProfessor` y `professor-fields.json` para las validaciones, y el patrón de «Clases libres agrupadas por curso» de `CreateProfessorPage` (si se edita un profesor que ya tiene clase, esa clase debe seguir ofreciéndose).

> **Nota (US10, 2026-10-21):** el botón «Editar» se añade a la tabla y a las tarjetas de `ProfessorsPage` como en `/cursos` (un `Link` con `aria-label` «Editar {nombre}» y la columna «Acciones» solo desde que exista). La columna de la clase se llama «Tutoría» y muestra «Tutor de 1º Primaria A» o «Sin tutoría»; al volver de editar, el aviso viaja en el estado de la navegación y la lista vuelve a la primera página.

> **Nota (US09_b, 2026-10-20):** el tutor de una clase también se cambia desde la edición del curso, así que la ficha del profesor no es el único camino. Si US12 permite cambiar la clase del profesor, debe usar la misma regla: un profesor tutoriza una sola clase (`classes.tutor_id` único) y la escritura va en dos fases (primero se libera la clase anterior, después se asigna), con `409 PROFESSOR_ALREADY_TUTOR` si la clase destino ya tiene otro profesor en otro curso. Reutiliza `planCourseUpdate(current, requested, tutors)` y la traducción de `classes_tutor_id_key` a `ProfessorAlreadyTutor` en lugar de duplicarlas.

> **Nota (US11, 2026-10-21):** al volver de editar a `/profesores` no se conserva el texto de búsqueda: vive en el estado de la página y se empieza sin filtro y en la primera página. Si el profesor editado cambia de nombre, la lista se vuelve a pedir y se filtra de nuevo con `matchesProfessorSearch`, sin tocar la función.

---

#### Decisiones (validadas por la persona usuaria, 2026-10-21)

* **Página propia `/profesores/:id/editar`**, como la edición de cursos (US07), con un formulario compartido con la creación (se extrae de `CreateProfessorPage`).
* **La tutoría puede ser cualquier clase del colegio, moviendo al tutor.** Se ofrecen «Sin clase», las clases libres, la que ya tutoriza y también las que tienen **otro tutor**; elegir una de estas hace que, al guardar, ese otro profesor **deje de tutorizarla** (queda «Sin tutoría»). Esto sustituye, para la edición, la regla de US09 «solo clases libres» (que se mantiene al **crear**) y la nota de US09_b sobre `409` en la clase destino. Para que no sea una sorpresa, la opción muestra el tutor actual y, al elegirla, un aviso bajo el campo dice quién la perderá.
* **Gana el último guardado** (como US07): sin control de versión ni aviso de «actualizado por otro usuario». Solo son errores que el profesor ya no exista (`404`) y lo que el servidor rechace por validación.
* **«Cancelar» vuelve sin preguntar**, aunque haya cambios (como US07).
* **Solo lo que existe:** sin asignaturas (`US-PROF-ASSIGN`), sin estados ni fechas editables, sin email.

#### Casos de uso y reglas de negocio

* **Acceso:** cualquier usuario autenticado del colegio (`ADMIN` o `MEMBER`). Desde `/profesores`, cada fila y cada tarjeta lleva un enlace «Editar» (`aria-label` «Editar {Apellidos, Nombre}», que contiene el texto visible) en una columna nueva «Acciones». Un profesor de otro colegio, uno inexistente y un `id` que no es UUID son el mismo «Este profesor no existe o ya no está disponible», con un enlace a «Profesores».
* **Campos editables:** nombre y apellidos (reglas de US09, `professor-fields.json`), cargo («Sin cargo», «Director» o «Jefe de estudios») y clase que tutoriza («Sin clase» o una clase del colegio). Se precargan con los valores actuales.
* **Desplegable de la clase:** agrupado por curso con `optgroup`, con todas las clases del colegio: las libres con su nombre («A»), la del propio profesor con su nombre y las de otro tutor como «A · tutor: Ana García». Si se elige una de otro tutor, bajo el campo aparece (ligado por `aria-describedby`) «Al guardar, Ana García dejará de ser tutor de 1º Primaria A». Si los cursos no se pueden cargar, el campo se desactiva con una explicación y **la tutoría no se envía** (se conserva la actual), y el resto del formulario sigue sirviendo.
* **«Guardar»** solo se habilita si hay cambios reales (nombre o apellidos limpios distintos, otro cargo u otra clase) y se protege contra el doble envío. **«Cancelar»** vuelve a `/profesores` sin preguntar.
* **Guardar:** `PUT /api/professors/{id}` con el **estado final** `{ firstName, lastName, position, classId }` (`position` y `classId` `null` = ninguno; `classId` ausente = no tocar la tutoría). En una transacción: actualiza el profesor y, si la clase cambia, libera la clase que tutorizaba (`tutor_id` a `NULL`), y asigna la nueva: si tenía otro tutor, ese profesor la pierde. La clase debe existir y ser del colegio (si no, `400` con `classId: NOT_FOUND`).
* **Tras guardar:** vuelve a `/profesores` (con `replace`) con el aviso «Profesor «Ana García» actualizado» y, si movió a otro tutor, «… Luis Pérez queda sin tutoría».
* **Errores:** un `400` marca sus campos; un `404` muestra «Este profesor no existe o ya no está disponible»; un `503` o error de red, «No se pudo guardar el profesor. Inténtalo de nuevo» conservando lo escrito.
* **Los alumnos** (US14) siguen en su clase aunque cambie el tutor: no hay alumnos todavía y esta historia no los toca.

#### Contrato de la API (`docs/api-spec.yml`, primero)

* **`GET /api/professors/{id}`** → `200` con `{ professor }` (la misma forma que en el listado: `id`, `firstName`, `lastName`, `position`, `subjects: []`, `tutoredClass`); `404 NOT_FOUND` para otro colegio, inexistente o `id` no UUID; `401` sin sesión.
* **`PUT /api/professors/{id}`** con `UpdateProfessorRequest` `{ firstName, lastName, position?: Position | null, classId?: uuid | null }` → `200` con `{ professor, replacedTutor: { id, firstName, lastName } | null }` (el profesor que perdió la tutoría, si lo hubo); `400 VALIDATION_ERROR` (`firstName`, `lastName`, `position`, `classId` con `INVALID_FORMAT` o `NOT_FOUND`); `404`; `401`. Sin códigos de error nuevos.

#### Criterios de Aceptación

* **CA1 (Abrir la edición):** Dado el listado de profesores, cuando pulso «Editar» en «García, Ana», entonces llego a `/profesores/<id>/editar` con su nombre, apellidos, cargo y clase precargados y «Guardar» deshabilitado.
* **CA2 (Cambiar nombre y cargo):** Cuando cambio «Ana» por «Ana María» y el cargo a «Director» y guardo, entonces vuelvo al listado con «Profesor «Ana María García» actualizado» y la fila muestra los datos nuevos.
* **CA3 (Validación):** Con el nombre vacío o de más de 100 caracteres, al guardar veo el error bajo el campo, el foco en él y no se envía nada; las reglas son las de la creación.
* **CA4 (Sin cambios):** Si no cambio nada, o cambio algo y lo deshago (o solo añado espacios), «Guardar» sigue deshabilitado.
* **CA5 (Cambiar a una clase libre):** Dado que Ana tutoriza 1º A y 1º B está libre, cuando elijo 1º B y guardo, entonces Ana tutoriza 1º B y 1º A queda sin tutor.
* **CA6 (Quitar la tutoría):** Cuando elijo «Sin clase» y guardo, entonces Ana queda «Sin tutoría» y su clase sin tutor.
* **CA7 (Mover al tutor de otra clase):** Dado que Luis tutoriza 2º A, cuando edito a Ana, veo «A · tutor: Luis Pérez» en «2º Primaria»; al elegirla aparece «Al guardar, Luis Pérez dejará de ser tutor de 2º Primaria A»; al guardar, Ana tutoriza 2º A, su clase anterior queda libre, Luis queda «Sin tutoría» y el aviso del listado lo dice.
* **CA8 (Último guardado gana):** Si otra persona cambió el profesor mientras yo lo editaba, mi guardado lo sustituye sin aviso; si otra persona le dio la clase elegida a un tercero, al guardar la clase pasa a Ana y el tercero la pierde.
* **CA9 (Profesor que ya no existe):** Con un `id` de otro colegio, inexistente o mal formado, veo «Este profesor no existe o ya no está disponible» y un enlace a «Profesores»; si deja de existir mientras edito, al guardar veo lo mismo.
* **CA10 (Clase que no existe):** Si la clase elegida desaparece (se borró su curso) antes de guardar, el `400` marca el campo de la clase y no se guarda nada.
* **CA11 (Cursos no disponibles):** Si los cursos no cargan, el campo de la clase está desactivado con una explicación, puedo guardar el resto y la tutoría no cambia.
* **CA12 (Atomicidad):** Si algo falla al guardar, no cambia ni el profesor ni ninguna clase.
* **CA13 (Acceso y aislamiento):** Un `MEMBER` puede editar; por la API, un profesor de otro colegio da `404` y no se modifica; sin sesión, `401` y `/login`.
* **CA14 (Accesibilidad, responsive e i18n):** etiquetas visibles, errores ligados a su campo, el aviso de movimiento ligado al desplegable, «Editar» con nombre accesible por fila; sin violaciones de `axe`; sin desplazamiento horizontal a 360 px; textos en `es.json` y `en.json`.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Contrato:** `docs/api-spec.yml` (los dos endpoints, `UpdateProfessorRequest` y la respuesta con `replacedTutor`), `npm run api:types -w frontend` y `api/schema.test.ts`.
* **Backend:** `application/professors/getProfessor.ts` y `updateProfessor.ts` (con `parseUpdateProfessorRequest`, que reutiliza las reglas de `createProfessorRequest`), los métodos `findById` y `update` del puerto `ProfessorRepository` y de `PrismaProfessorRepository` (transacción: bloquear la fila del profesor con `FOR UPDATE`, validar la clase en el colegio, actualizar el profesor, liberar su clase anterior, quitar la clase destino a su tutor anterior y asignarla, en ese orden), `professorsRouter` (dos rutas con `parseProfessorId`), eventos `PROFESSOR_UPDATED` (`school_id`, `actor_id`, `professor_id`, `changed_fields`, `tutor_changed`, `replaced_tutor`) y `PROFESSOR_UPDATE_REJECTED` (`reason: not_found | class_not_found`), sin nombres.
* **Frontend:** `components/ProfessorForm.tsx` extraído de `CreateProfessorPage` (con `initialValues`, `requireChanges` y las clases con su tutor), `pages/EditProfessorPage.tsx`, `professorsService.get` y `update`, `hasProfessorChanges` en `validation/professorValidation.ts`, la columna «Acciones» con «Editar» en `ProfessorsPage`, la ruta en `App.tsx` y los textos (`professors.edit.*`, `professors.updated`, `professors.actions`).
* **E2E:** `cypress/e2e/professors.cy.ts` (editar nombre y cargo, cambiar de clase, quitar la tutoría, mover al tutor de otra clase con su aviso, un `id` inexistente, 360 px).

##### Requisitos de Testing (Pre-release)

* **Unitarios backend:** el parser (reglas compartidas, `classId` y `position` nulos y ausentes); el caso de uso (`404`, `ClassNotFound` → `400`, el evento con lo cambiado); el router (`404` para un `id` no UUID).
* **Integración:** cambiar nombre y cargo; mover a una clase libre; quitar la tutoría; tomar la clase de otro profesor (que queda sin tutoría) en la misma transacción; clase de otro colegio (`400`, nada cambia); profesor de otro colegio (`404`); la clase no cambia con `classId` ausente; atomicidad (un disparador temporal que hace fallar la asignación deja todo como estaba); dos ediciones simultáneas que toman la misma clase terminan con un solo tutor y sin `500`.
* **Frontend:** `ProfessorForm` en creación (los tests de US09 siguen pasando) y en edición (precarga, «Guardar» solo con cambios, clases con tutor y su aviso); `EditProfessorPage` (carga única, `404`, error con «Reintentar», guardar, aviso de vuelta, cursos no disponibles); «Editar» en las filas y tarjetas; `axe`.
* **E2E:** los casos de «Archivos a modificar».

##### Documentación

* `docs/api-spec.yml`, `backend/CLAUDE.md` y `frontend/CLAUDE.md`, `docs/backend-standards.md` (mover una relación 1:1 quitándosela a otro registro en una transacción) y `docs/frontend-standards.md` (opción que desplaza a otro registro, con aviso), `README.md`, `MODELO_DATOS.md` (cómo se escribe `classes.tutor_id` desde la edición del profesor), la arquitectura y las notas de US13 y `US-PROF-ASSIGN`.

##### Riesgos y Mitigaciones

* **Seguridad:** el colegio sale de la identidad; la clase se valida dentro del colegio; un profesor de otro colegio es `404` indistinguible.
* **Concurrencia:** se bloquea la fila del profesor; la clase destino se escribe con el profesor bloqueado y el índice único `classes_tutor_id_key` es la red de seguridad (una violación por una carrera con otra escritura se traduce a `409 PROFESSOR_ALREADY_TUTOR`, sin `500` y sin cambiar nada).
* **Producto:** mover un tutor sin querer → la opción muestra el tutor actual, el aviso previo lo dice y el aviso posterior nombra al profesor afectado.
* **Observabilidad:** `PROFESSOR_UPDATED` con `replaced_tutor` permite rastrear tutorías quitadas.

##### Fuera de alcance

* Asignaturas (`US-PROF-ASSIGN`) y su revisión de asignaciones; estados, fechas y email; control de versión o aviso de «actualizado por otro usuario»; confirmación al cancelar; borrar un profesor (US13); avisos a alumnos (US14).

##### Definición de hecho

* Tests en verde con la cobertura mínima (90 % backend, 80 % frontend), `lint`, `typecheck` y `api:types:check`; pruebas con `curl`; E2E completo; PR integrada; despliegue y comprobación en producción.

### US13: Borrar profesor

**Épica:** [3. Gestión de Profesores](#epica-3-gestion-de-profesores)

**Estimación:** 3 puntos de historia. Un endpoint nuevo (`DELETE /api/professors/{id}`) con el patrón del borrado de cursos (US08), un diálogo de confirmación que consulta la tutoría al abrirse y el botón «Borrar» en el listado; sin migraciones.

**Historia:** Como usuario del colegio (`ADMIN` o `MEMBER`), quiero borrar un profesor, para eliminar los registros de docentes que ya no trabajan en el colegio.

**Depende de:** US09 (profesores y `classes.tutor_id` con `ON DELETE SET NULL`), US10 y US11 (el listado con paginación y búsqueda), US12 (`GET /api/professors/{id}`, `ProfessorNotFound` y la columna «Acciones») y US08 (el patrón de borrado: diálogo, bloqueo, `200` con lo borrado y foco al título).

> **Nota (US09, 2026-10-20):** borrar un profesor con clase **no debe fallar ni borrar la clase**: `classes.tutor_id` es `ON DELETE SET NULL`, así que la clase vuelve a quedar «Sin tutor». Esta historia decide si el borrado es real o lógico (US08 borró de verdad; `professors` no tiene `status` ni `deletedAt`) y, si es real, qué informa el diálogo (la clase que quedaría sin tutor, vía `tutoredClass`). Los cursos y las clases se borran sin tocar a los profesores, y eso ya está cubierto por los tests de US09.

> **Nota (US10, 2026-10-21):** el botón «Borrar» se añade junto a «Editar» (US12) en la tabla y en las tarjetas. Al borrar un profesor, la lista cargada se actualiza sin volver a pedirla, el total se recalcula y la página actual se acota si la última queda vacía (`Math.min(page, pageCount)` al pintar, ya hecho en US10); el foco, como en US08, pasa al título.

> **Nota (US09_b, 2026-10-20):** el desplegable de tutor de la edición del curso (`CourseForm` con `tutorOptions`) se alimenta de `GET /api/professors`; al borrar un profesor, esa lista y los tutores de `/cursos` deben reflejarlo sin pasos extra, porque la clase vuelve a «Sin tutor» por `ON DELETE SET NULL`. Un `PUT` del curso con un `tutorId` de un profesor ya borrado da `400` con `classes[<i>].tutorId: NOT_FOUND` (es el caso de una edición abierta mientras otra persona borra al profesor).

> **Nota (US05, 2026-10-19):** la cascada que describía US05 (CA11 antiguo) es de esta historia: al borrar un profesor, sus clases quedan «Sin tutor» (`tutor_id` a `NULL`) y se retira de los horarios en los que esté asignado.

> **Nota (US11, 2026-10-21):** al borrar un profesor con una búsqueda activa, la lista cargada se actualiza sin volver a pedirla y el filtro se aplica de nuevo: el «Mostrando N de M» se recalcula y, si el borrado deja el resultado vacío, aparece «No hay profesores que coincidan con «X»» con «Limpiar búsqueda». El foco, como en US08, pasa al título.

> **Nota (US12, 2026-10-21):** `ProfessorsPage` ya tiene la columna «Acciones» con «Editar» (`Link` con `aria-label` «Editar {Apellidos, Nombre}»): «Borrar» se añade en la misma celda y al pie de la tarjeta, como en `/cursos`. `GET /api/professors/{id}` y `ProfessorNotFound` (`404` indistinguible para otro colegio, inexistente o id mal formado) ya existen y el `DELETE` los reutiliza; `EditProfessorPage` ya trata un `404` al guardar como «Este profesor no existe o ya no está disponible», que es lo que verá quien edite a un profesor que otra persona acaba de borrar. Borrar a un profesor deja libre su clase por `ON DELETE SET NULL`, sin tocar `classes.tutor_id` a mano, y la edición de otro profesor que pida esa clase seguirá funcionando (la clase ya está libre).

---

#### Decisiones (validadas por la persona usuaria, 2026-10-21)

* **Borrado real**, como los cursos (US08): se borra la fila del profesor y su clase queda «Sin tutor» por `ON DELETE SET NULL`. Sin migración, sin papelera ni deshacer; el diálogo dice que no se puede deshacer.
* **El diálogo pide la tutoría al abrirse** (`GET /api/professors/{id}`), como el diálogo de borrar curso pide su impacto: muestra datos al día y, si el profesor ya no existe, lo dice.
* **Sin límite de borrados por minuto:** ningún otro CRUD del colegio lo tiene; la confirmación protege del borrado accidental.
* **Ajustes a lo que ya rige en el proyecto:** sin sincronización en tiempo real (como US06–US12; la lista se actualiza al borrar y al volver a abrirla), el log **sin el nombre** del profesor (regla de todos los eventos) y sin alumnos ni horarios todavía (US14 y US-ALGO decidirán qué pasa con ellos; hoy no hay nada que retirar).

#### Casos de uso y reglas de negocio

* **Acceso:** cualquier usuario autenticado del colegio (`ADMIN` o `MEMBER`), desde un botón «Borrar» (`outline-danger`, `aria-label` «Borrar {Apellidos, Nombre}», que contiene el texto visible) junto a «Editar» en cada fila y cada tarjeta de `/profesores`.
* **Diálogo de confirmación** (`components/DeleteProfessorModal`, como `DeleteCourseModal`): título «¿Borrar a {Nombre Apellidos}?»; al abrirse pide el profesor una sola vez (también con `StrictMode`) y muestra «Comprobando…» con «Borrar profesor» deshabilitado; después, si tutoriza una clase, «Tutoriza {curso} {clase}: la clase quedará sin tutor»; siempre «Esta acción no se puede deshacer». Si la consulta falla, un `role="alert"` con «Reintentar» y el botón sigue deshabilitado (no se confirma a ciegas). Foco inicial en «Cancelar»; sin «X» de cabecera.
* **Borrar:** `DELETE /api/professors/{id}` en una transacción con la fila del profesor bloqueada (`FOR UPDATE`): lee la clase que tutoriza y borra el profesor; la base de datos deja su clase sin tutor (`ON DELETE SET NULL`). Responde `200` con **lo que se liberó de verdad** (`{ deleted: { freedClass: { id, name, courseName } | null } }`), aunque la tutoría cambiara después de abrir el diálogo.
* **Mientras se borra:** «Borrando…» y botones deshabilitados, con guarda síncrona contra la doble pulsación; ni Escape ni el clic fuera cierran el diálogo.
* **Tras borrar:** el diálogo se cierra, la lista cargada quita al profesor **sin volver a pedirla** (el total, la búsqueda y la página se recalculan; la página se acota si la última queda vacía), un `role="status"` dice «Profesor «Ana García» eliminado» o «… La clase 1º Primaria A queda sin tutor», y el foco pasa al título (un turno después de cerrar el diálogo, como US08).
* **El profesor ya no existe** (otra persona lo borró, o es de otro colegio): un `404` al consultar o al borrar cierra el diálogo, muestra «Ese profesor ya no existe» y vuelve a pedir la lista. Un fallo al borrar se queda en el diálogo con un `role="alert"` («No se pudo borrar el profesor. Inténtalo de nuevo») y se puede reintentar.
* **Concurrencia:** con el bloqueo, una edición (`PUT`) simultánea espera y, si el borrado confirma primero, responde `404`; de dos borrados simultáneos, uno responde `200` y el otro `404`. La edición de un curso (US09_b) que pida a ese profesor como tutor recibe `400` con `classes[<i>].tutorId: NOT_FOUND`.
* **Observabilidad:** evento `PROFESSOR_DELETED` (`school_id`, `actor_id`, `professor_id`, `freed_class`), nunca nombres; un `404` no deja evento.

#### Contrato de la API (`docs/api-spec.yml`, primero)

* **`DELETE /api/professors/{id}`** (`deleteProfessor`, Bearer): `200` con `{ deleted: { freedClass: { id, name, courseName } | null } }`; `401`; `404 NOT_FOUND` (otro colegio, inexistente o id no UUID, sin distinguir); `500`; `503`. Sin cuerpo en la petición ni códigos de error nuevos.

#### Criterios de Aceptación

* **CA1 (Botón y diálogo):** Dado el listado, cuando pulso «Borrar» en «García, Ana», entonces se abre un diálogo «¿Borrar a Ana García?» con «Comprobando…», el foco en «Cancelar» y «Borrar profesor» deshabilitado hasta conocer su tutoría.
* **CA2 (Sin tutoría):** Dado un profesor sin clase, el diálogo dice «Esta acción no se puede deshacer» sin más advertencias; al confirmar se borra, el diálogo se cierra, desaparece de la lista sin volver a pedirla, veo «Profesor «Ana García» eliminado» y el foco está en el título.
* **CA3 (Con tutoría):** Dado que Ana tutoriza 1º Primaria A, el diálogo dice «Tutoriza 1º Primaria A: la clase quedará sin tutor»; al confirmar, el aviso dice «… La clase 1º Primaria A queda sin tutor» y en `/cursos` la clase aparece «Sin tutor».
* **CA4 (Datos al día):** Si otra persona cambió la tutoría de Ana después de cargar la lista, el diálogo muestra la tutoría actual (la consulta al abrirse), y el aviso final, lo que se liberó de verdad.
* **CA5 (Cancelar):** «Cancelar» o Escape cierran el diálogo sin borrar nada y devuelven el foco al botón «Borrar».
* **CA6 (Doble pulsación y espera):** Durante el borrado veo «Borrando…», los botones están deshabilitados, Escape no cierra y se envía una única petición.
* **CA7 (Ya no existe):** Si el profesor ya no existe al abrir el diálogo o al confirmar, el diálogo se cierra, veo «Ese profesor ya no existe» y la lista se vuelve a pedir.
* **CA8 (Fallo):** Si la consulta del diálogo falla, veo un aviso con «Reintentar» y no puedo confirmar; si el borrado falla, veo «No se pudo borrar el profesor. Inténtalo de nuevo» en el diálogo y puedo reintentar.
* **CA9 (Búsqueda y paginación):** Con una búsqueda activa, borrar recalcula «Mostrando N de M»; si era el único resultado, aparece el mensaje sin resultados; si era el único de la última página, se muestra la anterior.
* **CA10 (Concurrencia):** De dos borrados simultáneos del mismo profesor, uno responde `200` y el otro `404`; una edición simultánea espera y, si el borrado confirma primero, responde `404`.
* **CA11 (Atomicidad):** Si el borrado falla a mitad (un disparador en la prueba), el profesor y su tutoría siguen como estaban.
* **CA12 (Acceso y aislamiento):** Un `MEMBER` puede borrar; un profesor de otro colegio da `404` y no se borra; sin sesión, `401`.
* **CA13 (Accesibilidad, responsive e i18n):** el diálogo tiene nombre (su título), foco inicial y retorno de foco; «Borrar» con nombre accesible por fila; sin violaciones de `axe` (comprobando, con tutoría, sin tutoría, con error, borrando); sin desplazamiento horizontal a 360 px; textos en `es.json` y `en.json`.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Contrato:** `docs/api-spec.yml` (`deleteProfessor` y `DeleteProfessorResponse`), `npm run api:types -w frontend` y `api/schema.test.ts`.
* **Backend:** `application/professors/deleteProfessor.ts` (`DeleteProfessor`), el método `delete(schoolId, professorId)` del puerto `ProfessorRepository` y de `PrismaProfessorRepository` (bloqueo de la fila, lectura de la clase y borrado; `null` si no está en el colegio), la ruta `DELETE /:id` en `professorsRouter` con `parseProfessorId`, la raíz de composición y el evento `PROFESSOR_DELETED`.
* **Frontend:** `professorsService.delete`, `components/DeleteProfessorModal.tsx` (con `professorsService.get` al abrirse), el botón «Borrar» y el aviso en `ProfessorsPage` (quitar de la lista cargada, foco al título) y los textos (`professors.delete.*`).
* **E2E:** `cypress/e2e/professors.cy.ts` (borrar sin y con tutoría y verlo en `/cursos`, cancelar con Escape y foco, el profesor que ya no existe al confirmar, con búsqueda activa, y a 360 px con el diálogo abierto).

##### Requisitos de Testing (Pre-release)

* **Unitarios backend:** el caso de uso (`404`, evento con `freed_class`, nada de nombres) y la ruta (`200`, `404` para un id no UUID, `401`, `503`).
* **Integración:** borrar sin y con tutoría (la clase queda sin tutor y el curso intacto), otro colegio (`404`, nada borrado), dos borrados simultáneos (`200` y `404`), una edición simultánea (`404` si el borrado gana), atomicidad con un disparador temporal; y por HTTP, lo mismo con la base real.
* **Frontend:** el servicio; `DeleteProfessorModal` (consulta única con `StrictMode`, comprobando, con y sin tutoría, error con «Reintentar», confirmar, borrando, `404` en cada paso, foco, `axe`); `ProfessorsPage` (botón por fila y tarjeta, quitar sin volver a pedir, aviso, foco al título, búsqueda y página recalculadas, `onGone` vuelve a pedir la lista).

##### Documentación

* `docs/api-spec.yml`, `backend/CLAUDE.md` y `frontend/CLAUDE.md`, los estándares si aparece algo nuevo respecto a US08, `README.md`, `MODELO_DATOS.md` (el borrado real del profesor y `ON DELETE SET NULL`), la arquitectura y las notas de US14 (qué pasa con los alumnos de la clase que se queda sin tutor) y de las historias de horarios (un profesor borrado deja de estar disponible).

##### Riesgos y Mitigaciones

* **Seguridad:** el colegio sale de la identidad; un profesor de otro colegio es `404` indistinguible.
* **Producto:** borrar sin querer → diálogo con el nombre, la tutoría que se pierde y «no se puede deshacer», foco inicial en «Cancelar».
* **Concurrencia:** el bloqueo de la fila serializa borrado y edición; `ON DELETE SET NULL` hace que la liberación de la clase sea atómica con el borrado.
* **Observabilidad:** `PROFESSOR_DELETED` con `freed_class`, sin nombres.

##### Fuera de alcance

* Borrado lógico, papelera o deshacer; límite de borrados por minuto; borrado múltiple; sincronización en tiempo real; alumnos (US14) y horarios (historias de generación); avisos por email.

##### Definición de hecho

* Tests en verde con la cobertura mínima (90 % backend, 80 % frontend), `lint`, `typecheck` y `api:types:check`; pruebas con `curl`; E2E completo; PR integrada; despliegue y comprobación en producción.

---

## Módulo: Gestión de Alumnos

### US14: Crear un alumno (y listado mínimo)

**Épica:** [4. Gestión de Alumnos](#epica-4-gestion-de-alumnos)

**Estimación:** 8 puntos de historia. Una migración (`students`), dos endpoints (`POST` y `GET /api/students`), dos páginas, el enlace «Alumnos» en la cabecera y el recuento real de alumnos en el borrado de cursos (US08). El número de alumnos en `/cursos` y la confirmación al quitar una clase con alumnos son la sub-historia **US14_b**.

**Historia:** Como usuario del colegio (`ADMIN` o `MEMBER`), quiero crear un alumno con su nombre, sus apellidos, su curso, su clase (opcional) y sus datos de comedor, y ver los alumnos del colegio, para registrar a los estudiantes del centro.

**Depende de:** US02_b1 (`AuthenticatedLayout`, `requireAuthentication`), US05 a US08 (cursos y clases; el diálogo de borrado ya lleva `studentCount`) y US09 (el patrón de alta con listado mínimo, `ProfessorForm` y la tabla de campos compartida).

> **Nota (US06, 2026-10-19):** el listado de `/cursos` no muestra alumnos: esta historia (o la del listado de alumnos) añade el número de alumnos de cada curso y de cada clase. → **Pasa a US14_b.**

> **Nota (US07, 2026-10-20):** en la edición de un curso, quitar una fila de clase no pide confirmación ni borra nada hasta pulsar «Guardar», porque hoy una clase no tiene nada asociado. Con alumnos, esta historia debe decidir qué pasa con los de una clase que se quita (la ficha de US07 original pedía dejarlos sin clase, `class_id = NULL`) y añadir la confirmación al quitar una clase con alumnos, con su número en el mensaje. El `PUT /api/courses/{id}` ya conserva el `id` de las clases que se renombran, así que los alumnos de una clase renombrada no se mueven. Un alumno asignado a una clase que otra persona acaba de quitar es el mismo caso que `COURSE_CHANGED`. → **US14 decide** que quedan en el curso sin clase (`ON DELETE SET NULL`); **la confirmación pasa a US14_b.**

> **Nota (US08, 2026-10-20):** el diálogo de borrado de un curso ya está construido y el contrato ya lleva `studentCount`: `GET /api/courses/{id}/impact` y la respuesta de `DELETE /api/courses/{id}` devuelven `{ classCount, studentCount }`, con `studentCount` siempre `0` por la constante `STUDENT_COUNT_UNTIL_US14` de `PrismaCourseRepository`. Esta historia la sustituye por el recuento real de alumnos asignados a las clases del curso (tanto en `impactOf` como dentro de la transacción de `delete`, con el curso bloqueado) y el diálogo ya muestra «Tiene {M} alumnos asignados» y, tras borrar, «… {M} alumnos quedan sin clase» cuando M > 0. La clave ajena de la clase del alumno debe ser **`ON DELETE SET NULL`** (el alumno no se borra, queda sin clase) para que la cascada del borrado no se bloquee. Hay que añadir tests de integración con alumnos reales a los de `courses.int.test.ts` y `prismaCourseRepository.int.test.ts`, que hoy solo prueban `studentCount: 0`. → **En US14**, contando los alumnos **del curso** (con y sin clase), que quedan sin curso ni clase.

> **Nota (US13, 2026-10-21):** borrar un profesor deja sin tutor a la clase que tutorizaba (`classes.tutor_id` es `ON DELETE SET NULL`) y el diálogo ya avisa de ello. Los alumnos de esa clase siguen en ella: esta historia debe decidir si una clase con alumnos puede quedarse sin tutor o si el listado de alumnos debe señalarlo. Si pasa a ser una regla, el diálogo de borrado del profesor tendrá que contar lo que se pierde (p. ej. «N alumnos se quedan sin tutor»), como ya hace el de un curso con `studentCount`. → **US14 decide** que una clase con alumnos puede quedarse sin tutor y que no es una regla: el diálogo de US13 no cambia.

---

#### Decisiones (validadas por la persona usuaria, 2026-10-21)

* **La historia se divide en US14 y US14_b**, como US09: US14 crea la tabla, el alta, el listado mínimo `/alumnos` y el recuento real en el borrado de cursos; US14_b añade el número de alumnos a `/cursos` y la confirmación al quitar una clase con alumnos en la edición del curso.
* **Sin `status` ni `deletedAt`**, como los profesores, hasta que una historia los necesite (US18 decidirá cómo se borra). El listado muestra todos los alumnos.
* **«Tipo de comida» y «Observaciones» son datos sensibles** (pueden ser datos de salud de menores, categoría especial del RGPD): se guardan, pero **nunca** salen en los logs ni en el listado (`GET /api/students` no los devuelve), y el formulario lleva una ayuda breve que pide anotar solo lo necesario.
* **La beca es de comedor:** solo existe si el alumno está inscrito; si no, `scholarship` y `foodType` son `null`.
* **Borrar un curso deja a sus alumnos sin curso ni clase** (`students.course_id` y `class_id` con `ON DELETE SET NULL`): el alumno no se pierde y se reasigna al editarlo (US17). El curso es **obligatorio al crear**, pero la columna admite `NULL` para ese caso.
* **Quitar una clase en la edición del curso deja a sus alumnos en el curso, sin clase** (`class_id` a `NULL` por la clave ajena); la confirmación es de US14_b.
* **Una clase con alumnos puede quedarse sin tutor** (US13): no es una regla y el borrado de profesores no cambia.
* **Ajustes a lo que ya rige en el proyecto:** sin «toast» ni filtro del listado tras crear (se vuelve a `/alumnos` con un aviso `role="status"`, como profesores y cursos); validación al salir del campo y al enviar, no a cada tecla (como el resto de formularios); el alumno no tiene email (lo tenía el modelo v2.1).
* **Fuera de alcance:** filtros, búsqueda y paginación (US15, US16), editar (US17) y borrar (US18) alumnos, el número de alumnos en `/cursos` y la confirmación al quitar una clase (US14_b), importación masiva, email del alumno y estados.

#### Casos de uso y reglas de negocio

* **Acceso:** cualquier usuario autenticado del colegio (`ADMIN` o `MEMBER`), sin `RequireRole`. Enlace «Alumnos» en la cabecera, entre «Profesores» y «Usuarios». El alumno se crea en el colegio de la identidad.
* **Listado mínimo** `/alumnos` (`StudentsPage`, como el `/profesores` de US09): tabla desde 768 px (Nombre como «Apellidos, Nombre» en un `th scope="row"`, Curso y clase, Comedor) y tarjetas por debajo; ordenado por apellidos y nombre (`compareText`); «Curso y clase» dice «1º Primaria A», «1º Primaria · Sin clase» o «Sin curso»; «Comedor» dice «Sí · Con beca», «Sí» o «No». Carga única con `StrictMode`, «Reintentar» si falla, vacío «Todavía no hay alumnos» con «Crear alumno», y el botón «Crear alumno» siempre visible. No muestra el tipo de comida ni las observaciones.
* **Alta** `/alumnos/nuevo` (`CreateStudentPage` con `components/StudentForm.tsx`, que reutilizará US17):
  * **Nombre** y **Apellidos** (obligatorios): las reglas de la persona del registro y del profesor (1–100 caracteres tras limpiar, letras con acentos, espacios, guiones, apóstrofos y `·`; colapsa espacios; sin unicidad).
  * **Curso** (obligatorio): desplegable con los cursos del colegio en el orden natural del servidor (`coursesService.list`, pedida una vez).
  * **Clase** (opcional): desplegable con «Sin clase» y las clases del curso elegido; desactivado hasta elegir curso; al cambiar el curso vuelve a «Sin clase».
  * **¿Come en el comedor?** (obligatorio): «Sí» / «No», sin opción marcada al empezar (se exige elegir).
  * **Beca de comedor** (casilla, por defecto desmarcada) y **Tipo de comida** (texto, 0–255 caracteres, p. ej. «Vegetariana», «Sin gluten»): solo aparecen con «Sí»; al pasar a «No» se descartan y no se envían.
  * **Observaciones** (opcional, `textarea`, 0–5000 caracteres, con contador).
  * Ayuda bajo «Tipo de comida» y «Observaciones» (ligada por `aria-describedby`): «Anota solo lo necesario para atender al alumno. No aparece en el listado».
* **Validación:** al salir de cada campo y al enviar, con los errores bajo su campo (`aria-invalid`, `aria-describedby`), el foco en el primero inválido y nada enviado si hay errores. El servidor valida lo mismo con la tabla compartida `test-fixtures/student-fields.json`.
* **Envío:** guarda síncrona contra el doble envío, «Guardando…» y botón deshabilitado. Con el `201` navega a `/alumnos` con `replace` y `{ studentCreated: «Nombre Apellidos» }`, que el listado muestra como texto plano en un `role="status"`. Un `400` marca sus campos; un curso o una clase que ya no existen (otra persona los borró) marcan su desplegable con el foco y conservan lo escrito; cualquier otro fallo muestra «No se pudo crear el alumno. Inténtalo de nuevo» sin perder lo escrito.
* **Coherencia curso–clase:** la clase debe ser del curso elegido y ambos del colegio; se comprueba dentro de la transacción del alta. Una clase de otro curso o de otro colegio es indistinguible de una inexistente (`classId: NOT_FOUND`).
* **Borrar un curso** (US08): `studentCount` pasa a ser el número real de alumnos **del curso** (con y sin clase), en `GET /api/courses/{id}/impact` y dentro de la transacción de `DELETE`, con el curso bloqueado. El diálogo ya dice «Tiene M alumnos asignados»; el aviso final pasa a «… M alumnos quedan sin curso». Los alumnos quedan con `course_id` y `class_id` a `NULL`.
* **Quitar una clase** al editar un curso (US07): sus alumnos quedan en el curso con `class_id` a `NULL`, sin confirmación todavía (US14_b).
* **Observabilidad:** `STUDENT_CREATED` (`school_id`, `actor_id`, `student_id`, `has_class`, `cafeteria`) y `STUDENT_CREATION_REJECTED` (`reason: course_not_found | class_not_found`); **nunca** nombres, tipo de comida ni observaciones.

#### Modelo de datos (migración `add_students`)

* **`students`:** `id` (UUIDv7), `school_id` (FK → `schools`, sin cascada, como `courses` y `professors`), `course_id` (nulo, FK → `courses`, `ON DELETE SET NULL`), `class_id` (nulo, FK → `classes`, `ON DELETE SET NULL`), `first_name` y `last_name` (`VARCHAR(100)`), `cafeteria` (`BOOLEAN NOT NULL`), `scholarship` (`BOOLEAN NULL`: `null` si no come en el comedor), `food_type` (`VARCHAR(255) NULL`), `observations` (`TEXT NULL`, 5000 caracteres como máximo en la aplicación), `created_at` y `updated_at`. Índices por `school_id`, `course_id` y `class_id`.
* **Invariantes:** `class_id` no nulo implica una clase del curso `course_id` (lo garantiza la aplicación al crear; las clases no cambian de curso); `cafeteria = false` implica `scholarship` y `food_type` nulos (un `CHECK` en la migración).
* `MODELO_DATOS.md`: la tabla pasa a implementada con sus diferencias respecto a v2.1 (UUID, `school_id`, sin `email`, sin `status`, `cafeteria` en lugar de `lunch_type`, `course_id` nulo); la eliminan `scripts/e2eData.mjs`, `resetDatabase()` y las guías de limpieza antes que `courses` y `schools`.

#### Contrato de la API (`docs/api-spec.yml`, primero)

* **`POST /api/students`** (`createStudent`, Bearer): cuerpo `{ firstName, lastName, courseId, classId?, cafeteria, scholarship?, foodType?, observations? }`. `classId`, `foodType` y `observations` ausentes, `null` o (texto) vacío significan «ninguno». Con `cafeteria: true`, `scholarship` es obligatorio (booleano); con `cafeteria: false`, `scholarship` y `foodType` deben faltar o ser `null` (si no, `400` con el código de campo `NOT_ALLOWED`). `201` con `{ student: Student }`; `400 VALIDATION_ERROR` con los campos en el orden `firstName`, `lastName`, `courseId`, `classId`, `cafeteria`, `scholarship`, `foodType`, `observations` (curso y clase inexistentes o de otro colegio son `NOT_FOUND` en su campo); `401`; `500`; `503`.
* **`GET /api/students`** (`listStudents`, Bearer): `200` con `{ students: StudentSummary[] }` ordenados por apellidos y nombre; `401`; `500`; `503`. `Cache-Control: no-store`.
* **`Student`:** `{ id, firstName, lastName, course: { id, name } | null, class: { id, name } | null, cafeteria, scholarship: boolean | null, foodType: string | null, observations: string | null }`. **`StudentSummary`:** lo mismo **sin** `foodType` ni `observations`.
* **`studentCount`** de `CourseImpact` y de la respuesta de `DELETE /api/courses/{id}`: cambia su descripción («alumnos del curso, con y sin clase»); el tipo no cambia.
* Código de campo nuevo `NOT_ALLOWED` en el enum de códigos de detalle, si el contrato los enumera.

#### Criterios de Aceptación

* **CA1 (Crear completo):** Dado el formulario con «Juan», «García», «1º Primaria», clase «A», comedor «Sí», beca marcada, tipo de comida «Vegetariana» y observaciones, al guardar vuelvo a `/alumnos`, veo «Alumno «Juan García» creado» y la fila «García, Juan | 1º Primaria A | Sí · Con beca».
* **CA2 (Sin clase):** Dado que elijo «1º Primaria» y «Sin clase», el alumno se crea y la fila dice «1º Primaria · Sin clase».
* **CA3 (Obligatorios):** Sin nombre, apellidos, curso o respuesta de comedor, veo el error bajo cada campo, el foco va al primero y no se envía nada.
* **CA4 (Clases según el curso):** Con «1º Primaria» el desplegable de clase ofrece solo sus clases; al cambiar a «2º Primaria» vuelve a «Sin clase» y ofrece las de 2º; sin curso está desactivado.
* **CA5 (Comedor):** Con «No», «Beca de comedor» y «Tipo de comida» no aparecen y el alumno se guarda con `scholarship` y `foodType` nulos aunque antes se hubieran rellenado; con «Sí», se guardan.
* **CA6 (Límites):** Nombre o apellidos de 101 caracteres, tipo de comida de 256 u observaciones de 5001 dan error en su campo; «José María» «García-López» se acepta; «     » es obligatorio.
* **CA7 (Curso o clase que ya no existen):** Si otra persona borra el curso o la clase elegidos antes de guardar, veo el error en ese desplegable con el foco, conservo lo escrito y el alumno no se crea.
* **CA8 (Doble envío):** Con «Guardar» pulsado dos veces seguidas se envía una sola petición y veo «Guardando…».
* **CA9 (Fallo):** Si el servidor no responde, veo «No se pudo crear el alumno. Inténtalo de nuevo» y conservo lo escrito; nada queda a medias en la base de datos.
* **CA10 (Listado):** `/alumnos` muestra los alumnos del colegio por apellidos y nombre, en tabla desde 768 px y en tarjetas por debajo, sin tipo de comida ni observaciones; sin alumnos, «Todavía no hay alumnos» con «Crear alumno»; si falla, «Reintentar».
* **CA11 (Datos sensibles):** El tipo de comida y las observaciones no aparecen en `GET /api/students` ni en ningún log; el formulario muestra la ayuda que pide anotar solo lo necesario.
* **CA12 (Borrar un curso con alumnos):** Dado un curso con 3 alumnos (uno sin clase), el diálogo de borrado dice «Tiene 3 alumnos asignados»; tras borrarlo veo «… 3 alumnos quedan sin curso» y en `/alumnos` aparecen «Sin curso».
* **CA13 (Quitar una clase):** Dado un alumno de 1º Primaria A, si al editar el curso se quita la clase A y se guarda, el alumno sigue en `/alumnos` como «1º Primaria · Sin clase».
* **CA14 (Acceso y aislamiento):** Un `MEMBER` crea y ve alumnos; un curso o clase de otro colegio da `400` con `NOT_FOUND`; el listado solo trae los alumnos del colegio; sin sesión, `401`.
* **CA15 (Accesibilidad, responsive e i18n):** etiquetas visibles, errores ligados, foco en el primer error, «Alumnos» con `aria-current` en su sección, sin violaciones de `axe` (vacío, con datos, con errores, comedor «Sí»), sin desplazamiento horizontal a 360 px y textos en `es.json` y `en.json`.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Contrato:** `docs/api-spec.yml` (`createStudent`, `listStudents`, `Student`, `StudentSummary`, `CreateStudentRequest` y la descripción de `studentCount`), `npm run api:types -w frontend` y `api/schema.test.ts`.
* **Base de datos:** `backend/prisma/schema.prisma` (modelo `Student` y relaciones inversas en `School`, `Course` y `SchoolClass`) y la migración `add_students` con el `CHECK`.
* **Backend:** `domain/student/` (entidad, puerto `StudentRepository`, errores reutilizando `CourseNotFound`/`ClassNotFound` o propios), `application/students/createStudent.ts` y `listStudents.ts`, `presentation/students/` (`parseCreateStudentRequest` sobre `USER_FIELD_SCHEMAS`, router con `requireAuthentication`), `infrastructure/prisma/prismaStudentRepository.ts` (transacción: comprobar curso y clase del colegio, insertar; traducir una clave ajena violada por una carrera a `NOT_FOUND`), `PrismaCourseRepository` (sustituir `STUDENT_COUNT_UNTIL_US14` por el recuento en `impactOf` y en `delete`), la raíz de composición, `test/support/appDoubles.ts`, `resetDatabase()` y `scripts/e2eData.mjs`.
* **Frontend:** `services/studentsService.ts` (`list`, `create`), `validation/studentValidation.ts`, `components/StudentForm.tsx`, `pages/StudentsPage.tsx`, `pages/CreateStudentPage.tsx`, rutas en `App.tsx`, «Alumnos» en `AppHeader`, el texto `courses.delete.deletedWithStudents_*` («quedan sin curso») y los textos `students.*`.
* **Tabla compartida:** `test-fixtures/student-fields.json` (nombre, apellidos, tipo de comida, observaciones, comedor y beca).
* **E2E:** `cypress/e2e/students.cy.ts` (crear con y sin clase, comedor «Sí»/«No», errores, curso borrado antes de guardar, `MEMBER`, 360 px) y `courses.cy.ts` (borrar un curso con alumnos y verlos «Sin curso»).

##### Requisitos de Testing (Pre-release)

* **Unitarios backend:** el parser con la tabla compartida (incluido `NOT_ALLOWED` y el orden de los errores), los casos de uso (eventos sin datos personales) y las rutas (`201`, `400`, `401`, `503`, `200` del listado).
* **Integración:** alta con y sin clase; clase de otro curso, curso y clase de otro colegio (`400`); atomicidad (un disparador temporal hace fallar el insert y no queda nada); el `CHECK` de comedor; borrar el curso deja `course_id` y `class_id` a `NULL` y `studentCount` cuenta los alumnos con y sin clase; quitar una clase deja al alumno en el curso; el listado solo trae el colegio y no lleva tipo de comida ni observaciones; y por HTTP, lo mismo con la base real.
* **Frontend:** servicio, validación con la tabla compartida, `StudentForm` (clases según el curso, comedor que muestra y descarta, contador, foco en el primer error, doble envío, `axe`), `CreateStudentPage` (curso o clase `NOT_FOUND`, fallo, navegación con el aviso), `StudentsPage` (tabla y tarjetas con `describe.each`, vacío, error, aviso como texto plano), `AppHeader` y el aviso «sin curso» de `CoursesPage`.

##### Documentación

* `docs/api-spec.yml`, `MODELO_DATOS.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, el `CLAUDE.md` raíz (estado), `README.md` (árbol), los estándares solo con lo nuevo (datos sensibles fuera de logs y listados; un campo que depende de otro), la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL) y las notas de US14_b, US15, US17 y US18 con lo que heredan.

##### Requisitos no funcionales

* **Seguridad y privacidad:** el colegio sale de la identidad; los textos se guardan tal cual y se pintan como texto plano; tipo de comida y observaciones fuera de logs y del listado; sin límite de altas por minuto (como el resto de altas del colegio).
* **Rendimiento:** el listado completo sin paginar (como el `/profesores` de US09; US15 pagina), con índices por `school_id`, `course_id` y `class_id`; el recuento de `studentCount` es un `count` por `course_id`.
* **Observabilidad:** `STUDENT_CREATED` y `STUDENT_CREATION_REJECTED`, sin datos personales.

##### Riesgos y Mitigaciones

* **Datos de salud de menores:** campos libres → ayuda en el formulario, fuera de logs y listados; un tratamiento más estricto (cifrado, acceso por rol) se decidirá si el PRD lo pide.
* **Curso o clase borrados durante el alta:** se comprueban dentro de la transacción y una clave ajena violada por una carrera se traduce a `NOT_FOUND`.
* **Alumnos sin curso tras borrar un curso:** se ven como «Sin curso» y US17 los reasigna; el diálogo de US08 avisa antes de borrar.

##### Definición de hecho

* Migración aplicada, tests en verde con la cobertura mínima (90 % backend, 80 % frontend), `lint`, `typecheck`, `build` y `api:types:check`; pruebas con `curl`; E2E completo; PR integrada; despliegue (con la migración) y comprobación en producción.

---

### US14_b: Alumnos en los cursos (número y confirmación al quitar una clase)

**Épica:** [4. Gestión de Alumnos](#epica-4-gestion-de-alumnos)

**Estimación:** 3 puntos de historia. Sin migraciones: `studentCount` en `Course` y `SchoolClass` (listado, lectura, alta y edición), la columna «Alumnos» de `/cursos` y una confirmación al quitar una clase con alumnos en la edición del curso.

**Historia:** Como usuario del colegio (`ADMIN` o `MEMBER`), quiero ver cuántos alumnos tiene cada curso y cada clase, y que se me avise al quitar una clase con alumnos, para no dejar alumnos sin clase sin darme cuenta.

**Depende de:** US14 (la tabla `students` y `ON DELETE SET NULL` en `class_id`), US06 (listado de cursos) y US07 (edición del curso).

> **Nota (US14, 2026-10-21):** el contrato y el modelo ya tienen todo lo que esta historia necesita: `students.class_id` es `ON DELETE SET NULL` (quitar una clase deja a sus alumnos en el curso sin clase, ya hecho y probado en US14), `GET /api/students` y la tabla de alumnos existen y `PrismaCourseRepository` ya cuenta los alumnos del curso (`student.count({ where: { courseId } })`). Falta solo el recuento **por clase** (`SchoolClass.studentCount`, un `_count` de la relación `students` en los select del listado, la lectura y la edición), el del curso en el listado (`Course.studentCount`) y la confirmación del formulario. `CoursesPage.test.tsx` y `courses.cy.ts` comprueban hoy que `/cursos` no muestra «alumnos» dentro de `main`: esta historia lo cambia a propósito.

---

#### Decisiones (validadas por la persona usuaria, 2026-10-22)

* **`/cursos` muestra el total y, solo si los hay, los alumnos sin clase:** «25 (3 sin clase)». Son los que quedaron así al quitar su clase o los que se crearon sin ella.
* **La confirmación usa el número que cargó la edición:** si mientras tanto otra persona asigna alumnos a esa clase, el número del diálogo puede ser menor que el real. Ningún alumno se pierde (queda en el curso «Sin clase», visible en `/cursos` y `/alumnos`), así que el `PUT` **no cambia** su respuesta ni cuenta nada.
* **Fuera de alcance:** listar los alumnos de una clase, mover alumnos entre clases desde el curso, el número de alumnos en `/alumnos` o en `/profesores`, y bloquear el guardado si cambió el número.

#### Casos de uso y reglas de negocio

* **Contrato:** `SchoolClass` gana `studentCount` (entero ≥ 0, alumnos asignados a esa clase) y `Course` gana `studentCount` (alumnos del curso, con y sin clase). Los alumnos sin clase no viajan: son el total menos la suma de los de sus clases, que salen de la misma consulta. Ambos son obligatorios en todas las respuestas con un `Course`: `GET /api/courses`, `GET /api/courses/{id}`, `POST /api/courses` (siempre `0`) y `PUT /api/courses/{id}` (contados después de guardar, dentro de la transacción). El `PUT` no los admite: como cualquier propiedad desconocida, se ignoran.
* **`/cursos`** (tabla y tarjetas): columna «Alumnos» entre «Tutores» y «Creado» con «25» o «25 (3 sin clase)», y «0» sin alumnos. La columna «Clases» añade los de cada clase: «2 clases: A (12), B (10)». La búsqueda y el resto no cambian.
* **Edición del curso** (`EditCoursePage` → `CourseForm`): cada clase existente muestra bajo su nombre, junto al tutor, «12 alumnos» (o nada con 0), ligado por `aria-describedby`; el número es solo lectura, no forma parte del `CourseDraft` ni cuenta como cambio. Pulsar «Quitar» en una clase **existente con alumnos** abre un diálogo: título «¿Quitar la clase A?», texto «La clase A tiene 12 alumnos. Al guardar el curso quedarán en él sin clase», botones «Cancelar» (foco inicial) y «Quitar clase». Cancelar, Escape o el clic fuera la dejan en el formulario; confirmar la quita del formulario. Nada se guarda hasta «Guardar», y salir sin guardar no cambia nada.
* **Sin confirmación:** una clase nueva (sin `id`), una existente con 0 alumnos, y la creación de un curso (`CreateCoursePage` no pasa números). Se usa el nombre que hay escrito en la fila; si está vacío, «la clase {N}» por su posición.
* **Foco:** al cancelar vuelve al botón «Quitar» de la fila; al confirmar (la fila desaparece) pasa a «Añadir clase» un turno después de `onExited`, como en US08. Quitar sin diálogo deja el foco como hoy.
* **Tras guardar:** el aviso de `/cursos` no cambia («Curso «X» guardado»); la fila del curso ya muestra «(N sin clase)».

#### Criterios de Aceptación

* **CA1 (Números en `/cursos`):** Dado un curso con la clase A (12 alumnos), la B (10) y 3 alumnos sin clase, `/cursos` muestra «2 clases: A (12), B (10)» y «Alumnos: 25 (3 sin clase)», en tabla desde 768 px y en tarjetas por debajo; un curso sin alumnos muestra «0» y «A (0)».
* **CA2 (Confirmar):** Al editar ese curso, «Quitar» en A abre «¿Quitar la clase A?» con «tiene 12 alumnos»; al confirmar, A sale del formulario; al guardar, `/cursos` muestra «Alumnos: 25 (15 sin clase)» y en `/alumnos` esos 12 dicen «1º Primaria · Sin clase».
* **CA3 (Cancelar):** Cancelar, Escape o el clic fuera dejan la clase A con su nombre y su tutor, el foco vuelve a su «Quitar» y «Guardar» sigue como estaba.
* **CA4 (Sin confirmación):** Quitar una clase con 0 alumnos, o una fila añadida en esta edición, no abre el diálogo.
* **CA5 (Contrato):** `GET`, `POST` y `PUT` de cursos devuelven `studentCount` en el curso y en cada clase; un `studentCount` enviado en el `PUT` se ignora; los números solo cuentan alumnos del colegio.
* **CA6 (Accesibilidad, responsive e i18n):** diálogo con nombre (su título), foco inicial en «Cancelar» y retorno de foco; el número de cada clase ligado a su campo; plurales («1 alumno», «12 alumnos»); `axe` sin violaciones (listado con alumnos, edición con números, diálogo abierto); sin desplazamiento horizontal a 360 px; textos en `es.json` y `en.json`.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Contrato:** `docs/api-spec.yml` (`SchoolClass.studentCount` y `Course.studentCount`, obligatorios, con su descripción; nota en `createCourse`, `getCourse`, `listCourses` y `updateCourse`), `npm run api:types -w frontend` y `api/schema.test.ts`.
* **Backend:** `domain/course` (los tipos `Course` y `CourseClass` ganan los números), `PrismaCourseRepository`: `_count: { select: { students: true } }` en las clases y en el curso de `LIST_FIELDS` (y así en `EDIT_FIELDS` y en la lectura final del `update`): una sola consulta por listado, sin N+1; `create` devuelve ceros. La presentación serializa los campos nuevos. Sin migración: los índices `students_course_id_idx` y `students_class_id_idx` ya existen.
* **Frontend:** `coursesService` (exige los enteros ≥ 0 en `list`, `get`, `create` y `update`; otra forma es `unavailable`), `CoursesPage` (columna «Alumnos» y números por clase), `CourseForm` (prop `classStudentCounts` por `id`, como `classTutors`, y el diálogo), un componente nuevo `components/ConfirmRemoveClassModal.tsx` (patrón de `ConfirmSuspendModal`: siempre montado, gobernado por la clase a quitar, sin «X»), `EditCoursePage` (pasa los números), los fixtures de cursos de los tests y los textos `courses.*`.
* **Tests que cambian a propósito:** `CoursesPage.test.tsx` («no muestra alumnos») y `courses.cy.ts` (`/horario|alumnos/i` en `main`): ahora sí muestran alumnos; se mantiene que no hay «horario».
* **E2E:** `courses.cy.ts`: crear un curso con dos clases y alumnos (`createStudentViaApi`), ver los números en `/cursos`, quitar una clase con alumnos (cancelar y confirmar), guardar y ver «(N sin clase)» y «Sin clase» en `/alumnos`; quitar una clase vacía sin diálogo; 360 px.

##### Requisitos de Testing (Pre-release)

* **Integración backend:** los números en el listado, la lectura, el alta (ceros) y el `PUT` (contados tras guardar: quitar una clase con alumnos mantiene el total del curso y baja la suma de las clases); alumnos de otro colegio no cuentan; el listado hace un número fijo de consultas sea cual sea el número de cursos (o al menos no una por curso); y por HTTP, la forma de la respuesta.
* **Unitarios backend:** la serialización de las rutas de cursos con los campos nuevos.
* **Frontend:** `coursesService` (forma válida e inválida de los números), `CoursesPage` con `describe.each` a 1280 y 360 px (total, «sin clase» = total − suma de las clases y solo si > 0, número por clase), `CourseForm` (número bajo la clase y `aria-describedby`; diálogo solo para clases existentes con alumnos; cancelar con retorno de foco; confirmar quita la fila y lleva el foco a «Añadir clase»; los números no cuentan como cambio ni se envían; `axe` con el diálogo abierto) y `EditCoursePage` (pasa los números).

##### Documentación

* `docs/api-spec.yml`, `backend/CLAUDE.md` (recuentos del repositorio de cursos), `frontend/CLAUDE.md` (US14_b en cursos), `ARQUITECTURA_COMPLETA.md` (la fila de US14 deja de remitir a US14_b), las notas de US15 y US17 si heredan algo y los estándares solo si surge un patrón nuevo.

##### Requisitos no funcionales

* **Seguridad:** sin cambios de acceso (`ADMIN` y `MEMBER`); los recuentos filtran por el colegio de la identidad. Son números, no datos personales: pueden ir en la respuesta, pero no en los logs.
* **Rendimiento:** `_count` de Prisma (subconsultas por índice) en la misma consulta del listado; sin paginar, como hoy.
* **Observabilidad:** los eventos de cursos no cambian.

##### Riesgos y Mitigaciones

* **Número desactualizado en la confirmación** (decisión validada): los alumnos no se pierden y se ven «Sin clase»; si resulta un problema, una historia posterior puede hacer que el `PUT` cuente los que deja sin clase, como el borrado de un curso.
* **Consultas N+1 en el listado:** se cuentan en la misma consulta (`_count`) y un test lo vigila.
* **Tests que comprueban la ausencia de «alumnos» en `/cursos`:** se cambian a propósito y se dice en la PR.

#### Definición de hecho

* Tests en verde con la cobertura mínima (90 % backend, 80 % frontend), `lint`, `typecheck`, `build` y `api:types:check`; pruebas con `curl`; E2E completo; PR integrada; despliegue y comprobación en producción.

### US15: Ver listado de alumnos con filtros múltiples

**Épica:** [4. Gestión de Alumnos](#epica-4-gestion-de-alumnos)

**Estimación:** 5 puntos de historia. Solo frontend: `GET /api/students` no cambia; búsqueda, filtros y paginación en el navegador sobre el listado de US14, con los filtros en la URL.

**Historia:** Como usuario del colegio, quiero ver el listado de alumnos filtrado por nombre, apellido, curso, clase, comedor o beca, para gestionar los grupos de forma organizada.

> **Nota (US14, 2026-10-21):** el listado mínimo ya existe: `/alumnos` (`StudentsPage`), `GET /api/students` (`StudentSummary`, ordenado por apellidos y nombre en la aplicación y sin paginar), la tabla o las tarjetas con «Curso y clase» y «Comedor» y el botón «Crear alumno». Esta historia **lo amplía**, no lo crea: añade la paginación y los filtros (en el navegador, como US10 y US11, o en el servidor si el volumen lo pide), y las acciones por fila (US17 y US18). Hay alumnos **sin curso ni clase** (se quedan así al borrar su curso): el filtro por curso necesita una opción «Sin curso». `StudentSummary` ya lleva `cafeteria` y `scholarship` para los filtros de comedor y beca, y **no** lleva el tipo de comida ni las observaciones (datos sensibles): no se pueden filtrar ni mostrar en el listado. La beca es siempre de comedor y es `null` sin comedor.

> **Nota (US14_b, 2026-10-22):** los cursos ya llevan `studentCount` por curso y por clase y `/cursos` lo muestra; este listado no lo necesita (cuenta sobre los alumnos que ya tiene).

---

#### Decisiones (validadas por la persona usuaria, 2026-10-22)

* **Se filtra y pagina en el navegador**, como `/profesores` (US10 y US11): `GET /api/students` devuelve todos los alumnos del colegio y **no cambia** (ni contrato ni backend). Un colegio de primaria tiene cientos de alumnos, no miles; si algún día el volumen lo pide, se pasará al servidor en otra historia.
* **Un solo campo de búsqueda** «Buscar por nombre o apellidos», como US11: cada palabra debe estar en el nombre o en los apellidos, en cualquier orden y como parte de una palabra, sin mayúsculas ni acentos. **Absorbe US16**, que queda sin contenido propio.
* **Los filtros y la página van en la URL** (`/alumnos?curso=…&clase=…&comedor=si&beca=no&pagina=2`): se conservan al recargar, al compartir el enlace y al volver de editar o borrar un alumno (US17 y US18). Es nuevo en el proyecto: `/cursos` y `/profesores` guardan su búsqueda solo en memoria.

#### Ajustes propuestos a la ficha original (pendientes de validar con esta ficha)

* **El texto de búsqueda no va en la URL**, solo en memoria como en `/profesores`: son nombres de menores, y en la URL acabarían en el historial del navegador (a menudo compartido en el colegio) y en cualquier enlace que se copie. Curso, clase, comedor, beca y página sí van en la URL.
* **Orden:** por apellidos y nombre (el de US14, con «Apellidos, Nombre» en la fila), no «nombre + apellido».
* **Sin `status`:** el listado muestra todos los alumnos (US14 decidió no tener estado; US18 decidirá cómo se borra).
* **La clase se elige después del curso**, como en el formulario de US14: sin curso, el desplegable «Clase» está desactivado; un mismo nombre («A») existe en varios cursos y filtrar «A» de todos a la vez no ayuda a gestionar grupos.
* **Columnas:** las de US14 (Nombre, Curso y clase, Comedor); no se separan nombre y apellidos ni curso y clase.
* **Fuera de alcance:** los botones «Editar» y «Borrar» por fila (llegan con US17 y US18; el proyecto no muestra acciones de historias futuras), la actualización automática en menos de 3 segundos (ninguna página del proyecto se actualiza sola; se recarga al volver al listado), los índices de base de datos y los filtros por tipo de comida u observaciones (datos sensibles: no están en `StudentSummary`).

#### Casos de uso y reglas de negocio

* **Acceso:** `/alumnos`, igual que en US14: `ADMIN` y `MEMBER`, solo los alumnos del colegio de la identidad; sin sesión, la API responde `401` y la página lleva a `/login`.
* **Listado:** el de US14 (tabla desde 768 px, tarjetas por debajo, «Apellidos, Nombre» en un `th scope="row"`, «Curso y clase» y «Comedor»), ordenado por apellidos y nombre como lo devuelve el servidor.
* **Total y paginación** (como US10): encima del listado, «N alumnos» (plural); debajo, `components/Pagination` de 20 en 20 con «Anterior», «Página X de N» y «Siguiente» (no se pinta con una sola página). La misma página en tabla y en tarjetas; una página fuera de rango (de la URL, o tras filtrar) se acota a la última.
* **Barra de filtros** (solo si el colegio tiene alumnos), todos opcionales y combinables (se aplican a la vez):
  * **Búsqueda** (`type="search"`, «Buscar por nombre o apellidos», `maxLength` 100): filtra al escribir, desde el primer carácter, con la regla de US11 (`matchesProfessorSearch` generalizada o una función hermana sobre `normalizeForSearch`). No va en la URL.
  * **Curso:** «Todos los cursos», los cursos que tienen algún alumno (sacados de los alumnos cargados, en el orden natural de los cursos) y «Sin curso» (alumnos cuyo curso se borró), este último solo si hay alguno.
  * **Clase:** desactivado (con una ayuda ligada por `aria-describedby`) hasta elegir un curso concreto; entonces «Todas las clases», las clases de ese curso que tienen algún alumno y «Sin clase», solo si hay alguno. Cambiar de curso vuelve a «Todas las clases».
  * **Comedor:** «Todos», «Come en el comedor» y «No come en el comedor».
  * **Beca:** desactivado (con ayuda) salvo con «Come en el comedor»; entonces «Todos», «Con beca» y «Sin beca». Cambiar el comedor a otra cosa vuelve a «Todos».
* **Cambiar cualquier filtro o la búsqueda vuelve a la página 1.**
* **Estado con filtros:** mientras haya algún filtro o texto, el total dice «Mostrando N de M alumnos» en un `role="status"`; sin coincidencias, «No hay alumnos que coincidan con los filtros» con «Limpiar filtros», que quita todos los filtros y el texto, vuelve a la página 1 y lleva el foco al campo de búsqueda. Sin alumnos en el colegio, el vacío de US14 («Todavía no hay alumnos» con «Crear alumno»), sin barra de filtros.
* **URL:** `curso` (el `id` del curso o `sin-curso`), `clase` (el `id` de la clase o `sin-clase`; solo cuenta con un `curso` concreto), `comedor` (`si` o `no`), `beca` (`si` o `no`; solo cuenta con `comedor=si`) y `pagina` (entero ≥ 2; la 1 no se escribe). Los cambios usan `replace` (no llenan el historial). Un valor desconocido o que ya no existe (un curso borrado, una clase de otro curso, `pagina=abc`) se trata como si no estuviera, sin error. Llegar desde el alta (`{ studentCreated }`) muestra el aviso como hoy, sin filtros.
* **Accesibilidad:** cada filtro con etiqueta visible; el total y el estado con filtros en un `role="status"`; al cambiar de página, `scrollIntoView` al total sin mover el foco (como US10); sin desplazamiento horizontal a 360 px con la barra de filtros (los controles se apilan).
* **Textos:** `students.*` en `es.json` y `en.json`; ningún texto en el código.

#### Criterios de Aceptación

* **CA1 (Total y orden):** Con 3 alumnos, `/alumnos` muestra «3 alumnos» y las filas por apellidos y nombre.
* **CA2 (Búsqueda):** Escribir «juan garcia» muestra a «García López, Juan» y no a «García, Ana»; «JOSÉ» encuentra a «José»; la URL no cambia al escribir.
* **CA3 (Curso):** Elegir «1º Primaria» muestra solo sus alumnos y la URL lleva `curso=<id>`; «Sin curso» muestra los alumnos cuyo curso se borró.
* **CA4 (Clase):** Sin curso, «Clase» está desactivado con su ayuda; con «1º Primaria», ofrece sus clases y «Sin clase»; elegir «A» muestra los de 1º A; cambiar a «2º Primaria» vuelve a «Todas las clases».
* **CA5 (Comedor y beca):** «Come en el comedor» muestra solo los inscritos y habilita «Beca»; «Con beca» y «Sin beca» filtran entre ellos; «No come en el comedor» desactiva «Beca» y lo vuelve a «Todos».
* **CA6 (Combinados):** «juan» + «1º Primaria» + «Come en el comedor» muestra solo los alumnos que cumplen las tres.
* **CA7 (Sin coincidencias):** Un filtro sin resultados muestra «No hay alumnos que coincidan con los filtros» y «Limpiar filtros», que restablece todo, vuelve a la página 1 y lleva el foco a la búsqueda.
* **CA8 (Paginación):** Con 45 alumnos, se ven 20, «Página 1 de 3» y «Siguiente»; en la página 3, 5; filtrar vuelve a la página 1.
* **CA9 (URL):** Recargar `/alumnos?curso=<id>&comedor=si&pagina=2` conserva el curso, el comedor y la página; una URL con un curso que ya no existe o `pagina=99` se trata como sin ese curso o como la última página, sin error.
* **CA10 (Aislamiento):** Un `MEMBER` ve y filtra solo los alumnos de su colegio; un `id` de curso de otro colegio en la URL no filtra nada (no está entre los cursos de sus alumnos).
* **CA11 (Accesibilidad, responsive e i18n):** etiquetas visibles, ayudas ligadas de los desplegables desactivados, `role="status"` del total, `axe` sin violaciones (con datos, con filtros, sin resultados), tabla desde 768 px y tarjetas por debajo con la misma página, sin desplazamiento horizontal a 360 px y textos en `es.json` y `en.json`.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Frontend:** `pages/StudentsPage.tsx` (total, barra de filtros, paginación, estados con filtros y lectura y escritura de la URL con `useSearchParams` de react-router); una función pura de filtrado (`utils/studentFilters.ts`: lee y escribe los parámetros de la URL, valida contra los alumnos cargados y aplica los filtros) y la búsqueda por palabras (reutilizar o generalizar `utils/professorSearch.ts`); posiblemente un componente `StudentFilters`; los textos `students.*`.
* **Reutiliza:** `components/Pagination`, `utils/pagination.ts`, `normalizeForSearch` y `hooks/useMediaQuery`.
* **Sin cambios:** `docs/api-spec.yml`, backend, base de datos y `studentsService`.
* **E2E:** `cypress/e2e/students.cy.ts` (búsqueda, curso y clase, comedor y beca, sin coincidencias y «Limpiar filtros», paginación con más de 20 alumnos creados por la API, la URL al recargar y 360 px).

##### Requisitos de Testing (Pre-release)

* **Unitarios:** la lectura y escritura de la URL (valores válidos, desconocidos, de otro colegio, `pagina` fuera de rango), cada filtro y su combinación, la búsqueda por palabras y el orden de las opciones.
* **Componentes:** `StudentsPage` a 1280 y 360 px con `describe.each`: total, búsqueda, cada desplegable (desactivados con su ayuda, reinicio de la clase y la beca), «Mostrando N de M», sin coincidencias y «Limpiar filtros» con el foco, paginación y vuelta a la página 1, la URL (inicial y tras cada cambio, sin el texto de búsqueda), el aviso de alta y `axe`.

##### Documentación

* `frontend/CLAUDE.md` (US15 en alumnos), `docs/frontend-standards.md` si los filtros en la URL son un patrón nuevo, la ficha de US16 (absorbida por US15) y las notas de US17 y US18 (volver al listado conservando la URL).

##### Requisitos no funcionales

* **Privacidad:** el texto de búsqueda no va en la URL; los filtros de la URL son identificadores y valores cerrados; nunca se filtra ni muestra el tipo de comida ni las observaciones.
* **Rendimiento:** filtrar y paginar en memoria con `useMemo` sobre cientos de alumnos; una sola petición al cargar, ninguna al filtrar.
* **Seguridad:** sin cambios de acceso; los parámetros de la URL solo se comparan con los alumnos ya cargados del colegio, nunca se envían a la API.

##### Riesgos y Mitigaciones

* **Colegios grandes:** con miles de alumnos, la carga completa se notaría → se mide en una historia posterior y se pasa al servidor si hace falta (el contrato admitiría parámetros sin romper nada).
* **URL con valores obsoletos** (un curso borrado, un enlace antiguo) → se ignoran sin error.
* **Volver de US17/US18 sin perder los filtros** → esas historias navegan de vuelta con la misma búsqueda de la URL (`?…`).

#### Definición de hecho

* Tests en verde con la cobertura mínima (90 % backend, 80 % frontend), `lint`, `typecheck` y `build`; E2E completo; PR integrada; despliegue y comprobación en producción. Sin pruebas con `curl` de endpoints nuevos (no hay), pero sí una comprobación de que `GET /api/students` sigue igual.

### US16: Filtrar alumnos por nombre o apellido

**Épica:** [4. Gestión de Alumnos](#epica-4-gestion-de-alumnos)

> **Nota (US15, 2026-10-22):** absorbida por US15, que añade el campo «Buscar por nombre o apellidos» al listado de alumnos (la regla de palabras de US11, en `utils/personSearch.ts`). No tiene trabajo propio.

**STATUS:** ✗

---

### US17: Editar alumno

**Épica:** [4. Gestión de Alumnos](#epica-4-gestion-de-alumnos)

**Estimación:** 5 puntos de historia. Dos endpoints nuevos (`GET` y `PUT /api/students/{id}`), una página de edición que reutiliza `StudentForm` y el «Editar» por fila que vuelve al listado con sus filtros; sin migraciones.

**Historia:** Como usuario del colegio, quiero editar los datos de un alumno (nombre, apellido, curso, clase, comedor, tipo comida, beca, observaciones) para mantener su información actualizada.

**Depende de:** US14 (`StudentForm`, `student-fields.json`, el bloqueo `FOR SHARE` del curso), US15 (el listado con filtros en la URL al que se vuelve) y US12 (el patrón de edición: página propia, estado final en el `PUT`, «Guardar» solo con cambios, «gana el último guardado»).

> **Nota (US14, 2026-10-21):** el formulario ya existe: `components/StudentForm.tsx` se extrajo pensando en esta historia (recibe `initialValues`, `courses`, `failureMessage` y `onSubmit`; el curso y la clase se derivan al pintar y la clase vuelve a «Sin clase» al cambiar el curso; el comedor es `'' | 'yes' | 'no'` y descarta la beca y el tipo de comida con «No»). Falta añadir `requireChanges` (como `ProfessorForm`), `GET /api/students/{id}` (con los datos sensibles, que el listado no trae) y `PUT`. Un alumno puede estar **sin curso** (su curso se borró): el formulario de edición debe permitir elegir uno y, mientras no lo haga, el curso es obligatorio como en el alta. La coherencia curso–clase la comprueba hoy la transacción del alta (`FOR SHARE` del curso, clase del curso); el `PUT` debe hacer lo mismo y tomar el mismo bloqueo. `FieldErrorCode` ya tiene `NOT_ALLOWED` para la beca y el tipo de comida sin comedor, y `test-fixtures/student-fields.json` ya recoge los límites y las combinaciones.

> **Nota (US15, 2026-10-22):** el listado `/alumnos` ya guarda los filtros y la página en la URL (`?curso=…&clase=…&comedor=…&beca=…&pagina=N`, sin el texto de búsqueda). Al guardar el alumno, esta historia debe volver a `/alumnos` **conservando esa búsqueda** (navegar con la misma `?…` que tenía el listado al pulsar «Editar», p. ej. pasándola en el estado de la navegación o en un parámetro `volver`), y su aviso «Alumno actualizado» debe viajar en el estado como el de alta (`StudentsPage` conserva el estado al filtrar). El listado no tiene todavía el botón «Editar» por fila: lo añade esta historia, con `aria-label` «Editar {Apellidos, Nombre}» como en profesores. Si el alumno editado cambia de curso o de clase, el filtro de la URL puede dejar de contenerlo; el listado lo trata sin error.

---

#### Decisiones (validadas por la persona usuaria, 2026-10-22)

* **Página propia `/alumnos/:id/editar`** (`EditStudentPage`), como la edición de cursos (US07) y de profesores (US12), con el `StudentForm` del alta (US14) y `requireChanges`.
* **Gana el último guardado** (como US07 y US12): sin control de versión ni aviso de «actualizado por otro usuario». Solo son errores que el alumno ya no exista (`404`), que el curso o la clase elegidos ya no existan (`400` con `NOT_FOUND` en su campo) y lo que el servidor rechace por validación. Sustituye CA11 de la ficha original.
* **«Cancelar» vuelve sin preguntar**, aunque haya cambios (como US07 y US12). Sustituye la confirmación «¿Descartar cambios?» de la ficha original.
* **Se vuelve al listado con sus filtros** gracias al estado de la navegación: «Editar» pasa la búsqueda del listado (`?curso=…&pagina=…`) en el estado y, al guardar o cancelar, se vuelve a `/alumnos` con esa búsqueda. El estado vive en el historial del navegador, así que **sobrevive a recargar** la página de edición; si se entra por un enlace directo, sin ese estado, se vuelve a `/alumnos` sin filtros. La URL de edición queda limpia.
* **Ajustes a lo que ya rige en el proyecto:** sin «toast» (aviso `role="status"` en el listado, como el alta); validación al salir del campo y al enviar, no a cada tecla (CA16 original); el listado se vuelve a pedir al volver, no se actualiza solo (requisito de «<3 s» original); sin `status` (el alumno no lo tiene, US14).

#### Casos de uso y reglas de negocio

* **Acceso:** cualquier usuario autenticado del colegio (`ADMIN` o `MEMBER`). En `/alumnos`, cada fila de la tabla y cada tarjeta llevan un enlace «Editar» (`aria-label` «Editar {Apellidos, Nombre}», que contiene el texto visible) en una columna nueva «Acciones», como `/profesores`. Un alumno de otro colegio, uno inexistente y un `id` que no es UUID son el mismo «Este alumno no existe o ya no está disponible», con un enlace a «Alumnos».
* **Campos editables** (precargados con los valores actuales): nombre y apellidos (reglas de US14, `student-fields.json`), curso (obligatorio), clase («Sin clase» o una clase del curso), comedor («Sí» / «No»), beca y tipo de comida (solo con «Sí») y observaciones. No se editan el `id` ni las fechas.
* **Curso y clase:** el desplegable de curso tiene los cursos del colegio; al cambiarlo, la clase vuelve a «Sin clase» y ofrece las del curso nuevo (comportamiento de `StudentForm`). Un alumno **sin curso** (su curso se borró) llega con el curso vacío y un aviso bajo el campo (ligado por `aria-describedby`): «Este alumno no tiene curso. Elige uno para guardar»; el curso es obligatorio al guardar, como en el alta.
* **Comedor:** al pasar a «No», la beca y el tipo de comida desaparecen y se guardan como `null`; al pasar a «Sí», aparecen vacíos y con la beca desmarcada (como en el alta: «No» descarta lo escrito).
* **Datos sensibles:** el tipo de comida y las observaciones llegan solo con `GET /api/students/{id}` (el listado no los trae), se pintan como texto plano, con la ayuda de US14, y nunca salen en logs ni en el título del documento.
* **«Guardar»** solo se habilita si hay cambios reales: se comparan los valores que se enviarían (nombre y apellidos limpios, `null` para lo vacío, beca y tipo de comida descartados con «No») con los cargados (`hasStudentChanges`); deshacer un cambio o añadir espacios no lo habilita. Guarda síncrona contra el doble envío y «Guardando…».
* **Guardar:** `PUT /api/students/{id}` con el **estado final** completo. En una transacción: bloquea el curso elegido con `FOR SHARE` (el mismo bloqueo del alta, que serializa con el borrado del curso) y **después** la fila del alumno (`FOR UPDATE`, del colegio), el mismo orden curso → alumnos que el borrado del curso para no formar un *deadlock*, comprueba que la clase es de ese curso y actualiza. Si algo falla, no cambia nada.
* **Tras guardar:** vuelve a `/alumnos` + la búsqueda que traía (con `replace`) y el estado `{ studentUpdated: «Nombre Apellidos» }`, que el listado muestra como texto plano en un `role="status"` y conserva al filtrar (como `studentCreated`). Si el alumno ya no cumple los filtros (cambió de curso o de comedor), no aparece y no es un error; si la página de la URL deja de existir, se usa la última (la regla de US15).
* **Errores al guardar:** un `400` marca sus campos (con el foco en el primero); un curso o una clase que ya no existen marcan su desplegable y conservan lo escrito; un `404` muestra «Este alumno no existe o ya no está disponible» con el enlace a «Alumnos»; un `503` o un error de red, «No se pudo guardar el alumno. Inténtalo de nuevo», conservando lo escrito.
* **Carga:** el alumno y los cursos se piden una vez (también con `StrictMode`); si el alumno no carga (error distinto de `404`), «Reintentar»; si los cursos no cargan, el formulario muestra el error de cursos con su «Reintentar», como el alta (sin cursos no se puede guardar, porque el curso es obligatorio).
* **Recuentos:** `studentCount` de `/cursos` (US14_b) refleja el cambio de curso o de clase sin tocar nada, porque se calcula al pedir el listado.
* **Observabilidad:** `STUDENT_UPDATED` (`school_id`, `actor_id`, `student_id`, `changed_fields` con los **nombres** de los campos cambiados, `has_class`, `cafeteria`) y `STUDENT_UPDATE_REJECTED` (`reason: not_found | course_not_found | class_not_found`); **nunca** nombres, tipo de comida ni observaciones.

#### Contrato de la API (`docs/api-spec.yml`, primero)

* **`GET /api/students/{id}`** (`getStudent`, Bearer) → `200` con `{ student: Student }` (con `foodType` y `observations`); `404 NOT_FOUND` para otro colegio, inexistente o `id` no UUID; `401`; `500`; `503`. `Cache-Control: no-store`.
* **`PUT /api/students/{id}`** (`updateStudent`, Bearer) con `UpdateStudentRequest`: los mismos campos y reglas que `CreateStudentRequest` (`firstName`, `lastName`, `courseId` obligatorios; `classId`, `foodType` y `observations` ausentes, `null` o vacíos = ninguno; `scholarship` obligatorio con `cafeteria: true` y `NOT_ALLOWED` con `cafeteria: false`). Es el estado final: lo ausente queda vacío. → `200` con `{ student: Student }`; `400 VALIDATION_ERROR` (mismo orden de campos que el alta; curso y clase inexistentes, de otro colegio o clase de otro curso = `NOT_FOUND`); `404`; `401`; `500`; `503`. `Cache-Control: no-store`. Sin códigos de error nuevos.

#### Criterios de Aceptación

* **CA1 (Abrir la edición):** Dado `/alumnos?comedor=si&pagina=2`, cuando pulso «Editar» en «García, Juan», llego a `/alumnos/<id>/editar` con todos sus datos precargados (también tipo de comida y observaciones) y «Guardar» deshabilitado.
* **CA2 (Cambiar nombre):** Cuando cambio «Juan» por «Juanito» y guardo, vuelvo a `/alumnos?comedor=si&pagina=2` con «Alumno «Juanito García» actualizado» y la fila muestra el nombre nuevo.
* **CA3 (Cambiar de curso):** Cuando cambio «1º Primaria» por «2º Primaria», la clase vuelve a «Sin clase» y ofrece las de 2º; al guardar, el alumno queda en 2º Primaria con la clase elegida (o sin clase).
* **CA4 (Cambiar o quitar la clase):** En el mismo curso, puedo pasar de la clase A a la B, o a «Sin clase», y se guarda.
* **CA5 (Comedor a «No»):** Dado un alumno con comedor, beca y tipo de comida, cuando elijo «No» y guardo, quedan `scholarship` y `foodType` a `null`; con «Sí» y la beca marcada, se guarda la beca.
* **CA6 (Observaciones):** Puedo cambiar o vaciar las observaciones (máximo 5000 caracteres, con contador); 5001 dan error en su campo.
* **CA7 (Validación):** Con el nombre vacío, de 101 caracteres o con caracteres no válidos, al salir del campo o al guardar veo el error bajo él, el foco va al primero inválido y no se envía nada; las reglas son las del alta.
* **CA8 (Sin cambios):** Si no cambio nada, o lo deshago, o solo añado espacios al nombre, «Guardar» sigue deshabilitado.
* **CA9 (Alumno sin curso):** Dado un alumno «Sin curso», veo el aviso bajo el curso; si intento guardar sin elegir uno, veo el error del curso; al elegir curso y guardar, queda asignado.
* **CA10 (Curso o clase que ya no existen):** Si otra persona borra el curso o la clase elegidos antes de guardar, veo el error en ese desplegable, conservo lo escrito y el alumno no cambia.
* **CA11 (Último guardado gana):** Si otra persona cambió el alumno mientras yo lo editaba, mi guardado lo sustituye sin aviso.
* **CA12 (Alumno que ya no existe):** Con un `id` de otro colegio, inexistente o mal formado, veo «Este alumno no existe o ya no está disponible» y un enlace a «Alumnos»; si deja de existir mientras edito, al guardar veo lo mismo.
* **CA13 (Cancelar):** «Cancelar» vuelve a `/alumnos` con la misma búsqueda, sin preguntar y sin guardar (también tras recargar la página de edición); si se entró por un enlace directo, vuelve a `/alumnos` sin filtros.
* **CA14 (Atomicidad y fallo):** Si algo falla al guardar, el alumno no cambia y veo «No se pudo guardar el alumno. Inténtalo de nuevo», conservando lo escrito.
* **CA15 (Acceso y aislamiento):** Un `MEMBER` puede editar; por la API, un alumno de otro colegio da `404` y no se modifica, y un curso o una clase de otro colegio dan `400` con `NOT_FOUND`; sin sesión, `401` y `/login`.
* **CA16 (Accesibilidad, responsive e i18n):** etiquetas visibles, errores y avisos ligados a su campo, «Editar» con nombre accesible por fila y tarjeta; sin violaciones de `axe` (cargado, con errores, sin curso); sin desplazamiento horizontal a 360 px; textos en `es.json` y `en.json`.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Contrato:** `docs/api-spec.yml` (`getStudent`, `updateStudent`, `UpdateStudentRequest`), `npm run api:types -w frontend` y `api/schema.test.ts`.
* **Backend:** `application/students/getStudent.ts` y `updateStudent.ts` (con `parseUpdateStudentRequest`, que reutiliza las reglas de `createStudentRequest`), error de dominio `StudentNotFound`, métodos `findById` y `update` del puerto `StudentRepository` y de `PrismaStudentRepository` (transacción: curso `FOR SHARE` del colegio, después alumno `FOR UPDATE` del colegio, clase del curso, `UPDATE`; con el curso bloqueado no hace falta traducir ninguna clave ajena), `studentsRouter` (dos rutas con un `parseStudentId` como el de profesores), los eventos y `test/support/appDoubles.ts`.
* **Frontend:** `studentsService.get` y `update`, `hasStudentChanges` en `validation/studentValidation.ts`, `StudentForm` con `requireChanges` y el aviso de alumno sin curso, `pages/EditStudentPage.tsx`, la columna «Acciones» con «Editar» en `StudentsPage` (tabla y tarjetas, con la búsqueda en el estado del `Link`), el aviso `studentUpdated`, la ruta en `App.tsx` y los textos (`students.edit.*`, `students.updated`, `students.actions`, `students.form.courseMissing`).
* **E2E:** `cypress/e2e/students.cy.ts` (editar el nombre y volver con los filtros; cambiar de curso; comedor a «No»; reasignar un alumno sin curso; `id` inexistente; `MEMBER`; 360 px).

##### Requisitos de Testing (Pre-release)

* **Unitarios backend:** el parser (reglas compartidas con la tabla `student-fields.json`); los casos de uso (`404`, `CourseNotFound`/`ClassNotFound` → `400`, eventos con `changed_fields` y sin datos personales); el router (`404` para un `id` no UUID, `Cache-Control`).
* **Integración:** obtener con datos sensibles; cambiar nombre, curso, clase, comedor; clase de otro curso y curso o clase de otro colegio (`400`, nada cambia); alumno de otro colegio (`404`); `cafeteria: false` deja beca y tipo de comida a `null`; reasignar un alumno sin curso; atomicidad (un disparador temporal hace fallar el `UPDATE` y todo queda igual); un `PUT` y un `DELETE` del curso simultáneos terminan sin `500` y sin un alumno apuntando a un curso borrado; dos `PUT` simultáneos, gana el último; y por HTTP, lo mismo con la base real.
* **Frontend:** servicio (`get`, `update`, guardas de forma), `hasStudentChanges`, `StudentForm` en alta (los tests de US14 siguen pasando) y en edición (precarga, «Guardar» solo con cambios, aviso sin curso), `EditStudentPage` (carga única, `404`, «Reintentar», guardar, volver con la búsqueda o sin ella, errores de campo, fallo), «Editar» en filas y tarjetas con `describe.each` a 1280 y 360 px, el aviso `studentUpdated` en `StudentsPage` y `axe`.
* **E2E:** los casos de «Archivos a modificar».

##### Documentación

* `docs/api-spec.yml`, `backend/CLAUDE.md` y `frontend/CLAUDE.md`, `docs/frontend-standards.md` (volver a un listado con filtros en la URL pasando su búsqueda en el estado de la navegación), `README.md`, la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL) y la nota de US18 (el «Editar» por fila y el regreso con filtros que debe imitar).

##### Requisitos no funcionales

* **Seguridad y privacidad:** el colegio sale de la identidad; un alumno de otro colegio es `404` indistinguible; los datos sensibles solo viajan en `GET` y `PUT` de un alumno, con `no-store`, y nunca en logs; la búsqueda devuelta se usa solo como `search` de la ruta fija `/alumnos` (no es una redirección abierta).
* **Rendimiento:** dos consultas por bloqueo y un `UPDATE` por guardado; sin índices nuevos.
* **Observabilidad:** `STUDENT_UPDATED` y `STUDENT_UPDATE_REJECTED`, sin datos personales.

##### Riesgos y Mitigaciones

* **Curso o clase borrados durante la edición:** el `FOR SHARE` del curso serializa con su borrado (US08) y la clase se comprueba dentro de la transacción; con el curso bloqueado, la clave ajena no puede violarse por una carrera.
* **Edición simultánea:** gana el último guardado (documentado); el bloqueo de la fila evita escrituras intercaladas.
* **Datos de salud de menores:** fuera de logs y listados, ayuda en el formulario y `no-store`.
* **Perder los filtros al volver:** la búsqueda viaja en el estado de la navegación, que el navegador conserva al recargar; si no hay estado (enlace directo), se vuelve a `/alumnos` sin filtros, sin error.

##### Fuera de alcance

* Borrar un alumno (US18), también desde el formulario; control de versión o aviso de «actualizado por otro usuario»; confirmación al cancelar; «toast»; historial de cambios; edición masiva; estados y email del alumno.

##### Definición de hecho

* Tests en verde con la cobertura mínima (90 % backend, 80 % frontend), `lint`, `typecheck`, `build` y `api:types:check`; pruebas con `curl`; E2E completo; PR integrada; despliegue y comprobación en producción.

### US18: Borrar alumno

**Épica:** [4. Gestión de Alumnos](#epica-4-gestion-de-alumnos)

**Estimación:** 3 puntos de historia. Un endpoint nuevo (`DELETE /api/students/{id}`) con el patrón del borrado de profesores (US13), un diálogo de confirmación que **no** consulta al alumno y el botón «Borrar» en el listado; sin migraciones.

**Historia:** Como usuario del colegio (`ADMIN` o `MEMBER`), quiero borrar un alumno, para eliminar los registros de estudiantes que ya no están en el colegio.

**Depende de:** US14 (la tabla `students` y sus claves ajenas con `ON DELETE SET NULL`), US15 (el listado con filtros y paginación en el navegador y la búsqueda en la URL), US17 (la columna «Acciones» con «Editar», `StudentNotFound`, `parseStudentId` y el bloqueo de la fila `FOR UPDATE`) y US13 y US08 (el patrón de borrado: diálogo, `200` y foco al título).

> **Nota (US14, 2026-10-21):** el alumno no tiene `status` ni `deleted_at`: el borrado puede ser real (como cursos y profesores) o introducir un estado, y esta historia lo decide. Si es real, el patrón es el de US13: `GET /api/students/{id}` para el diálogo, bloqueo de la fila, `200` con lo que se borró y `404` indistinguible para otro colegio. Los datos sensibles (tipo de comida y observaciones) **no deben salir en el diálogo ni en el log** del borrado; el evento solo lleva identificadores. Cuando existan los horarios, el diálogo tendrá que contar lo que se pierde de ese alumno, como el de un curso cuenta sus clases y alumnos.

> **Nota (US15, 2026-10-22):** el listado `/alumnos` filtra y pagina en el navegador sobre la lista cargada. Tras borrar un alumno, esta historia debe quitarlo de la lista cargada **sin volver a pedirla** (como `/profesores` y `/cursos`), de modo que el total, los filtros, las opciones de los desplegables (un curso o una clase se quedan sin alumnos) y la página se recalculen, y debe **conservar la URL** del listado (filtros y página); una página que se queda sin filas se acota a la última. El botón «Borrar» por fila, con `aria-label` «Borrar {Apellidos, Nombre}», lo añade esta historia.

> **Nota (US17, 2026-10-22):** el listado ya tiene la columna «Acciones» (tabla) y el pie de cada tarjeta con el enlace «Editar» (`aria-label` «Editar {Apellidos, Nombre}»), que lleva la búsqueda de la URL en el estado de la navegación (`{ listSearch }`). El «Borrar» va **junto a él**, con el patrón de US13 y `ProfessorsPage` (un botón `outline-danger` con `aria-label` «Borrar {Apellidos, Nombre}»). `GET /api/students/{id}` ya existe y devuelve los datos sensibles (`foodType` y `observations`): el diálogo **no debe mostrarlos** ni el borrado escribirlos en el log; solo necesita el nombre. Al borrar, la búsqueda ya está en la URL del listado, que no se toca (el alumno se quita de la lista cargada sin volver a pedirla). Si se borra desde la edición, ya no existe la página a la que volver: se navega a `/alumnos` con la búsqueda recibida (`returnSearchFrom`) y un aviso. Un `PUT` de edición que llega después del borrado responde `404` por el bloqueo de la fila del alumno, que el borrado tomará igual (`FOR UPDATE`, filtrando por colegio).

---

#### Decisiones (validadas por la persona usuaria, 2026-10-22)

* **Borrado real**, como los cursos (US08) y los profesores (US13): se borra la fila del alumno. Sin `status` ni `deleted_at`, sin migración, sin papelera ni deshacer; el diálogo dice que no se puede deshacer. No se conservan datos de menores que ya no están en el colegio.
* **Nada que arrastrar.** `students` no tiene tablas hijas hoy: el comedor, la beca y el tipo de comida son columnas del propio alumno y se van con la fila. La ficha anterior hablaba de una tabla `students_meals`, de «registros de comedor» y de `ON DELETE CASCADE`: **no existen** y se retiran (el diálogo no cuenta nada). Cuando existan los horarios, una historia propia añadirá la consulta de impacto al diálogo, como la de US08.
* **El diálogo no consulta al alumno.** Usa el nombre que ya tiene la fila del listado: no hay nada que avisar y así `foodType` y `observations` (datos sensibles) no viajan al navegador para borrar. Si el alumno ya no existe, el `DELETE` responde `404` y se avisa (diferencia con US13, cuyo diálogo sí pide la tutoría).
* **«Borrar» solo en el listado**, no en la edición (como cursos y profesores). Quien edita a un alumno que otra persona acaba de borrar ya ve «Este alumno no existe o ya no está disponible» (US17).
* **Una sola confirmación**, no doble: el diálogo con «Cancelar» como foco inicial ya protege del borrado accidental, como en US08 y US13.
* **Ajustes a lo que ya rige en el proyecto:** un aviso `role="status"` en la página en lugar de un «toast», sin sincronización automática en menos de 3 segundos (ninguna página se actualiza sola: la lista se actualiza al borrar y al volver a abrirla), sin límite de borrados por minuto, y el log solo con identificadores.
* **Los filtros se conservan aunque el borrado vacíe su curso o su clase**: si se filtra por «1º A» y se borra a su último alumno, la lista pasa a «No hay alumnos que coincidan con los filtros» con «Limpiar filtros», en lugar de saltar a todos los alumnos. Para ello la URL se valida y los desplegables se calculan sobre la lista **tal como se cargó**, mientras que las filas, el total y la página salen de la lista ya sin el alumno borrado; al volver a abrir `/alumnos` se pide de nuevo y las opciones se recalculan.

#### Casos de uso y reglas de negocio

* **Acceso:** cualquier usuario autenticado del colegio (`ADMIN` o `MEMBER`), desde un botón «Borrar» (`outline-danger`, `aria-label` «Borrar {Apellidos, Nombre}», que contiene el texto visible) **junto a «Editar»** en la celda «Acciones» de cada fila y en el pie de cada tarjeta de `/alumnos`.
* **Diálogo de confirmación** (`components/DeleteStudentModal`, a imagen de `DeleteProfessorModal` pero sin la consulta): título «¿Borrar a {Nombre Apellidos}?», «Esta acción no se puede deshacer», «Cancelar» y «Borrar alumno». Foco inicial en «Cancelar»; sin «X» de cabecera; siempre montado y controlado por el alumno elegido, para devolver el foco al botón «Borrar» que lo abrió. No muestra curso, clase ni datos sensibles.
* **Borrar:** `DELETE /api/students/{id}` en una transacción con la fila del alumno bloqueada (`FOR UPDATE`, filtrando por colegio) y su borrado. Responde `200` con `{ deleted: { id } }`. Un alumno de otro colegio, inexistente, ya borrado o con un identificador que no es un UUID responde `404` sin distinguir el caso.
* **Mientras se borra:** «Borrando…» y botones deshabilitados, con guarda síncrona contra la doble pulsación; ni Escape ni el clic fuera cierran el diálogo.
* **Tras borrar:** el diálogo se cierra, la lista cargada quita al alumno **sin volver a pedirla** (el total, los filtros y la página se recalculan; una página que se queda sin filas se acota a la última, `Math.min(page, pageCount)` como hasta ahora), un `role="status"` dice «Alumno «Ana García» eliminado» y el foco pasa al título (un turno después de cerrar el diálogo, como US08 y US13). **La URL del listado no se toca** (filtros y página) y el texto de la búsqueda se conserva. El aviso de borrado sustituye al de «creado» o «actualizado» que pudiera haber por haber llegado de otra página.
* **El alumno ya no existe** (otra persona lo borró, o es de otro colegio): un `404` al borrar cierra el diálogo, muestra «Ese alumno ya no existe» y vuelve a pedir la lista. Un fallo al borrar se queda en el diálogo con un `role="alert"` («No se pudo borrar el alumno. Inténtalo de nuevo») y se puede reintentar. Si la sesión se perdió, no hace nada: `AuthenticatedLayout` lleva a `/login`.
* **Concurrencia:** con el bloqueo de la fila, una edición (`PUT`, US17) simultánea espera y, si el borrado confirma primero, responde `404`; de dos borrados simultáneos, uno responde `200` y el otro `404`. El borrado solo toma la fila del alumno (no el curso), así que no puede interbloquearse con el borrado de un curso (que toma el curso y después sus alumnos) ni con la edición (curso y después alumno).
* **Observabilidad:** evento `STUDENT_DELETED` con `school_id`, `actor_id` y `student_id`, **nunca** nombres, curso, clase, comedor ni datos sensibles; un `404` no deja evento (como US13).

#### Contrato de la API (`docs/api-spec.yml`, primero)

* **`DELETE /api/students/{id}`** (`deleteStudent`, Bearer, parámetro `StudentId` ya existente): `200` con `{ deleted: { id } }` (`DeleteStudentResponse`, con `Cache-Control: no-store`); `401`; `404 NOT_FOUND` (`StudentNotFound`, ya existente); `500`; `503`. Sin cuerpo en la petición ni códigos de error nuevos.

#### Criterios de Aceptación

* **CA1 (Botón y diálogo):** Dado el listado, cuando pulso «Borrar» en «García, Ana», entonces se abre un diálogo «¿Borrar a Ana García?» con «Esta acción no se puede deshacer», el foco en «Cancelar», sin curso, clase ni datos sensibles, y sin que se haga ninguna petición.
* **CA2 (Confirmar):** Dado el diálogo abierto, cuando pulso «Borrar alumno», entonces se envía un único `DELETE`, el diálogo se cierra, el alumno desaparece de la lista sin volver a pedirla, el total baja en uno, veo «Alumno «Ana García» eliminado» y el foco está en el título.
* **CA3 (URL y búsqueda):** Dado que filtro por curso, comedor y página 2 y busco por texto, cuando borro un alumno, entonces la URL conserva los filtros y la página, el texto sigue escrito y el listado muestra «Mostrando N de M» recalculado.
* **CA4 (Página y filtros vacíos):** Dado que era el único alumno de la última página, entonces se muestra la anterior; dado que era el único resultado de los filtros, aparece «No hay alumnos que coincidan con los filtros» con «Limpiar filtros» y los filtros siguen aplicados aunque su curso o su clase se hayan quedado sin alumnos; dado que era el último alumno del colegio, aparece «Todavía no hay alumnos».
* **CA5 (Cancelar):** «Cancelar» o Escape cierran el diálogo sin borrar nada y devuelven el foco al botón «Borrar» de esa fila.
* **CA6 (Doble pulsación y espera):** Durante el borrado veo «Borrando…», los botones están deshabilitados, Escape y el clic fuera no cierran y se envía una única petición.
* **CA7 (Ya no existe):** Si el alumno ya no existe al confirmar, el diálogo se cierra, veo «Ese alumno ya no existe» y la lista se vuelve a pedir.
* **CA8 (Fallo):** Si el borrado falla, veo «No se pudo borrar el alumno. Inténtalo de nuevo» en el diálogo, el alumno sigue en la lista y puedo reintentar.
* **CA9 (Concurrencia):** De dos borrados simultáneos del mismo alumno, uno responde `200` y el otro `404`; una edición simultánea espera y, si el borrado confirma primero, responde `404`; el borrado de un alumno y el de su curso a la vez terminan sin interbloqueo.
* **CA10 (Atomicidad):** Si el borrado falla a mitad (un disparador en la prueba), el alumno sigue como estaba y no se escribe el evento.
* **CA11 (Acceso y aislamiento):** Un `MEMBER` puede borrar; un alumno de otro colegio, inexistente o con un `id` que no es un UUID da `404` y no se borra nada; sin sesión, `401`; borrar a un alumno no altera su curso, su clase ni a los demás alumnos.
* **CA12 (Observabilidad y datos sensibles):** El log solo lleva `STUDENT_DELETED` con identificadores; ni el nombre, ni el curso, ni el tipo de comida ni las observaciones aparecen en el log ni en la petición del borrado.
* **CA13 (Accesibilidad, responsive e i18n):** el diálogo tiene nombre (su título), foco inicial y retorno de foco; «Borrar» con nombre accesible por fila y por tarjeta; sin violaciones de `axe` (abierto, borrando, con error); sin desplazamiento horizontal a 360 px con el diálogo abierto; textos en `es.json` y `en.json`.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Contrato:** `docs/api-spec.yml` (`deleteStudent` y `DeleteStudentResponse`), `npm run api:types -w frontend` y `api/schema.test.ts`.
* **Backend:** `application/students/deleteStudent.ts` (`DeleteStudent`: un único borrado y el evento), el método `delete(schoolId, studentId)` del puerto `StudentRepository` (`true` si lo borró, `false` si no está en el colegio) y de `PrismaStudentRepository` (bloqueo de la fila filtrando por colegio y borrado, en una transacción), la ruta `DELETE /:id` en `studentsRouter` con `parseStudentId`, la raíz de composición (`composeApp.ts`, `app.ts` y `test/support/appDoubles.ts`) y el evento `STUDENT_DELETED`. `StudentNotFound` ya está mapeado a `404` en `errorHandler.ts`.
* **Frontend:** `studentsService.delete` (resultado `deleted`, `notFound`, `unauthenticated` o `unavailable`), `components/DeleteStudentModal.tsx` (sin consulta previa), el botón «Borrar» junto a «Editar» y el aviso en `StudentsPage` (quitar de la lista cargada, aviso propio que sustituye al de llegada, foco al título, catálogo de la lista cargada para validar la URL y los desplegables) y los textos (`students.delete.*`, `students.deleteLabel` y `students.deleteButton`).
* **E2E:** `cypress/e2e/students.cy.ts` (borrar desde un listado filtrado y en página 2 conservando la URL, cancelar con Escape y foco, el alumno que ya no existe al confirmar, el último alumno de un curso filtrado, un `MEMBER`, y a 360 px con el diálogo abierto).
* **Documentación:** `backend/CLAUDE.md` y `frontend/CLAUDE.md` (borrado de alumnos y el catálogo de filtros), `README.md` (árbol), la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL) y la ficha de esta historia. No hay patrón nuevo para los estándares: es el de US13.

##### Requisitos de Testing (Pre-release)

* **Backend unitario:** `DeleteStudent` borra y escribe `STUDENT_DELETED` solo con identificadores; si el repositorio devuelve `false` lanza `StudentNotFound` y no escribe nada; no escribe nombres ni datos sensibles. Ruta (`studentsRoute.test.ts`): `200`, `401`, `404` y un `id` que no es UUID sin llamar al caso de uso.
* **Backend de integración:** repositorio contra PostgreSQL (borra solo del colegio, `false` para otro colegio o inexistente, no toca el curso, la clase ni otros alumnos, dos borrados simultáneos, un `PUT` simultáneo, el borrado de un curso a la vez sin interbloqueo y la atomicidad con un disparador) y HTTP (`students.int.test.ts`: `200` con `no-store`, el alumno desaparece del `GET /api/students`, `MEMBER`, otro colegio `404`, `id` mal formado `404`, sin sesión `401`).
* **Frontend:** servicio (los cuatro resultados y el `DELETE` sin cuerpo), `DeleteStudentModal` (foco, Escape, doble pulsación, error y `404`), `StudentsPage` (botón por fila y tarjeta, URL y búsqueda intactas, página y filtros vacíos, aviso y foco, `404` que recarga) y accesibilidad con `axe`.
* **Manual y E2E:** pruebas con `curl` (200, 401, 404, `id` inválido, otro colegio y borrado repetido), E2E completo y comprobación de la base de datos antes y después.
* **Cobertura mínima:** 90 % backend y 80 % frontend.

##### Definición de hecho

* Tests en verde con la cobertura mínima (90 % backend, 80 % frontend), `lint`, `typecheck`, `build` y `api:types:check`; pruebas con `curl`; E2E completo; PR integrada; despliegue y comprobación en producción.

##### Riesgos y mitigaciones

* **Borrado accidental:** diálogo con «Cancelar» como foco inicial y botón rojo; sin deshacer, y el diálogo lo dice.
* **Datos sensibles:** el diálogo no consulta al alumno y el evento solo lleva identificadores; un test comprueba que el log no contiene el nombre.
* **Concurrencia:** el bloqueo de la fila serializa el borrado con la edición y con otro borrado; no toma el curso, así que no hay interbloqueo con el borrado de cursos.
* **Filtros que se vacían:** validar la URL contra la lista tal como se cargó evita el salto a «todos los alumnos»; se recalcula al recargar.
* **Alumno de otro colegio:** `404` indistinguible, filtrando por colegio en el propio `SELECT … FOR UPDATE`.
* **Futuros horarios:** cuando existan, el borrado tendrá que retirar o contar lo que se pierde (consulta de impacto en el diálogo); esta historia no deja nada que retirar.

---

## Módulo: Configuración de Horarios

### US-BASE: Configurar Calendario Base del Horario Escolar (crear y ver)

**Épica:** [5. Configuración de Horarios (Base + Asignaturas + Restricciones)](#epica-5-configuracion-de-horarios-base--asignaturas--restricciones)

**Estimación:** 5 puntos de historia. Dos tablas nuevas y una columna nueva en `courses` (una migración), dos endpoints, dos páginas y el primer endpoint de escritura solo para `ADMIN`.

**Historia:** Como administrador del colegio, quiero crear los calendarios base del horario (sesiones, horas y recreos) e indicar qué cursos sigue cada uno, y como usuario del colegio, quiero verlos, para que sirvan de base de todos los horarios que se generen automáticamente.

**Depende de:** US02_b1 (identidad, `requireAuthentication`, `requireRole` y `RequireRole`), US05 (los cursos) y US04 (la navegación). **Esta ficha se parte en tres:** esta (crear y ver), **US-BASE_b** (editar) y **US-BASE_c** (borrar), como cursos (US05–US08).

> **Nota (Horarios.docx, 2026-10-23):** el documento de partida del producto tiene **dos estructuras horarias** de seis sesiones de 45 min: Primaria (patio 11:15–11:45, sesión 4 de 11:45 a 12:30) e Infantil (patio 11:15–12:00 y sesión 4 reducida, de 12:00 a 12:30). La ficha anterior hablaba de «un calendario por colegio (o por nivel)» sin decir cómo se asigna a los cursos; las decisiones de abajo lo resuelven.

---

#### Decisiones (validadas por la persona usuaria, 2026-10-23)

* **Varios calendarios por colegio, y cada curso sigue como mucho uno.** Cada calendario es una estructura (p. ej. «Primaria» e «Infantil»). La relación es `courses.calendar_id`, nulo y `ON DELETE SET NULL`: un curso sin calendario es válido (el motor de generación lo avisará cuando exista, no esta historia).
* **El calendario se asigna a los cursos desde el formulario del calendario** («Cursos que siguen este calendario», una lista de casillas), no desde los de cursos: **no cambian la API ni las pantallas de cursos** (US05–US08). Un curso solo puede estar en un calendario: marcarlo en otro lo **mueve**, y el formulario avisa de ello.
* **Un calendario guarda solo la estructura semanal**: nombre y periodos (sesiones y recreos), **iguales de lunes a viernes**. Sin fechas, curso académico, estado ni borrado lógico. **Cambia el glosario del PRD**, que definía el calendario base con fechas: los horarios que se generan son semanales y nada de lo que viene después usa fechas; el glosario se actualiza con esta historia.
* **Tres historias** (crear y ver, editar, borrar), cada una con su ciclo de despliegue.
* **Ajustes a la ficha anterior y a lo que rige en el proyecto:** sin «toast» (un aviso `role="status"` en la página), sin paginación (un colegio tiene pocos calendarios, así que el listado se carga entero), sin estado `ACTIVE`/`ARCHIVED`, sin «calendario en uso» ni marcar horarios como `NEEDS_REVIEW` (no existen horarios todavía; llegarán con el motor de generación), y el resumen de CA17 («25 franjas de 45 min» con 270 minutos) era incoherente: se muestra «N sesiones al día · 5×N a la semana · M minutos lectivos al día».

#### Casos de uso y reglas de negocio

* **Acceso:** `GET /api/calendars` lo usan `ADMIN` y `MEMBER` (el `MEMBER` los ve en solo lectura); `POST /api/calendars` es **solo `ADMIN`** (`requireAuthentication` y `requireRole('ADMIN')`: un `MEMBER` recibe `403 FORBIDDEN` y no se crea nada, con el evento `AUTHORIZATION_DENIED` que ya existe). El colegio sale siempre de la identidad.
* **Calendario:** nombre obligatorio, de 1 a 100 caracteres tras recortar espacios, con las mismas reglas que el nombre de un curso (letras, dígitos, `º`, `ª`, `-`, `/` y espacios, los repetidos se colapsan); **único por colegio** sin distinguir mayúsculas ni espacios sobrantes (`409 CALENDAR_ALREADY_EXISTS`).
* **Periodos** (`periods`, una lista ordenada por hora, la misma estructura de lunes a viernes): cada uno es una `SESSION` o un `BREAK` con `startTime` y `endTime` en `HH:MM` de 24 horas (de `00:00` a `23:59`).
  * De 1 a **8 sesiones** y de 0 a **2 recreos**. Un recreo va **entre dos sesiones** (ni el primero ni el último, ni dos seguidos).
  * `endTime` posterior a `startTime`; cada periodo dura **como máximo 90 minutos** (sesión o recreo); un periodo no puede empezar antes de que acabe el anterior (pueden ser contiguos o dejar un hueco).
  * El **número de sesión** (1, 2, 3…) no se guarda: sale del orden entre las `SESSION`; quitar o mover una renumera sola.
* **Generación automática (solo en el formulario, no es un endpoint):** con hora de inicio, número de sesiones, duración, y opcionalmente un recreo tras la sesión N y su duración, «Generar» rellena la tabla de periodos contiguos (09:00, 6 sesiones de 45 min y un recreo de 30 tras la 3.ª da 09:00–09:45, 09:45–10:30, 10:30–11:15, recreo 11:15–11:45, 11:45–12:30, 12:30–13:15, 13:15–14:00). Después se editan **a mano**, una hora a la vez (Infantil: recreo 11:15–12:00 y sesión 4 de 12:00 a 12:30). El formulario arranca con los valores por defecto (09:00, 6 sesiones, 45 min, sin recreo) ya generados, así que solo falta el nombre.
* **Cursos asignados** (`courseIds`, opcional): los cursos del colegio que siguen este calendario. Sin repetidos; uno de otro colegio o que no existe es `400` con `NOT_FOUND` en `courseIds[<i>]`. Si un curso ya seguía otro calendario, **se mueve** (su `calendar_id` cambia en la misma transacción).
* **Alta atómica:** el calendario, sus periodos y las asignaciones de cursos se guardan en una transacción: o todo o nada. Los cursos se bloquean `FOR UPDATE` **en orden de `id`** (así dos altas con cursos en común no se interbloquean, y el borrado o la edición de un curso esperan a la transacción o no encuentran el curso).
* **Dos altas con el mismo nombre a la vez:** una responde `201` y la otra `409` (índice único, sin consulta previa).
* **Navegación:** la cabecera gana el enlace **«Calendario»** (`/calendarios`) para `ADMIN` y `MEMBER`, entre «Alumnos» y «Usuarios». `/calendarios/nuevo` cuelga de `RequireRole role="ADMIN"` (un `MEMBER` va a `/onboarding` sin mensaje, solo una comodidad: decide el backend).
* **Listado (`/calendarios`):** carga única (también con `StrictMode`) con «Reintentar» si falla. Una tarjeta por calendario: su nombre, la tabla de periodos («Sesión 1 · 09:00–09:45», «Recreo · 11:15–11:45»…), «N sesiones al día · 5×N a la semana · M minutos lectivos al día» (los recreos no cuentan) y los cursos que lo siguen («1º Primaria, 2º Primaria» o «Sin cursos asignados»). Vacío: «Todavía no hay calendarios» con «Crear calendario» para el `ADMIN` y, para el `MEMBER`, «Solo los administradores pueden crear y modificar los calendarios». El botón «Crear calendario» **solo se pinta para el `ADMIN`** (no se muestra deshabilitado). El aviso `{ calendarCreated: nombre }` de la navegación se lee con una guarda de tipo y se muestra como texto plano.
* **Formulario (`/calendarios/nuevo`):** `CalendarForm` (extraído para reutilizarlo en US-BASE_b), con el nombre, el bloque «Generar sesiones», la tabla de periodos editable (cada fila: tipo, inicio y fin con `<input type="time">`; «Añadir sesión», «Añadir recreo» y «Quitar» por fila) y «Cursos que siguen este calendario», con la lista de cursos y, en los que ya siguen otro, «Ahora sigue «Primaria»: se moverá» (se cruzan los cursos con `GET /api/calendars`). Valida antes de enviar con las mismas reglas que el backend (tabla compartida `test-fixtures/calendar-fields.json`), foco en el primer campo inválido, errores bajo su fila, guarda síncrona contra el doble envío y el error de red o del servidor como `role="alert"`. Con el `201` navega a `/calendarios` con `replace` y el aviso «Calendario «X» creado».
* **Observabilidad:** eventos `CALENDAR_CREATED` (`school_id`, `actor_id`, `calendar_id`, `session_count`, `break_count`, `course_count`) y `CALENDAR_CREATION_REJECTED` (`reason: duplicate | course_not_found`), nunca nombres.

#### Modelo de datos (migración `add_calendars`)

* **`calendars`:** `id` (UUIDv7), `school_id` (clave ajena a `schools`, sin cascada), `name` (`VARCHAR(100)`), `normalized_name` (`VARCHAR(100)`), `created_at`, `updated_at`; único `(school_id, normalized_name)`.
* **`calendar_periods`:** `id` (UUIDv7), `calendar_id` (clave ajena a `calendars`, `ON DELETE CASCADE`), `position` (`SMALLINT`, orden dentro del día desde 1), `kind` (enum `SESSION` o `BREAK`), `start_minute` y `end_minute` (`SMALLINT`: minutos desde las 00:00, para evitar los problemas de zona horaria de `TIME` con Prisma), `created_at`, `updated_at`; único `(calendar_id, position)` y un `CHECK` escrito a mano (`start_minute >= 0 AND end_minute <= 1439 AND end_minute > start_minute`). El solapamiento, el máximo de sesiones y de recreos y la regla del recreo se validan en la aplicación.
* **`courses.calendar_id`:** nulo, clave ajena a `calendars` con `ON DELETE SET NULL`, con índice. Es compatible hacia atrás: `GET` y `PUT /api/courses` **no cambian ni lo exponen**.
* Revisa el SQL de cada `prisma migrate dev` posterior: el `CHECK` está escrito a mano.

#### Contrato de la API (`docs/api-spec.yml`, primero)

* **`POST /api/calendars`** (`createCalendar`, Bearer, solo `ADMIN`): cuerpo `CreateCalendarRequest` (`name`, `periods: [{ type: SESSION|BREAK, startTime, endTime }]`, `courseIds?: uuid[]`, sin más propiedades); `201` con `{ calendar: Calendar }` y `Cache-Control: no-store`; `400 VALIDATION_ERROR`; `401`; `403 FORBIDDEN` (un `MEMBER`); `409 CALENDAR_ALREADY_EXISTS`; `500`; `503`.
* **`GET /api/calendars`** (`listCalendars`, Bearer, `ADMIN` y `MEMBER`): `200` con `{ calendars: Calendar[] }` ordenados por nombre (`compareText`), cada uno con sus `periods` en orden y sus `courses` (`{ id, name }`, en orden natural); `401`; `500`; `503`.
* **`Calendar`:** `id`, `name`, `periods`, `courses` y `createdAt`. **Códigos nuevos:** `CALENDAR_ALREADY_EXISTS` en `ErrorCode` y en `ERROR_CODES` de `appError.ts` a la vez (un test falla si no coinciden), y en `FieldErrorCode`: `INVALID_RANGE` (el fin no es posterior al inicio), `TOO_LONG` (más de 90 minutos) y `OVERLAP` (empieza antes de que acabe el anterior). Se reutilizan `REQUIRED` (sin ninguna sesión), `INVALID_LENGTH` (más de 8 sesiones o 2 recreos o 100 cursos), `INVALID_FORMAT` (hora mal escrita), `NOT_ALLOWED` (un recreo en el sitio equivocado), `DUPLICATE` y `NOT_FOUND`. Los campos se indican como `periods[<i>].startTime`, `periods[<i>].type` y `courseIds[<i>]`.

#### Criterios de Aceptación

* **CA1 (Acceso y navegación):** Dado un `ADMIN`, cuando abro el menú, entonces veo «Calendario» y en `/calendarios` el botón «Crear calendario»; dado un `MEMBER`, veo el listado sin ese botón y con «Solo los administradores pueden crear y modificar los calendarios», `/calendarios/nuevo` me lleva a `/onboarding` y `POST /api/calendars` responde `403 FORBIDDEN` sin crear nada.
* **CA2 (Formulario de partida):** Dado el formulario de alta, cuando lo abro, entonces la tabla ya tiene 6 sesiones contiguas de 45 min desde las 09:00 y solo falta el nombre.
* **CA3 (Generar Primaria):** Dado 09:00, 6 sesiones, 45 min y un recreo de 30 min tras la sesión 3, cuando pulso «Generar», entonces la tabla queda 09:00–09:45, 09:45–10:30, 10:30–11:15, recreo 11:15–11:45, 11:45–12:30, 12:30–13:15, 13:15–14:00.
* **CA4 (Editar a mano, Infantil):** Dado esa tabla, cuando cambio el recreo a 11:15–12:00 y la sesión 4 a 12:00–12:30 y guardo con el nombre «Infantil», entonces se crea y el listado muestra esas horas.
* **CA5 (Crear y ver):** Dado un calendario válido, cuando pulso «Guardar», entonces se envía un único `POST`, vuelvo a `/calendarios` con «Calendario «Primaria» creado» y la tarjeta muestra los periodos y «6 sesiones al día · 30 a la semana · 270 minutos lectivos al día».
* **CA6 (Cursos que lo siguen):** Dado que marco «1º Primaria» y «2º Primaria», cuando guardo, entonces la tarjeta los lista; dado que «1º Primaria» seguía otro calendario, el formulario lo avisaba («Ahora sigue «Infantil»: se moverá») y, tras guardar, ese curso ya no aparece en el otro.
* **CA7 (Nombre):** Dado el nombre vacío, de más de 100 caracteres o con caracteres no admitidos, cuando guardo, entonces el error sale bajo el campo con el foco y no se envía nada; dado «primaria » cuando «Primaria» ya existe, entonces `409` y el error en el nombre.
* **CA8 (Periodos inválidos):** Dado un periodo de más de 90 minutos, con el fin no posterior al inicio, que solapa con el anterior, un recreo al principio, al final o junto a otro, una novena sesión, un tercer recreo o ninguna sesión, cuando guardo, entonces el error sale bajo su fila con el foco en la primera inválida y no se envía nada; el servidor responde `400` con los mismos códigos (`TOO_LONG`, `INVALID_RANGE`, `OVERLAP`, `NOT_ALLOWED`, `INVALID_LENGTH`, `REQUIRED`).
* **CA9 (Curso que ya no existe):** Dado un curso que otra persona borró antes de guardar, o de otro colegio, cuando guardo, entonces `400` con `courseIds[<i>]` `NOT_FOUND`, el formulario vuelve a pedir los cursos y conserva lo escrito.
* **CA10 (Atomicidad):** Si el alta falla a mitad (un disparador en la prueba), no queda ni el calendario, ni sus periodos, ni ningún curso movido.
* **CA11 (Concurrencia):** Dos altas simultáneas con el mismo nombre responden `201` y `409`; el alta con un curso y el borrado de ese curso a la vez dan `201` o `400`, nunca `500` ni interbloqueo; dos altas con cursos en común terminan sin error y cada curso en el último calendario que lo tomó.
* **CA12 (Aislamiento y sesión):** Los calendarios de otro colegio nunca se ven; sin sesión, `401`; un curso de otro colegio en `courseIds` es `NOT_FOUND`.
* **CA13 (Listado vacío, error y solo lectura):** Sin calendarios veo «Todavía no hay calendarios» (con «Crear calendario» solo si soy `ADMIN`); si la lista falla, un aviso con «Reintentar»; un `MEMBER` ve los mismos calendarios que el `ADMIN`.
* **CA14 (Accesibilidad, responsive e i18n):** cada hora tiene etiqueta accesible («Inicio de la sesión 1»), los errores van ligados por `aria-describedby`, sin violaciones de `axe`, sin desplazamiento horizontal a 360 px (la tabla de periodos se adapta) y los textos en `es.json` y `en.json`.
* **CA15 (Observabilidad):** El log solo lleva `CALENDAR_CREATED` y `CALENDAR_CREATION_REJECTED` con identificadores y recuentos, nunca el nombre del calendario ni de los cursos.

**Fuera de alcance:** editar (US-BASE_b), borrar (US-BASE_c), fechas, curso académico, estado, «calendario en uso» y marcar horarios, paginación, estructuras distintas por día de la semana, asignar el calendario desde las pantallas de cursos, avisar de los cursos sin calendario (llegará con el motor de generación) y cualquier uso de los calendarios por los horarios.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Contrato:** `docs/api-spec.yml` (`createCalendar`, `listCalendars`, `CreateCalendarRequest`, `Calendar`, `CalendarPeriod`, `CALENDAR_ALREADY_EXISTS` y los tres códigos de campo nuevos), `npm run api:types -w frontend` y `api/schema.test.ts`.
* **Modelo:** `backend/prisma/schema.prisma` (`Calendar`, `CalendarPeriod`, `Course.calendarId`) y la migración `add_calendars` con el `CHECK` a mano; `docs/Modelo_de_Datos/MODELO_DATOS.md` (sustituir las secciones `calendars` y `sessions` del modelo antiguo por las reales).
* **Backend:** `domain/calendar/` (`Calendar`, `CalendarPeriod`, el puerto `CalendarRepository`, `CalendarAlreadyExists`), `application/calendars/` (`CreateCalendar`, `ListCalendars`, `createCalendarRequest.ts` con las reglas de periodos, compartidas con el frontend por `test-fixtures/calendar-fields.json`), `infrastructure/prisma/prismaCalendarRepository.ts`, `presentation/calendars/calendarsRouter.ts` (`GET` para los dos roles y `POST` con `requireRole('ADMIN')`), `errorHandler` (`409`), `appError.ts`, `app.ts`, `composeApp.ts` y `test/support/appDoubles.ts`.
* **Frontend:** `services/calendarsService.ts`, `validation/calendarValidation.ts`, `utils/calendarPeriods.ts` (generar los periodos, números de sesión y totales: funciones puras), `components/CalendarForm.tsx`, `pages/CalendarsPage.tsx` y `pages/CreateCalendarPage.tsx`, `App.tsx` (las dos rutas; la de alta bajo `RequireRole`), `AppHeader.tsx` («Calendario»), i18n y `cypress/e2e/calendars.cy.ts`.
* **Documentación:** `backend/CLAUDE.md` y `frontend/CLAUDE.md`, `docs/backend-standards.md` y `docs/frontend-standards.md` (escritura solo para un rol y lectura para los dos; horas como minutos desde medianoche; lista ordenada con posición), `README.md`, la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL: 12 tablas) y el glosario del PRD (calendario base sin fechas).

##### Requisitos de Testing (Pre-release)

* **Backend unitario:** el parser con la tabla compartida (todos los códigos y el orden de los errores, incluidos recreo mal colocado, solapes y límites de 8 sesiones, 2 recreos y 90 minutos); `CreateCalendar` (eventos sin nombres, `CourseNotFound` a `400`, `409`) y `ListCalendars` (orden); la ruta (`201`, `403` para un `MEMBER`, `401`, `409`, `400`, `503`, `GET` para los dos roles y `no-store`).
* **Backend de integración:** repositorio contra PostgreSQL (alta atómica con periodos y cursos movidos, `UNIQUE` de nombre, otro colegio, atomicidad con un disparador, dos altas con el mismo nombre, alta contra borrado del curso, dos altas con cursos en común) y HTTP completo (`ADMIN`, `MEMBER`, aislamiento y registro sin nombres).
* **Frontend:** servicio, validación (misma tabla), las funciones puras de periodos (generar, números, totales), `CalendarForm` (generar, editar a mano, añadir y quitar, avisos de cursos que se mueven, errores, doble envío, `axe`), las dos páginas por rol (botón solo para `ADMIN`, redirección del `MEMBER`) y la cabecera.
* **Manual y E2E:** `curl` (incluido el `403` de un `MEMBER` real) y E2E (Primaria e Infantil con las horas del documento, mover un curso entre calendarios, un `MEMBER`, `409` y 360 px).
* **Cobertura mínima:** 90 % backend y 80 % frontend.

##### Definición de hecho

* Tests en verde con la cobertura mínima (90 % backend, 80 % frontend), `lint`, `typecheck`, `build` y `api:types:check`; pruebas con `curl`; E2E completo; PR integrada; despliegue y comprobación en producción (la migración se aplica en el despliegue).

##### Riesgos y mitigaciones

* **La migración toca `courses`:** la columna es nula y nueva, así que no cambia los datos ni la API de cursos; un test de integración comprueba que `GET /api/courses` no la devuelve.
* **Dos altas con cursos en común:** bloqueo de los cursos en orden de `id`; test de concurrencia.
* **Horas:** minutos desde medianoche en la base de datos y `HH:MM` en la API, con una única función de conversión probada; sin zona horaria.
* **Solapamientos, máximos y regla del recreo solo en la aplicación:** el parser comparte la tabla de casos con el frontend, y el `CHECK` de la base de datos cubre lo mínimo (`end > start`).
* **`input type="time"`:** su aspecto (12 h o 24 h) depende del navegador; el valor siempre es `HH:MM`, y los tests comprueban el valor.
* **Un colegio con un curso sin calendario:** válido ahora; el motor de generación lo exigirá.

---

### US-BASE_b: Editar un calendario base

**Épica:** [5. Configuración de Horarios (Base + Asignaturas + Restricciones)](#epica-5-configuracion-de-horarios-base--asignaturas--restricciones)

**Estimación:** 3 puntos de historia. Dos endpoints (`GET` y `PUT /api/calendars/{id}`), una página y la edición en `CalendarForm`; **sin migraciones**.

**Historia:** Como administrador del colegio, quiero editar un calendario (nombre, sesiones, recreos y cursos que lo siguen), para ajustarlo cuando cambia la jornada.

**Depende de:** US-BASE (tablas, `CalendarForm`, `calendarsRouter`, `CalendarsPage`, reglas de los periodos y orden por hora al guardar), US07 y US17 (el patrón de edición: estado final, `404` sin distinguir, `requireChanges` y «Guardar» solo con cambios).

---

#### Decisiones (validadas por la persona usuaria, 2026-10-25)

* **Gana el último guardado**, como en US17: cada `PUT` envía el estado final completo y prevalece el último que se confirma. Sin versión ni `409` de conflicto (los calendarios los editan pocos administradores y pocas veces).
* **Un curso que se desmarca queda sin calendario** (`calendar_id` nulo), sin diálogo de confirmación: se deshace volviendo a marcarlo. El formulario lo avisa bajo el curso («Se quedará sin calendario»).
* **Heredadas de US-BASE:** solo `ADMIN` escribe (un `MEMBER` recibe `403` y la página cuelga de `RequireRole`); estructura semanal sin fechas ni estado; un curso sigue como mucho un calendario y marcarlo aquí lo **mueve** desde el otro; el orden de las filas es el de la jornada (se ordenan por hora al guardar). **Sin** «calendario en uso» ni horarios `NEEDS_REVIEW`: no existen horarios; llegarán con el motor de generación, que decidirá qué hacer si una edición deja huérfanas las sesiones de un horario.

#### Casos de uso y reglas de negocio

* **Acceso:** `GET /api/calendars/{id}` lo usan `ADMIN` y `MEMBER` (las lecturas son de los dos roles); `PUT /api/calendars/{id}` es **solo `ADMIN`** (`requireRole('ADMIN')` **antes** de leer el `id` y el cuerpo: un `MEMBER` recibe `403 FORBIDDEN` aunque el calendario no exista o el cuerpo sea inválido, sin revelar nada). El colegio sale de la identidad.
* **`404` sin distinguir:** un `id` que no es UUID, un calendario inexistente, de otro colegio o borrado por otra persona responden `404 NOT_FOUND` (el código común de los recursos que no están, como `CourseNotFound`), al leer y al guardar.
* **Estado final:** el cuerpo es el del alta (`{ name, periods, courseIds? }`) con **las mismas reglas y el mismo parser** que `POST` (nombre de 1 a 100 caracteres, de 1 a 8 sesiones, hasta 2 recreos entre sesiones, hasta 90 minutos por periodo, fin posterior al inicio, sin solapes, `courseIds` sin repetidos y del colegio). `courseIds` ausente equivale a `[]`: el calendario se queda sin cursos.
* **Nombre:** renombrar a uno que ya tiene **otro** calendario del colegio es `409 CALENDAR_ALREADY_EXISTS`; cambiar solo mayúsculas o espacios del propio nombre es válido (es la misma fila).
* **Periodos:** se **reemplazan** enteros: se borran los del calendario y se insertan los recibidos con `position` desde 1, en la misma transacción (el índice único `(calendar_id, position)` lo permite porque se borra antes). Sus `id` cambian; hoy nada los referencia.
* **Cursos:** los de `courseIds` pasan a este calendario (también si seguían otro: se mueven); los que lo seguían y ya no están en `courseIds` pasan a **sin calendario**. Uno de otro colegio o inexistente es `400` con `NOT_FOUND` en `courseIds[<i>]` y no se cambia nada.
* **Transacción y bloqueos:** en una sola transacción, primero la fila del calendario `FOR UPDATE` (filtrada por colegio; si no está, `404` antes de mirar los cursos), después los cursos —la unión de los pedidos y de los que lo siguen hoy— `FOR UPDATE` **en orden de `id`** (el mismo orden que el alta, así que no hay interbloqueos), después el nombre, los periodos y los cursos, y se relee. O todo o nada.
* **Navegación:** en `/calendarios` cada tarjeta lleva, **solo para `ADMIN`**, un enlace «Editar» (`aria-label` «Editar {nombre}») hacia `/calendarios/:id/editar`, que cuelga de `RequireRole role="ADMIN"` (un `MEMBER` va a `/onboarding`). El `NavLink` «Calendario» sigue activo en la subruta.
* **Página de edición:** pide el calendario, los cursos y los calendarios una vez cada uno (también con `StrictMode`); muestra carga, «Este calendario no existe o ya no está disponible» con un enlace a «Calendarios» (un `404` al cargar y al guardar), el error con «Reintentar» o el formulario precargado.
* **Formulario (`CalendarForm` reutilizado):** gana `initialValues` (nombre, periodos y cursos del calendario; solo se leen al montar), `requireChanges` y el texto del botón y del título. «Guardar» está deshabilitado mientras **lo que se enviaría** (nombre limpio, periodos ya ordenados y conjunto de cursos) no difiera de lo cargado; deshacer un cambio lo vuelve a deshabilitar. El bloque «Generar sesiones» sigue y sustituye la tabla, como en el alta. En los cursos: marcados los que lo siguen; bajo uno de otro calendario, «Ahora sigue «X»: se moverá»; bajo uno que se desmarca, «Se quedará sin calendario». Validación, foco, guarda contra el doble envío y errores del servidor como en el alta. «Cancelar» vuelve a `/calendarios`.
* **Al guardar:** con el `200` navega a `/calendarios` con `replace` y `{ calendarUpdated: nombre del servidor }` («Calendario «X» actualizado» en un `role="status"`); un `409` marca el nombre con el foco; un `400` marca sus campos (y vuelve a pedir los cursos si falla `courseIds`); un `404` muestra la vista de no disponible; un `403` el mensaje de solo administradores; cualquier otro fallo, un aviso general conservando lo escrito.
* **Observabilidad:** `CALENDAR_UPDATED` (`school_id`, `actor_id`, `calendar_id`, `changed_fields` —`name`, `periods`, `courses`—, `session_count`, `break_count`, `courses_added`, `courses_removed`) y `CALENDAR_UPDATE_REJECTED` (`reason: not_found | duplicate | course_not_found`). Nunca nombres. Un `PUT` sin cambios es `200` con `changed_fields: []`.

#### Contrato de la API (`docs/api-spec.yml`, primero)

* **`GET /api/calendars/{id}`** (`getCalendar`, Bearer, `ADMIN` y `MEMBER`): `200` con `{ calendar: Calendar }` y `Cache-Control: no-store`; `401`; `404 NOT_FOUND` (respuesta reutilizable `CalendarNotFound`); `500`; `503`.
* **`PUT /api/calendars/{id}`** (`updateCalendar`, Bearer, solo `ADMIN`): cuerpo `UpdateCalendarRequest` (la misma forma que `CreateCalendarRequest`, sin propiedades de más); `200` con `{ calendar: Calendar }` y `no-store`; `400 VALIDATION_ERROR`; `401`; `403 FORBIDDEN`; `404 NOT_FOUND` (`CalendarNotFound`); `409 CALENDAR_ALREADY_EXISTS`; `500`; `503`.
* **Sin códigos nuevos:** se reutilizan `NOT_FOUND` (con la respuesta `CalendarNotFound` en `components.responses`), `CALENDAR_ALREADY_EXISTS` y los códigos de campo del alta. **Sin migraciones** (el modelo de US-BASE basta).

#### Criterios de Aceptación

* **CA1 (Acceso):** Dado un `ADMIN`, cada tarjeta de `/calendarios` lleva «Editar»; dado un `MEMBER`, no lo lleva, `/calendarios/:id/editar` lo lleva a `/onboarding` y `PUT /api/calendars/{id}` responde `403 FORBIDDEN` sin cambiar nada (también con un `id` inexistente o un cuerpo inválido); `GET /api/calendars/{id}` le responde `200`.
* **CA2 (Precarga):** Dado «Primaria» con siete periodos y dos cursos, cuando abro su edición, entonces veo su nombre, sus periodos en orden y sus cursos marcados, y «Guardar» está deshabilitado.
* **CA3 (Solo con cambios):** Dado el formulario cargado, cuando añado un espacio al final del nombre o cambio una hora y la devuelvo a su valor, entonces «Guardar» sigue deshabilitado; con un cambio real, se habilita.
* **CA4 (Renombrar):** Dado «Primaria», cuando la renombro a «Primaria 1º ciclo» y guardo, entonces se envía un único `PUT`, vuelvo a `/calendarios` con «Calendario «Primaria 1º ciclo» actualizado» y la tarjeta lo muestra; renombrarla a «PRIMARIA» también es válido.
* **CA5 (Mover el recreo):** Dado el recreo 11:15–11:45, cuando lo cambio a 11:00–11:30 y reajusto a mano las sesiones de alrededor, entonces se guarda y el listado muestra las horas nuevas; si no las reajusto, el error de solape sale en su fila y no se envía nada.
* **CA6 (Añadir y quitar sesiones):** Dado seis sesiones, cuando añado una séptima y guardo, entonces el resumen dice «7 sesiones al día · 35 a la semana»; cuando quito la sesión 2, las siguientes se renumeran y se guarda.
* **CA7 (Cursos):** Dado «Primaria» con «1º» y «2º Primaria», cuando desmarco «2º» (veo «Se quedará sin calendario») y marco «3º Primaria», que seguía «Infantil» (veo «Ahora sigue «Infantil»: se moverá»), y guardo, entonces «Primaria» tiene «1º» y «3º», «2º» no sigue ninguno e «Infantil» ya no tiene «3º».
* **CA8 (Nombre repetido):** Dado otro calendario «Infantil», cuando renombro «Primaria» a «infantil », entonces `409` y el error en el nombre con el foco, conservando lo escrito.
* **CA9 (Validación):** Dado un periodo inválido, más de 8 sesiones o un nombre vacío, cuando guardo, entonces el error sale bajo su campo con el foco y no se envía nada; el servidor responde `400` con los mismos códigos que en el alta.
* **CA10 (Ya no existe):** Dado un calendario que otra persona borró, cuando abro su edición o guardo, entonces veo «Este calendario no existe o ya no está disponible» con un enlace a «Calendarios»; un `id` que no es UUID da lo mismo.
* **CA11 (Curso que ya no existe):** Dado un curso que otra persona borró antes de guardar, cuando guardo, entonces `400` con `courseIds[<i>]` `NOT_FOUND`, el formulario vuelve a pedir los cursos y conserva lo escrito.
* **CA12 (Atomicidad):** Si la edición falla a mitad (un disparador en la prueba), el calendario conserva su nombre, sus periodos y sus cursos.
* **CA13 (Concurrencia):** Dos ediciones del mismo calendario a la vez terminan las dos con `200` y queda el estado del último en confirmarse, entero (nunca una mezcla de periodos); una edición y el borrado de uno de sus cursos a la vez dan `200` o `400`, nunca `500` ni interbloqueo; una edición y un alta con cursos en común terminan sin error.
* **CA14 (Aislamiento y sesión):** El calendario de otro colegio es `404` al leer y al guardar; sin sesión, `401`.
* **CA15 (Accesibilidad, responsive e i18n):** el enlace «Editar» con su nombre accesible, los avisos de los cursos ligados por `aria-describedby`, sin violaciones de `axe`, sin desplazamiento horizontal a 360 px y los textos en `es.json` y `en.json`.
* **CA16 (Observabilidad):** El log solo lleva `CALENDAR_UPDATED` y `CALENDAR_UPDATE_REJECTED` con identificadores, campos cambiados y recuentos, nunca el nombre del calendario ni de los cursos.

**Fuera de alcance:** borrar (US-BASE_c), detectar conflictos entre ediciones, «calendario en uso» y horarios `NEEDS_REVIEW`, historial de cambios, duplicar un calendario, asignar el calendario desde las pantallas de cursos y estructuras distintas por día.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Contrato:** `docs/api-spec.yml` (`getCalendar`, `updateCalendar`, `UpdateCalendarRequest` y la respuesta `CalendarNotFound`), `npm run api:types -w frontend` y `api/schema.test.ts`.
* **Backend:** `domain/calendar/` (`CalendarNotFound`; el puerto gana `findById` y `update`, que devuelve el calendario como era y como queda), `application/calendars/` (`GetCalendar`, `UpdateCalendar` y `parseUpdateCalendarRequest`, que delega en el parser del alta), `infrastructure/prisma/prismaCalendarRepository.ts` (`findById` y `update` con los bloqueos en orden), `presentation/calendars/calendarsRouter.ts` (las dos rutas y `parseCalendarId`; `requireRole('ADMIN')` solo en el `PUT`), `presentation/http/appError.ts` y `errorHandler.ts`, `composeApp.ts`, `app.ts` y `test/support/appDoubles.ts`.
* **Frontend:** `services/calendarsService.ts` (`get` y `update`, con `notFound`), `validation/calendarValidation.ts` (`hasCalendarChanges`), `components/CalendarForm.tsx` (`initialValues`, `requireChanges`, textos por parámetro y el aviso «Se quedará sin calendario»), `pages/EditCalendarPage.tsx`, `pages/CalendarsPage.tsx` (enlace «Editar» solo para `ADMIN` y el aviso `calendarUpdated`), `App.tsx` (ruta bajo `RequireRole`), i18n y `cypress/e2e/calendars.cy.ts`.
* **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `docs/backend-standards.md` y `docs/frontend-standards.md` (reemplazar una lista de hijos ordenada; bloquear el padre y después la unión de hijos en orden), `README.md` (endpoints y árbol) y la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL).

##### Requisitos de Testing (Pre-release)

* **Backend unitario:** `parseCalendarId` y `parseUpdateCalendarRequest` (la tabla compartida `test-fixtures/calendar-fields.json` sigue valiendo); `GetCalendar` y `UpdateCalendar` (`404`, `409`, `400` de cursos, `changed_fields` y recuentos, eventos sin nombres, `PUT` sin cambios); la ruta (`200`, `403` del `MEMBER` antes de validar, `401`, `404`, `409`, `400`, `503`, `no-store`).
* **Backend de integración:** repositorio contra PostgreSQL (reemplazo de periodos con `position` nuevos, cursos añadidos, movidos desde otro calendario y liberados, renombrar a sí mismo y a otro, otro colegio, atomicidad con un disparador, dos ediciones a la vez con el estado del último entero, edición contra borrado de un curso, edición contra alta con cursos en común) y HTTP completo (`ADMIN`, `MEMBER`, aislamiento y registro sin nombres).
* **Frontend:** servicio, `hasCalendarChanges`, `CalendarForm` en modo edición (precarga, «Guardar» solo con cambios, avisos de cursos, errores), `EditCalendarPage` (carga única con `StrictMode`, `404` al cargar y al guardar, `409`, `400` de cursos, `403`), `CalendarsPage` (enlace solo para `ADMIN`, aviso `calendarUpdated`) y la ruta.
* **Manual y E2E:** `curl` (incluido el `403` de un `MEMBER` real y la concurrencia) y E2E (renombrar, mover el recreo, quitar una sesión, mover un curso entre calendarios y liberar otro, `409`, `MEMBER` y 360 px).
* **Cobertura mínima:** 90 % backend y 80 % frontend.

##### Definición de hecho

* Tests en verde con la cobertura mínima, `lint`, `typecheck`, `build` y `api:types:check`; pruebas con `curl`; E2E completo; PR integrada; despliegue (sin migraciones) y comprobación en producción.

##### Riesgos y mitigaciones

* **Reemplazar los periodos:** borrar y reinsertar en la misma transacción, después de bloquear el calendario; un test comprueba que dos ediciones simultáneas nunca dejan una mezcla.
* **Interbloqueos:** el calendario primero y los cursos después, siempre en orden de `id` (el alta solo bloquea cursos, en el mismo orden); tests de concurrencia.
* **Perder la edición de otra persona:** aceptado (gana el último), validado por la persona usuaria.
* **Un curso queda sin calendario al desmarcarlo:** es intencionado y se avisa bajo el curso; el motor de generación avisará de los cursos sin calendario.

---

### US-BASE_c: Borrar un calendario base

**Épica:** [5. Configuración de Horarios (Base + Asignaturas + Restricciones)](#epica-5-configuracion-de-horarios-base--asignaturas--restricciones)

**Estimación:** 2 puntos de historia. Un endpoint (`DELETE /api/calendars/{id}`), un diálogo y un botón en el listado; **sin migraciones** (la cascada de los periodos y el `SET NULL` de los cursos ya existen desde US-BASE).

**Historia:** Como administrador del colegio, quiero borrar un calendario que ya no uso, para mantener solo los que siguen en vigor.

**Depende de:** US-BASE y US-BASE_b (tablas, `calendarsRouter`, `CalendarsPage` con «Editar», bloqueos en orden) y US18 (el patrón de borrado sin petición previa: `DeleteStudentModal`, `200` con lo borrado, la lista se actualiza sin volver a pedirla y el foco pasa al título).

---

#### Decisiones (validadas por la persona usuaria, 2026-10-25)

* **Se puede borrar un calendario con cursos:** sus cursos quedan **sin calendario** (`courses.calendar_id` a nulo por `ON DELETE SET NULL`), nunca se borran. El diálogo avisa de cuáles son antes de confirmar. Es coherente con la edición (US-BASE_b), donde desmarcar un curso también lo deja sin calendario.
* **El diálogo usa los datos de la tarjeta**, como el borrado de alumnos (US18): el listado ya trae el nombre y los cursos de cada calendario, así que el diálogo se abre al instante y **no pide nada**. El aviso final usa el recuento **real** que devuelve el `DELETE`, por si otra persona cambió los cursos entretanto.
* **Heredadas:** borrado real, sin papelera ni deshacer; solo `ADMIN` (un `MEMBER` recibe `403` y no ve el botón). **Sin** «calendario en uso» ni horarios `NEEDS_REVIEW`: no existen horarios; el motor de generación decidirá qué hacer con los horarios de un calendario borrado.

#### Casos de uso y reglas de negocio

* **Acceso:** `DELETE /api/calendars/{id}` es **solo `ADMIN`**, con `requireRole('ADMIN')` **antes** de leer el `id` (un `MEMBER` recibe `403 FORBIDDEN` aunque el calendario no exista o el `id` no sea UUID, sin revelar nada). Sin cuerpo. El colegio sale de la identidad.
* **`404` sin distinguir:** un `id` que no es UUID, un calendario inexistente, de otro colegio o ya borrado responden `404 NOT_FOUND` (`CalendarNotFound` y la respuesta reutilizable `CalendarNotFound` de US-BASE_b). Un `404` no deja evento.
* **Transacción y bloqueos:** en una transacción, primero la fila del calendario `FOR UPDATE` (filtrada por colegio; sin fila, `404` sin tocar nada), después **sus cursos `FOR UPDATE` en orden de `id`** (el mismo orden que el alta y la edición, sin ciclos de bloqueo), se cuentan (`courseCount`, lo que se va a liberar de verdad) y se borra el calendario: los periodos caen por `ON DELETE CASCADE` y los cursos quedan sin calendario por `ON DELETE SET NULL`, sin tocarlos a mano.
* **Respuesta:** `200` con `{ deleted: { id, courseCount } }` y `Cache-Control: no-store` (no `204`: el recuento es lo que ve la persona usuaria y lo que registra el evento).
* **Concurrencia:** dos borrados del mismo calendario a la vez dan `200` y `404`; una edición y un borrado del mismo calendario se serializan por el bloqueo (si el borrado confirma antes, la edición responde `404`); un borrado y la edición de **otro** calendario que se lleva uno de sus cursos terminan sin error ni interbloqueo, y el curso queda donde lo dejó la edición; un borrado y el borrado de uno de sus cursos terminan los dos con `200`.
* **Listado (`/calendarios`):** cada tarjeta lleva, **solo para `ADMIN`**, un botón «Borrar» (`outline-danger`, `aria-label` «Borrar {nombre}», que contiene el texto visible) junto a «Editar».
* **Diálogo (`DeleteCalendarModal`):** patrón de `DeleteStudentModal`: siempre montado y gobernado por `calendar` (`null` si está cerrado; conserva el último mientras se cierra), con `onDeleted`, `onGone`, `onCancel` y `onExited`; **no pide nada al abrirse**. Título «¿Borrar el calendario «{nombre}»?», la lista de cursos que se quedarán sin calendario («Estos cursos se quedarán sin calendario: 1º Primaria, 2º Primaria») o «Ningún curso sigue este calendario», y «Esta acción no se puede deshacer». Foco inicial en «Cancelar», sin «X» de cabecera, una sola confirmación con guarda síncrona contra la doble pulsación, «Borrando…» con los botones deshabilitados, y ni Escape ni el clic fuera lo cierran mientras borra. Un `404` llama a `onGone`; cualquier otro fallo se queda en el diálogo con un `role="alert"` y se puede reintentar.
* **Tras borrar:** `CalendarsPage` quita el calendario de la lista cargada **sin volver a pedirla**, muestra en un `role="status"` propio (que tiene prioridad sobre el aviso de llegada) «Calendario «X» eliminado» o «Calendario «X» eliminado. N cursos se quedan sin calendario» (plural, con el `courseCount` del servidor) y mueve el foco al `h1` un turno después de `onExited` (como en US08, US13 y US18). Con `onGone` avisa «Ese calendario ya no existe» y vuelve a pedir la lista. Si era el último, se ve el estado vacío.
* **Observabilidad:** `CALENDAR_DELETED` (`school_id`, `actor_id`, `calendar_id`, `course_count`), nunca nombres.

#### Contrato de la API (`docs/api-spec.yml`, primero)

* **`DELETE /api/calendars/{id}`** (`deleteCalendar`, Bearer, solo `ADMIN`): sin cuerpo; `200` con `DeleteCalendarResponse` (`{ deleted: { id, courseCount } }`, `courseCount` entero ≥ 0) y `no-store`; `401`; `403 FORBIDDEN`; `404 NOT_FOUND` (`CalendarNotFound`); `500`; `503`.
* **Sin códigos de error nuevos ni migraciones.**

#### Criterios de Aceptación

* **CA1 (Acceso):** Dado un `ADMIN`, cada tarjeta de `/calendarios` lleva «Borrar» junto a «Editar»; dado un `MEMBER`, no lo lleva y `DELETE /api/calendars/{id}` responde `403 FORBIDDEN` sin borrar nada (también con un `id` inexistente o que no es UUID).
* **CA2 (Diálogo con cursos):** Dado «Primaria» con «1º Primaria» y «2º Primaria», cuando pulso «Borrar Primaria», entonces se abre al instante (sin peticiones) «¿Borrar el calendario «Primaria»?» con «Estos cursos se quedarán sin calendario: 1º Primaria, 2º Primaria» y «Esta acción no se puede deshacer», con el foco en «Cancelar».
* **CA3 (Diálogo sin cursos):** Dado un calendario sin cursos, el diálogo dice «Ningún curso sigue este calendario».
* **CA4 (Cancelar):** Cuando pulso «Cancelar» o Escape, el diálogo se cierra sin borrar nada y el foco vuelve a «Borrar Primaria».
* **CA5 (Confirmar):** Cuando pulso «Borrar calendario» (dos veces seguidas), entonces se envía un único `DELETE`, el calendario desaparece de la lista sin volver a pedirla, veo «Calendario «Primaria» eliminado. 2 cursos se quedan sin calendario» y el foco pasa al título; los dos cursos siguen existiendo y no siguen ningún calendario.
* **CA6 (Último calendario):** Si borro el único calendario, veo el estado vacío («Todavía no hay calendarios» con «Crear calendario»).
* **CA7 (Ya no existe):** Dado un calendario que otra persona borró, cuando confirmo, entonces el diálogo se cierra, veo «Ese calendario ya no existe» y la lista se vuelve a pedir.
* **CA8 (Fallo):** Si el servidor falla, el diálogo sigue abierto con un aviso y puedo reintentar; nada se borra.
* **CA9 (Recuento real):** Si otra persona añadió un curso al calendario entre la carga y la confirmación, el aviso dice el número real que devolvió el servidor.
* **CA10 (Atomicidad):** Si el borrado falla a mitad (un disparador en la prueba), el calendario, sus periodos y sus cursos siguen como estaban.
* **CA11 (Concurrencia):** Dos borrados a la vez dan `200` y `404`; un borrado y una edición del mismo calendario, o la edición de otro que se lleva uno de sus cursos, o el borrado de uno de sus cursos, terminan sin `500` ni interbloqueo.
* **CA12 (Aislamiento y sesión):** El calendario de otro colegio es `404`; sin sesión, `401`.
* **CA13 (Accesibilidad, responsive e i18n):** el diálogo con título como nombre accesible, sin violaciones de `axe`, sin desplazamiento horizontal a 360 px y los textos en `es.json` y `en.json`.
* **CA14 (Observabilidad):** El log solo lleva `CALENDAR_DELETED` con identificadores y el recuento, nunca nombres.

**Fuera de alcance:** papelera o deshacer, borrar varios a la vez, impedir el borrado de un calendario con cursos (validado: se permite), «calendario en uso» y horarios `NEEDS_REVIEW`, y borrar desde la página de edición.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Contrato:** `docs/api-spec.yml` (`deleteCalendar` y `DeleteCalendarResponse`), `npm run api:types -w frontend` y `api/schema.test.ts`.
* **Backend:** el puerto `CalendarRepository` gana `delete(schoolId, id)` (devuelve `{ courseCount }` o `null`), `application/calendars/deleteCalendar.ts` (`DeleteCalendar`), `PrismaCalendarRepository.delete` (bloqueos y recuento), `calendarsRouter` (`DELETE /:id` con `requireRole('ADMIN')` antes de `parseCalendarId`), `app.ts`, `composeApp.ts` y `test/support/appDoubles.ts`.
* **Frontend:** `services/calendarsService.ts` (`delete`, con `deleted`, `notFound`, `forbidden`, `unauthenticated` y `unavailable`), `components/DeleteCalendarModal.tsx`, `pages/CalendarsPage.tsx` (botón, diálogo, aviso propio y foco), i18n y `cypress/e2e/calendars.cy.ts`.
* **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `docs/backend-standards.md` y `docs/frontend-standards.md` (si surge algo nuevo), `README.md` (módulo 2, endpoints y árbol), `MODELO_DATOS.md` (el borrado y sus efectos) y la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL).

##### Requisitos de Testing (Pre-release)

* **Backend unitario:** `DeleteCalendar` (`null` → `CalendarNotFound` sin evento, `CALENDAR_DELETED` con el recuento y sin nombres); la ruta (`200` y `no-store`, `403` del `MEMBER` antes de mirar el `id`, `404` con un `id` que no es UUID sin llegar al caso de uso, `401`, `503`) y `api/schema.test.ts`.
* **Backend de integración:** repositorio contra PostgreSQL (borra el calendario y sus periodos, los cursos quedan sin calendario y siguen existiendo, el recuento, otro colegio o inexistente → `null` sin borrar nada, atomicidad con un disparador, dos borrados a la vez, borrado contra edición del mismo calendario, contra la edición de otro que se lleva un curso y contra el borrado de un curso) y HTTP completo (`ADMIN`, `MEMBER`, aislamiento, el listado y los cursos tras borrar, y el registro sin nombres).
* **Frontend:** servicio, `DeleteCalendarModal` (contenido con y sin cursos, foco, cancelar y Escape, doble pulsación, «Borrando…», `404` → `onGone`, fallo con reintento, `axe`) y `CalendarsPage` (botón solo para `ADMIN`, la lista se actualiza sin volver a pedirla, aviso con el recuento real y plural, prioridad sobre el aviso de llegada, foco al `h1`, `onGone`, estado vacío), a 1280 y 360 px.
* **Manual y E2E:** `curl` (incluido el `403` de un `MEMBER` real y la concurrencia) y E2E (borrar con cursos y sin cursos, cancelar, el último calendario, el aviso, que los cursos siguen existiendo, `MEMBER` sin botón y 360 px).
* **Cobertura mínima:** 90 % backend y 80 % frontend.

##### Definición de hecho

* Tests en verde con la cobertura mínima, `lint`, `typecheck`, `build` y `api:types:check` (cada uno con su código de salida); pruebas con `curl`; E2E completo; PR integrada; despliegue (sin migraciones) y comprobación en producción.

##### Riesgos y mitigaciones

* **Borrar por error un calendario con cursos:** el diálogo dice qué cursos quedan sin calendario y pide confirmar; los cursos no se pierden y se pueden reasignar editando otro calendario.
* **Recuento desfasado en el diálogo:** el diálogo usa la tarjeta, pero el aviso final usa el `courseCount` del servidor, contado con los cursos bloqueados.
* **Interbloqueos:** el calendario primero y sus cursos después en orden de `id`, como el alta y la edición; tests de concurrencia.
* **Foco al cerrar el diálogo:** el botón «Borrar» desaparece con el calendario; el foco va al `h1` un turno después de `onExited` (react-bootstrap suelta la captura de foco justo después), comprobado con `have.focus` en el E2E.
---

### US-SUBJECT: Gestionar las asignaturas del colegio (crear y ver)

**Épica:** [5. Configuración de Horarios (Base + Asignaturas + Restricciones)](#epica-5-configuracion-de-horarios-base--asignaturas--restricciones)

**Estimación:** 5 puntos de historia. Dos tablas y tres enums nuevos (una migración, con un `CHECK` escrito a mano), dos endpoints, dos páginas y un enlace en la cabecera.

**Historia:** Como administrador del colegio, quiero crear las asignaturas del colegio (nombre, código, tipo, estado, color y los cursos en los que se imparten, con sus sesiones semanales), y como usuario del colegio, quiero verlas, para que sirvan de base a las restricciones de carga (US19), a la asignación de profesores (US-PROF-ASSIGN) y a la vista de los horarios.

**Depende de:** US02_b1 (`requireAuthentication`, `requireRole` y `RequireRole`), US05 (los cursos), US06 (la búsqueda en el cliente) y US-BASE (el patrón de escritura solo para `ADMIN` con lectura para los dos roles). **Esta ficha se parte en tres:** esta (crear y ver), **US-SUBJECT_b** (editar e inactivar) y **US-SUBJECT_c** (borrar), como cursos (US05–US08) y calendarios (US-BASE).

> **Nota (2026-10-26):** la ficha anterior («AMPLIADA CON CURSOS + CARGAS ESTÁNDAR», 20 CA) daba a `ADMIN` y `MEMBER` el CRUD, usaba casillas fijas de 1º a 6º, mezclaba la gestión de asignaturas con las restricciones de US19 (que aún no existen) y tenía los CA14, CA15 y CA19 cortados por un fallo de codificación. Las decisiones de abajo la sustituyen.

---

#### Decisiones (validadas por la persona usuaria, 2026-10-26)

* **Lo que depende de las restricciones pasa a US19** (no hay restricciones contra las que probarlo): la pregunta «¿actualizar las restricciones?» al editar cursos o cargas (antiguos CA14 y CA15), el aviso de uso al editar (CA16), el borrado en cascada de las restricciones (CA18), el prerrelleno de las sesiones con la carga de la asignatura (CA20) y la columna «Usos».
* **Los cursos aplicables son los cursos del colegio** (`courses`), no una lista fija de 1º a 6º. Desaparece el badge de rango «1º-6º»: los nombres son libres y no tienen orden ni continuidad garantizados.
* **Una sola tabla `subject_courses`** con `sessions_per_week` (de 1 a 5), que sustituye a `subject_courses` y `subject_standard_loads` del modelo antiguo: un curso marcado siempre tiene su carga.
* **Código opcional**, de 1 a 10 caracteres, único por colegio sin distinguir mayúsculas si se rellena; vacío se guarda `null`. Sirve para mostrar la asignatura de forma compacta (la cuadrícula del horario).
* **Color obligatorio** de una **paleta cerrada** de 12 colores; se guarda la clave, no el hexadecimal. Puede repetirse entre asignaturas. El formulario propone el primer color de la paleta que aún no usa ninguna asignatura del colegio (el primero, si ya se usan todos). El selector muestra el nombre del color además de la muestra. Lo usará la vista del horario (US-ALGO-VIEW).
* **Escribe solo `ADMIN`; leen `ADMIN` y `MEMBER`**, como los calendarios.
* **Borrar un curso puede dejar una asignatura sin cursos:** sus filas de `subject_courses` caen en cascada y la asignatura sigue existiendo; la regla «al menos un curso» solo se comprueba al guardar. El diálogo de borrado de cursos (US08) **no cambia**.
* **Tres historias** (crear y ver, editar e inactivar, borrar), cada una con su ciclo de despliegue. **Se inactiva desde el formulario de edición** (el campo «Estado»), sin botón aparte.
* **Ajustes a lo que rige en el proyecto:** sin `code` único global, sin borrado lógico (`deletedAt`) ni `createdBy`/`updatedBy` del modelo antiguo; UUIDv7 y unicidad por colegio; sin «toast» (un aviso `role="status"`); filtros y búsqueda en el cliente, sin paginación.

#### Casos de uso y reglas de negocio

* **Acceso:** `GET /api/subjects` lo usan `ADMIN` y `MEMBER`; `POST /api/subjects` es **solo `ADMIN`** (`requireRole('ADMIN')` antes de validar el cuerpo: un `MEMBER` recibe `403 FORBIDDEN` y no se crea nada, con el evento `AUTHORIZATION_DENIED` que ya existe). El colegio sale siempre de la identidad.
* **Nombre:** obligatorio, de 1 a 100 caracteres tras recortar, con las mismas reglas de caracteres que el nombre de un curso (`cleanName`/`normalizeName`); **único por colegio** sin distinguir mayúsculas ni espacios sobrantes (`409 SUBJECT_ALREADY_EXISTS`).
* **Código (`code`):** opcional; se recorta y, vacío o solo espacios, es `null`. De 1 a 10 caracteres (letras, dígitos, `-` y `/`, sin espacios); **único por colegio** sin distinguir mayúsculas (`409 SUBJECT_CODE_ALREADY_EXISTS`). Se muestra tal como se escribe.
* **Tipo (`type`):** obligatorio, `CORE`, `ELECTIVE` o `CUSTOM` («Troncal», «Optativa» y «Propia del centro» en pantalla).
* **Estado (`status`):** obligatorio, `ACTIVE` o `INACTIVE`; el formulario de alta lo preselecciona en `ACTIVE`. En esta historia solo se guarda y se filtra: lo que implica `INACTIVE` lo deciden US-PROF-ASSIGN (solo ofrece las activas) y el motor de generación.
* **Descripción:** opcional, hasta 500 caracteres tras recortar; vacía es `null`. Texto plano.
* **Color (`color`):** obligatorio, una de las 12 claves: `blue`, `indigo`, `purple`, `pink`, `red`, `orange`, `yellow`, `green`, `teal`, `cyan`, `brown`, `gray`. Cada clave tiene en el frontend su fondo y su color de texto con contraste AA, y su nombre en i18n («Azul», «Añil»…).
* **Cursos (`courses`):** lista de `{ courseId, sessionsPerWeek }`; al menos uno (`REQUIRED`) y como mucho 100 (`INVALID_LENGTH`), sin cursos repetidos (`DUPLICATE` en `courses[<i>].courseId`); uno de otro colegio o inexistente es `400` con `NOT_FOUND` en `courses[<i>].courseId`; `sessionsPerWeek` es un entero de 1 a 5 (`OUT_OF_RANGE`).
* **Alta atómica:** la asignatura y sus cursos en una transacción. Los cursos se bloquean `FOR SHARE` **en orden de `id`** antes de insertar: un borrado simultáneo de un curso espera o hace que el alta responda `400`, y un calendario que mueve el curso (`FOR UPDATE`) no forma ciclo, porque el alta solo bloquea cursos.
* **Dos altas con el mismo nombre o el mismo código a la vez:** `201` y `409` (índice único, sin consulta previa; `violatedUniqueIndex` distingue cuál).
* **Navegación:** la cabecera gana **«Asignaturas»** (`/asignaturas`) para los dos roles, entre «Calendario» y «Usuarios»; `/asignaturas/nueva` cuelga de `RequireRole role="ADMIN"` (un `MEMBER` va a `/onboarding` sin mensaje: decide el backend).
* **Listado (`/asignaturas`):** carga única (también con `StrictMode`) con «Reintentar» si falla. Cada asignatura muestra la muestra de color (con su nombre accesible), el nombre, el código si lo tiene, el tipo, el estado y el resumen de cursos («3 cursos · 6 sesiones a la semana» o «Sin cursos», con un texto de aviso); el resumen es un botón con `aria-expanded` que despliega cada curso con sus sesiones («1º Primaria: 2 sesiones»). Orden por nombre (`compareText`). Filtros por tipo y por estado (selects con «Todos») y búsqueda por nombre o código con la comparación de la búsqueda de cursos (US06), en el cliente, combinables, y «No hay asignaturas que coincidan» si no queda ninguna. Vacío: «Todavía no hay asignaturas», con «Crear asignatura» para el `ADMIN` y, para el `MEMBER`, «Solo los administradores pueden crear y modificar las asignaturas». El botón **solo se pinta para el `ADMIN`**. El aviso `{ subjectCreated: nombre }` de la navegación se lee con una guarda de tipo.
* **Formulario (`/asignaturas/nueva`, `SubjectForm`, reutilizable en US-SUBJECT_b):** nombre, código, tipo, estado, descripción, color (grupo de radios con muestra y nombre) y «Cursos en los que se imparte»: los cursos del colegio (`GET /api/courses`), cada uno con su casilla y, marcado, un número de sesiones de 1 a 5 (**2 por defecto**, con la etiqueta accesible «Sesiones a la semana en {curso}»). Sin cursos en el colegio: «Primero crea los cursos» con un enlace a `/cursos`, y no se puede guardar. Valida antes de enviar con las mismas reglas que el backend (tabla compartida `test-fixtures/subject-fields.json`), foco en el primer campo inválido, errores bajo su campo, guarda síncrona contra el doble envío y el error de red o del servidor como `role="alert"`. Con el `201` navega a `/asignaturas` con `replace` y el aviso «Asignatura «X» creada».
* **Observabilidad:** `SUBJECT_CREATED` (`school_id`, `actor_id`, `subject_id`, `course_count`) y `SUBJECT_CREATION_REJECTED` (`reason: duplicate_name | duplicate_code | course_not_found`), nunca nombres, códigos ni descripciones.

#### Modelo de datos (migración `add_subjects`)

* **Enums:** `SubjectType` (`CORE`, `ELECTIVE`, `CUSTOM`), `SubjectStatus` (`ACTIVE`, `INACTIVE`) y `SubjectColor` (las 12 claves): la base de datos rechaza un color fuera de la paleta; cambiarla requiere una migración.
* **`subjects`:** `id` (UUIDv7), `school_id` (clave ajena a `schools`, sin cascada), `name` y `normalized_name` (`VARCHAR(100)`), `code` y `normalized_code` (`VARCHAR(10)`, nulos), `type`, `status`, `description` (`VARCHAR(500)`, nulo), `color`, `created_at`, `updated_at`; únicos `(school_id, normalized_name)` y `(school_id, normalized_code)`. PostgreSQL trata los `NULL` como distintos en un índice único, así que varias asignaturas sin código no chocan y basta `@@unique` de Prisma (sin índice parcial).
* **`subject_courses`:** `subject_id` (clave ajena a `subjects`, `ON DELETE CASCADE`), `course_id` (clave ajena a `courses`, `ON DELETE CASCADE`), `sessions_per_week` (`SMALLINT`), `created_at`, `updated_at`; clave primaria `(subject_id, course_id)` e índice en `course_id`. `CHECK` escrito a mano `subject_courses_sessions_per_week_check` (`sessions_per_week BETWEEN 1 AND 5`), con `--create-only` y su test de esquema, que exige el nombre de la restricción.
* **`MODELO_DATOS.md`:** se sustituyen `subjects` y `subject_courses` del modelo antiguo por las reales y se elimina `subject_standard_loads`. Revisa el SQL de cada `prisma migrate dev` posterior: el `CHECK` está escrito a mano.

#### Contrato de la API (`docs/api-spec.yml`, primero)

* **`POST /api/subjects`** (`createSubject`, Bearer, solo `ADMIN`): cuerpo `CreateSubjectRequest` (`name`, `code?`, `type`, `status`, `description?`, `color`, `courses: [{ courseId, sessionsPerWeek }]`, sin más propiedades); `201` con `{ subject: Subject }` y `Cache-Control: no-store`; `400 VALIDATION_ERROR`; `401`; `403 FORBIDDEN`; `409 SUBJECT_ALREADY_EXISTS` o `SUBJECT_CODE_ALREADY_EXISTS`; `500`; `503`.
* **`GET /api/subjects`** (`listSubjects`, Bearer, `ADMIN` y `MEMBER`): `200` con `{ subjects: Subject[] }` ordenados por nombre; `401`; `500`; `503`.
* **`Subject`:** `id`, `name`, `code` (`string | null`), `type`, `status`, `description` (`string | null`), `color`, `courses: [{ id, name, sessionsPerWeek }]` (en orden natural del nombre del curso) y `createdAt`.
* **Códigos nuevos:** `SUBJECT_ALREADY_EXISTS` y `SUBJECT_CODE_ALREADY_EXISTS` en `ErrorCode` y en `ERROR_CODES` de `appError.ts` a la vez (un test falla si no coinciden), y `OUT_OF_RANGE` en `FieldErrorCode` (un número fuera de su intervalo; `INVALID_RANGE` ya significa «el fin no es posterior al inicio»). Se reutilizan `REQUIRED`, `INVALID_LENGTH`, `INVALID_FORMAT` (también para un color o un tipo que no existe), `INVALID_CHARACTERS`, `DUPLICATE` y `NOT_FOUND`. Los campos se indican como `name`, `code`, `type`, `status`, `description`, `color`, `courses`, `courses[<i>].courseId` y `courses[<i>].sessionsPerWeek`.

#### Criterios de Aceptación

* **CA1 (Acceso y navegación):** Dado un `ADMIN`, cuando abro el menú, entonces veo «Asignaturas» y en `/asignaturas` el botón «Crear asignatura»; dado un `MEMBER`, veo el listado sin ese botón y con «Solo los administradores pueden crear y modificar las asignaturas», `/asignaturas/nueva` me lleva a `/onboarding` y `POST /api/subjects` responde `403 FORBIDDEN` sin crear nada (también con un cuerpo inválido).
* **CA2 (Formulario de partida):** Dado el formulario de alta, cuando lo abro, entonces el estado es «Activa», el color propuesto es el primero de la paleta que no usa ninguna asignatura del colegio y veo los cursos del colegio sin marcar; al marcar uno, sus sesiones valen 2.
* **CA3 (Crear con todos los cursos):** Dado «Inglés», código «ING», «Troncal», «Azul» y los seis cursos con 3 sesiones, cuando guardo, entonces se envía un único `POST`, vuelvo a `/asignaturas` con «Asignatura «Inglés» creada» y la fila muestra «ING», «Troncal», «Activa» y «6 cursos · 18 sesiones a la semana».
* **CA4 (Crear con cursos parciales y sin código):** Dado «Programación», «Propia del centro», sin código, con 4º (2), 5º (3) y 6º (4), cuando guardo, entonces se crea y al desplegar sus cursos veo «4º Primaria: 2 sesiones», «5º Primaria: 3 sesiones» y «6º Primaria: 4 sesiones».
* **CA5 (Nombre y código repetidos):** Dado «Inglés» con código «ING», cuando creo «inglés », entonces `409` con el error en el nombre; cuando creo «Inglés 2» con código «ing», entonces `409` con el error en el código; en los dos casos con el foco en el campo y conservando lo escrito. Dos asignaturas sin código sí se crean.
* **CA6 (Validación):** Dado el nombre vacío, de más de 100 caracteres o con caracteres no admitidos, un código de más de 10 caracteres o con espacios, una descripción de más de 500, ningún curso marcado («Marca al menos un curso») o unas sesiones de 0 o 6 («Entre 1 y 5 sesiones»), cuando guardo, entonces el error sale bajo su campo con el foco y no se envía nada; el servidor responde `400` con los mismos códigos.
* **CA7 (Color fuera de la paleta):** `POST` con `color: "magenta"` responde `400` con `INVALID_FORMAT` en `color`.
* **CA8 (Curso que ya no existe):** Dado un curso que otra persona borró antes de guardar, o de otro colegio, cuando guardo, entonces `400` con `courses[<i>].courseId` `NOT_FOUND`, el formulario vuelve a pedir los cursos y conserva lo escrito.
* **CA9 (Colegio sin cursos):** Sin cursos, el formulario dice «Primero crea los cursos» con un enlace a «Cursos» y no se puede guardar.
* **CA10 (Listado, filtros y búsqueda):** Dado «Inglés» (Troncal, Activa), «Programación» (Propia del centro, Activa) y «Francés» (Optativa, Inactiva): el filtro «Troncal» deja solo «Inglés»; «Inactiva», solo «Francés»; buscar «prog» o el código de Programación, solo «Programación»; filtros combinados sin resultados muestran «No hay asignaturas que coincidan»; el orden es por nombre.
* **CA11 (Asignatura sin cursos):** Dado «Inglés» con solo «1º Primaria», cuando se borra ese curso (US08), entonces la asignatura sigue en el listado con «Sin cursos».
* **CA12 (Atomicidad):** Si el alta falla a mitad (un disparador en la prueba), no queda ni la asignatura ni ninguna fila de `subject_courses`.
* **CA13 (Concurrencia):** Dos altas simultáneas con el mismo nombre o el mismo código responden `201` y `409`; un alta con un curso y el borrado de ese curso a la vez dan `201` (y la asignatura queda sin ese curso) o `400`, nunca `500` ni interbloqueo; un alta y la edición de un calendario que mueve ese curso terminan las dos sin error.
* **CA14 (Aislamiento y sesión):** Las asignaturas de otro colegio nunca se ven; sin sesión, `401`; un curso de otro colegio en `courses` es `NOT_FOUND`.
* **CA15 (Accesibilidad, responsive e i18n):** El color se anuncia por su nombre y nunca es la única pista; cada número de sesiones tiene etiqueta accesible; los errores van ligados por `aria-describedby`; el desplegable de cursos usa `aria-expanded`; sin violaciones de `axe`; sin desplazamiento horizontal a 360 px; textos, tipos, estados y nombres de los colores en `es.json` y `en.json`.
* **CA16 (Observabilidad):** El log solo lleva `SUBJECT_CREATED` y `SUBJECT_CREATION_REJECTED` con identificadores y recuentos, nunca nombres, códigos ni descripciones.

**Fuera de alcance:** editar e inactivar (US-SUBJECT_b), borrar (US-SUBJECT_c), todo lo de restricciones (US19), «Usos», asignar asignaturas a profesores (US-PROF-ASSIGN), las consecuencias de `INACTIVE`, colores libres, paginación y búsqueda en el servidor, y ver las asignaturas desde las pantallas de cursos.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Contrato:** `docs/api-spec.yml` (`createSubject`, `listSubjects`, `CreateSubjectRequest`, `Subject`, `SubjectCourse`, los enums, `SUBJECT_ALREADY_EXISTS`, `SUBJECT_CODE_ALREADY_EXISTS` y `OUT_OF_RANGE`), `npm run api:types -w frontend` y `api/schema.test.ts`.
* **Modelo:** `backend/prisma/schema.prisma` (`Subject`, `SubjectCourse` y los tres enums) y la migración `add_subjects` con el `CHECK` a mano; `docs/Modelo_de_Datos/MODELO_DATOS.md`.
* **Backend:** `domain/subject/` (`Subject`, el puerto `SubjectRepository`, `SubjectAlreadyExists`, `SubjectCodeAlreadyExists`, `normalizeCode`), `application/subjects/` (`CreateSubject`, `ListSubjects` y `createSubjectRequest.ts`, que recorre `test-fixtures/subject-fields.json`), `infrastructure/prisma/prismaSubjectRepository.ts` (cursos `FOR SHARE` en orden de `id`, `violatedUniqueIndex` para los dos `409`), `presentation/subjects/subjectsRouter.ts` (`GET` para los dos roles y `POST` con `requireRole('ADMIN')`), `errorHandler.ts`, `appError.ts`, `app.ts`, `composeApp.ts` y `test/support/appDoubles.ts`.
* **Frontend:** `services/subjectsService.ts`, `validation/subjectValidation.ts`, `utils/subjectColors.ts` (paleta, contraste y color por defecto: funciones puras), `components/SubjectForm.tsx`, `components/SubjectColorSwatch.tsx`, `pages/SubjectsPage.tsx` y `pages/CreateSubjectPage.tsx`, `App.tsx` (las dos rutas; la de alta bajo `RequireRole`), `AppHeader.tsx` («Asignaturas»), i18n y `cypress/e2e/subjects.cy.ts`.
* **Documentación:** `backend/CLAUDE.md` y `frontend/CLAUDE.md` (tabla de features, bloqueo `FOR SHARE` de cursos, paleta cerrada), `docs/backend-standards.md` y `docs/frontend-standards.md` (si surge un patrón nuevo), `README.md` (módulo 3, endpoints y árbol), la arquitectura (fila «Asignaturas» de la sección 0 de `ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL) y el resumen de épicas de este documento.

##### Requisitos de Testing (Pre-release)

* **Backend unitario:** el parser con la tabla compartida (todos los códigos y el orden de los errores, código vacío a `null`, color y tipo fuera de la lista, sesiones fuera de 1–5, cursos repetidos); `CreateSubject` (eventos sin nombres, los dos `409`, `CourseNotFound` a `400`) y `ListSubjects` (orden); la ruta (`201`, `403` del `MEMBER` antes de validar, `401`, `400`, `409`, `503`, `GET` para los dos roles y `no-store`).
* **Backend de integración:** repositorio contra PostgreSQL (alta atómica, los dos índices únicos, varias asignaturas sin código, otro colegio, atomicidad con un disparador, dos altas con el mismo nombre y con el mismo código, alta contra borrado del curso, alta contra edición de un calendario con ese curso, la cascada al borrar un curso), `subjectsSchema.int.test.ts` (el `CHECK` por su nombre) y HTTP completo (`ADMIN`, `MEMBER`, aislamiento y registro sin nombres).
* **Frontend:** servicio, validación (misma tabla), `subjectColors` (color por defecto, contraste AA de las 12 claves), `SubjectForm` (cursos con sesiones y 2 por defecto, colegio sin cursos, errores, doble envío, `axe`), las dos páginas por rol (filtros, búsqueda, desplegable, vacío, error, aviso, botón solo para `ADMIN`, redirección del `MEMBER`) y la cabecera.
* **Manual y E2E:** `curl` (incluido el `403` de un `MEMBER` real) y E2E (crear Inglés y Programación, filtros y búsqueda, `409`, borrar un curso y ver «Sin cursos», `MEMBER` y 360 px).
* **Cobertura mínima:** 90 % backend y 80 % frontend.

##### Definición de hecho

* Tests en verde con la cobertura mínima (90 % backend, 80 % frontend), `lint`, `typecheck`, `build` y `api:types:check`; pruebas con `curl`; E2E completo; PR integrada; despliegue y comprobación en producción (la migración se aplica en el despliegue).

##### Riesgos y mitigaciones

* **El `CHECK` escrito a mano:** un `migrate dev` posterior puede intentar borrarlo; test de esquema con su nombre y revisión del SQL de cada migración.
* **Contraste de los colores:** la paleta cerrada lleva fijado el color del texto y un test comprueba el AA de las 12 claves.
* **Asignaturas sin cursos tras borrar un curso:** intencionado; el listado lo avisa y US-SUBJECT_b obliga a marcar uno para guardar.
* **Interbloqueos con calendarios y cursos:** el alta solo bloquea cursos, `FOR SHARE` y en orden de `id`; tests de concurrencia.
* **Dos `409` distintos:** se distinguen por el nombre del índice (`violatedUniqueIndex`), con un test de cada uno.

---

### US-SUBJECT_b: Editar e inactivar una asignatura

**Épica:** [5. Configuración de Horarios (Base + Asignaturas + Restricciones)](#epica-5-configuracion-de-horarios-base--asignaturas--restricciones)

**Estimación:** 3 puntos de historia. Dos endpoints (`GET` y `PUT /api/subjects/{id}`), una página, el modo de edición de `SubjectForm` y un enlace en el listado; **sin migraciones**.

**Historia:** Como administrador del colegio, quiero editar una asignatura (nombre, código, tipo, estado, descripción, color y sus cursos con sus sesiones), para ajustarla cuando cambia el plan de estudios o deja de impartirse.

**Depende de:** US-SUBJECT (tablas, `SubjectForm`, `subjectsRouter`, `SubjectsPage` y `parseCreateSubjectRequest`) y el patrón de edición de US-BASE_b (estado final, `404` sin distinguir, `requireChanges` y «Guardar» solo con cambios).

---

#### Decisiones (validadas por la persona usuaria, 2026-10-26)

* **Se inactiva desde el formulario** (el campo «Estado»), sin botón aparte: sustituye al antiguo CA19.
* **Gana el último guardado:** cada `PUT` envía el estado final completo y prevalece el último que se confirma, sin versión ni `409` de conflicto.
* **Una asignatura que se quedó sin cursos no se puede guardar** hasta marcar al menos uno; el formulario lo indica al cargarla.
* **`INACTIVE` sigue sin tener consecuencias** (las decidirán US-PROF-ASSIGN y el motor de generación): una asignatura inactiva se puede editar y reactivar.
* **El color no se propone al editar:** se precarga el actual. La propuesta del «primer color libre» solo existe en el alta.
* **Un curso que se desmarca y se vuelve a marcar recupera sus sesiones originales** si la asignatura ya lo tenía (no las 2 por defecto), de modo que deshacer deja «Guardar» deshabilitado. Los cursos nuevos empiezan en 2.
* **Heredadas de US-SUBJECT:** solo `ADMIN` escribe (`requireRole('ADMIN')` antes de leer el `id` y el cuerpo); el resto de reglas de los campos.

#### Casos de uso y reglas de negocio

* **Acceso:** `GET /api/subjects/{id}` lo usan `ADMIN` y `MEMBER`; `PUT /api/subjects/{id}` es **solo `ADMIN`** (un `MEMBER` recibe `403 FORBIDDEN` aunque la asignatura no exista o el cuerpo sea inválido, sin revelar nada). El colegio sale siempre de la identidad.
* **`404` sin distinguir:** un `id` que no es UUID, una asignatura inexistente, de otro colegio o borrada por otra persona responden `404 NOT_FOUND`, al leer y al guardar.
* **Estado final:** el cuerpo es el del alta (`name`, `code?`, `type`, `status`, `description?`, `color`, `courses`) con **el mismo parser y las mismas reglas** que `POST`; las propiedades desconocidas se ignoran, como en el alta.
* **Nombre y código:** pasar a los de **otra** asignatura del colegio es `409 SUBJECT_ALREADY_EXISTS` o `SUBJECT_CODE_ALREADY_EXISTS`; cambiar solo mayúsculas o espacios de los propios es válido (es la misma fila). Vaciar el código lo deja en `null`.
* **Cursos:** `subject_courses` se **reemplaza** entera en la transacción (se borran las filas de la asignatura y se insertan las recibidas). Un curso inexistente o de otro colegio es `400` con `NOT_FOUND` en `courses[<i>].courseId` y no se cambia nada.
* **Transacción y bloqueos:** la fila de la asignatura `FOR UPDATE` (filtrada por colegio; si no está, `404` antes de mirar los cursos); después la unión de los cursos pedidos y los actuales `FOR SHARE` **en orden de `id`**, **antes** de tocar `subject_courses`; después los campos y los cursos, y se relee. Así no hay ciclo con el borrado de un curso (curso `FOR UPDATE` → cascada) ni con el alta. O todo o nada.
* **`PUT` sin cambios:** `200` con `changed_fields: []`.
* **Navegación:** en `/asignaturas` cada fila lleva, **solo para `ADMIN`**, un enlace «Editar» (`aria-label` «Editar {nombre}») hacia `/asignaturas/:id/editar`, bajo `RequireRole role="ADMIN"` (un `MEMBER` va a `/onboarding`). El `NavLink` «Asignaturas» sigue activo en la subruta.
* **Página de edición:** pide la asignatura y los cursos una vez cada uno (también con `StrictMode`) y **no monta el formulario hasta tener las dos respuestas**. Muestra carga, «Esta asignatura no existe o ya no está disponible» con un enlace a «Asignaturas» (un `404` al cargar y al guardar), el error con «Reintentar» o el formulario precargado.
* **Formulario (`SubjectForm` reutilizado):** gana `initialValues` (solo se leen al montar), `requireChanges` y el texto del título y del botón por parámetro. «Guardar» está deshabilitado mientras **lo que se enviaría** (nombre y código limpios, descripción recortada, vacío y `null` equivalentes, y el conjunto de `(curso, sesiones)`) no difiera de lo cargado; deshacer un cambio lo vuelve a deshabilitar. Si la asignatura no tiene cursos, un aviso ligado por `aria-describedby`: «Esta asignatura no tiene cursos: marca al menos uno para guardarla». Validación, foco en el primer campo inválido, guarda síncrona contra el doble envío y errores del servidor como en el alta. «Cancelar» vuelve a `/asignaturas`.
* **Al guardar:** con el `200` navega a `/asignaturas` con `replace` y `{ subjectUpdated: nombre del servidor }` («Asignatura «X» actualizada» en un `role="status"`); un `409` marca el nombre o el código con el foco; un `400` marca sus campos (y vuelve a pedir los cursos si falla `courses`); un `404` muestra la vista de no disponible; un `403` el mensaje de solo administradores; cualquier otro fallo, un aviso general conservando lo escrito.
* **Observabilidad:** `SUBJECT_UPDATED` (`school_id`, `actor_id`, `subject_id`, `changed_fields` —de `name`, `code`, `type`, `status`, `description`, `color`, `courses`—, `courses_added`, `courses_removed`, `courses_changed`) y `SUBJECT_UPDATE_REJECTED` (`reason: not_found | duplicate_name | duplicate_code | course_not_found`). Nunca nombres, códigos ni descripciones.

#### Contrato de la API (`docs/api-spec.yml`, primero)

* **`GET /api/subjects/{id}`** (`getSubject`, Bearer, `ADMIN` y `MEMBER`): `200` con `{ subject: Subject }` y `Cache-Control: no-store`; `401`; `404 NOT_FOUND` (respuesta reutilizable `SubjectNotFound`); `500`; `503`.
* **`PUT /api/subjects/{id}`** (`updateSubject`, Bearer, solo `ADMIN`): cuerpo `UpdateSubjectRequest` (la misma forma que `CreateSubjectRequest`); `200` con `{ subject: Subject }` y `no-store`; `400 VALIDATION_ERROR`; `401`; `403 FORBIDDEN`; `404 NOT_FOUND` (`SubjectNotFound`); `409 SUBJECT_ALREADY_EXISTS` o `SUBJECT_CODE_ALREADY_EXISTS`; `500`; `503`.
* **Sin códigos nuevos ni migraciones:** se reutilizan `NOT_FOUND`, los dos `409` y los códigos de campo del alta.

#### Criterios de Aceptación

* **CA1 (Acceso):** Dado un `ADMIN`, cada fila de `/asignaturas` lleva «Editar»; dado un `MEMBER`, no lo lleva, `/asignaturas/:id/editar` lo lleva a `/onboarding` y `PUT /api/subjects/{id}` responde `403 FORBIDDEN` sin cambiar nada (también con un `id` inexistente o un cuerpo inválido); `GET /api/subjects/{id}` le responde `200`.
* **CA2 (Precarga):** Dado «Inglés» con código, color y tres cursos, cuando abro su edición, entonces veo todos sus campos, su color seleccionado y sus cursos marcados con sus sesiones, y «Guardar» está deshabilitado.
* **CA3 (Solo con cambios):** Dado el formulario cargado, cuando añado un espacio al final del nombre, borro y vuelvo a escribir la descripción, o cambio unas sesiones y las devuelvo a su valor (también desmarcando y marcando de nuevo un curso), entonces «Guardar» sigue deshabilitado; con un cambio real, se habilita.
* **CA4 (Renombrar y recodificar):** Dado «Inglés» («ING»), cuando la renombro a «Inglés avanzado» y guardo, entonces se envía un único `PUT`, vuelvo a `/asignaturas` con «Asignatura «Inglés avanzado» actualizada» y la fila lo muestra; cambiar «ING» a «ing» es válido y vaciar el código lo deja en `null`.
* **CA5 (Inactivar):** Dado «Inglés» activa, cuando cambio el estado a «Inactiva» y guardo, entonces el filtro «Inactiva» la muestra; al volver a «Activa» y guardar, el filtro «Activa» la vuelve a mostrar.
* **CA6 (Cursos):** Dado «Inglés» con 1º (3) y 2º (3), cuando cambio 1º a 2 sesiones, desmarco 2º y marco 3º (2 por defecto) y guardo, entonces el desplegable muestra «1º Primaria: 2 sesiones» y «3º Primaria: 2 sesiones», y 2º ya no aparece.
* **CA7 (Sin cursos):** Dado una asignatura sin cursos (tras borrar el último, US08), cuando abro su edición, entonces veo el aviso «Esta asignatura no tiene cursos: marca al menos uno para guardarla»; si cambio solo el nombre y guardo, el error «Marca al menos un curso» sale con el foco y no se envía nada; marcando uno, se guarda.
* **CA8 (Nombre y código repetidos):** Dado otra asignatura «Programación» con código «PRG», cuando renombro «Inglés» a «programación », entonces `409` y el error en el nombre; cuando le pongo el código «prg», entonces `409` y el error en el código; en los dos casos con el foco en el campo y conservando lo escrito.
* **CA9 (Validación):** Dado un nombre vacío o de más de 100 caracteres, un código de más de 10 o con espacios, una descripción de más de 500 o unas sesiones de 0 o 6, cuando guardo, entonces el error sale bajo su campo con el foco y no se envía nada; el servidor responde `400` con los mismos códigos que en el alta.
* **CA10 (Ya no existe):** Dado una asignatura que otra persona borró, cuando abro su edición o guardo, entonces veo «Esta asignatura no existe o ya no está disponible» con un enlace a «Asignaturas»; un `id` que no es UUID da lo mismo.
* **CA11 (Curso que ya no existe):** Dado un curso que otra persona borró antes de guardar, cuando guardo, entonces `400` con `courses[<i>].courseId` `NOT_FOUND`, el formulario vuelve a pedir los cursos y conserva lo escrito.
* **CA12 (Atomicidad):** Si la edición falla a mitad (un disparador en la prueba), la asignatura conserva todos sus campos y sus cursos.
* **CA13 (Concurrencia):** Dos ediciones de la misma asignatura a la vez terminan las dos con `200` y queda el estado del último en confirmarse, entero (nunca una mezcla de cursos); una edición y el borrado de uno de sus cursos a la vez dan `200` o `400`, nunca `500` ni interbloqueo; una edición y un alta, o dos ediciones de asignaturas distintas, con cursos en común terminan sin error; dos ediciones que se cruzan en el mismo nombre o el mismo código dan `200` y `409`.
* **CA14 (Aislamiento y sesión):** La asignatura de otro colegio es `404` al leer y al guardar; un curso de otro colegio en `courses` es `NOT_FOUND`; sin sesión, `401`.
* **CA15 (Accesibilidad, responsive e i18n):** el enlace «Editar» con su nombre accesible, el aviso de sin cursos ligado por `aria-describedby`, sin violaciones de `axe`, sin desplazamiento horizontal a 360 px y los textos en `es.json` y `en.json`.
* **CA16 (Observabilidad):** El log solo lleva `SUBJECT_UPDATED` y `SUBJECT_UPDATE_REJECTED` con identificadores, campos cambiados y recuentos, nunca nombres, códigos ni descripciones.

**Fuera de alcance:** borrar (US-SUBJECT_c), actualizar restricciones al cambiar cursos o cargas (US19), las consecuencias de `INACTIVE`, detectar conflictos entre ediciones, historial de cambios y duplicar una asignatura.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Contrato:** `docs/api-spec.yml` (`getSubject`, `updateSubject`, `UpdateSubjectRequest` y la respuesta `SubjectNotFound`), `npm run api:types -w frontend` y `api/schema.test.ts`.
* **Backend:** `domain/subject/` (`SubjectNotFound`; el puerto gana `findById` y `update`, que devuelve la asignatura como era y como queda), `application/subjects/` (`GetSubject`, `UpdateSubject` y `updateSubjectRequest.ts`, que delega en el parser del alta), `infrastructure/prisma/prismaSubjectRepository.ts` (`findById` y `update` con los bloqueos en orden y `violatedUniqueIndex`), `presentation/subjects/subjectsRouter.ts` (las dos rutas y `parseSubjectId`; `requireRole('ADMIN')` solo en el `PUT`), `presentation/http/appError.ts` y `errorHandler.ts`, `composeApp.ts`, `app.ts` y `test/support/appDoubles.ts`.
* **Frontend:** `services/subjectsService.ts` (`get` y `update`, con `notFound`), `validation/subjectValidation.ts` (`hasSubjectChanges` y la conversión de una asignatura a borrador), `components/SubjectForm.tsx` (`initialValues`, `requireChanges`, textos por parámetro, aviso de sin cursos y sesiones originales al volver a marcar), `pages/EditSubjectPage.tsx`, `pages/SubjectsPage.tsx` (enlace «Editar» solo para `ADMIN` y el aviso `subjectUpdated`), `App.tsx` (ruta bajo `RequireRole`), i18n y `cypress/e2e/subjects.cy.ts`.
* **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `README.md` (endpoints y árbol), la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL) y este documento; los estándares solo si surge un patrón nuevo (reemplazar hijos bajo bloqueo del padre ya está de US-BASE_b).

##### Requisitos de Testing (Pre-release)

* **Backend unitario:** `parseSubjectId` y `parseUpdateSubjectRequest` (la tabla compartida `test-fixtures/subject-fields.json` sigue valiendo); `GetSubject` y `UpdateSubject` (`404`, los dos `409`, `400` de cursos, `changed_fields` y recuentos, eventos sin nombres, `PUT` sin cambios); la ruta (`200`, `403` del `MEMBER` antes de validar, `401`, `404`, `409`, `400`, `503`, `no-store`).
* **Backend de integración:** repositorio contra PostgreSQL (reemplazo de cursos, renombrar a sí misma y a otra, código a `null`, otro colegio, atomicidad con un disparador, dos ediciones a la vez con el estado del último entero, dos ediciones cruzadas en nombre y en código, edición contra borrado de un curso, edición contra alta con cursos en común) y HTTP completo (`ADMIN`, `MEMBER`, aislamiento y registro sin nombres).
* **Frontend:** servicio, `hasSubjectChanges`, `SubjectForm` en edición (precarga, «Guardar» solo con cambios, sesiones originales al volver a marcar, aviso de sin cursos, errores, `axe`), `EditSubjectPage` (carga única con `StrictMode`, `404` al cargar y al guardar, `409`, `400` de cursos, `403`), `SubjectsPage` (enlace solo para `ADMIN`, aviso `subjectUpdated`) y la ruta.
* **Manual y E2E:** `curl` (incluido el `403` de un `MEMBER` real y la concurrencia) y E2E (renombrar, inactivar y filtrar, cambiar cursos y sesiones, `409`, asignatura sin cursos, `MEMBER` y 360 px).
* **Cobertura mínima:** 90 % backend y 80 % frontend.

##### Definición de hecho

* Tests en verde con la cobertura mínima, `lint`, `typecheck`, `build` y `api:types:check`; pruebas con `curl`; E2E completo; PR integrada; despliegue (sin migraciones) y comprobación en producción.

##### Riesgos y mitigaciones

* **Reemplazar `subject_courses`:** refresca `created_at` de las filas; hoy nada las referencia. US19_b las referencia (las reglas de reparto cuelgan de la pareja) y hace que la edición pase a aplicar diferencias. Borrar y reinsertar en la misma transacción, tras bloquear la asignatura; un test comprueba que dos ediciones simultáneas nunca dejan una mezcla.
* **Interbloqueos:** la asignatura primero y los cursos después, `FOR SHARE` y en orden de `id` (el alta solo bloquea cursos, en el mismo orden); tests de concurrencia.
* **Perder la edición de otra persona:** aceptado (gana el último), validado por la persona usuaria.
* **Asignaturas sin cursos:** intencionado; el listado ya las avisa y aquí el formulario obliga a marcar uno para guardar.

---

### US-SUBJECT_c: Borrar una asignatura

**Épica:** [5. Configuración de Horarios (Base + Asignaturas + Restricciones)](#epica-5-configuracion-de-horarios-base--asignaturas--restricciones)

**Estimación:** 2 puntos de historia. Un endpoint (`DELETE /api/subjects/{id}`), un diálogo y un botón en el listado; **sin migraciones** (la cascada a `subject_courses` ya existe desde US-SUBJECT).

**Historia:** Como administrador del colegio, quiero borrar una asignatura que ya no se imparte, para que no aparezca al asignar profesores ni al definir restricciones.

**Depende de:** US-SUBJECT y US-SUBJECT_b (tablas, `subjectsRouter`, `SubjectsPage` con «Editar», `SubjectNotFound` y la respuesta reutilizable `SubjectNotFound`) y el patrón de borrado de US18 y US-BASE_c (diálogo sin petición previa, `200` con lo borrado, la lista se actualiza sin volver a pedirla y el foco pasa al título).

---

#### Decisiones (validadas por la persona usuaria, 2026-10-28)

* **Borrado real**, sin papelera ni deshacer; solo `ADMIN` (un `MEMBER` recibe `403` y no ve el botón).
* **Se puede borrar una asignatura con cursos:** sus filas de `subject_courses` caen en cascada y los cursos no se tocan.
* **El diálogo usa los datos de la tarjeta** (como el de alumnos y el de calendarios): se abre al instante y **no pide nada**.
* **El diálogo lista los cursos en los que se imparte** («Se imparte en: 1º Primaria, 2º Primaria» o «No se imparte en ningún curso»), para no borrar la asignatura equivocada.
* **Recuerda la alternativa solo con un texto**, sin botón: «Si solo ha dejado de impartirse, puedes inactivarla desde Editar». Un botón «Inactivar en su lugar» obligaría al diálogo a hacer un `PUT` con el estado completo, con sus `409` y `400`, y duplicaría lo que ya hace «Editar».
* **Respuesta mínima** `{ deleted: { id } }`, como los alumnos: no hay nada que se libere y que la persona deba ver con el número real del servidor.
* **Las restricciones llegan con US19**, que añadirá el borrado en cascada de las restricciones de la asignatura (antiguo CA18). Hasta entonces no hay «asignatura en uso» que impida borrarla. *Decidido en la exploración de US19 (2026-10-29):* las reglas de reparto cuelgan de `subject_courses` y caen en cascada; US19_b añade a este diálogo «Se borrarán también N reglas».

#### Casos de uso y reglas de negocio

* **Acceso:** `DELETE /api/subjects/{id}` es **solo `ADMIN`**, con `requireRole('ADMIN')` **antes** de leer el `id` (un `MEMBER` recibe `403 FORBIDDEN` aunque la asignatura no exista o el `id` no sea UUID, sin revelar nada). Sin cuerpo. El colegio sale de la identidad.
* **`404` sin distinguir:** un `id` que no es UUID, una asignatura inexistente, de otro colegio o ya borrada responden `404 NOT_FOUND` (`SubjectNotFound`). Un `404` no deja evento.
* **Transacción y bloqueos:** en una transacción, la fila de la asignatura `FOR UPDATE` (filtrada por colegio; sin fila, `404` sin tocar nada) y el `DELETE`; sus filas de `subject_courses` caen por `ON DELETE CASCADE`, nunca a mano. **No se bloquean los cursos:** el borrado no los toca, y así no forma ciclo con la edición (asignatura → cursos `FOR SHARE`) ni con el borrado de un curso (curso → sus filas de `subject_courses`).
* **Respuesta:** `200` con `{ deleted: { id } }` y `Cache-Control: no-store` (no `204`: el formato de respuesta común).
* **El nombre y el código quedan libres:** después de borrar se puede crear otra asignatura con los mismos.
* **Concurrencia:** dos borrados de la misma asignatura a la vez dan `200` y `404`; un borrado y una edición de la misma se serializan por el bloqueo (si el borrado confirma antes, la edición responde `404`); un borrado y el borrado de uno de sus cursos terminan los dos con `200`. Nunca `500` ni interbloqueo.
* **Listado (`/asignaturas`):** cada tarjeta lleva, **solo para `ADMIN`**, un botón «Borrar» (`outline-danger`, `aria-label` «Borrar {nombre}», que contiene el texto visible) junto a «Editar».
* **Diálogo (`DeleteSubjectModal`):** patrón de `DeleteCalendarModal`: siempre montado y gobernado por `subject` (`null` si está cerrado; conserva la última mientras se cierra), con `onDeleted`, `onGone`, `onCancel` y `onExited`; **no pide nada al abrirse**. Título «¿Borrar la asignatura «{nombre}»?», «Se imparte en: …» o «No se imparte en ningún curso», «Si solo ha dejado de impartirse, puedes inactivarla desde Editar» y «Esta acción no se puede deshacer». Foco inicial en «Cancelar», sin «X» de cabecera, una sola confirmación con guarda síncrona contra la doble pulsación, «Borrando…» con los botones deshabilitados, y ni Escape ni el clic fuera lo cierran mientras borra. Un `404` llama a `onGone`; cualquier otro fallo (también un `403`) se queda en el diálogo con un `role="alert"` y se puede reintentar.
* **Tras borrar:** `SubjectsPage` quita la asignatura de la lista cargada **sin volver a pedirla** (conserva los filtros y la búsqueda), muestra «Asignatura «X» eliminada» en un `role="status"` propio, que tiene prioridad sobre el aviso de llegada, y mueve el foco al `h1` un turno después de `onExited` (como en US08, US13, US18 y US-BASE_c). Si era la última, se ve el estado vacío; si los filtros la dejaban como la única visible, «No hay asignaturas que coincidan». Con `onGone` avisa «Esa asignatura ya no existe» y vuelve a pedir la lista.
* **Observabilidad:** `SUBJECT_DELETED` (`school_id`, `actor_id`, `subject_id`), nunca nombres ni códigos.

#### Contrato de la API (`docs/api-spec.yml`, primero)

* **`DELETE /api/subjects/{id}`** (`deleteSubject`, Bearer, solo `ADMIN`): sin cuerpo; `200` con `DeleteSubjectResponse` (`{ deleted: { id } }`) y `no-store`; `401`; `403 FORBIDDEN`; `404 NOT_FOUND` (`SubjectNotFound`); `500`; `503`.
* **Sin códigos de error nuevos ni migraciones.**

#### Criterios de Aceptación

* **CA1 (Acceso):** Dado un `ADMIN`, cada tarjeta de `/asignaturas` lleva «Borrar» junto a «Editar»; dado un `MEMBER`, no lo lleva y `DELETE /api/subjects/{id}` responde `403 FORBIDDEN` sin borrar nada (también con un `id` inexistente o que no es UUID).
* **CA2 (Diálogo con cursos):** Dado «Inglés» con «1º Primaria» y «2º Primaria», cuando pulso «Borrar Inglés», entonces se abre al instante (sin peticiones) «¿Borrar la asignatura «Inglés»?» con «Se imparte en: 1º Primaria, 2º Primaria», el recordatorio de inactivar y «Esta acción no se puede deshacer», con el foco en «Cancelar».
* **CA3 (Diálogo sin cursos):** Dado una asignatura sin cursos, el diálogo dice «No se imparte en ningún curso».
* **CA4 (Cancelar):** Cuando pulso «Cancelar» o Escape, el diálogo se cierra sin borrar nada y el foco vuelve a «Borrar Inglés».
* **CA5 (Confirmar):** Cuando pulso «Borrar asignatura» (dos veces seguidas), entonces se envía un único `DELETE`, la asignatura desaparece de la lista sin volver a pedirla, veo «Asignatura «Inglés» eliminada» y el foco pasa al título; los dos cursos siguen existiendo, sin la asignatura.
* **CA6 (La última y los filtros):** Si borro la única asignatura, veo «Todavía no hay asignaturas» (con «Crear asignatura»); si un filtro la dejaba como la única visible, veo «No hay asignaturas que coincidan» y el filtro sigue puesto.
* **CA7 (Ya no existe):** Dado una asignatura que otra persona borró, cuando confirmo, entonces el diálogo se cierra, veo «Esa asignatura ya no existe» y la lista se vuelve a pedir; y su edición (US-SUBJECT_b) muestra «Esta asignatura no existe o ya no está disponible» al abrirla o al guardar.
* **CA8 (Fallo):** Si el servidor falla, el diálogo sigue abierto con un aviso y puedo reintentar; nada se borra.
* **CA9 (Nombre y código libres):** Tras borrar «Inglés» con código «ING», crear otra «Inglés» con «ING» responde `201`.
* **CA10 (Atomicidad):** Si el borrado falla a mitad (un disparador en la prueba), la asignatura y sus filas de `subject_courses` siguen como estaban.
* **CA11 (Concurrencia):** Dos borrados a la vez dan `200` y `404`; un borrado y una edición de la misma asignatura, o el borrado de uno de sus cursos, terminan sin `500` ni interbloqueo.
* **CA12 (Aislamiento y sesión):** La asignatura de otro colegio es `404`; sin sesión, `401`.
* **CA13 (Accesibilidad, responsive e i18n):** el diálogo con su título como nombre accesible, sin violaciones de `axe`, sin desplazamiento horizontal a 360 px y los textos en `es.json` y `en.json`.
* **CA14 (Observabilidad):** El log solo lleva `SUBJECT_DELETED` con identificadores, nunca nombres ni códigos.

**Fuera de alcance:** papelera o deshacer, borrar varias a la vez, impedir el borrado de una asignatura en uso (las reglas de US19_b caen en cascada; lo que referencie US-PROF-ASSIGN lo decidirá esa historia), borrar desde la página de edición e inactivar desde el diálogo.

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Contrato:** `docs/api-spec.yml` (`deleteSubject` y `DeleteSubjectResponse`), `npm run api:types -w frontend` y `api/schema.test.ts`.
* **Backend:** el puerto `SubjectRepository` gana `delete(schoolId, id)` (devuelve `true` o `false`), `application/subjects/deleteSubject.ts` (`DeleteSubject`), `PrismaSubjectRepository.delete` (bloqueo y borrado), `subjectsRouter` (`DELETE /:id` con `requireRole('ADMIN')` antes de `parseSubjectId`), `app.ts`, `composeApp.ts` y `test/support/appDoubles.ts`.
* **Frontend:** `services/subjectsService.ts` (`delete`, con `deleted`, `notFound`, `forbidden`, `unauthenticated` y `unavailable`), `components/DeleteSubjectModal.tsx`, `pages/SubjectsPage.tsx` (botón, diálogo, aviso propio, foco y la lista sin volver a pedirla), i18n y `cypress/e2e/subjects.cy.ts` (el `404` de la edición que US-SUBJECT_b simulaba con un `cy.intercept` pasa a probarse con un borrado real).
* **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `README.md` (módulo 3, endpoints y árbol), `MODELO_DATOS.md` (el borrado y sus efectos), la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL) y el resumen de épicas de este documento; `docs/backend-standards.md` y `docs/frontend-standards.md` solo si surge un patrón nuevo.

##### Requisitos de Testing (Pre-release)

* **Backend unitario:** `DeleteSubject` (`false` → `SubjectNotFound` sin evento, `SUBJECT_DELETED` sin nombres); la ruta (`200` y `no-store`, `403` del `MEMBER` antes de mirar el `id`, `404` con un `id` que no es UUID sin llegar al caso de uso, `401`, `503`) y `api/schema.test.ts`.
* **Backend de integración:** repositorio contra PostgreSQL (borra la asignatura y sus filas de `subject_courses`, los cursos y las demás asignaturas siguen intactos, el nombre y el código quedan libres, otro colegio o inexistente → `false` sin borrar nada, atomicidad con un disparador, dos borrados a la vez, borrado contra edición de la misma asignatura y contra el borrado de uno de sus cursos) y HTTP completo (`ADMIN`, `MEMBER`, aislamiento, el listado tras borrar y el registro sin nombres).
* **Frontend:** servicio, `DeleteSubjectModal` (contenido con y sin cursos, el recordatorio, foco, cancelar y Escape, doble pulsación, «Borrando…», `404` → `onGone`, fallo con reintento, `axe`) y `SubjectsPage` (botón solo para `ADMIN`, la lista se actualiza sin volver a pedirla y conserva los filtros, aviso propio con prioridad sobre el de llegada, foco al `h1`, `onGone`, estado vacío).
* **Manual y E2E:** `curl` (incluido el `403` de un `MEMBER` real y la concurrencia) y E2E (borrar con cursos y sin cursos, cancelar, la última, el aviso, que los cursos siguen existiendo, la edición de una asignatura borrada, `MEMBER` sin botón y 360 px).
* **Cobertura mínima:** 90 % backend y 80 % frontend.

##### Definición de hecho

* Tests en verde con la cobertura mínima, `lint`, `typecheck`, `build` y `api:types:check` (cada uno con su código de salida); pruebas con `curl`; E2E completo; PR integrada; despliegue (sin migraciones) y comprobación en producción.

##### Riesgos y mitigaciones

* **Borrar una asignatura que solo ha dejado de impartirse:** el diálogo recuerda que se puede inactivar desde «Editar» y pide confirmar; muestra los cursos para no borrar la equivocada.
* **Interbloqueos:** el borrado solo bloquea la asignatura; la cascada toca filas de `subject_courses` que la edición y el borrado de un curso también tocan, siempre después de su propio bloqueo y sin ciclos; tests de concurrencia.
* **Foco al cerrar el diálogo:** el botón «Borrar» desaparece con la tarjeta; el foco va al `h1` un turno después de `onExited` (react-bootstrap suelta la captura de foco justo después), comprobado con `have.focus` en el E2E.
* **Reglas de reparto (US19_b):** caen en cascada con la asignatura (clave ajena compuesta a `subject_courses`) y US19_b añade su recuento a este diálogo.

---

### US19: Carga horaria por curso

**Épica:** [5. Configuración de Horarios (Base + Asignaturas + Restricciones)](#epica-5-configuracion-de-horarios-base--asignaturas--restricciones)

**Estimación:** 5 puntos de historia. Dos endpoints (`GET` y `PATCH /api/courses/{id}/workload`), una página, un enlace en el listado de cursos y una función pura de avisos; **sin migraciones**.

**Historia:** Como administrador del colegio, quiero ver y ajustar en una sola pantalla las asignaturas que se imparten en un curso y sus sesiones semanales, con el balance frente a las sesiones de su calendario, y como usuario del colegio quiero consultarlo, para saber antes de generar el horario si la carga de cada curso cabe en su semana.

**Depende de:** US-SUBJECT y US-SUBJECT_b (`subject_courses`, sus bloqueos y `subjectsRouter`), US05–US08 (cursos y `CoursesPage`), US-BASE (el calendario de cada curso y sus periodos) y el patrón de lectura para los dos roles con escritura solo para `ADMIN`.

> **Nota (2026-10-29):** la ficha anterior («Crear Restricción de Carga Horaria», 20 CA) guardaba la carga en una tabla de restricciones `HOURS_PER_WEEK` que duplicaba `subject_courses.sessions_per_week`, mezclaba la disponibilidad del profesor (US-PROF-AVAIL) y la regla de ubicación única del profesor (una regla fija del motor, US-ALGO-RUN), suponía 25 franjas fijas y tenía varios CA cortados por un fallo de codificación. La exploración del 2026-10-29 la parte en **US19** (esta), **US19_b** (máximo por día y bloques), **US19_c** (franjas prohibidas), **US19_d** (franjas preferidas) y **US20** (listado de reglas). Las decisiones de abajo la sustituyen.

---

#### Decisiones (validadas por la persona usuaria, 2026-10-29)

* **La carga tiene una sola fuente: `subject_courses.sessions_per_week`.** No hay restricción `HOURS_PER_WEEK`; desaparecen la «sugerencia» de sesiones, la pregunta «¿actualizar las restricciones?» al editar una asignatura y la columna «Usos» (antiguos CA14, CA15, CA16 y CA20 de US-SUBJECT).
* **Dos caminos escriben la misma fila:** la ficha de la asignatura (US-SUBJECT_b, por asignatura) y esta matriz (por curso). Los dos bloquean primero las asignaturas y después los cursos, así que no forman ciclos.
* **Escribe solo `ADMIN`; `ADMIN` y `MEMBER` leen**, como en la ficha de la asignatura.
* **Las sesiones disponibles salen del calendario del curso:** sesiones de su jornada × 5 días (de 5 a 40), no 25 fijas. La jornada es la misma de lunes a viernes.
* **Si no cabe, se avisa y nunca se rechaza:** el aviso se calcula al leer, porque la carga y el calendario se cambian en pantallas distintas. Un curso sin calendario no tiene balance: se avisa.
* **Ámbito: asignatura + curso** (todas sus clases), como `subject_courses`.

#### Casos de uso y reglas de negocio

* **Acceso:** `GET /api/courses/{id}/workload` lo usan `ADMIN` y `MEMBER`; `PATCH /api/courses/{id}/workload` es **solo `ADMIN`** (`requireRole('ADMIN')` antes de leer el `id` y el cuerpo: un `MEMBER` recibe `403 FORBIDDEN` sin revelar nada). El colegio sale de la identidad; un `id` que no es UUID, un curso inexistente o de otro colegio son `404 NOT_FOUND` (`CourseNotFound`).
* **Lectura:** el curso (`id`, `name`), su calendario (`id`, `name`, `sessionsPerDay`) o `null`, las **asignaturas del colegio** ordenadas por nombre (`compareText`), cada una con `id`, `name`, `code`, `color`, `status` y `sessionsPerWeek` (`null` si no se imparte en el curso), el total asignado, el disponible (`sessionsPerDay × 5` o `null`) y los **avisos** del curso.
* **Avisos (función pura `workloadWarnings` del dominio, recalculada en cada lectura):** `COURSE_WITHOUT_CALENDAR` (no hay balance) y `WORKLOAD_EXCEEDS_SLOTS` (`assigned > available`, con los dos números). Son códigos del contrato que el frontend traduce; US19_b–US19_d añaden los suyos.
* **Escritura por diferencias:** el cuerpo lleva **solo las filas que cambian**, `{ changes: [{ subjectId, sessionsPerWeek }] }`, con `sessionsPerWeek` de 1 a 5 (la asignatura se imparte con esas sesiones; la fila se crea o se actualiza) o `null` (deja de impartirse; la fila se borra). Las demás asignaturas del curso no se tocan, así que dos personas que cambian asignaturas distintas del mismo curso no se pisan; en la misma fila gana el último guardado. De 1 a 200 cambios, sin asignaturas repetidas (`DUPLICATE` en `changes[<i>].subjectId`); una asignatura inexistente o de otro colegio es `400` con `NOT_FOUND` en `changes[<i>].subjectId` y no se cambia nada; `OUT_OF_RANGE` en `changes[<i>].sessionsPerWeek`. Un `null` sobre una asignatura que no se imparte en el curso no es error (no cambia nada).
* **Una asignatura puede quedarse sin cursos** desde aquí (como al borrar un curso): su tarjeta ya dice «Sin cursos» y US-SUBJECT_b obliga a marcar uno para guardarla.
* **Asignaturas inactivas:** aparecen con su estado y se pueden ajustar (`INACTIVE` sigue sin consecuencias).
* **Transacción y bloqueos:** las asignaturas de `changes` `FOR UPDATE` **en orden de `id`** (filtradas por colegio; si falta alguna, `400` sin tocar nada); después el curso `FOR SHARE` (si no está, `404`); después las diferencias sobre `subject_courses` (borrar, actualizar e insertar, sin reemplazar las demás filas, que conservan su `created_at`) y se relee. Es el mismo orden que la edición de una asignatura (asignatura → cursos `FOR SHARE`); el borrado de un curso (curso `FOR UPDATE` → cascada) espera o hace que el `PATCH` responda `404`. **El calendario no se bloquea:** se lee para el balance y, si cambia a la vez, la siguiente lectura recalcula los avisos.
* **Respuesta del `PATCH`:** `200` con la misma forma que el `GET` (releída) y `no-store`; un cuerpo sin cambios reales responde `200` sin evento de cambio.
* **Navegación:** cada tarjeta de `/cursos` lleva, **para los dos roles**, un enlace «Carga horaria» (`aria-label` «Carga horaria de {curso}») hacia `/cursos/:id/carga`; el `NavLink` «Cursos» sigue activo en la subruta.
* **Página `/cursos/:id/carga` (`CourseWorkloadPage`):** una sola carga (también con `StrictMode`), con «Reintentar» si falla y la vista «Este curso no existe o ya no está disponible» con un enlace a «Cursos» para el `404`. Título «Carga horaria de {curso}». **Balance:** «{asignadas} de {disponibles} sesiones a la semana» con una barra (decorativa, `aria-hidden`; el texto lleva el dato), de color de peligro si se supera, y el aviso «La carga supera en {n} las sesiones del calendario {nombre}» en un `role="status"`; sin calendario: «Este curso no tiene calendario base: asígnaselo desde Calendarios para saber si cabe la carga», con un enlace a `/calendarios`.
* **Matriz (para el `ADMIN`):** una fila por asignatura del colegio: muestra de color, nombre (y código), estado si es «Inactiva» y un selector de sesiones («No se imparte», 1, 2, 3, 4, 5) con la etiqueta accesible «Sesiones a la semana de {asignatura}». El balance se actualiza mientras se edita. «Guardar» está deshabilitado mientras no haya diferencias con lo cargado (deshacer lo vuelve a deshabilitar) y envía solo las filas cambiadas, con guarda síncrona contra el doble envío; con el `200` sigue en la página con lo releído y «Carga de {curso} guardada» en un `role="status"`; un `400` en una asignatura vuelve a pedir la página y avisa «Alguna asignatura ya no existe; revisa la carga»; un `404` muestra la vista de no disponible; un `403`, el mensaje de solo administradores; cualquier otro fallo, un aviso general conservando lo editado. Sin asignaturas en el colegio: «Todavía no hay asignaturas», con un enlace a «Crear asignatura».
* **Vista del `MEMBER`:** el balance y la lista de las asignaturas que se imparten en el curso con sus sesiones, sin selectores ni «Guardar», y «Solo los administradores pueden modificar la carga horaria».
* **Observabilidad:** `COURSE_WORKLOAD_UPDATED` (`school_id`, `actor_id`, `course_id`, `subjects_added`, `subjects_removed`, `subjects_changed`) y `COURSE_WORKLOAD_UPDATE_REJECTED` (`reason: not_found | subject_not_found`). Nunca nombres ni códigos.

#### Contrato de la API (`docs/api-spec.yml`, primero)

* **`GET /api/courses/{id}/workload`** (`getCourseWorkload`, Bearer, `ADMIN` y `MEMBER`): `200` con `{ workload: CourseWorkload }` y `no-store`; `401`; `404 NOT_FOUND` (`CourseNotFound`); `500`; `503`.
* **`PATCH /api/courses/{id}/workload`** (`updateCourseWorkload`, Bearer, solo `ADMIN`): cuerpo `UpdateCourseWorkloadRequest` (`{ changes: [{ subjectId, sessionsPerWeek: integer 1..5 | null }] }`, sin más propiedades); `200` con `{ workload: CourseWorkload }` y `no-store`; `400 VALIDATION_ERROR`; `401`; `403 FORBIDDEN`; `404 NOT_FOUND`; `500`; `503`.
* **`CourseWorkload`:** `course` (`id`, `name`), `calendar` (`{ id, name, sessionsPerDay }` o `null`), `subjects` (`[{ id, name, code, color, status, sessionsPerWeek: integer | null }]`), `assignedSessions`, `availableSessions` (`integer | null`) y `warnings` (`[{ code: WorkloadWarningCode, … }]`, con `assigned` y `available` en `WORKLOAD_EXCEEDS_SLOTS`).
* **`WorkloadWarningCode`:** enum nuevo (`COURSE_WITHOUT_CALENDAR`, `WORKLOAD_EXCEEDS_SLOTS`), que ampliarán US19_b–US19_d. **Sin códigos de error nuevos:** se reutilizan `NOT_FOUND`, `DUPLICATE`, `OUT_OF_RANGE`, `REQUIRED` e `INVALID_LENGTH`.

#### Criterios de Aceptación

* **CA1 (Acceso):** Dado un `ADMIN` o un `MEMBER`, cada tarjeta de `/cursos` lleva «Carga horaria»; el `MEMBER` ve la carga sin poder editarla, con «Solo los administradores pueden modificar la carga horaria», y `PATCH /api/courses/{id}/workload` le responde `403 FORBIDDEN` sin cambiar nada (también con un `id` inexistente o un cuerpo inválido).
* **CA2 (Matriz y balance):** Dado «1º Primaria» con un calendario de 6 sesiones e «Inglés» (3) y «Lengua» (5) en el curso, cuando abro su carga, entonces veo todas las asignaturas del colegio por nombre, «Inglés» con 3, «Lengua» con 5, el resto en «No se imparte» y «8 de 30 sesiones a la semana».
* **CA3 (Ajustar):** Cuando subo «Inglés» a 4, marco «Música» con 2 y paso «Lengua» a «No se imparte», entonces el balance pasa a «6 de 30» mientras edito; al guardar se envía un único `PATCH` con esas tres filas, veo «Carga de 1º Primaria guardada», y la tarjeta de «Lengua» en `/asignaturas` ya no lista 1º.
* **CA4 (Solo con cambios):** «Guardar» está deshabilitado al cargar y vuelve a estarlo si deshago los cambios.
* **CA5 (No cabe):** Dado un curso con 31 sesiones asignadas y un calendario de 6, entonces veo «31 de 30», la barra en color de peligro y «La carga supera en 1 las sesiones del calendario …»; guardar sigue siendo posible.
* **CA6 (Sin calendario):** Dado un curso sin calendario, veo la carga y «Este curso no tiene calendario base…» con el enlace a «Calendarios», sin balance; y la carga se puede guardar.
* **CA7 (Coherencia con la asignatura):** Lo guardado aquí se ve en la edición de la asignatura (US-SUBJECT_b) y lo guardado allí se ve aquí al volver a abrir la página.
* **CA8 (Asignatura que ya no existe):** Dado una asignatura que otra persona borró, cuando guardo un cambio en ella, entonces `400` con `NOT_FOUND`, la página se vuelve a pedir y veo el aviso; no se guarda ningún cambio.
* **CA9 (Validación):** `PATCH` con sesiones de 0 o 6, una asignatura repetida o sin cambios (`changes: []`) responde `400` con su código en su campo.
* **CA10 (Curso que ya no existe):** Dado un curso que otra persona borró, la página muestra «Este curso no existe o ya no está disponible», también al guardar.
* **CA11 (Atomicidad):** Si el `PATCH` falla a mitad (un disparador en la prueba), ninguna de sus filas cambia.
* **CA12 (Concurrencia):** Dos `PATCH` del mismo curso sobre asignaturas distintas conservan los dos cambios; sobre la misma asignatura queda el último; un `PATCH` y la edición de una de sus asignaturas, o el borrado del curso, o la edición del calendario del curso, terminan sin `500` ni interbloqueo.
* **CA13 (Aislamiento y sesión):** El curso de otro colegio es `404`; una asignatura de otro colegio en `changes` es `NOT_FOUND`; sin sesión, `401`.
* **CA14 (Accesibilidad, responsive e i18n):** cada selector con su etiqueta accesible, el balance como texto (la barra es decorativa), los avisos en un `role="status"`, sin violaciones de `axe`, sin desplazamiento horizontal a 360 px y los textos y códigos de aviso en `es.json` y `en.json`.
* **CA15 (Observabilidad):** El log solo lleva `COURSE_WORKLOAD_UPDATED` y `COURSE_WORKLOAD_UPDATE_REJECTED` con identificadores y recuentos.

**Fuera de alcance:** reglas de reparto (US19_b–US19_d), listado de reglas (US20), cargas por clase, copiar la carga de otro curso, asignar el calendario desde esta página y la disponibilidad de los profesores (US-PROF-AVAIL).

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Contrato:** `docs/api-spec.yml` (`getCourseWorkload`, `updateCourseWorkload`, `CourseWorkload`, `UpdateCourseWorkloadRequest`, `WorkloadWarning` y `WorkloadWarningCode`), `npm run api:types -w frontend` y `api/schema.test.ts`.
* **Backend:** `domain/workload/` (`CourseWorkload`, el puerto `CourseWorkloadRepository` y `workloadWarnings`, pura), `application/workload/` (`GetCourseWorkload`, `UpdateCourseWorkload` y `updateCourseWorkloadRequest.ts`), `infrastructure/prisma/prismaCourseWorkloadRepository.ts` (lectura y diferencias con los bloqueos en orden), `presentation/workload/workloadRouter.ts` (montado en `/api/courses/:id/workload`; `requireRole('ADMIN')` solo en el `PATCH`), `app.ts`, `composeApp.ts` y `test/support/appDoubles.ts`.
* **Frontend:** `services/courseWorkloadService.ts`, `pages/CourseWorkloadPage.tsx`, `components/WorkloadBalance.tsx`, `pages/CoursesPage.tsx` (enlace «Carga horaria»), `App.tsx` (la ruta, para los dos roles), i18n (textos y códigos de aviso) y `cypress/e2e/workload.cy.ts`.
* **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `README.md` (módulo, endpoints y árbol), `MODELO_DATOS.md` (dos caminos de escritura sobre `subject_courses`), la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL), `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md` (HC1 lee `subject_courses`) y el resumen de épicas.

##### Requisitos de Testing (Pre-release)

* **Backend unitario:** `workloadWarnings` (con y sin calendario, en el límite, por encima), el parser (`null`, 1–5, repetidas, vacío, más de 200), los casos de uso (eventos con recuentos, `400`, `404`, sin cambios) y la ruta (`200`, `403` del `MEMBER` antes de validar, `401`, `404`, `503`, `no-store`).
* **Backend de integración:** repositorio contra PostgreSQL (crear, actualizar y borrar filas sin tocar las demás, `created_at` conservado, asignatura de otro colegio, atomicidad con un disparador, dos `PATCH` sobre asignaturas distintas y sobre la misma, `PATCH` contra edición de la asignatura, contra borrado del curso y contra edición del calendario) y HTTP completo (`ADMIN`, `MEMBER`, aislamiento y registro sin nombres).
* **Frontend:** servicio, `WorkloadBalance` (con calendario, sin calendario, superado), `CourseWorkloadPage` (carga única con `StrictMode`, matriz, solo cambios, envío de las filas cambiadas, `400`, `404`, `403`, vista del `MEMBER`, `axe`) y el enlace en `CoursesPage`.
* **Manual y E2E:** `curl` (incluido el `403` de un `MEMBER` real y la concurrencia) y E2E (ajustar la carga y verla en la asignatura, carga que no cabe, curso sin calendario, `MEMBER` y 360 px).
* **Cobertura mínima:** 90 % backend y 80 % frontend.

##### Definición de hecho

* Tests en verde con la cobertura mínima, `lint`, `typecheck`, `build` y `api:types:check` (cada uno con su código de salida); pruebas con `curl`; E2E completo; PR integrada; despliegue (sin migraciones) y comprobación en producción.

##### Riesgos y mitigaciones

* **Dos pantallas escriben `subject_courses`:** mismo orden de bloqueo (asignaturas `FOR UPDATE` en orden de `id` y después cursos `FOR SHARE`) y tests de concurrencia cruzada.
* **Pisar cambios ajenos:** el `PATCH` solo lleva las filas cambiadas; en la misma fila gana el último, como en el resto del proyecto.
* **Ciclo con los calendarios:** la carga no bloquea el calendario; los avisos se recalculan al leer.
* **La matriz crece con las asignaturas:** decenas de filas por colegio; sin paginación, como el resto de listados.

---

### US19_b: Reglas de reparto: máximo por día y bloques

**Épica:** [5. Configuración de Horarios (Base + Asignaturas + Restricciones)](#epica-5-configuracion-de-horarios-base--asignaturas--restricciones)

**Estimación:** 5 puntos de historia. Una tabla y un enum nuevos (una migración, con `CHECK` y clave ajena compuesta escritos a mano), dos columnas en la matriz de US19, la escritura por diferencias de la edición de asignaturas, recuentos en tres respuestas y avisos en tres diálogos.

**Historia:** Como administrador del colegio, quiero indicar en la carga de un curso cuántas sesiones de una asignatura pueden caer el mismo día y si van en bloques de sesiones seguidas, para que el horario generado respete cómo se imparte cada asignatura.

**Depende de:** US19 (la matriz y `PATCH /api/courses/{id}/workload`), US-SUBJECT_b (la edición de asignaturas, que pasa a aplicar diferencias), US-SUBJECT_c (el diálogo de borrado de asignaturas) y US08 (el diálogo de borrado de cursos y `GET /api/courses/{id}/impact`).

---

#### Decisiones (validadas por la persona usuaria, 2026-10-29)

* **Una tabla de reglas propias** (`scheduling_constraints`), con **una fila por (asignatura, curso, tipo)**, para lo que no es un dato de otra entidad. Esta historia trae dos tipos, **`MAX_PER_DAY`** y **`BLOCK`**, los dos duros; US19_c y US19_d añaden `FORBIDDEN_SLOTS` y `PREFERRED_SLOTS`.
* **La regla cuelga de la pareja:** clave ajena compuesta a `subject_courses(subject_id, course_id)` con `ON DELETE CASCADE`. Una regla de una asignatura en un curso donde no se imparte es imposible; al dejar de impartirse (desde la asignatura o desde la matriz), al borrar la asignatura o al borrar el curso, sus reglas se borran solas.
* **Sin regla, el motor pone como mucho una sesión al día** (HC3). `MAX_PER_DAY` la sube.
* **El bloque manda sobre el máximo:** un día con un bloque de `k` lleva esas `k` sesiones seguidas aunque el máximo diga menos; el máximo se aplica a las sesiones sueltas.
* **El recreo siempre corta un bloque:** dos sesiones son seguidas si no hay ningún recreo entre ellas en el calendario del curso.
* **Bloques y el resto suelto:** 3 sesiones en bloques de 2 son un bloque y una suelta; 4, dos bloques.
* **Solo avisos:** lo que no cabe (por la carga, el calendario o las otras reglas) se avisa al leer y nunca se rechaza al guardar.
* **Escribe solo `ADMIN`; `ADMIN` y `MEMBER` leen.**
* **Se ve dónde se pierde algo:** «N reglas» por curso en la tarjeta de la asignatura (sin columna «Usos») y «Se borrarán también N reglas» al quitar un curso de una asignatura, al borrar una asignatura y al borrar un curso.

#### Casos de uso y reglas de negocio

* **Valores:** `MAX_PER_DAY` de **2 a 5** (1 es lo que ya hace el motor sin regla); `BLOCK` de **2 o 3** sesiones seguidas.
* **Edición en la matriz de US19:** cada fila gana dos selectores, «Máximo al día» («1 (por defecto)», 2, 3, 4, 5) y «Bloques» («Sin bloques», «De 2», «De 3»), con etiquetas accesibles «Máximo al día de {asignatura}» y «Bloques de {asignatura}»; están deshabilitados en «No se imparte». El mismo `PATCH` guarda la fila entera: `{ subjectId, sessionsPerWeek, maxPerDay: 2..5 | null, blockSize: 2..3 | null }`, donde `null` borra la regla y un valor la crea o la cambia. Con `sessionsPerWeek: null`, `maxPerDay` y `blockSize` deben ser `null` (`NOT_ALLOWED` en el campo: el código que ya existe para un campo que no admite el valor de otro). La fila de la regla y la de `subject_courses` se escriben en la misma transacción y bajo los mismos bloqueos de US19.
* **Avisos nuevos** (en `workloadWarnings`, al leer y por asignatura): `BLOCK_LARGER_THAN_LOAD` (1 sesión con bloques de 2, o 2 con bloques de 3) y `SUBJECT_DOES_NOT_FIT` (con el calendario, el máximo, los bloques y, desde US19_c, las franjas prohibidas, no hay forma de repartir sus sesiones en la semana). El cálculo: cada día lleva como mucho un bloque y, si lo lleva, ninguna sesión suelta de esa asignatura; un día admite un bloque si tiene `k` sesiones seguidas sin recreo, y los cinco días tienen la misma jornada. Como una asignatura tiene como mucho 5 sesiones, hoy solo deja de caber cuando ningún tramo de la jornada sin recreo llega a `k` sesiones; US19_c lo amplía con las franjas prohibidas. Sin calendario, solo se comprueba `BLOCK_LARGER_THAN_LOAD`. Es una comprobación de cada asignatura por separado: no garantiza que el horario completo exista (eso lo decide el motor).
* **La edición de asignaturas aplica diferencias:** `PrismaSubjectRepository.update` deja de borrar y reinsertar `subject_courses`: borra los cursos quitados (sus reglas caen por la cascada), actualiza las sesiones cambiadas e inserta los nuevos, con los mismos bloqueos. Guardar una asignatura sin cambiar sus cursos no toca sus reglas.
* **Recuentos:** `SubjectCourse` (en `GET /api/subjects` y `GET /api/subjects/{id}`) gana `constraintCount`; cada fila de `CourseWorkload` gana `constraintCount`; `CourseImpact` (`GET /api/courses/{id}/impact`) gana `constraintCount`. Cuentan todas las reglas de la pareja o del curso, de cualquier tipo.
* **Tarjeta de la asignatura:** el desplegable de cursos dice «1º Primaria: 3 sesiones · 2 reglas» (sin el sufijo si no tiene).
* **Avisos de pérdida:**
  * **Editar una asignatura:** al desmarcar un curso con reglas, «Al guardar se borrarán sus {n} reglas en {curso}», ligado al curso por `aria-describedby`.
  * **Matriz de US19:** al pasar a «No se imparte» una asignatura con reglas en el curso, «Al guardar se borrarán sus {n} reglas en este curso».
  * **Borrar una asignatura (`DeleteSubjectModal`):** «Se borrarán también {n} reglas», con la suma de sus cursos, solo si hay alguna.
  * **Borrar un curso (`DeleteCourseModal`):** «Se borrarán también {n} reglas de reparto», con el `constraintCount` del impacto, solo si hay alguna.
* **Observabilidad:** `COURSE_WORKLOAD_UPDATED` gana `constraints_set` y `constraints_removed`. Nunca nombres.

#### Modelo de datos (migración `add_scheduling_constraints`)

* **Enum `ConstraintType`:** `MAX_PER_DAY`, `BLOCK`, `FORBIDDEN_SLOTS`, `PREFERRED_SLOTS` (los dos últimos se crean ya para no migrar el enum otra vez; esta historia no los usa).
* **`scheduling_constraints`:** `id` (UUIDv7), `school_id` (clave ajena a `schools`), `subject_id`, `course_id`, `type`, `max_per_day` (`SMALLINT`, nulo), `block_size` (`SMALLINT`, nulo), `created_at`, `updated_at`; único `(subject_id, course_id, type)`; índice en `(course_id)` y en `(school_id)`. **Clave ajena compuesta** `(subject_id, course_id)` → `subject_courses (subject_id, course_id)` `ON DELETE CASCADE`. `CHECK` escritos a mano: `MAX_PER_DAY` exige `max_per_day BETWEEN 2 AND 5` y `block_size IS NULL`; `BLOCK` exige `block_size BETWEEN 2 AND 3` y `max_per_day IS NULL`; los tipos de franjas, los dos nulos. Test de esquema con el nombre de cada restricción.
* **`MODELO_DATOS.md`:** la tabla, sus `CHECK`, la cascada desde `subject_courses` y por qué la edición de asignaturas aplica diferencias.

#### Contrato de la API (`docs/api-spec.yml`, primero)

* **`UpdateCourseWorkloadRequest`:** cada cambio gana `maxPerDay` y `blockSize` (obligatorios, `integer | null`). **`CourseWorkload`:** cada asignatura gana `maxPerDay`, `blockSize`, `constraintCount` y sus `warnings`.
* **`SubjectCourse`** y **`CourseImpact`** ganan `constraintCount`.
* **`WorkloadWarningCode`** gana `BLOCK_LARGER_THAN_LOAD` y `SUBJECT_DOES_NOT_FIT`. `FieldErrorCode` no cambia: una regla sin carga es `NOT_ALLOWED`. **`calendar`** (en `CourseWorkload`) gana `maxConsecutiveSessions`, el tramo más largo de sesiones sin recreo, para que la matriz recalcule los avisos mientras se edita.

#### Criterios de Aceptación

* **CA1 (Máximo al día):** Dado «Inglés» con 4 sesiones en 1º, cuando elijo «Máximo al día: 2» y guardo, entonces se guarda la regla y la tarjeta de «Inglés» dice «1º Primaria: 4 sesiones · 1 regla»; al volver a «1 (por defecto)» y guardar, la regla se borra.
* **CA2 (Bloques):** Dado «Plástica» con 3 sesiones en 1º, cuando elijo «Bloques: De 2» y guardo, entonces se guarda sin avisos (un bloque y una suelta).
* **CA3 (Bloque mayor que la carga):** Dado «Plástica» con 1 sesión y bloques de 2, veo «Plástica: con 1 sesión no puede ir en bloques de 2»; guardar sigue siendo posible.
* **CA4 (No cabe):** Dado un calendario de 2 sesiones sin recreo entre ellas y «Educación Física» con 3 sesiones en bloques de 3, veo «Educación Física no cabe en la semana con sus reglas»; con un calendario de 3 sesiones y el recreo entre la 1ª y la 2ª, un bloque de 3 nunca cabe y se avisa, y uno de 2 sí cabe. (5 sesiones en bloques de 2 con 2 sesiones seguidas caben: dos bloques y una suelta en tres días.)
* **CA5 (Selectores sin carga):** En «No se imparte», los dos selectores están deshabilitados; `PATCH` con `sessionsPerWeek: null` y `maxPerDay: 2` responde `400` con `NOT_ALLOWED`.
* **CA6 (Validación):** `PATCH` con `maxPerDay: 1` o `6`, o `blockSize: 1` o `4`, responde `400` con `OUT_OF_RANGE`.
* **CA7 (Quitar un curso desde la asignatura):** Dado «Inglés» con 2 reglas en 1º, cuando desmarco 1º en su edición, veo «Al guardar se borrarán sus 2 reglas en 1º Primaria»; al guardar, las reglas desaparecen. Si guardo «Inglés» cambiando solo su nombre, sus reglas siguen.
* **CA8 (Quitar desde la matriz):** Dado lo mismo, cuando paso «Inglés» a «No se imparte» en la carga de 1º, veo el aviso y al guardar las reglas desaparecen.
* **CA9 (Borrar la asignatura):** El diálogo de borrar «Inglés» dice «Se borrarán también 2 reglas»; al confirmar, no queda ninguna regla de «Inglés».
* **CA10 (Borrar el curso):** El diálogo de borrar 1º dice «Se borrarán también {n} reglas de reparto»; al confirmar, no queda ninguna regla de 1º.
* **CA11 (Vista del `MEMBER`):** El `MEMBER` ve en la carga el máximo y los bloques de cada asignatura como texto, sin selectores.
* **CA12 (Atomicidad):** Si el `PATCH` falla a mitad (un disparador en la prueba), ni la carga ni las reglas cambian.
* **CA13 (Concurrencia):** Un `PATCH` con reglas y la edición de la misma asignatura que quita ese curso, o el borrado del curso, terminan sin `500` ni interbloqueo y nunca dejan una regla sin su pareja (la base de datos lo impide).
* **CA14 (Accesibilidad, responsive e i18n):** los selectores con su etiqueta, los avisos de pérdida ligados por `aria-describedby`, sin violaciones de `axe`, la matriz sin desplazamiento horizontal a 360 px (las columnas pasan a apilarse) y los textos en `es.json` y `en.json`.
* **CA15 (Observabilidad):** El log lleva los recuentos de reglas creadas y borradas, nunca nombres.

**Fuera de alcance:** franjas prohibidas y preferidas (US19_c, US19_d), listado de reglas (US20), bloques que cruzan el recreo, reglas por clase o de curso entero y comprobar si el horario completo es posible (US-ALGO-RUN).

---

#### Requisitos Técnicos, QA y Riesgos

##### Archivos a modificar

* **Contrato:** `docs/api-spec.yml` (los campos nuevos, `maxConsecutiveSessions` y `WorkloadWarningCode`), `npm run api:types -w frontend` y `api/schema.test.ts`.
* **Modelo:** `backend/prisma/schema.prisma` (`SchedulingConstraint`, `ConstraintType` y la relación con `SubjectCourse`) y la migración `add_scheduling_constraints` con la clave compuesta y los `CHECK` a mano (`--create-only`); `MODELO_DATOS.md`.
* **Backend:** `domain/workload/workloadWarnings.ts` (los dos avisos, con el cálculo por días), el parser y el repositorio de la carga (reglas en la misma transacción), `PrismaSubjectRepository.update` (diferencias), los recuentos en `PrismaSubjectRepository` y en el impacto y el borrado de cursos (`COURSE_DELETED` gana `constraint_count`).
* **Frontend:** `CourseWorkloadPage` (dos selectores y aviso de pérdida), `SubjectsPage` (sufijo «· N reglas»), `SubjectForm` (aviso al desmarcar), `DeleteSubjectModal`, `DeleteCourseModal`, servicios e i18n; `cypress/e2e/workload.cy.ts`, `subjects.cy.ts` y `courses.cy.ts`.
* **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `README.md`, la arquitectura, `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md` (HC3 por defecto, `MAX_PER_DAY` y `BLOCK`) y `docs/backend-standards.md` (clave ajena compuesta a una tabla de unión y escritura por diferencias).

##### Requisitos de Testing (Pre-release)

* **Backend unitario:** `workloadWarnings` (bloque mayor que la carga, el recreo corta, combinaciones de días, sin calendario), parser (rangos, `NOT_ALLOWED`) y eventos.
* **Backend de integración:** esquema (los `CHECK` por su nombre y la clave compuesta), cascadas (quitar el curso desde la asignatura y desde la matriz, borrar la asignatura y el curso), edición de asignatura que no toca las reglas de los cursos que conserva, recuentos, atomicidad y concurrencia cruzada.
* **Frontend:** selectores y su deshabilitado, avisos de pérdida en los cuatro sitios, sufijo de la tarjeta, vista del `MEMBER` y `axe`.
* **Manual y E2E:** `curl` y E2E (crear reglas, verlas en la tarjeta, avisos de pérdida y que las reglas desaparecen, `MEMBER` y 360 px).
* **Cobertura mínima:** 90 % backend y 80 % frontend.

##### Definición de hecho

* Tests en verde con la cobertura mínima, `lint`, `typecheck`, `build` y `api:types:check`; pruebas con `curl`; E2E completo; PR integrada; despliegue con la migración y comprobación en producción.

##### Riesgos y mitigaciones

* **La edición de asignaturas borraba y reinsertaba:** con la clave compuesta, eso borraría todas las reglas; pasa a diferencias con un test que lo comprueba.
* **`CHECK` y clave compuesta escritos a mano:** un `migrate dev` posterior puede intentar quitarlos; test de esquema con sus nombres y revisión del SQL.
* **Avisos que no garantizan el horario:** el texto dice «no cabe con sus reglas», y la especificación del motor sigue mandando.

---

### US19_c: Reglas de reparto: franjas prohibidas

**Épica:** [5. Configuración de Horarios (Base + Asignaturas + Restricciones)](#epica-5-configuracion-de-horarios-base--asignaturas--restricciones)

**Estimación:** 3 puntos de historia. Una tabla hija (una migración, con `CHECK` a mano), dos endpoints, una página de cuadrícula y un enlace en la matriz de US19.

**Historia:** Como administrador del colegio, quiero marcar en una cuadrícula de días y sesiones en qué franjas no puede ir una asignatura en un curso, para que el horario generado no la ponga ahí (por ejemplo, Religión solo martes y jueves, o Educación Física nunca a primera hora).

**Depende de:** US19 y US19_b (la matriz, `scheduling_constraints` con `FORBIDDEN_SLOTS` en el enum y `workloadWarnings`) y US-BASE (los periodos del calendario).

---

#### Decisiones (validadas por la persona usuaria, 2026-10-29)

* **Tipo `FORBIDDEN_SLOTS`, duro**, con su propia pantalla de cuadrícula (las preferidas, US19_d, tienen la suya).
* **Las celdas van en una tabla hija**, una celda por fila; la regla se borra cuando no queda ninguna celda.
* **La cuadrícula sale del calendario del curso:** días de lunes a viernes × sus sesiones, con los recreos como separadores. **Un curso sin calendario no admite franjas.**
* **Si el calendario cambia** (menos sesiones, u otro calendario), las celdas que sobran **se ignoran al leer y se avisa**; se quitan cuando alguien guarda la cuadrícula. El número de sesión es su orden en la jornada, no su hora.
* **Solo avisos** cuando con las franjas prohibidas la asignatura no cabe.
* **Escribe solo `ADMIN`; `ADMIN` y `MEMBER` leen.**

#### Casos de uso y reglas de negocio

* **Acceso:** `GET /api/courses/{courseId}/subjects/{subjectId}/forbidden-slots` lo usan los dos roles; `PUT` en la misma ruta es **solo `ADMIN`** (`requireRole('ADMIN')` antes de leer los `id` y el cuerpo). Un curso o una asignatura que no son UUID, inexistentes, de otro colegio, **o una asignatura que no se imparte en el curso**, responden `404 NOT_FOUND`.
* **Lectura:** curso, asignatura (`id`, `name`, `code`, `color`, `sessionsPerWeek`, `maxPerDay` y `blockSize`, que intervienen en los avisos), el calendario con sus periodos (el `CalendarPeriod` de US-BASE: `type`, `startTime`, `endTime`, en orden) o `null`, las celdas (`[{ dayOfWeek: 1..5, sessionNumber }]`, solo las que existen en el calendario actual), `outsideCalendarCount` (las que sobran) y los avisos de la asignatura.
* **Escritura (estado final):** `{ slots: [{ dayOfWeek, sessionNumber }] }`, de 0 a 40 celdas, sin repetidas (`DUPLICATE`), `dayOfWeek` de 1 a 5 y `sessionNumber` de 1 al número de sesiones del calendario actual (`OUT_OF_RANGE` en `slots[<i>].…`). Una lista vacía borra la regla. Un curso sin calendario responde `409 COURSE_HAS_NO_CALENDAR` (código nuevo). Las celdas que sobraban por un cambio de calendario desaparecen al guardar.
* **Transacción y bloqueos:** la asignatura `FOR UPDATE`, el curso `FOR SHARE` (el orden de US19 y US-SUBJECT_b), la existencia de la pareja (si no, `404`), la creación de la regla si no existía (o su borrado si la lista está vacía) y el reemplazo de sus celdas. El calendario se lee sin bloquear, como en US19.
* **Avisos nuevos:** `SLOTS_OUTSIDE_CALENDAR` (con el recuento) y las franjas pasan a contar en `SUBJECT_DOES_NOT_FIT`, que se calcula **día a día** (un día con todas sus sesiones prohibidas no lleva ninguna; un bloque necesita `k` sesiones seguidas sin recreo y sin prohibir; se prueba qué días llevan los bloques). Backend y frontend comparten la regla y una tabla de casos (`test-fixtures/subject-warnings.json`).
* **Navegación:** en la matriz de US19, cada asignatura que se imparte lleva «Franjas prohibidas» (con el número de celdas si hay alguna; `aria-label` «Franjas prohibidas de {asignatura}») hacia `/cursos/:courseId/carga/:subjectId/prohibidas`, para los dos roles. Sin calendario, el enlace no aparece y la fila dice «Asigna un calendario para definir franjas».
* **Cuadrícula (`SlotGrid`, reutilizable en US19_d):** una tabla con `caption` («Franjas prohibidas de {asignatura} en {curso}»), una columna por día y una fila por periodo en orden: las sesiones son filas de botones con `aria-pressed` (`aria-label` «{día}, sesión {n} ({inicio}–{fin})») y los recreos, filas de separación no interactivas («Recreo 11:15–11:45»). Las cabeceras de día y de sesión son botones que marcan o desmarcan la columna o la fila entera. Las celdas marcadas se distinguen por un icono y un texto oculto, no solo por el color. «Guardar» está deshabilitado sin cambios, con guarda síncrona; con el `200`, «Franjas prohibidas guardadas» y sigue en la página; «Volver a la carga» lleva a `/cursos/:courseId/carga`. Con celdas fuera del calendario: «Hay {n} franjas fuera del calendario actual; se quitarán al guardar». Un `404` muestra «Esta asignatura ya no se imparte en este curso o no existe»; un `409`, «Este curso ya no tiene calendario».
* **Vista del `MEMBER`:** la cuadrícula sin botones (celdas como texto) y «Solo los administradores pueden modificar las franjas».
* **Observabilidad:** `SUBJECT_SLOTS_UPDATED` (`school_id`, `actor_id`, `course_id`, `subject_id`, `type`, `slot_count`) y `SUBJECT_SLOTS_UPDATE_REJECTED` (`reason: not_found | no_calendar`).

#### Modelo de datos (migración `add_scheduling_constraint_slots`)

* **`scheduling_constraint_slots`:** `constraint_id` (clave ajena a `scheduling_constraints`, `ON DELETE CASCADE`), `day_of_week` y `session_number` (`SMALLINT`), `created_at`; clave primaria `(constraint_id, day_of_week, session_number)`. `CHECK` a mano: `day_of_week BETWEEN 1 AND 5` y `session_number BETWEEN 1 AND 8` (el máximo de sesiones de un calendario, US-BASE). Test de esquema con sus nombres.

#### Contrato de la API (`docs/api-spec.yml`, primero)

* **`GET /api/courses/{courseId}/subjects/{subjectId}/forbidden-slots`** (`getForbiddenSlots`) y **`PUT`** (`updateForbiddenSlots`): `200` con `{ slotRule: SubjectSlotRule }` y `no-store`; `400`; `401`; `403` (solo en el `PUT`); `404 NOT_FOUND`; `409 COURSE_HAS_NO_CALENDAR` (solo en el `PUT`); `500`; `503`.
* **`SubjectSlotRule`:** `course`, `subject`, `sessionsPerWeek`, `calendar` (con `periods`) o `null`, `slots`, `outsideCalendarCount` y `warnings`. **`CourseWorkload`:** cada asignatura gana `forbiddenSlots` (las celdas dentro del calendario; el enlace muestra cuántas son) y el calendario gana `sessionGroups` (los tramos de sesiones entre recreos), para que la matriz recalcule los avisos mientras se edita. *Corregido en la propuesta (2026-10-30): la ficha pedía solo `forbiddenSlotCount`, que no basta para recalcular.*
* **Códigos nuevos:** `COURSE_HAS_NO_CALENDAR` en `ErrorCode` y en `ERROR_CODES` a la vez, y `SLOTS_OUTSIDE_CALENDAR` en `WorkloadWarningCode`.

#### Criterios de Aceptación

* **CA1 (Cuadrícula):** Dado «Religión» en 1º con un calendario de 6 sesiones y el recreo tras la 3ª, cuando abro sus franjas prohibidas, entonces veo 5 columnas (L–V), 6 filas de sesiones con sus horas y una fila «Recreo» entre la 3ª y la 4ª, sin ninguna marcada.
* **CA2 (Marcar y guardar):** Cuando pulso las cabeceras «Lunes», «Miércoles» y «Viernes» y guardo, entonces se envía un único `PUT` con 18 celdas, veo «Franjas prohibidas guardadas» y la matriz muestra «Franjas prohibidas (18)».
* **CA3 (Vaciar):** Cuando desmarco todas y guardo, la regla se borra y el recuento de reglas de la pareja baja.
* **CA4 (No cabe):** Dado «Inglés» con 3 sesiones y 3 días enteros prohibidos (y sin máximo), veo «Inglés no cabe en la semana con sus reglas»; guardar sigue siendo posible.
* **CA5 (Bloque y franjas):** Dado «Plástica» con 2 sesiones en bloques de 2 y todas las sesiones prohibidas salvo la 3ª y la 4ª (con el recreo entre ellas), veo que no cabe.
* **CA6 (Calendario que cambia):** Dado una regla con la sesión 6 prohibida los cinco días, cuando el calendario del curso pasa a 5 sesiones, entonces la cuadrícula muestra 5 filas y «Hay 5 franjas fuera del calendario actual; se quitarán al guardar»; al guardar desaparecen.
* **CA7 (Sin calendario):** Dado un curso sin calendario, la matriz no ofrece el enlace y `PUT` responde `409 COURSE_HAS_NO_CALENDAR`.
* **CA8 (Pareja que no existe):** Dado una asignatura que dejó de impartirse en el curso, abrir o guardar sus franjas muestra «Esta asignatura ya no se imparte en este curso o no existe» (`404`).
* **CA9 (Validación):** `PUT` con `dayOfWeek: 6`, `sessionNumber: 7` en un calendario de 6 o una celda repetida responde `400` con su código.
* **CA10 (Acceso):** Dado un `MEMBER`, ve la cuadrícula sin poder editarla y el `PUT` le responde `403 FORBIDDEN`.
* **CA11 (Atomicidad y concurrencia):** Un fallo a mitad (un disparador) deja las celdas como estaban; dos `PUT` a la vez dejan el estado entero de uno de los dos; un `PUT` y quitar el curso de la asignatura terminan sin `500` ni interbloqueo.
* **CA12 (Accesibilidad, responsive e i18n):** la tabla con `caption` y cabeceras, cada celda con `aria-pressed` y su nombre accesible, lo marcado no solo por color, sin violaciones de `axe`, sin desplazamiento horizontal a 360 px y los textos en `es.json` y `en.json`.

**Fuera de alcance:** franjas preferidas (US19_d), franjas de curso entero o de profesor (US-PROF-AVAIL), franjas por clase y copiar las franjas a otros cursos.

---

#### Requisitos Técnicos, QA y Riesgos

* **Archivos:** contrato (`getForbiddenSlots`, `updateForbiddenSlots`, `SubjectSlotRule`, `COURSE_HAS_NO_CALENDAR`); `schema.prisma` y la migración con los `CHECK` a mano; `domain/workload/workloadWarnings.ts` (franjas), un caso de uso y un parser de franjas, el repositorio (bloqueos en orden y reemplazo de celdas), `slotsRouter`; `components/SlotGrid.tsx`, `pages/ForbiddenSlotsPage.tsx`, el enlace en `CourseWorkloadPage`, servicio e i18n; `cypress/e2e/slots.cy.ts`; documentación como en US19_b.
* **Testing:** unitarios (parser, avisos con franjas y recreos, ruta), integración (esquema, celdas fuera del calendario, cascadas desde `subject_courses`, atomicidad y concurrencia), frontend (`SlotGrid` con cabeceras, recreos, solo cambios, vista del `MEMBER`, `axe`) y E2E (marcar, guardar, calendario que cambia, `MEMBER` y 360 px). Cobertura 90 % y 80 %.
* **Definición de hecho:** la de US19_b (con migración).
* **Riesgos:** la cuadrícula a 360 px (6 columnas compactas, probado en E2E); celdas fuera del calendario (se ignoran al leer, con aviso, y no se borran sin que nadie lo vea); el `CHECK` de 8 sesiones depende del límite de US-BASE (si cambia, migración).

---

### US19_d: Reglas de reparto: franjas preferidas

**Épica:** [5. Configuración de Horarios (Base + Asignaturas + Restricciones)](#epica-5-configuracion-de-horarios-base--asignaturas--restricciones)

**Estimación:** 2 puntos de historia. Dos endpoints y una página que reutiliza la cuadrícula de US19_c; **sin migraciones** (el tipo y la tabla de celdas ya existen).

**Historia:** Como administrador del colegio, quiero marcar las franjas en las que es mejor que vaya una asignatura en un curso (por ejemplo, Matemáticas por la mañana), para que el horario generado las prefiera cuando pueda.

**Depende de:** US19_c (`SlotGrid`, la tabla de celdas y el patrón de los endpoints).

---

#### Decisiones (validadas por la persona usuaria, 2026-10-29)

* **Tipo `PREFERRED_SLOTS`, blando:** el motor lo intenta y no siempre lo cumple. Pantalla propia, distinta de la de prohibidas.
* **Si una franja preferida está prohibida, gana la prohibida y se avisa:** no se rechaza al guardar, porque las dos reglas se editan por separado y en momentos distintos.
* El resto, como US19_c (celdas en la tabla hija, cuadrícula del calendario, sin calendario no hay franjas, celdas fuera del calendario ignoradas con aviso, solo `ADMIN` escribe).
* **Correcciones de la propuesta (2026-10-30):**
  * `forbiddenSlots` es un campo opcional de `SubjectSlotRule`, solo en las respuestas de las preferidas: no hay un esquema nuevo.
  * Una sola página, `pages/SubjectSlotsPage.tsx` (la de las prohibidas, renombrada), recibe el tipo. Lo mismo pasa con los casos de uso (`GetSubjectSlots`, `UpdateSubjectSlots`) y el repositorio.
  * `PREFERRED_SLOTS_FORBIDDEN` también sale en la carga del curso.
  * En la carga, `SLOTS_OUTSIDE_CALENDAR` suma las celdas fuera de las dos reglas.
  * Las cabeceras de día y de sesión no marcan celdas prohibidas.
  * `SUBJECT_SLOTS_UPDATE_REJECTED` lleva `type`.
  * La página de prohibidas no avisa de las preferidas que tapa.

#### Casos de uso y reglas de negocio

* **Endpoints:** `GET` y `PUT /api/courses/{courseId}/subjects/{subjectId}/preferred-slots`, con las mismas reglas, códigos y bloqueos que las prohibidas. La lectura añade `forbiddenSlots` (las celdas prohibidas de la pareja) para pintarlas.
* **Cuadrícula:** `SlotGrid` en modo «preferidas». Las celdas prohibidas se ven como «Prohibida» y no se pueden marcar como preferidas (botón deshabilitado con ese motivo en su nombre accesible); las cabeceras de día y de sesión solo marcan las no prohibidas. Una celda preferida que después se prohibió se ve como «Preferida · prohibida, se ignora» y se puede desmarcar.
* **Aviso nuevo:** `PREFERRED_SLOTS_FORBIDDEN` (con el recuento): «{n} franjas preferidas están prohibidas y se ignorarán». Sale en la página de preferidas y en la carga del curso. El servidor acepta guardar una celda preferida prohibida (gana la prohibida); solo la pantalla impide marcar una nueva.
* **Navegación:** en la matriz de US19, «Franjas preferidas» (con su recuento) junto a «Franjas prohibidas», hacia `/cursos/:courseId/carga/:subjectId/preferidas`.
* **Observabilidad:** los mismos eventos de US19_c con `type: PREFERRED_SLOTS`; `SUBJECT_SLOTS_UPDATE_REJECTED` gana `type` en los dos tipos.

#### Contrato de la API (`docs/api-spec.yml`, primero)

* **`getPreferredSlots`** y **`updatePreferredSlots`**, con `SubjectSlotRule` y su campo opcional `forbiddenSlots`. **`CourseWorkload`:** cada asignatura gana `preferredSlotCount`, y `SLOTS_OUTSIDE_CALENDAR` suma las dos reglas. **`WorkloadWarningCode`** gana `PREFERRED_SLOTS_FORBIDDEN`. Sin códigos de error nuevos.

#### Criterios de Aceptación

* **CA1 (Marcar y guardar):** Dado «Matemáticas» en 1º, cuando marco las sesiones 1 y 2 de lunes a viernes en sus franjas preferidas y guardo, entonces se envía un único `PUT` con 10 celdas y la matriz muestra «Franjas preferidas (10)».
* **CA2 (Prohibidas visibles):** Dado «Religión» con el lunes prohibido, en sus preferidas el lunes se ve como «Prohibida» y no se puede marcar.
* **CA3 (Contradicción posterior):** Dado «Religión» con el martes 2ª preferido, cuando después se prohíbe el martes entero, entonces sus preferidas muestran esa celda como «Preferida · prohibida, se ignora» y el aviso «1 franja preferida está prohibida y se ignorará»; al desmarcarla y guardar, el aviso desaparece.
* **CA4 (El servidor no rechaza):** `PUT` de preferidas con una celda prohibida responde `200`.
* **CA5 (Vaciar, calendario, acceso y concurrencia):** como CA3, CA6–CA11 de US19_c, con las preferidas.
* **CA6 (Accesibilidad, responsive e i18n):** el motivo de una celda deshabilitada en su nombre accesible, lo marcado y lo prohibido distinguibles sin color, sin violaciones de `axe`, sin desplazamiento horizontal a 360 px y los textos en `es.json` y `en.json`.

**Fuera de alcance:** pesos o prioridades entre preferencias, preferencias de profesor y preferencias de curso entero.

---

#### Requisitos Técnicos, QA y Riesgos

* **Archivos:** contrato; caso de uso, parser y rutas de preferidas (comparten casi todo con las prohibidas: se extrae lo común por tipo); `SlotGrid` (modo preferidas), `pages/SubjectSlotsPage.tsx` (la de prohibidas, con el tipo), el enlace en `CourseWorkloadPage`, servicio e i18n; `cypress/e2e/slots.cy.ts`; `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md` (preferidas como restricción blanda).
* **Testing:** como US19_c, más la contradicción (las dos órdenes de edición) y el modo preferidas de `SlotGrid`. Cobertura 90 % y 80 %.
* **Definición de hecho:** la de US19 (sin migraciones).
* **Riesgos:** duplicar el código de las prohibidas (se comparte por tipo, con tests de los dos); una preferencia ignorada en silencio (el aviso y el estado de la celda lo hacen visible).

---

### US20: Ver el listado de reglas de reparto

**Épica:** [5. Configuración de Horarios (Base + Asignaturas + Restricciones)](#epica-5-configuracion-de-horarios-base--asignaturas--restricciones)

**Estimación:** 3 puntos de historia. Un endpoint (`GET /api/constraints`), una página y un enlace en la cabecera; **sin migraciones**.

**Historia:** Como usuario del colegio, quiero ver en un solo listado todas las reglas de reparto del colegio, con sus avisos, para tener claro qué condiciones se aplicarán antes de generar los horarios.

**Depende de:** US19_b, US19_c y US19_d (los cuatro tipos de regla ya existen) y los listados con filtros en el cliente (US06, US-SUBJECT).

> **Nota (2026-10-29):** la ficha anterior (15 CA) listaba restricciones con estado activo e inactivo, paginaba de 20 en 20, mostraba una barra de «franjas en uso» de todo el colegio frente a 25 fijas e incluía la disponibilidad de los profesores. Las reglas no tienen estado, el balance es por curso (US19) y la disponibilidad es de US-PROF-AVAIL.

> **Nota (2026-10-31):** revisada frente a lo implementado en US19_b, US19_c y US19_d. Cada fila muestra **los avisos de su regla**, no todos los de la asignatura (que repetiría los mismos avisos en cada regla y pondría, por ejemplo, «preferidas prohibidas» en la fila del máximo), y el aviso de celdas fuera del calendario lleva el recuento de su propia cuadrícula (en la carga del curso suma las dos). La página va en **`/reglas`**, como su título y su enlace de la cabecera (la API sigue siendo `/api/constraints`, como la tabla). Se añaden la asignatura inactiva, el curso sin calendario y qué cuenta `slotCount`.

---

#### Decisiones (validadas por la persona usuaria, 2026-10-29)

* **Solo lectura para los dos roles:** las reglas se editan en la carga del curso y en las cuadrículas; el listado enlaza allí. Solo el `ADMIN` las modifica.
* **Una fila por regla** (asignatura + curso + tipo), con sus avisos.
* **Sin estado ni paginación;** filtros y búsqueda en el cliente.

#### Casos de uso y reglas de negocio

* **Acceso:** `GET /api/constraints` para `ADMIN` y `MEMBER`; solo las reglas del colegio.
* **Respuesta:** cada regla con `id`, `type`, `course` (`id`, `name`), `subject` (`id`, `name`, `code`, `color`, `status`), `maxPerDay`, `blockSize`, `slotCount` (según el tipo; los demás, `null`) y sus avisos; ordenadas por curso, asignatura (`compareText`) y tipo (máximo, bloques, prohibidas, preferidas). `slotCount` cuenta las celdas que existen en el calendario actual del curso (las que quedaron fuera van en el aviso; sin calendario es 0).
* **Avisos de cada regla** (los mismos códigos de `WorkloadWarning` y las mismas funciones puras que la carga, `subjectWarnings` y `preferredSlotsWarnings`, repartidos por la regla a la que afectan):
  * **Curso sin calendario:** todas sus reglas llevan `COURSE_WITHOUT_CALENDAR` (no se pueden comprobar) y nada más, salvo `BLOCK_LARGER_THAN_LOAD`, que no depende del calendario.
  * `SUBJECT_DOES_NOT_FIT`: en las reglas obligatorias de la asignatura (máximo, bloques y prohibidas), nunca en las preferidas.
  * `BLOCK_LARGER_THAN_LOAD`: en la regla de bloques.
  * `SLOTS_OUTSIDE_CALENDAR`: en cada regla de franjas, con el recuento de **sus** celdas fuera del calendario.
  * `PREFERRED_SLOTS_FORBIDDEN`: en la regla de preferidas.
* **Página `/reglas` («Reglas de reparto»):** carga única con «Reintentar»; cada regla muestra el curso, la asignatura (color, nombre, código e «Inactiva» si lo está, como en la carga), el tipo con su nombre («Máximo al día», «Bloques», «Franjas prohibidas», «Franjas preferidas»; nunca solo por color), el detalle («Hasta 2 al día», «En bloques de 2», «18 franjas») y sus avisos en rojo con su texto (`SubjectWarnings`). Un enlace por regla lleva a la carga del curso (máximo y bloques) o a su cuadrícula (`/cursos/{curso}/carga/{asignatura}/prohibidas` o `/preferidas`): «Editar» para el `ADMIN` y «Ver» para el `MEMBER`, con un nombre accesible que dice la regla («Editar Franjas prohibidas de Religión en 1º Primaria»). Recuento «{n} reglas» de lo que se ve.
* **Filtros (combinables, en el cliente, en el estado de la página y no en la URL, como en asignaturas):** tipo (los cuatro), curso (los que tienen alguna regla, en orden natural), búsqueda por nombre o código de la asignatura (`matchesCourseSearch`, la comparación de US06) y «Solo con avisos». Sin resultados: «No hay reglas que coincidan» con «Limpiar filtros». Vacío: «Todavía no hay reglas de reparto. Se definen en la carga horaria de cada curso», con un enlace a «Cursos»; sin reglas no se muestran los filtros.
* **Navegación:** la cabecera gana **«Reglas»** (`/reglas`) para los dos roles, tras «Asignaturas».
* **Responsive:** una sola presentación según `useMediaQuery('(min-width: 768px)')`, como en cursos: tabla desde 768 px y tarjetas apiladas por debajo.

#### Contrato de la API (`docs/api-spec.yml`, primero)

* **`GET /api/constraints`** (`listConstraints`, Bearer, `ADMIN` y `MEMBER`): `200` con `{ constraints: SchedulingConstraint[] }` y `no-store`; `401`; `500`; `503`. Sin códigos nuevos.

#### Criterios de Aceptación

* **CA1 (Listado):** Dado «Inglés» en 1º con máximo 2 y «Religión» en 1º con 18 franjas prohibidas, cuando abro «Reglas», entonces veo las dos con su curso, asignatura, tipo y detalle, en ese orden, y «2 reglas».
* **CA2 (Filtros y búsqueda):** el filtro «Franjas prohibidas» deja solo «Religión»; el de curso solo ofrece los cursos con alguna regla; buscar «ingl» deja «Inglés»; «Solo con avisos» deja las que tienen alguno; se combinan, y una combinación sin coincidencias (el tipo «Bloques») dice «No hay reglas que coincidan» con «Limpiar filtros», que los quita.
* **CA3 (Avisos por regla):** si «Matemáticas» no cabe en 1º con máximo y franjas prohibidas, el aviso sale en esas dos filas y no en la de sus preferidas; si 2 de sus preferidas están prohibidas, ese aviso sale solo en la fila de las preferidas; las reglas de un curso sin calendario dicen que no se pueden comprobar.
* **CA4 (Enlaces por rol):** el `ADMIN` ve «Editar» y el `MEMBER` «Ver»; los dos llevan a la carga del curso o a la cuadrícula, que el `MEMBER` ve sin poder editar.
* **CA5 (Vacío):** sin reglas, veo «Todavía no hay reglas de reparto…» con el enlace a «Cursos».
* **CA6 (Aislamiento y sesión):** las reglas de otro colegio nunca se ven; sin sesión, `401`.
* **CA7 (Accesibilidad, responsive e i18n):** el tipo como texto, la tabla con cabeceras, tarjetas a 360 px sin desplazamiento horizontal, sin violaciones de `axe` y los textos en `es.json` y `en.json`.

**Fuera de alcance:** editar o borrar desde el listado, estado activo/inactivo de una regla, paginación en el servidor, la disponibilidad de los profesores (US-PROF-AVAIL) y exportar el listado.

---

#### Requisitos Técnicos, QA y Riesgos

* **Archivos:** contrato (`listConstraints`, `SchedulingConstraint`); `application/constraints/listConstraints.ts` (reparte los avisos con las funciones de `domain/workload/workloadWarnings.ts`), el repositorio (lee de una vez las reglas del colegio con sus celdas y los calendarios de sus cursos, sin una consulta por curso) y `constraintsRouter`; `services/constraintsService.ts`, `pages/ConstraintsPage.tsx`, `App.tsx`, `AppHeader.tsx`, i18n y `cypress/e2e/constraints.cy.ts`; documentación (`README.md`, `CLAUDE.md` de las dos capas y la arquitectura).
* **Testing:** unitarios (orden, avisos por regla, ruta para los dos roles), integración (aislamiento y recuentos), frontend (filtros combinados, «Solo con avisos», enlaces por rol, vacío, error, `axe`) y E2E (listado, filtros, `MEMBER` y 360 px). Cobertura 90 % y 80 %.
* **Definición de hecho:** la de US19 (sin migraciones).
* **Riesgos:** los avisos se calculan con las mismas funciones que la carga (`subjectWarnings` y `preferredSlotsWarnings`) y solo se reparten por regla, para que el listado y la carga no se contradigan; un test compara, en un curso con calendario, la unión de los avisos de las reglas de una asignatura con los de la carga (salvo el recuento de celdas fuera, que la carga suma).

---

## Módulo: Disponibilidad y Reparto de Profesores

### US-PROF-AVAIL: Configurar Disponibilidad Horaria de Profesor

**Épica:** [6. Asignación de Horarios y Disponibilidad de Profesores](#epica-6-asignacion-de-horarios-y-disponibilidad-de-profesores)

**Historia:** Como usuario del colegio, quiero definir qué sesiones (horas) está disponible cada profesor para que el sistema respete sus limitaciones horarias al generar horarios.

---

#### Casos de Uso y Reglas de Negocio

* **Interfaz de configuración:** Grid visual semanal [Lun-Vie À— Sesiones 1-N], cada celda toggle disponible/no disponible
* **Botones conveniencia:** "Marcar Todo Disponible", "Solo Mañana", "Solo Tarde", "Inversión Rápida"
* **Color visual:** Verde (disponible ✓), Gris (no disponible ✓)
* **Display dinámico:** Total franjas disponibles + barra visual (ej: 20/30 = 67%)
* **Validaciones:** Profesor debe existir, días/sesiones válidas, avisar si cambio reduce disponibilidad >50%
* **Cascada:** Avisar si hay asignaciones conflictivas (horarios marcan NEEDS_REVIEW pero no borran)
* **Transacción atómica:** DELETE antiguas + INSERT nuevas simultáneamente
* **Permisos:** cualquier usuario del colegio (`ADMIN` o `MEMBER`) configura la disponibilidad de todos los profesores del colegio; los datos de otro colegio responden `404 NOT_FOUND`. Los usuarios no están vinculados a una ficha de profesor, así que no hay una vista de «mi disponibilidad».

#### Criterios de Aceptación (16 CAs)

* **CA1 (Abrir disponibilidad):** Dado que selecciono profesor, cuando carga, entonces veo grid [Lun-Vie À— Sesiones] con estado actual precargado.

* **CA2 (Marcar celda individual):** Dado que hago clic en celda, cuando presiono, entonces toggle cambia de ✓ a ✓ (o viceversa).

* **CA3 (Marcar todo disponible):** Dado que presiono "Marcar Todo Disponible", entonces todas celdas pasan a ✓.

* **CA4 (Marcar jornada completa):** Dado que presiono "Marcar Jornada Completa Lun-Vie", entonces todos días 100% disponibles.

* **CA5 (Marcar solo mañana):** Dado que presiono "Solo Mañana", entonces sesiones 1-3 ✓, sesiones 4-6 ✓.

* **CA6 (Marcar solo tarde):** Dado que presiono "Solo Tarde", entonces sesiones 1-3 ✓, sesiones 4-6 ✓.

* **CA7 (Inversión rápida):** Dado que presiono "Inversión Rápida", entonces todas celdas se invierten (✓✗

* **CA8 (Marcar día completo):** Dado que hago clic en encabezado día "Miércoles", cuando presiono, entonces todo el día se habilita/deshabilita.

* **CA9 (Marcar sesión completa):** Dado que hago clic en encabezado sesión "Sesión 3", cuando presiono, entonces sesión completa Lun-Vie se habilita/deshabilita.

* **CA10 (Mostrar resumen disponibilidad):** Dado que edito grid, cuando visualizo, entonces veo: "Total franjas disponibles: 24/30 (80%)" + barra visual.

* **CA11 (Guardar disponibilidad):** Dado que cambié disponibilidad, cuando presiono "Guardar", entonces transacción DELETE/INSERT, toast "Disponibilidad actualizada", resumen recalcula (<1s).

* **CA12 (Editar disponibilidad existente):** Dado que profesor ya tiene disponibilidad guardada, cuando cambio y guardo, entonces se actualiza BD y UI.

* **CA13 (Advertencia cambio drástico):** Dado que disponibilidad se reduce >50%, cuando guardo, entonces avisar "✗

* **CA14 (Advertencia asignaciones conflictivas):** Dado que cambio causa conflicto con asignaciones existentes, cuando guardo, entonces avisar pero permitir (marcar horarios NEEDS_REVIEW).

* **CA15 (Acceso de cualquier usuario del colegio):** Dado que soy `MEMBER`, cuando accedo a la disponibilidad de un profesor de mi colegio, entonces veo y edito su grid igual que un `ADMIN`.

* **CA16 (Aislamiento entre colegios):** Dado que soy usuario de un colegio, cuando intento ver o editar vía API la disponibilidad de un profesor de otro colegio, entonces recibo `404 NOT_FOUND` y no se modifica nada.

---

### US-PROF-ASSIGN: Asignar Asignaturas a Profesor

**Épica:** [6. Asignación de Horarios y Disponibilidad de Profesores](#epica-6-asignacion-de-horarios-y-disponibilidad-de-profesores)

**Historia:** Como usuario del colegio, quiero asignar qué asignaturas imparte cada profesor y a qué cursos, para que el sistema respete estas asignaciones al generar horarios.

> **Nota (US09, 2026-10-20):** el contrato ya lleva `subjects: []` en `Professor`, siempre vacío; `docs/api-spec.yml` define esa propiedad como un array de objetos sin propiedades concretas, y `professorsService` del frontend **exige** que esté vacía (`isProfessor` rechaza otra cosa): al llenarlo hay que concretar el esquema, relajar esa comprobación y sustituir el `subjects: []` fijo de `PrismaProfessorRepository.toProfessor` por la lectura de `professor_subjects`, que no existe aún. El alta de un profesor (`POST /api/professors`) hoy no acepta asignaturas y las ignora si llegan; si esta historia las añade al alta, debe hacerlo dentro de la misma transacción que la clase y el profesor.

> **Nota (US10, 2026-10-21):** la columna de asignaturas se añade a `ProfessorsPage` entre «Cargo» y «Tutoría» (y a las tarjetas); hoy `subjects` es siempre `[]` y la página no pinta nada de ellas. Cada fila lleva sus datos ya preparados (`ProfessorRow`) y la paginación sigue siendo en el navegador, así que no hay que tocar `Pagination` ni el contrato del listado.

> **Nota (US11, 2026-10-21):** la búsqueda de profesores (`matchesProfessorSearch`, `utils/professorSearch.ts`) recibe hoy solo `{ firstName, lastName }`. Para buscar por asignatura (CA13 de la ficha original de US11), basta con pasarle también los nombres de las asignaturas del profesor y añadirlos al texto sobre el que se exige cada palabra; el campo, el filtro antes de paginar, la vuelta a la página 1 y los textos («Buscar por nombre o apellidos» pasaría a mencionar las asignaturas) ya están hechos.

> **Nota (US12, 2026-10-21):** las asignaturas se añaden al formulario compartido `ProfessorForm` (`components/ProfessorForm.tsx`), que hoy tiene nombre, apellidos, cargo y clase y sirve a `CreateProfessorPage` y a `EditProfessorPage`: un campo nuevo en `ProfessorFormValues`, su regla en `professorValidation.ts` (y en `professor-fields.json`, compartida con el backend) y `subjectIds` en `UpdateProfessorRequest` y `CreateProfessorRequest`. `PUT /api/professors/{id}` guarda el estado final dentro de la transacción que ya bloquea la fila del profesor, así que el `DELETE` de `professor_subjects` y el `INSERT` de las nuevas caben en ella sin cambiar el orden de bloqueos. `hasProfessorChanges` tendrá que comparar también las asignaturas (como conjunto, sin importar el orden). `changed_fields` del evento `PROFESSOR_UPDATED` ganaría `subjects`.

---

#### Casos de Uso y Reglas de Negocio

* **Modelo:** Profesor ✗
* **Cálculo dinámico:** Total sesiones = cursos seleccionados À— sesiones/semana
* **Ejemplo:** Prof. 2 (E.F.) ✗
* **Múltiples asignaturas:** Un profesor puede enseñar varias (suma se acumula)
* **Validaciones críticas:**
  - ✗
  - ✗
  - ✗
* **Listado:** Tabla con filtros (profesor, asignatura, curso)
* **Indicador color:** 🟢 OK (✗
* **Edición/Borrado:** Permitir cambiar cursos/sesiones, avisar si impacta restricciones
* **Permisos:** cualquier usuario del colegio (`ADMIN` o `MEMBER`) gestiona las asignaciones de todos los profesores del colegio; los datos de otro colegio responden `404 NOT_FOUND`.

#### Criterios de Aceptación (18 CAs)

* **CA1 (Abrir formulario crear):** Dado que presiono "Nueva Asignación", cuando abre, entonces veo formulario con: Profesor, Asignatura, Cursos (checkboxes), Sesiones/Semana, display cálculo dinámico.

* **CA2 (Crear asignación simple):** Dado que completo: Prof=García, Asignatura=Lengua, Cursos=[1º,2º,3º], Sesiones=4, cuando guardo, entonces asignación se crea, toast "Prof. García imparte Lengua a 1º-3º (12 sesiones)", listado actualiza.

* **CA3 (Crear asignación múltiple - mismo profesor):** Dado que Prof. García ya tiene Lengua [1º-3º] (12), cuando creo García, Mate, [1º-2º], 5 sesiones, entonces nueva asignación se crea, García ahora 22/25 franjas (amarillo).

* **CA4 (Validación profesor requerido):** Dado que dejo Profesor vacío, cuando guardo, entonces error "Profesor es obligatorio".

* **CA5 (Validación asignatura requerida):** Dado que dejo Asignatura vacía, cuando guardo, entonces error "Asignatura es obligatoria".

* **CA6 (Validación cursos requeridos):** Dado que no selecciono cursos, cuando guardo, entonces error "Selecciona al menos 1 curso".

* **CA7 (Validación sesiones rango):** Dado que ingreso Sesiones=0 o 6, cuando guardo, entonces error "Sesiones entre 1-5".

* **CA8 (CRÀTICO - No duplicado):** Dado que Prof. García ya imparte Lengua a 1º, cuando intento García, Lengua, 1º, 4 sesiones, entonces error "Prof. García ya imparte Lengua a 1º. No duplicados".

* **CA9 (Advertencia mismatch restricción):** Dado que restricción "Lengua 1º=4" pero asigno 3, cuando guardo, entonces avisar "✗

* **CA10 (Advertencia disponibilidad insuficiente):** Dado que Prof. García tiene 5/25 disponibles, cuando asigno 8 sesiones, entonces avisar "✗

* **CA11 (Mostrar cálculo dinámico):** Dado que selecciono Cursos=[1º,2º,3º] y Sesiones=4, entonces display: "3 cursos À— 4 sesiones = 12 sesiones totales" + "Prof. tiene 19/25 (76%)".

* **CA12 (Ver listado asignaciones):** Dado que accedo a "Asignación de Profesores", cuando carga, entonces tabla: Profesor | Asignatura | Cursos | Sesiones | Total | Disponibilidad | Acciones.

* **CA13 (Filtrar por profesor):** Dado que presiono filtro "Profesor=García", cuando filtra, entonces veo solo asignaciones de García.

* **CA14 (Filtrar por asignatura):** Dado que presiono filtro "Asignatura=Lengua", cuando filtra, entonces veo solo asignaciones de Lengua.

* **CA15 (Editar asignación):** Dado que hago clic en "Editar" en García: Lengua a 1º-3º, cuando abre modal, entonces puedo cambiar Cursos/Sesiones, guardar actualiza BD.

* **CA16 (Borrar asignación):** Dado que presiono "Borrar" en asignación, cuando confirmo, entonces asignación se elimina, avisar si hay horarios para marcar NEEDS_REVIEW.

* **CA17 (Indicador visual sobrecarga):** Dado que Prof. sobrecargado (>100%), cuando visualizo fila, entonces color ROJO, texto "28/25 (112% ✗

* **CA18 (Acceso y aislamiento):** Dado que soy `MEMBER`, cuando accedo a las asignaciones, entonces veo y edito las de los profesores de mi colegio igual que un `ADMIN`; una asignación de otro colegio responde `404 NOT_FOUND`.

---

### US-PROF-SUMMARY: Ver Resumen de Carga de Profesores

**Épica:** [6. Asignación de Horarios y Disponibilidad de Profesores](#epica-6-asignacion-de-horarios-y-disponibilidad-de-profesores)

**Historia:** Como usuario del colegio, quiero ver un resumen de la carga horaria asignada a cada profesor (asignaturas, cursos, sesiones totales, disponibilidad) para identificar desbalances, sobrecarga o asignaciones incompletas antes de generar horarios.

---

#### Casos de Uso y Reglas de Negocio

* **Tabla maestro:** Profesor | Asignaturas | Total Sesiones | Disponibilidad | Estado | Acciones
* **Indicador color:** 🟢 OK (0-75%) | 🟡 Aviso (75-100%) | 🔴 Error (>100%)
* **Expandible:** Click en fila ✗
* **Filtros:** Por estado (🟢/🟡/🔴), por asignatura, búsqueda nombre
* **Alertas:**
  - 🔴 Sobrecarga: profesor > disponibilidad
  - ✗
  - ✗
* **Acciones rápidas:** "Editar disponibilidad" (✗
* **Exportar:** CSV con datos + estadísticas
* **Sincronización:** Auto-refresh cada 30s cuando cambien disponibilidades/asignaciones
* **Permisos:** cualquier usuario del colegio (`ADMIN` o `MEMBER`) ve el resumen de todos los profesores del colegio, y de ninguno de otro colegio.

#### Criterios de Aceptación (14 CAs)

* **CA1 (Abrir resumen maestro):** Dado que accedo "Resumen de Profesores", cuando carga, entonces tabla todos profesores: Nombre | Asignaturas | Total Sesiones | Disponibilidad | Estado | Acciones.

* **CA2 (Filtrar por estado):** Dado que presiono filtro "Estado=ðŸ”´", cuando filtra, entonces veo solo profesores sobrecargados (rojo).

* **CA3 (Filtrar por asignatura):** Dado que presiono filtro "Asignatura=Inglés", cuando filtra, entonces veo solo profesores que enseñan Inglés.

* **CA4 (Búsqueda por nombre):** Dado que escribo "García" en buscador, cuando busca, entonces veo solo profesor García (case-insensitive).

* **CA5 (Indicador OK):** Dado que profesor tiene 15/25 sesiones (60%), cuando visualizo, entonces color 🟢 verde, texto "15/25 (60%) OK".

* **CA6 (Indicador aviso):** Dado que profesor tiene 22/25 sesiones (88%), cuando visualizo, entonces color 🟡 amarillo, texto "22/25 (88%) ✗

* **CA7 (Indicador error sobrecarga):** Dado que profesor tiene 28/25 sesiones (112%), cuando visualizo, entonces color ðŸ”´ rojo, texto "28/25 (112%) ✗

* **CA8 (Expandir fila detalles):** Dado que hago clic en fila profesor, cuando expande, entonces veo: asignaturas detalladas, disponibilidad grid, timeline visual, advertencias.

* **CA9 (Advertencia mismatch restricción):** Dado que asignación ✗

* **CA10 (Advertencia restricción sin asignar):** Dado que restricción sin profesor asignado, cuando visualizo resumen, entonces avisar rojo en general "✗

* **CA11 (Acción rápida: editar disponibilidad):** Dado que hago clic "Editar disponibilidad" en profesor, cuando presiono, entonces navega a US-PROF-AVAIL con profesor preseleccionado.

* **CA12 (Acción rápida: editar asignaciones):** Dado que hago clic "Editar asignaciones" en profesor, cuando presiono, entonces navega a US-PROF-ASSIGN con profesor preseleccionado.

* **CA13 (Exportar CSV):** Dado que presiono "Exportar CSV", cuando descarga, entonces archivo con: Profesor | Asignaturas | Total Sesiones | Disponibilidad | Estado | Advertencias.

* **CA14 (Acceso y aislamiento):** Dado que soy `MEMBER`, cuando accedo al resumen de profesores, entonces veo el de todos los profesores de mi colegio, igual que un `ADMIN`, y ninguno de otro colegio.

---

### US-ALGO-RUN: Generar Horarios Automáticamente (Motor)

**Épica:** [7. Generación Automática de Horarios](#epica-7-generacion-automatica-de-horarios) — **FASE 2 POST-MVP**

> **Nota (US13, 2026-10-21):** el borrado de un profesor es real (no hay `deleted_at`). Cuando existan los horarios, los huecos de un profesor borrado quedan sin profesor (`schedule_entries.profesorId` a `NULL`, como dice el modelo de datos) y el diálogo de borrado tendrá que contar las entradas de horario que se pierden. El motor debe tratar un hueco sin profesor como no asignado, no como un error.

### 1. Definición

**Historia:** Como administrador del colegio, quiero disparar la generación automática de horarios seleccionando un algoritmo (CSP o Backtracking), para obtener un cuadrante horario semanal completo que respete todas las restricciones pedagógicas, laborales y de disponibilidad configuradas (Hard Constraints HC1-HC6 y Soft Constraints SC1-SC3).

---

### 2. Criterios de Aceptación (Gherkin)

* **CA1 (Abrir modal selector de algoritmo):** Dado que accedo a "Generar Horarios" desde el menú de Configuración, cuando hago clic en el botón "Generar Nuevo Horario", entonces se abre un modal con dos opciones: "(✓) CSP (Constraint Satisfaction Problem) — Recomendado (rápido, 1-15s típicamente)" y "( ) Backtracking (exhaustivo, hasta 120s)". CSP está preseleccionado por defecto.

* **CA2 (Seleccionar algoritmo y disparar generación):** Dado que el modal está abierto con CSP preseleccionado, cuando hago clic en "Generar", entonces el sistema valida que todas las dependencias están completadas (US-BASE, US-SUBJECT, US19, US-PROF-AVAIL, US-PROF-ASSIGN con restricciones consistentes), dispara un job de generación en background vía BullMQ (no bloquea UI), y muestra spinner de progreso con "Generando horarios... (0%)" y botón "Cancelar".

* **CA3 (Polling de progreso durante ejecución):** Dado que la generación está en progreso, cuando cada 2 segundos el frontend hace polling a GET /api/schedule/generate/:jobId, entonces recibe respuesta con estado (RUNNING, COMPLETED, FAILED) y porcentaje de progreso (0-100%), y muestra "Generando horarios... (45%)" actualizado en tiempo real. Timeout máximo CSP: 60 segundos; Timeout máximo Backtracking: 120 segundos. Si excede, error "Generación tardó más del máximo permitido (60s/120s según algoritmo). Intenta con menos restricciones o elige Backtracking."

* **CA4 (Hard Constraints HC1-HC6 aplicados):** Dado que la generación completa exitosamente, cuando se valida el horario generado, entonces cumple:
  - HC1 (Carga exacta): Cada asignatura en cada grupo tiene EXACTAMENTE N sesiones/semana (según `subject_courses.sessions_per_week`: la ficha de la asignatura o la carga del curso, US19).
  - HC2 (Ubicación simultánea): Cada profesor NO aparece en 2 aulas diferentes en la misma sesión (UNIQUE KEY profesorId, dayOfWeek, sessionNumber).
  - HC3 (No duplicidad diaria): Un grupo NO tiene 2+ sesiones de la misma asignatura en un mismo día.
  - HC4 (Disponibilidad profesor): Cada sesión asignada ocurre SOLO en franjas horarias donde el profesor está marcado disponible (US-PROF-AVAIL).
  - HC5 (Aula disponible): Ningún aula está doble-reservada (aula=classroom_id en schedule_entries, UNIQUE por sesión/día).
  - HC6 (Profesor enseña asignatura): Cada profesor-asignatura en el horario fue explícitamente asignada en US-PROF-ASSIGN.

* **CA5 (Soft Constraints SC1-SC3 optimizadas):** Dado que la generación termina, cuando se examina el horario, entonces demuestra esfuerzo en optimizar (sin garantía):
  - SC1 (Concentración): Minimizar brechas horarias en calendario de profesor (p.ej., no huecos aislados de 1 sesión).
  - SC2 (Aulas especializadas): Preferencia a aulas propias para EF/Ciencias (si están disponibles).
  - SC3 (Distribución uniforme): Carga horaria distribuida uniformemente a lo largo de la semana (ej., no todas asignaturas en 1º hora de cada día).

* **CA6 (Especialista libera tutor):** Dado que un especialista (Prof. Smith, Inglés) entra a una clase (1º A) en una sesión (lunes 09:00-09:45), cuando se genera el horario, entonces el tutor de la clase (Prof. García) se marca con rol "Refuerzo"/"Coordinación"/"Sesión Libre" en esa sesión (field role=REFUERZO en schedule_entries), NO aparece como docente principal, y la entrada del horario refleja "Lunes 09:00 | Prof. Smith (Inglés) | Especialista".

* **CA7 (Error INFEASIBLE: restricciones imposibles):** Dado que la carga de un curso supera las sesiones de su calendario (sesiones al día × 5), cuando se dispara generación, entonces algoritmo falla rápidamente (<2s) con error INFEASIBLE: "No es posible generar horarios. La carga de 1º Primaria (31 sesiones) excede las sesiones de su calendario (30). Revisa su carga horaria." Usuario puede volver a la carga del curso (US19) para ajustar.

* **CA8 (Error TIMEOUT):** Dado que se dispara generación con Backtracking en un problema complejo (30+ grupos, 20+ profesores, restricciones cruzadas), cuando tiempo de ejecución supera 120 segundos, entonces algoritmo se cancela automáticamente con error TIMEOUT: "Generación tardó más de 120 segundos (máximo Backtracking). Intenta con CSP, o simplifica restricciones en US19." Usuario puede regenerar.

* **CA9 (Error INTERNAL y logging):** Dado que ocurre un error no previsto durante generación (ej., fallos en BD, crash de servicio), cuando error ocurre, entonces backend guarda error_log en tabla schedule_generation_jobs con detalles (stack trace, timestamps) para debugging, y muestra usuario error genérico INTERNAL: "Error interno durante generación. Por favor intenta de nuevo o contacta soporte. (ID: {jobId})". Log incluye jobId, userId, algorithmSelected, timestamp, stack trace.

* **CA10 (Concurrencia: solo un job activo por colegio):** Dado que hay un job de generación en progreso para el colegio, cuando otro usuario intenta dispara otro job de generación simultáneamente, entonces sistema rechaza con error: "Ya hay una generación en progreso. Espera a que termine o cancela la actual." (verificar estado de job_status=RUNNING en tabla schedule_generation_jobs por schoolId).

* **CA11 (Solo administradores):** Dado que soy `MEMBER`, cuando entro en la sección de horarios, entonces no veo la opción de generar y, si intento disparar la generación vía API, recibo `403 FORBIDDEN` y no se crea ningún job.

---

### 3. Datos Técnicos a Tener en Cuenta

* **API Endpoints:**
  - `POST /api/schedule/generate` — dispara generación. Body: `{ algorithmType: "CSP" | "BACKTRACK" }`. Response: `{ jobId, status: "QUEUED", createdAt }`.
  - `GET /api/schedule/generate/:jobId` — polling de progreso. Response: `{ jobId, status: "RUNNING" | "COMPLETED" | "FAILED", progress: 0-100, errorCode?: "INFEASIBLE" | "TIMEOUT" | "INTERNAL", errorMessage?: string, scheduleId?: uuid (si COMPLETED) }`.
  - `DELETE /api/schedule/generate/:jobId` — cancelar job. Response: `{ success: true }`.
  - `GET /api/schedule/:scheduleId` — obtener datos del horario generado (usado luego por US-ALGO-VIEW).

* **Tablas BD:**
  - `schedules` (nueva): id, schoolId, status (DRAFT|OFFICIAL), algorithmUsed (CSP|BACKTRACK), generatedAt, officializedAt, createdBy, deletedAt.
  - `schedule_entries` (nueva): id, scheduleId, dayOfWeek (0-4), sessionNumber (1-8), courseId, subjectId, professorId, classroomId (aula), role (TEACHER|REFUERZO), notes. Índice UNIQUE: (profesorId, dayOfWeek, sessionNumber) para HC2.
  - `schedule_generation_jobs` (nueva): id, jobId, schoolId, userId, algorithmType, status (QUEUED|RUNNING|COMPLETED|FAILED), progress (0-100), errorCode, errorMessage, errorLog (blob), startedAt, completedAt, createdAt.

* **Backend Services:**
  - `ScheduleController::generate(POST)` — valida dependencias, enqueue job a BullMQ.
  - `ScheduleGenerationJob (worker BullMQ)` — ejecuta algoritmo, guarda resultados en BD, notifica completion.
  - `ScheduleGenerator (service)` — interfaz común. Subclases:
    - `ScheduleGeneratorCSP` — OR-Tools constraint solver. Max 60s timeout.
    - `ScheduleGeneratorBacktrack` — recursivo con memoización. Max 120s timeout.
  - Validadores: `validateHC1ToHC6()`, `optimizeSoftConstraints()`, `detectSpecialistRule()`.

* **Algoritmo Principal:**
  - **CSP (default)**: OR-Tools de Google. Modela como ConstraintProgram: variables = (profesor, asignatura, día, sesión) ∈ domini válido. Constraints = HC1-HC6. Objective = minimizar brechas (SC1) y maximizar aulas especializadas (SC2).
  - **Backtracking (fallback)**: Árbol de búsqueda con poda. Variables asignadas secuencialmente (profesor, asignatura, slot). Forward-checking para detectar dead-ends temprano. Memoización de configuraciones ya exploradas.

* **Concurrencia y Transacciones:**
  - Job queue (BullMQ/Redis) gestiona una sola ejecución activa por schoolId.
  - Si job falla, BD queda consistente (transacción ROLLBACK automático en BD al insertar schedule_entries).
  - Control de acceso: solo los usuarios `ADMIN` pueden disparar la generación; un `MEMBER` recibe `403 FORBIDDEN` (PRD §3.1).

---

### 4. Dependencias de Otras Historias de Usuario

* **Depende de (bloqueantes):**
  - `US-BASE`: Calendario base debe estar configurado (define sesiones, recreos, franjas totales que limitan HC1).
  - `US-SUBJECT`: Asignaturas deben existir (HC6 valida que profesor enseña asignatura).
  - `US19`: la carga de cada curso (`subject_courses`, alimenta HC1) y, si las hay, las reglas de reparto de US19_b–US19_d.
  - `US-PROF-AVAIL`: Disponibilidad de profesores debe estar configurada (alimenta HC4).
  - `US-PROF-ASSIGN`: Asignaciones profesor-asignatura-cursos deben estar definidas (alimenta HC6 y especialista libera tutor).
  - `US-PROF-SUMMARY`: Idealmente completado para detectar conflictos previos (detección temprana, no bloqueante pero recomendado).
  
* **Produce datos para:**
  - `US-ALGO-CONFIRM`: El horario generado (estado DRAFT) pasa a confirmación.
  - `US-ALGO-VIEW`: El horario generado se visualiza y exporta.

* **Relación con otras US en Épica 7:**
  - `US-ALGO-RUN` → `US-ALGO-CONFIRM` (secuencial).
  - `US-ALGO-RUN` → `US-ALGO-VIEW` (el view necesita un horario generado).

---

### US-ALGO-CONFIRM: Oficializar un Horario Generado

**Épica:** [7. Generación Automática de Horarios](#epica-7-generacion-automatica-de-horarios) — **FASE 2 POST-MVP**

### 1. Definición

**Historia:** Como administrador del colegio, quiero confirmar y guardar un horario generado como versión oficial/activa del colegio, para que pase a ser el horario vinculante, o descartarlo y regenerar si no es satisfactorio.

---

### 2. Criterios de Aceptación (Gherkin)

* **CA1 (Ver horario generado en estado borrador):** Dado que un horario fue generado por US-ALGO-RUN y está en estado DRAFT, cuando accedo a "Mis Horarios Generados", entonces veo tabla con: Horario | Algoritmo | Generado | Estado (DRAFT) | Acciones (Ver, Confirmar, Descartar, Regenerar).

* **CA2 (Confirmar y guardar como oficial):** Dado que veo un horario en estado DRAFT, cuando hago clic en "Confirmar como Oficial", entonces se abre diálogo de confirmación: "¿Marcar este horario como oficial? Esto reemplazará el horario anterior (si existe) y pasará a ser el horario activo del colegio." Al confirmar, status pasa a OFFICIAL, fecha officializedAt se registra, se muestra toast "Horario oficializado exitosamente" y tabla muestra Estado=OFFICIAL. Solo UN horario puede estar OFFICIAL a la vez.

* **CA3 (Descartar horario borrador):** Dado que veo un horario en estado DRAFT, cuando hago clic en "Descartar", entonces diálogo: "¿Descartar este horario? No se puede recuperar." Al confirmar, horario se marca deleted=true (soft delete), se remueve de listado, toast "Horario descartado."

* **CA4 (Regenerar a partir de borrador):** Dado que veo un horario DRAFT que no me gusta, cuando hago clic en "Regenerar", entonces se dispara de nuevo US-ALGO-RUN (abre modal selector de algoritmo), y nuevo horario generado se crea con status=DRAFT aparte (no sobrescribe el anterior hasta confirmar).

* **CA5 (Historial de horarios oficiales):** Dado que confirmo múltiples horarios como OFFICIAL en días distintos, cuando accedo a "Historial de Horarios Oficiales", entonces veo tabla con: Oficializado | Algoritmo | Generado | Generado Por (usuario) | Acciones (Ver detalles, Revertir). Permite auditoría y opcionalmente revertir a un horario oficial anterior (soft-revert: crea nuevo DRAFT basado en horario histórico).

* **CA6 (Solo administradores):** Dado que soy `MEMBER`, cuando veo un horario en estado DRAFT, entonces no veo las opciones de oficializar, descartar ni revertir y, si las intento vía API, recibo `403 FORBIDDEN` y el horario no cambia.

---

### 3. Datos Técnicos a Tener en Cuenta

* **API Endpoints:**
  - `PATCH /api/schedule/:scheduleId/confirm` — confirmar como oficial. Body: `{}`. Response: `{ scheduleId, status: "OFFICIAL", officializedAt }`.
  - `DELETE /api/schedule/:scheduleId` — descartar (soft delete, deletedAt=now). Response: `{ success: true }`.
  - `GET /api/schedule?status=DRAFT|OFFICIAL` — listar por estado.

* **Tablas BD:**
  - `schedules`: extender con campo `officializedAt` (timestamp nullable, NULL si DRAFT).
  - Verificar UNIQUE: un colegio solo puede tener UN schedule con status=OFFICIAL Y deletedAt=NULL.

* **Backend Services:**
  - `ScheduleController::confirm(PATCH)` — validar que el usuario es `ADMIN` (`403 FORBIDDEN` si no), actualizar status a OFFICIAL, registrar officializedAt.
  - Revertir a histórico: crear nuevo schedule con status=DRAFT copiando datos de horario histórico. No destruir el anterior.

* **Concurrencia:**
  - Si dos usuarios intentan confirmar simultáneamente (race condition), el primero gana (UNIQUE constraint en BD + transacción).
  - Segundo intento recibe error: "Otro usuario ya oficializó un horario. Recarga para ver el estado actual."

---

### 4. Dependencias de Otras Historias de Usuario

* **Depende de:**
  - `US-ALGO-RUN`: Requiere un horario generado (status=DRAFT).

* **Produce datos para:**
  - `US-ALGO-VIEW`: El horario oficial se visualiza como versión activa, diferenciado de borradores.

* **Relación con otras US en Épica 7:**
  - `US-ALGO-RUN` (precede) → `US-ALGO-CONFIRM` (flujo secuencial).
  - `US-ALGO-VIEW` (refleja estado OFFICIAL vs DRAFT).

---

### US-ALGO-VIEW: Visualizar y Exportar Horarios

**Épica:** [7. Generación Automática de Horarios](#epica-7-generacion-automatica-de-horarios) — **FASE 2 POST-MVP**

### 1. Definición

**Historia:** Como usuario del colegio, quiero visualizar el horario generado (oficial o borrador) en formato tabla clara (Lunes-Viernes × Sesiones) y ver el horario individual de cada profesor para auditar solapamientos; y, como administrador, exportar horarios en formatos Markdown (por grupo) y PDF (individual o agregado del colegio completo) para distribuir o archivar.

> **Nota (US06, 2026-10-19):** el listado de `/cursos` no tiene «Ver horario»: esta historia añade el acceso al horario de cada clase desde el listado (la ficha original de US06 lo preveía como un botón deshabilitado, descartado: no se muestran botones de funcionalidades que no existen).

---

### 2. Criterios de Aceptación (Gherkin)

* **CA1 (Ver horario por grupo en tabla):** Dado que accedo a "Ver Horario" para un horario generado, cuando carga, entonces veo tabla Lunes-Viernes (columnas) × Sesiones 1-8 (filas según US-BASE). Cada celda muestra: [Asignatura | Profesor | Tipo]. Colores por asignatura (ej., Inglés=azul, Matemáticas=rojo, etc.), recreo en gris, sessions sin contenido vacías. Encabezado indica "Grupo: 1º A | Calendario Base: 8 sesiones | Horario (DRAFT | OFICIAL)".

* **CA2 (Vista individual por profesor - auditoría de solapamientos):** Dado que hago clic en "Ver por Profesor", entonces se abre interfaz alternativa con dropdown "Selecciona profesor". Al elegir Prof. García, veo su tabla Lun-Vie × Sesiones con TODAS las asignaturas/grupos donde aparece, destacando cualquier celda duplicada (error rojo border): "¡Solapamiento detectado! Prof. García asignado a 1º A Y 1º B lunes 09:00-09:45". Sistema valida que no haya solapamientos (HC2).

* **CA3 (Exportar a Markdown por grupo):** Dado que veo horario de 1º A, cuando hago clic en "Exportar a Markdown", entonces descarga archivo `1A_horario.md` con tabla Markdown:
  ```
  # Horario 1º A
  | Lunes | Martes | Miércoles | Jueves | Viernes |
  |-------|--------|-----------|--------|---------|
  | **Sesión 1 (09:00-09:45)** | Matemáticas (Prof. García) | Inglés (Prof. Smith) | ... |
  ```
  Formato copiable directamente a Word sin perder estructura. Incluye encabezado con curso, generado el, generado con (algoritmo).

* **CA4 (Exportar a PDF individual por grupo):** Dado que veo horario de 1º A, cuando hago clic en "Exportar a PDF", entonces descarga `1A_horario.pdf` con tabla formateada profesionalmente (página A4 horizontal, fuente 11pt, bordes claros, colores preservados, encabezado/pie con fecha y "CalendarSchool"). Incluye página separada con "Leyenda" explicando colores de asignaturas.

* **CA5 (Exportar paquete completo - todos los grupos del colegio):** Dado que accedo a "Exportar Horarios Completos", cuando hago clic en "Descargar Paquete Markdown" o "Descargar Paquete PDF", entonces:
  - **Markdown**: Descarga archivo `horarios_completos_YYYY_MM_DD.md` con una tabla por cada grupo (1º A, 1º B, 2º A, ...). Cada tabla tiene encabezado "## Grupo: X", tabla Markdown, línea en blanco separadora.
  - **PDF**: Descarga archivo `horarios_completos_YYYY_MM_DD.pdf` con portada (escuela, fecha, algoritmo, estado OFICIAL/DRAFT), tabla de contenidos con lista de grupos, página per grupo con tabla formateada, leyenda de colores al final.

* **CA6 (Diferenciar DRAFT vs OFICIAL en UI):** Dado que veo un horario en estado DRAFT, entonces encabezado muestra badge amarillo "DRAFT — No oficial aún". Si es OFFICIAL, badge verde "OFICIAL — Versión activa". Exportaciones incluyen esta nota en encabezado/pie. Usuario puede distinguir fácilmente.

* **CA7 (Validar datos antes de exportar):** Dado que intento exportar un horario con datos incompletos (ej., una celda sin profesor asignado), cuando hago clic en "Exportar", entonces sistema verifica HC1-HC6 antes de permitir y muestra advertencia "Horario tiene inconsistencias (profesor faltante en X celdas). ¿Deseas continuar?" con opción "Continuar" o "Revisar". Si continúa, exportación marca celdas problemáticas con asterisco "*" y nota al pie "* Problema detectado".

* **CA8 (Ver sí, exportar solo administradores):** Dado que soy `MEMBER`, cuando abro un horario, entonces lo veo igual que un `ADMIN`, pero no veo las opciones de exportar y, si llamo a una ruta de exportación vía API, recibo `403 FORBIDDEN`.

---

### 3. Datos Técnicos a Tener en Cuenta

* **API Endpoints:**
  - `GET /api/schedule/:scheduleId/view` — obtener datos horario para visualización. Response: `{ scheduleId, status, courseGroups: [{ courseId, groupId, groupName, entries: [...] }], scheduleMetadata: { generatedAt, algorithm, generatedBy } }`.
  - `GET /api/schedule/:scheduleId/export/markdown?groupId=x` — descargar Markdown de un grupo. Response: file (text/markdown).
  - `GET /api/schedule/:scheduleId/export/pdf?groupId=x` — descargar PDF de un grupo. Response: file (application/pdf).
  - `GET /api/schedule/:scheduleId/export/markdown-all` — descargar Markdown de todos los grupos. Response: file (text/markdown).
  - `GET /api/schedule/:scheduleId/export/pdf-all` — descargar PDF de todos los grupos. Response: file (application/pdf).
  - Las rutas de visualización admiten `ADMIN` y `MEMBER`; las de exportación, solo `ADMIN` (`403 FORBIDDEN` para un `MEMBER`).

* **Tablas BD:**
  - `schedules`: datos ya existentes (scheduleId, status, algorithmUsed, generatedAt, officializedAt).
  - `schedule_entries`: (scheduleId, dayOfWeek, sessionNumber, courseId, professorId, subjectId, classroomId, role, notes).
  - `subjects`: para color mapping (subjectId → color_hex, nombre).
  - `courses` y `classes`: para nombres de grupos.

* **Frontend Components:**
  - `ScheduleTableGrid` — renderizar tabla Lun-Vie × Sesiones con celdas (asignatura + profesor, coloreadas).
  - `ProfessorScheduleView` — filtro por profesor, tabla separada mostrando todas sus asignaciones, highlighting de solapamientos.
  - `ExportOptions` — botones y modales para seleccionar formato (Markdown/PDF) y alcance (grupo/todos).
  - `MarkdownGenerator` — servicio para generar tabla Markdown válida.
  - `PDFGenerator` (usando librería como jsPDF o wkhtmltopdf) — generar PDF formateado.

* **Color Mapping:**
  - Base datos `subjects` incluye `color_hex` (ej., Inglés="#0066cc", Matemáticas="#cc0000"). Frontend accede para colorear celdas.

* **Validación Previa a Exportación:**
  - Verificar HC1-HC6 en memoria (no en BD cada vez).
  - Si hay inconsistencias, marcar en exportación y mostrar advertencia usuario.

---

### 4. Dependencias de Otras Historias de Usuario

* **Depende de:**
  - `US-ALGO-RUN`: Requiere un horario generado (status=DRAFT o OFFICIAL).
  - `US-ALGO-CONFIRM`: Distingue si horario es DRAFT o OFFICIAL (reflejado en UI).
  - `US-BASE`: Para obtener estructura de sesiones (1-8, nombre, horas).
  - `US-SUBJECT`: Para nombres y colores de asignaturas.

* **Produce datos para:**
  - Usuarios finales (descargables, no produce nuevas US).

* **Relación con otras US en Épica 7:**
  - Consume salida de `US-ALGO-RUN` (horarios generados).
  - Refleja estado distinguido en `US-ALGO-CONFIRM` (DRAFT vs OFFICIAL).

---

## Resumen de Historias por Módulo

| Módulo | Historias | CAs | Status |
|--------|-----------|-----|--------|
| **Infraestructura Técnica** | US00, US00_b | 16 | ✓ US00 y US00_b implementadas y desplegadas |
| **Autenticación y Sesión** | US01 (US01_a-US01_f), US02, US02_b, US02_c, US03, US04 | 56+ | ✓ Completadas (US01 con pendientes antes de publicar en sus partes) |
| **Gestión de Cursos** | US05-08 | 25+ | ✓ Completadas |
| **Gestión de Profesores** | US09-13 | 22+ | ✓ Completadas |
| **Gestión de Alumnos** | US14-18 | 50+ | ✓ Completadas |
| **Configuración de Horarios** | US-BASE (US-BASE_b, US-BASE_c), US-SUBJECT (US-SUBJECT_b, US-SUBJECT_c), US19 (US19_b, US19_c, US19_d), US20 | 73+ | US-BASE, US-BASE_b y US-BASE_c implementadas; US-SUBJECT (crear y ver), US-SUBJECT_b (editar e inactivar) y US-SUBJECT_c (borrar) implementadas; US19 (carga horaria por curso), US19_b (reglas de máximo al día y bloques) US19_c (franjas prohibidas) y US19_d (franjas preferidas) implementadas; US20 (listado de reglas de reparto) implementada |
| **Disponibilidad de Profesores** | US-PROF-AVAIL, US-PROF-ASSIGN, US-PROF-SUMMARY | 48+ | Especificadas, sin implementar |
| **Generación de Horarios (Fase 2)** | US-ALGO-RUN, US-ALGO-CONFIRM, US-ALGO-VIEW | 25+ | Especificadas (3 US), sin implementar |

**Total Criterios de Aceptación (MVP):** 281+ CAs  
**Total Criterios de Aceptación (Fase 2 Post-MVP):** 25+ CAs

---

## Arquitectura: Horarios + Profesores

El sistema de generación de horarios se compone de **9 historias vinculadas en 3 bloques:**

### Bloque 1: Configuración Base de Horarios
1. **US-BASE (Calendario Base):** Define estructura temporal (sesiones, recreos, horas)
2. **US-SUBJECT (Asignaturas):** Gestiona materias educativas (CORE, ELECTIVE, CUSTOM)
3. **US19 (Carga y reglas de reparto):** Carga por curso (sesiones de cada asignatura frente a su calendario) y, en US19_b–US19_d, reglas de reparto: máximo al día, bloques, franjas prohibidas y franjas preferidas
4. **US20 (Reglas de reparto):** Listado de las reglas del colegio con filtros y avisos

### Bloque 2: Disponibilidad y Reparto de Profesores
5. **US-PROF-AVAIL (Disponibilidad):** Define qué sesiones/días trabaja cada profesor
6. **US-PROF-ASSIGN (Asignaciones):** Asigna asignaturas a profesor (qué enseña, a qué cursos)
7. **US-PROF-SUMMARY (Resumen):** Visualiza carga de todos profesores, detecta sobrecarga/conflictos

### Bloque 3: Generación Automática (Fase 2 Post-MVP)
8. **US-ALGO-RUN (Motor):** Dispara generación con CSP/Backtracking, aplica Hard Constraints HC1-HC6 y Soft Constraints SC1-SC3, maneja errores (INFEASIBLE/TIMEOUT)
9. **US-ALGO-CONFIRM (Oficialización):** Marca horario generado (DRAFT) como OFFICIAL/activo, o descarta para regenerar
10. **US-ALGO-VIEW (Visualización y Export):** Visualiza horario (tabla por grupo, vista por profesor), exporta Markdown y PDF (individual o agregado colegio completo)

**Flujo:** US-BASE ✗

---

## Restricción crítica: SINGLE_LOCATION

La constrainta **SINGLE_LOCATION (Tipo 4)** es crítica para la integridad del horario:
- **Regla:** Un profesor NO puede estar en dos sitios a la vez en la misma sesión
- **Validación:** UNIQUE KEY (profesorId, dayOfWeek, sessionNumber) a nivel BD
- **Cascada:** Cuando especialista entra en aula, tutor se marca como "Refuerzo"/"Coordinación"/"Sesión Libre"
- **Ubicación:** US-ALGO-RUN (HC2). Es una regla fija del motor, no un tipo de regla que se configure (eran los antiguos CA13.5 y CA13.6 de US19)

---

## Notas de Implementación

- **Dependencias técnicas:** US01-04 (Autenticación) deben completarse antes de cualquier otra funcionalidad, ya que protegen todas las rutas.
- **Orden de implementación recomendado:** 
  * **Fase 0:** Autenticación
  * **Fase 1:** US-BASE + US-SUBJECT (1.5-2 semanas)
  * **Fase 2:** US19 (US19_b–US19_d) + US20 (2 semanas)
  * **Fase 3:** US-PROF-AVAIL + US-PROF-ASSIGN + US-PROF-SUMMARY (2-3 semanas)
  * **Fase 4:** US-ALGO (3-4 semanas)
- **Validaciones:** Todas las historias asumen validación de entrada tanto en frontend (UX) como en backend (seguridad).
- **Responsive:** Todas las interfaces deben ser usables en navegadores de escritorio, tablet y móvil (Tailwind v4 + shadcn/ui facilita esto).
- **Transacciones atómicas:** Todas las operaciones de escritura (crear, editar, borrar) deben ser transaccionales con ROLLBACK automático en caso de error.
- **Permisos:** Todas las rutas API exigen sesión iniciada y solo dan acceso a los datos del colegio del usuario (`404 NOT_FOUND` para datos de otro colegio). Las acciones reservadas al rol `ADMIN` (gestión de usuarios, calendario base, asignaturas, carga horaria y reglas de reparto, y generación, oficialización y exportación de horarios; PRD §3.1) responden `403 FORBIDDEN` a un `MEMBER`.

---

## Antes de ejecutar la Fase 2 (US-ALGO-RUN, US-ALGO-CONFIRM, US-ALGO-VIEW), validar que se ha completado:

**Fase 1 (Configuración Base):**
- [ ] Calendario base configurado (# sesiones, recreos confirmados)
- [ ] Asignaturas creadas (CORE, ELECTIVE, CUSTOM según necesidad)

**Fase 2 (Restricciones):**
- [ ] Carga de cada curso definida (US19) y que cabe en las sesiones de su calendario (sin avisos)
- [ ] Reglas de reparto revisadas en su listado (US20), sin avisos pendientes

**Fase 3 (Profesores):**
- [ ] Disponibilidad horaria de todos profesores configurada
- [ ] Asignaturas asignadas a todos profesores (no hay restricciones sin asignar)
- [ ] No hay profesores sobrecargados (>100% disponibilidad)
- [ ] Mismatches restricción resueltos (o deliberados y documentados)
- [ ] Resumen de carga verificado (alertas rojas resueltas)

**Condiciones previas de US-ALGO-RUN, US-ALGO-CONFIRM, US-ALGO-VIEW:**
- ✓ US-BASE completado (calendario define sesiones)
- ✓ US-SUBJECT completado (asignaturas disponibles)
- ✓ US19 completado (carga por curso; US19_b–US19_d, reglas de reparto)
- ✓ US20 completado (reglas de reparto visualizables)
- ✓ US-PROF-AVAIL completado (profesores con disponibilidad)
- ✓ US-PROF-ASSIGN completado (profesores con asignaciones)
- ✓ US-PROF-SUMMARY completado (carga validada sin conflictos críticos)

**Orden de ejecución en Fase 2 (secuencial):**
1. **US-ALGO-RUN**: Implementar motor de generación (CSP con OR-Tools + Backtracking fallback). Disparar job, aplicar HC1-HC6, manejo de errores.
2. **US-ALGO-CONFIRM**: Implementar confirmación/oficialización. Marcar horario DRAFT como OFFICIAL.
3. **US-ALGO-VIEW**: Implementar visualización y exportación. Ver en tablas, exportar Markdown/PDF (individual + agregado).

---

## Documentos de Referencia

### Master
* `docs/User_Stories_MVP.md` 

### Configuración de Horarios
* `docs/ESPECIFICACION_FINAL_SISTEMA_HORARIOS.md`
* `docs/RESEARCH_ALGORITMOS_GENERACION_HORARIOS.md`

### Disponibilidad y Reparto de Profesores
* `docs/arquitectura/ARQUITECTURA_PROFESORES_DISPONIBILIDAD.md`


