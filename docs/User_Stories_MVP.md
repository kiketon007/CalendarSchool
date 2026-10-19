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

**Historia:** Como usuario del colegio, quiero editar los detalles de un curso existente (nombre, clases, tutores, alumnos), para mantener la estructura actualizada si hay cambios.

> **Nota (US06, 2026-10-19):** el listado de `/cursos` (tabla en escritorio y tarjetas en móvil) no tiene todavía acciones: esta historia añade el botón «Editar» de cada curso y, al asignar tutores, decide cómo se muestran sus nombres en la columna «Tutores» (hoy, «Sin tutor»).

> **Nota (US05, 2026-10-19):** el tutor pasó a ser opcional (PRD §3.4). Esta historia asume la asignación y el cambio de tutor de una clase, con la regla «un profesor tutoriza una sola clase» (validada también en la base de datos) y el desplegable filtrable de profesores `ACTIVE`.

---

#### Casos de uso y reglas de negocio

* **Acceso a edición:**
  * Cualquier usuario del colegio (`ADMIN` o `MEMBER`) puede editar sus cursos.
  * Botón "Editar" está en el listado de cursos (US06).
  * Se abre modal o página de edición con formulario pre-poblado.

* **Campos editables:**
  * Nombre del curso (ej. "1º Primaria" ✗
  * Nombres de clases (ej. "A" ✗
  * Tutores de clases (ej. "Juan López" ✗
  * Agregar nuevas clases (ej. "A, B" ✗
  * Eliminar clases existentes (ej. "A, B, C" ✗
  * Agregar alumnos a clases (mover de clase o asignar sin clase previa)
  * Eliminar alumnos de clases (alumnos quedan sin clase asignada)
  * NO se pueden: eliminar curso (usar US08)

* **Validación de nombre del curso:**
  * Nombre debe ser único en el sistema (no puede duplicar existente).
  * Caracteres permitidos: alfanuméricos (A-Z, a-z, 0-9) + especiales (º, Âª, -, /, espacio).
  * Límite: 100 caracteres máximo.
  * Si usuario intenta cambiar a nombre que ya existe, mostrar error claro.

* **Validación de clases:**
  * Nombre de clase debe ser único DENTRO del mismo curso (no puede haber dos "A").
  * Caracteres permitidos: alfanuméricos + (º, Âª).
  * Límite: 10 caracteres máximo.
  * Se pueden editar nombres de clases existentes, agregar nuevas, o eliminar.

* **Gestión de tutores:**
  * Tutor puede estar asignado o no a una clase (puede quedar vacío).
  * Si tutor está asignado, debe existir en BD como profesor del colegio y estar en estado ACTIVE.
  * Un tutor solo puede tutorizar UNA clase en TODO el sistema (restricción US05).
  * Si intenta asignar tutor que ya tutoriza otra clase, mostrar error.
  * Se puede quitar tutor de una clase (dejar clase sin tutor con ✗
  * Dropdown filtrable con profesores disponibles (solo ACTIVE, solo no asignados a otra clase).
  * Opción "Sin tutor" en dropdown (permitir clase sin tutor asignado).

* **Operaciones de clases:**
  * Editar nombre de clase existente: Sí, con validación de uniqueness.
  * Agregar tutor a clase: Sí, con validación de restricción (no puede tutorizar otra clase).
  * Cambiar tutor de clase: Sí, validación de restricción.
  * Quitar tutor de clase: Sí, clase puede quedar sin tutor asignado (✗
  * Eliminar clase: Sí, los alumnos que estén en esa clase quedan sin clase asignada (NO se eliminan alumnos).
  * Agregar nuevas clases: Sí, crear nueva clase dentro del curso.
  * Asignar/eliminar alumnos de clase: Sí, alumnos pueden moverse entre clases o quedar sin clase.

* **Protección de formulario:**
  * Botón "Guardar" se deshabilita si no hay cambios reales.
  * Botón "Guardar" se deshabilita durante guardado (evita doble envío).
  * Botón "Cancelar" descarta cambios sin guardar.

* **Validación en tiempo real:**
  * Mensajes de validación se muestran inline mientras usuario escribe.
  * Validación frontend (rápida) + backend (definitiva, no confiar solo en frontend).

* **Sincronización de cambios:**
  * Al guardar, cambios se reflejan inmediatamente en listado de cursos (actualizar estado).
  * Notificación de éxito: "Curso actualizado correctamente" (toast/snackbar).
  * Si cambios fallan, mostrar error claro sin mensaje técnico.

* **Transacciones en base de datos:**
  * Si se editan múltiples clases/alumnos y algo falla, REVERTIR TODO (rollback de transacción).
  * Usuario ve error claro de qué falló, datos quedan consistentes.
  * Si profesor es borrado mientras se edita, error al guardar (profesor no existe).

* **Interfaz de edición:**
  * Modal o página nueva con formulario.
  * Campo nombre del curso (editable).
  * Tabla de clases con columnas: Nombre Clase | Tutor Asignado | Cantidad Alumnos | Acciones.
  * Acciones por clase: Editar nombre, cambiar tutor (o quitar), eliminar clase, expandir para ver/editar alumnos.
  * Agregar nueva clase: Botón "+ Agregar Clase" en tabla.
  * Gestión de alumnos por clase: Al expandir clase, ver lista de alumnos y poder agregar/quitar.
  * Dropdown de tutor: Mostrar profesores disponibles + opción "Sin tutor".
  * Clase sin tutor: Mostrar ✗
  * Responsive: Desktop (modal/página), Tablet (cards), Móvil (accordion expandible).

---

#### Restricciones de campos y formatos

**Nombre del Curso:**
* Obligatorio: Sí.
* Caracteres permitidos: Alfanuméricos (A-Z, a-z, 0-9) + especiales (º, Âª, -, /, espacio).
* Límite: 100 caracteres máximo.
* Unicidad: Debe ser único en el sistema.
* Ejemplos válidos: "1º Primaria", "1º Primaria Turno Tarde", "6º Primaria".

**Nombre de Clase:**
* Obligatorio: Sí.
* Caracteres permitidos: Alfanuméricos (A-Z, a-z, 0-9) + especiales (º, Âª).
* Límite: 10 caracteres máximo.
* Unicidad: Àšnico DENTRO del MISMO curso.
* Ejemplos válidos: "A", "B", "Grupo A", "1ÂªA".

**Tutor Asignado:**
* Obligatorio: No (puede quedar sin tutor).
* Validación: Si asignado, profesor debe existir en BD y estar ACTIVE.
* Restricción crítica: Un tutor solo en UNA clase (verificar en BD).
* Dropdown filtrable: Mostrar solo profesores ACTIVE que NO tutorizan otra clase.
* Error si ya tutoriza: "Este profesor ya es tutor de otra clase. Elige otro".
* Fallback: Si no hay profesores disponibles, mostrar "No hay profesores disponibles".
* Icono warning: Si clase sin tutor, mostrar ✗

---

#### Criterios de Aceptación (19 CAs)

* **CA1 (Abrir formulario de edición):** Dado que soy usuario del colegio y veo un curso en el listado, cuando hago clic en "Editar", entonces se abre modal o página con formulario que contiene: campo nombre del curso, tabla de clases (nombre, tutor, alumnos, acciones), botones Guardar/Cancelar, y está pre-poblado con datos actuales del curso.

* **CA2 (Cambiar nombre del curso):** Dado que estoy editando un curso y cambio nombre de "1º Primaria" a "1º Primaria Turno Tarde", cuando presiono Guardar, entonces: se valida que nuevo nombre es único, cambios se guardan en BD, listado se actualiza inmediatamente, y aparece notificación "Curso actualizado correctamente".

* **CA3 (Validar tutor válido):** Dado que intento cambiar tutor de una clase a un profesor inexistente, INACTIVE, o que no está en BD, cuando intento guardar, entonces veo error "El tutor seleccionado no es válido" y cambios no se guardan.

* **CA4 (Validar nombre curso único):** Dado que intento cambiar nombre del curso a uno que ya existe en el sistema (ej. "6º Primaria"), cuando intento guardar, entonces veo error "Este curso ya existe en el sistema. Usa otro nombre" y cambios no se guardan.

* **CA5 (Validar clase única dentro del curso):** Dado que intento cambiar nombre de clase "B" a "A" (que ya existe en "1º Primaria"), cuando intento guardar, entonces veo error "Ya existe una clase A en este curso" y cambios no se guardan.

* **CA6 (Validar tutor único - restricción de una clase por profesor):** Dado que intento asignar un profesor que ya tutoriza otra clase (ej. "Juan" es tutor de 1ºA y quiero ponerlo en 1ºB), cuando intento guardar, entonces veo error "Este profesor ya es tutor de otra clase. Elige otro profesor" y cambios no se guardan.

* **CA7 (Editar múltiples campos en una sesión):** Dado que estoy editando un curso y cambio: nombre curso + nombre clase + tutor + alumnos, cuando presiono Guardar, entonces todos los cambios se guardan de forma atómica (todo o nada, no parcial) y listado se actualiza.

* **CA8 (Eliminar clase - alumnos quedan sin clase):** Dado que una clase tiene o no alumnos asignados, cuando presiono "Eliminar" en esa clase, entonces: la clase se elimina del curso, y los alumnos que estaban en esa clase quedan con `class_id = NULL` (sin clase asignada, pero NO se eliminan como alumnos).

* **CA9 (Quitar tutor de una clase):** Dado que una clase tiene un tutor asignado, cuando presiono "Quitar Tutor" o selecciono "Sin tutor" en dropdown, entonces: el tutor se desasigna de la clase (class.tutor_id = NULL), la clase muestra ✗

* **CA10 (Cancelar edición sin guardar):** Dado que estoy editando un curso y cambio varios campos, cuando presiono Cancelar, entonces se cierra formulario sin guardar cambios y vuelvo al listado con datos originales.

* **CA11 (Validación en tiempo real + inline):** Dado que escribo en campo de nombre del curso, cuando escribo caracteres, entonces aparece validación inline debajo del campo (ej. si nombre ya existe, muestra "Este curso ya existe") sin esperar a presionar Guardar.

* **CA12 (Caracteres especiales permitidos en edición):** Dado que cambio nombre a "1º Primaria Turno Tarde" o "Grupo 6Âª A", cuando guardo, entonces se acepta (alfanuméricos + º, Âª, -, /, espacio permitidos en nombre curso; alfanuméricos + º, Âª en nombre clase).

* **CA13 (Manejo de errores server-side):** Dado que frontend valida OK pero backend falla (ej., profesor borrado simultáneamente, BD no responde), cuando intento guardar, entonces veo error claro "No se pudo actualizar el curso. Intenta de nuevo" (SIN mensajes técnicos) y cambios no se guardan.

* **CA14 (Agregar nueva clase al editar):** Dado que estoy editando un curso "1º Primaria" con clases A, B, cuando presiono "+ Agregar Clase", entonces: puedo agregar nueva clase "C" con nombre único (validación en tiempo real), asignar tutor opcional, y al guardar la clase se crea en el curso.

* **CA15 (Tutor no puede tutorizar otra clase al agregar):** Dado que intento agregar nueva clase y asignar profesor que ya tutoriza otra clase, cuando intento guardar, entonces veo error "Este profesor ya es tutor de otra clase. Elige otro profesor" y cambios no se guardan.

* **CA16 (Agregar alumnos a una clase):** Dado que expando una clase en tabla de edición, cuando veo lista de alumnos, entonces puedo agregar nuevos alumnos a esa clase (mover de otra clase o asignar si no tenían clase). Al guardar, alumnos se asignan a la clase.

* **CA17 (Eliminar alumnos de una clase):** Dado que expando una clase y veo sus alumnos, cuando presiono "Eliminar" en un alumno de esa clase, entonces: el alumno se desasigna de la clase (class_id = NULL), pero NO se elimina del sistema (alumno sigue existiendo sin clase).

* **CA18 (Clase sin tutor es permitida con icono warning):** Dado que una clase no tiene tutor asignado, cuando veo tabla de clases o intento guardar, entonces: la clase se acepta sin tutor (no es error), se muestra como "✗

* **CA19 (Transacción atómica con múltiples cambios):** Dado que edito: nombre curso + agrego clase + cambio tutor + agregue/elimino alumnos, cuando guardo, entonces: todos los cambios se guardan atómicamente (si algo falla, se revierte TODO, no guardado parcial).

---

#### Requisitos de Testing

* **Unit Tests:** Validación de uniqueness, restricción tutor, detección cambios, transacciones rollback.
* **E2E Tests:** Agregar clase, eliminar clase, mover alumno, quitar tutor, múltiples cambios.
* **Seguridad:** SQL injection, XSS, JWT, permisos, rate limiting.
* **Performance:** Tabla clases <200ms, guardado <1s, validación inline sin lag.
* **a11y:** Navegación teclado, screen reader, WCAG 2.1 AA, aria-labels.

---

#### Requisitos Técnicos

**Frontend:**
* Componentes: `CourseEditModal`, `ClassesEditTable`, `FormField`, `NotificationToast`
* APIs: `PUT /api/courses/:id`, `POST /api/courses/:courseId/classes`, `DELETE /api/courses/:courseId/classes/:classId`, `PUT /api/classes/:classId/students`
* Estado: `originalCourse`, `editedCourse`, `errors`, `loading`, `hasChanges`
* Validación: Debounce 300ms, comparación cambios, deshabilitar Guardar si sin cambios

**Backend (AdonisJS):**
* Autenticación obligatoria (usuario `ADMIN` o `MEMBER`); los datos se filtran por el colegio del usuario.
* Rutas CRUD para cursos, clases, alumnos
* Transacciones BD para rollback si algo falla
* Àndices: `idx_courses_name`, `UNIQUE (course_id, name)` en classes, `UNIQUE (tutor_id)`
* Constraints: `ON DELETE SET NULL` para profesor borrado y alumno sin clase

**Seguridad & Performance:**
* Parametrized queries (Lucid ORM)
* Vine schema validation
* Rate limiting: 10 ediciones/min por usuario
* Àndices en BD para búsquedas rápidas

---

#### Riesgos y Mitigaciones

* **Seguridad - SQL Injection:** Parametrized queries + Vine validation.
* **Concurrencia - Cambios simultáneos:** Last-write-wins (último guardado prevalece).
* **Integridad - Profesor borrado:** Validar en backend que profesor todavía existe.
* **Integridad - Restricción tutor:** UNIQUE constraint en BD en tutor_id.
* **Datos inconsistentes - Transacciones:** Usar transacciones BD, rollback si algo falla.
* **Orfandad de alumnos - Clase eliminada:** Alumnos quedan con `class_id = NULL`, permitido por sistema.
* **Cascada de eliminación:** Al eliminar clase, también actualizar referencias en horarios.
* **UX - Sin cambios:** Deshabilitar botón Guardar si no hay cambios reales.

---

#### Dependencias

* **Depende de US05 (Crear curso):** Curso debe existir antes de editar.
* **Depende de US06 (Ver listado):** Botón "Editar" está en listado de US06.
* **Depende de US09 (Crear profesor):** Tutores disponibles para asignar a clases.
* **Impacta en US08 (Borrar curso):** No se puede borrar curso con alumnos.
* **Cascada con US05 CA11:** Si profesor borrado, clase pierde tutor.

### US08: Borrar un curso

**Épica:** [2. Gestión de Cursos y Estructura Base](#epica-2-gestion-de-cursos-y-estructura-base)

**Historia:** Como usuario del colegio, quiero borrar un curso que ya no está activo, para mantener la estructura limpia.

> **Nota (US06, 2026-10-19):** el listado de `/cursos` no tiene todavía acciones: esta historia añade el botón «Borrar» de cada curso en la tabla y en las tarjetas.

---

#### Casos de uso y reglas de negocio

* **Acceso a borrado:**
  * Cualquier usuario del colegio (`ADMIN` o `MEMBER`) puede borrar sus cursos.
  * Botón "Borrar" está en el listado de cursos (US06).
  * Se abre diálogo de confirmación con información de impacto.

* **Cascada de borrado (OPCIÀ“N A - Permitir con alumnos):**
  * Si se elimina un curso, se eliminan TODAS sus clases automáticamente.
  * Si se eliminan clases, se eliminan TODOS sus horarios automáticamente.
  * Si se eliminan clases, todos los alumnos asignados quedan con `class_id = NULL` (sin clase asignada).
  * Si se eliminan clases, todos los tutores asignados quedan con `tutor_id = NULL` (sin tutoría).
  * Los profesores/alumnos NO se eliminan del sistema, solo se desasignan de sus roles.

* **Diálogo de confirmación:**
  * Muestra nombre del curso a borrar.
  * Muestra impacto: cantidad de clases, alumnos, horarios, tutores a desasignar.
  * Advierte: "Â¿Está seguro? Esta acción no se puede deshacer".
  * Si hay >50 alumnos, muestra confirmación adicional.
  * Botones: Confirmar, Cancelar.

* **Transacción atómica:**
  * Si algo falla durante el borrado, toda la operación se revierte (ROLLBACK).
  * No hay borrados parciales: TODO o NOTHING.
  * Usuario ve error claro si algo falla.

* **Permisos:**
  * Cualquier usuario del colegio (`ADMIN` o `MEMBER`) ve el botón Borrar.
  * Un curso de otro colegio responde `404 NOT_FOUND`, como si no existiera.

* **Feedback post-borrado:**
  * Diálogo se cierra.
  * Listado de cursos se actualiza inmediatamente.
  * Notificación de éxito: "Curso eliminado correctamente" (o con cantidad de alumnos desasignados).
  * Si es el último curso, mostrar CTA para crear nuevo.

* **Auditoría:**
  * Se registra evento de borrado con timestamp, usuario, nombre de curso, cantidad de alumnos/clases/horarios afectados.
  * NUNCA se loguean datos sensibles de alumnos o profesores.

---

#### Restricciones de campos y formatos

**Confirmación de Borrado:**
* Información mostrada: nombre curso, clases a eliminar, alumnos a desasignar, horarios a eliminar, tutores a desasignar.
* Si ✗
* Si >50 alumnos: confirmación adicional "Â¿Realmente deseas? Este curso tiene N alumnos".
* Si es último curso: advertencia especial "Este es el ÀšNICO curso del colegio".

---

#### Criterios de Aceptación (8 CAs)

* **CA1 (Diálogo de confirmación con impacto):** Dado que veo un curso en el listado, cuando hago clic en "Borrar", entonces se abre diálogo que muestra: nombre del curso, cantidad de clases a eliminar, cantidad de alumnos a desasignar, cantidad de horarios a eliminar, cantidad de tutores a desasignar, texto "Â¿Está seguro? Esta acción no se puede deshacer", y botones Confirmar/Cancelar.

* **CA2 (Borrar curso y cascadas se ejecutan):** Dado que confirmo borrado de un curso "1º Primaria" con 3 clases y 85 alumnos, cuando presiono Confirmar, entonces: curso se elimina, clases se eliminan (cascada), alumnos quedan con class_id = NULL (sin clase), tutores quedan con tutor_id = NULL (sin tutoría), horarios se eliminan, listado se actualiza inmediatamente, y notificación "Curso eliminado. 85 alumnos quedan sin clase asignada".

* **CA3 (Transacción atómica - rollback si falla):** Dado que se inicia borrado de curso con múltiples cascadas, cuando algo falla en mitad del proceso (ej., error BD, timeout), entonces BD hace ROLLBACK automático, nada se elimina parcialmente, datos quedan consistentes, y usuario ve error claro "No se pudo eliminar el curso. Intenta de nuevo".

* **CA4 (Aislamiento entre colegios):** Dado que soy usuario de un colegio, cuando intento borrar vía API un curso de otro colegio, entonces recibo `404 NOT_FOUND` y el curso no se borra.

* **CA5 (Confirmación adicional si >50 alumnos):** Dado que intento borrar un curso con 85 alumnos asignados, cuando abro diálogo de confirmación, entonces aparece confirmación adicional: "Este curso tiene 85 alumnos. Â¿Realmente deseas continuar?" con Confirmar/Cancelar.

* **CA6 (Loading state durante borrado):** Dado que presiono Confirmar en diálogo, cuando se procesa borrado, entonces: botones se deshabilitan (prevenir doble clic), aparece spinner/loading "Eliminando curso...", tras éxito diálogo se cierra, listado actualiza, y notificación aparece.

* **CA7 (Concurrencia - curso borrado mientras se edita):** Dado que intento guardar cambios en un curso que fue borrado por otro usuario, cuando intento guardar, entonces veo error "Este curso ha sido eliminado por otro usuario" y cambios no se guardan.

* **CA8 (Àšltimo curso del colegio - CTA crear nuevo):** Dado que borro el ÀšNICO curso que existe en el colegio, cuando se completa borrado, entonces: aparece notificación con CTA "Crear primer curso" (enlaza a US05) o mensaje "El colegio no tiene cursos. Crea uno para empezar".

---

#### Requisitos de Testing

* **Unit Tests:** Validación de permisos, cascada correcta, transacción rollback, cantidad correcta confirmación.
* **E2E Tests:** Flujo completo borrado, >50 alumnos, último curso, concurrencia.
* **Seguridad:** SQL injection, XSS, JWT, permisos, rate limiting.
* **Performance:** Curso con 1000 alumnos <2s, timeout 30s.
* **Concurrencia:** Dos usuarios simultáneamente, usuario edita mientras otro borra.

---

#### Requisitos Técnicos

**Frontend:**
* Componentes: `DeleteCourseDialog`, `ConfirmationStep`, `LoadingOverlay`, `NotificationToast`
* API: `DELETE /api/courses/:id`
* Estado: `courseToDelete`, `impactData`, `loading`, `showAdditionalConfirm`

**Backend (AdonisJS):**
* Autenticación obligatoria (usuario `ADMIN` o `MEMBER`); los datos se filtran por el colegio del usuario.
* Transacción BD: DELETE schedules ✗
* Constraints: `ON DELETE CASCADE` para clases/horarios, `ON DELETE SET NULL` para alumnos/tutores
* Logging: COURSE_DELETED event con timestamp, usuario, impacto
* Rate limiting: 10 borrados/min por usuario

**Seguridad & Performance:**
* Parametrized queries (Lucid ORM)
* Validación JWT
* Àndices: courses(id), classes(course_id)
* Timeout: 30s para operación completa

---

#### Riesgos y Mitigaciones

* **Accidente - borrado irreversible:** Diálogo claro con impacto, confirmación >50 alumnos, audit log. Futuro: soft-delete.
* **Integridad referencial - cascada incompleta:** Transacción BD con constraints, rollback si falla.
* **Concurrencia:** Transacción BD aísla, segundo intento falla con error.
* **Performance - muchos alumnos:** Transacción rápida con índices, timeout 30s.
* **Usuario edita mientras se borra:** Validar curso existe, error si borrado.

---

#### Dependencias

* **Depende de US06 (Ver listado):** Botón "Borrar" en listado.
* **Integración con US07 (Editar):** Error si intenta guardar en curso borrado.
* **Cascada con US05, US14, US19:** Afecta clases, alumnos, horarios.

---

## Módulo: Gestión de Profesores

### US09: Crear un profesor

**Épica:** [3. Gestión de Profesores](#epica-3-gestion-de-profesores)

**Historia:** Como usuario del colegio, quiero crear un profesor indicando su nombre, apellido, múltiples asignaturas que puede impartir, su cargo y si es tutor de un curso, para configurar la estructura docente del colegio con flexibilidad para profesores que enseñan varias materias.

> **Nota (US06, 2026-10-19):** cuando una clase tenga tutor, la columna «Tutores» del listado de `/cursos` (hoy «Sin tutor») debe mostrar su nombre y apellido; `SchoolClass.tutor` deja de ser siempre `null`.

> **Nota (US05, 2026-10-19):** la migración de esta historia crea `professors` y añade `classes.tutor_id` (nullable, con un índice único: un profesor tutoriza una sola clase). Asignar el profesor como «tutor de clase» al crearlo es la primera forma de dar tutor a las clases que US05 crea «Sin tutor».

**Casos de uso y reglas de negocio:**

* **Acceso a creación:** Cualquier usuario del colegio (`ADMIN` o `MEMBER`) puede crear profesores. Botón "Crear Profesor" está en listado de profesores (US10). Se abre formulario con campos: nombre, apellido, asignaturas (multiselect), cargo (opcional), tutor de clase (opcional).

* **Campos obligatorios:** Nombre (obligatorio), Apellido (obligatorio), Asignaturas (obligatorio - multiselect, mínimo 1, máximo N), Tutor de clase (opcional, profesor puede crearse sin clase asignada, tutor_id = NULL), Email (NO obligatorio, no se solicita en formulario de creación).

* **Validación de nombre y apellido:** Caracteres permitidos: alfanuméricos (A-Z, a-z, 0-9), acentos (á, é, í, ó, ú, ñ), guiones (-), apóstrofos ('), espacios. Límite: 100 caracteres por campo. No puede ser solo espacios (debe tener caracteres alfanuméricos). NO hay validación de unicidad: pueden existir múltiples profesores con mismo nombre + apellido.

* **Gestión de asignaturas:** Asignaturas: checkboxes multiselect. Mínimo 1 asignatura requerida (validación). Máximo: N asignaturas (sin límite explícito, pero práctico ~10). Solo se muestran asignaturas con status ACTIVE (de US-SUBJECT). Múltiples profesores pueden tener las MISMAS asignaturas (sin restricción de unicidad). Ejemplos: Prof. Smith [Inglés, Arts], Prof. García [Inglés, Valenciano], Prof. López [Educación Física].

* **Integración con US-SUBJECT:** Sistema pre-carga lista de asignaturas desde tabla subjects WHERE status = 'ACTIVE'. Cada asignatura muestra tipo (CORE/ELECTIVE/CUSTOM) como ayuda visual. Si no hay asignaturas disponibles, mostrar aviso "No hay asignaturas ACTIVE disponibles. Crear primero en US-SUBJECT".

* **Gestión de tutoría:** Tutor de clase es opcional. Un profesor puede ser tutor de UNA sola clase (restricción heredada de US05). Profesor se crea SIN tutor (tutor_id = NULL) y se asigna después si es necesario.

* **Cargo:** opcional, con los valores "Director" o "Jefe de estudios" (vacío por defecto). Es un dato informativo del profesor y no concede permisos en la aplicación (PRD §3.2); los permisos dependen del rol del usuario (`ADMIN` o `MEMBER`). Es independiente de la tutoría: un profesor puede tener cargo y ser tutor a la vez.

* **Estado del profesor:** Profesor se crea en estado ACTIVE automáticamente. No hay campo para cambiar estado al crear.

* **Permisos:** Cualquier usuario del colegio (`ADMIN` o `MEMBER`) puede crear profesores, que se crean en su colegio. Sin sesión iniciada, la API responde `401`.

* **Feedback post-creación:** Formulario se cierra. Listado de profesores se actualiza inmediatamente. Notificación de éxito: "Profesor creado correctamente" (toast/snackbar). Profesor aparece en listado con nombre, asignaturas (separadas por comas) y estado de tutoría.

**Criterios de Aceptación:**
* **CA1 (Crear profesor con 1 asignatura):** Dado que estoy en sección gestión de profesores, cuando completo formulario con nombre "José María", apellido "García López", selecciono asignatura "Inglés" (checkbox), marco "Sin tutor" (opcional), entonces profesor se crea exitosamente en estado ACTIVE con 1 asignatura.

* **CA2 (Crear profesor con múltiples asignaturas):** Dado que completo nombre "Smith", apellido "John", selecciono 3 asignaturas [✗

* **CA3 (Nombre y apellido obligatorios):** Dado que intento crear profesor sin nombre o sin apellido, cuando intento guardar, entonces veo error inline "Nombre y apellido son obligatorios" y formulario no se envía.

* **CA4 (Asignaturas obligatorio - mínimo 1):** Dado que no selecciono ninguna asignatura, cuando intento guardar, entonces veo error "Debe seleccionar al menos 1 asignatura" y formulario no se envía.

* **CA5 (Profesor aparece en listado con asignaturas):** Dado que cree exitosamente profesor "Smith, John" con asignaturas [Inglés, Arts] sin tutor, cuando veo listado de profesores, entonces aparece: "Smith, John | Inglés, Arts | Sin tutoría".

* **CA6 (Badge expandible de asignaturas en listado):** Dado que profesor tiene 3+ asignaturas, cuando veo badge "3 asignaturas" en listado, entonces puedo hacer clic para expandir y ver detalle: [Inglés, Arts, Matemáticas] (con tipo CORE/ELECTIVE/CUSTOM).

* **CA7 (Tutor en una sola clase - restricción):** Dado que intento asignar profesor como tutor de múltiples clases simultáneamente, cuando intento guardar, entonces veo error "Un profesor solo puede ser tutor de una clase" y formulario no se envía.

* **CA8 (Validar clase existe):** Dado que intento asignar profesor a clase que no existe, cuando intento guardar, entonces veo error "La clase seleccionada no existe" y formulario no se envía.

* **CA9 (Caracteres especiales permitidos):** Dado que creo profesor con nombre "José María García-López" o "D'Angelo MÀ¼ller", cuando guardo, entonces se acepta (acentos, guiones, apóstrofos permitidos).

* **CA10 (Nombre no solo espacios):** Dado que intento crear profesor con nombre "     " (solo espacios), cuando intento guardar, entonces veo error "El nombre debe contener caracteres alfanuméricos" y formulario no se envía.

* **CA11 (Acceso de cualquier usuario del colegio):** Dado que soy `MEMBER`, cuando creo un profesor, entonces se crea en mi colegio igual que si fuera `ADMIN`; sin sesión iniciada, la API responde `401`.

* **CA12 (Validar asignaturas existen y ACTIVE):** Dado que intento enviar asignatura con ID que no existe o está INACTIVE, cuando guardo vía API, entonces recibo error "Una o más asignaturas no existen o no están activas" y no se crea profesor.

* **CA13 (Transacción atómica: profesor + asignaturas):** Dado que guardo profesor con 3 asignaturas, cuando se produce error en INSERT INTO professor_subjects, entonces toda transacción hace ROLLBACK (no se crea profesor ni asignaturas parciales).

* **CA14 (Mostrar solo asignaturas ACTIVE):** Dado que hay asignaturas con status INACTIVE en BD, cuando abro formulario, entonces checkbox lista solo muestra asignaturas con status = 'ACTIVE' (filtro automático).

* **CA15 (Cargo del profesor):** Dado que creo un profesor y elijo el cargo "Jefe de estudios", cuando guardo, entonces el profesor se crea con ese cargo; si no elijo ninguno, se crea sin cargo. El cargo no cambia los permisos de ningún usuario.

**Requisitos Técnicos:**
* Frontend: Componentes CreateProfessorForm (nombre, apellido, asignaturas multiselect, cargo, tutor), SubjectsCheckboxList (checkboxes multiselect con tipo CORE/ELECTIVE/CUSTOM), ClassDropdown (clases sin tutor), NotificationToast (éxito/error). API: POST /api/professors (crear profesor).
* Backend: Ruta POST /api/professors con autenticación (usuario `ADMIN` o `MEMBER`; el profesor se crea en el colegio del usuario), firstName + lastName (obligatorio, 100 chars, caracteres válidos), position (opcional: DIRECTOR | JEFE_ESTUDIOS), subjectIds array (obligatorio, mínimo 1, máximo N), cada subjectId validar existe y status='ACTIVE', classId (opcional, debe existir, sin otro tutor). Transacción BD completa (INSERT professors + INSERT professor_subjects). Response: { professor: { id, firstName, lastName, position, subjectIds, subjects: [...], classId, status: 'ACTIVE' } }.
* BD: Tabla professors con id, firstName, lastName, position (nullable: DIRECTOR | JEFE_ESTUDIOS), specialty (nullable, DEPRECATED - backward compat), classId (nullable), status, created_at. Àndices en firstName, lastName, status. NUEVA TABLA: professor_subjects (id, profesorId FK✗

**Decisiones Tomadas:**
| Decisión | Justificación |
|----------|---------------|
| **Múltiples asignaturas** | Realidad: profesores enseñan varias materias (Smith: Inglés+Arts) |
| **Multiselect (checkboxes)** | Claro, visual, mejor UX que dropdown múltiple |
| **Mínimo 1 asignatura** | Profesor debe poder enseñar algo (validación en BD) |
| **Solo ACTIVE en dropdown** | No confundir con asignaturas inactivas |
| **Many-to-many professor_subjects** | Flexible, permite N asignaturas por profesor sin límite |
| **specialty DEPRECATED** | Backward compat: campo sigue existiendo pero no usado. Read prioriza professor_subjects. Write siempre a profesor_subjects. |
| **Migración Opción 2** | Deprecate completamente: migrar datos legacy specialty✗
| **Profesor sin clase al crear** | Tutor se asigna después en US05/US07, orden flexible |
| **NO validar unicidad nombre** | Múltiples profesores pueden compartir nombre |
| **Un tutor por clase** | Restricción heredada de US05 |
| **Permisos: cualquier usuario del colegio** | `ADMIN` y `MEMBER` gestionan profesores (PRD §3.1) |
| **Cargo informativo** | Director y jefe de estudios son un dato del profesor, no un permiso |
| **Transacción atómica** | INSERT profesor + INSERT professor_subjects en una transacción, ROLLBACK si falla alguna |

### US10: Ver listado de profesores

**Épica:** [3. Gestión de Profesores](#epica-3-gestion-de-profesores)

**Historia:** Como usuario del colegio, quiero ver el listado completo de profesores del colegio, para tener referencia de todo el personal docente.

**Casos de uso y reglas de negocio:**

* **Acceso al listado:** Cualquier usuario del colegio (`ADMIN` o `MEMBER`) puede ver el listado, que solo incluye los profesores de su colegio. Acceso desde menú principal o sección "Gestión de Profesores".

* **Contenido del listado:** Muestra TODOS los profesores en estado ACTIVE (no muestra inactivos/borrados). Tabla con columnas: Nombre | Asignaturas | Rol | Acciones. Ordenado alfabéticamente A-Z por nombre + apellido. Paginación: 20 profesores por página si hay más de 20. Controles Anterior/Siguiente + indicador "Página X de N (Total Y profesores)".

* **Estructura de datos mostrada:**
  - Nombre: Nombre completo (nombre + apellido) en texto.
  - Asignaturas: Lista de asignaturas que imparte profesor (de tabla professor_subjects). Separadas por comas. Si <3 asignaturas muestra todas; si ≥3 muestra "3 asignaturas" como badge clickable que expande. Ejemplo: "Inglés, Arts, Matemáticas" o badge "3 asignaturas" ✗
  - Rol: Si tutoriza clase ✗
  - Acciones: Botones Editar | Borrar (abiertos a US12/US13).

* **Listado vacío:** Si no hay profesores, mostrar mensaje "No hay profesores registrados" con botón CTA "Crear primer profesor" (enlaza a US09).

* **Botones de acción:** Editar (abre US12) | Borrar (abre US13). Siempre visibles (permisos validados en backend).

* **Responsive design:**
  - Desktop (>1024px): Tabla horizontal.
  - Tablet (768-1024px): Cards compactos.
  - Móvil (<768px): Cards, nombres largos truncados con ellipsis (...) + tooltip.

* **Sincronización:** Listado se actualiza automáticamente en <3 segundos cuando se crea/edita/borra profesor (polling o WebSocket).

**Criterios de Aceptación:**
* **CA1 (Mostrar tabla de profesores):** Dado que accedo a sección gestión de profesores, cuando carga la página, entonces veo tabla con columnas: Nombre | Asignaturas | Rol | Acciones, ordenada alfabéticamente A-Z por nombre + apellido.

* **CA2 (Paginación de 20 items):** Dado que hay más de 20 profesores en el sistema, cuando veo listado, entonces muestro primeros 20 en página 1 con controles Anterior/Siguiente e indicador "Página 1 de N (Total Y profesores)".

* **CA3 (Listado vacío con CTA):** Dado que no hay profesores en el sistema, cuando veo listado, entonces aparece mensaje "No hay profesores registrados" con botón CTA "Crear primer profesor" enlazando a US09.

* **CA4 (Mostrar 1-2 asignaturas):** Dado que veo profesor "José García" con asignaturas [Inglés], cuando veo fila en tabla, entonces columna Asignaturas muestra "Inglés". Dado que profesor tiene [Inglés, Arts], entonces muestra "Inglés, Arts".

* **CA5 (Badge expandible para ≥3 asignaturas):** Dado que profesor tiene 3+ asignaturas [Inglés, Arts, Matemáticas], cuando veo columna Asignaturas, entonces muestra badge "3 asignaturas" clickable. Cuando hago clic, expande y muestra lista completa [Inglés, Arts, Matemáticas].

* **CA6 (Rol: Tutor vs Sin tutoría):** Dado que profesor tutoriza clase "1º Primaria A", cuando veo listado, entonces columna Rol muestra "Tutor de 1º Primaria A". Dado que profesor NO tutoriza, entonces columna Rol muestra "Sin tutoría" en texto gris.

* **CA7 (Mostrar solo ACTIVE):** Dado que profesor está en estado INACTIVE o DELETED, cuando veo listado, entonces NO aparece (filtro automático WHERE status = 'ACTIVE').

* **CA8 (Botones de acción):** Dado que veo fila de profesor, cuando veo columna Acciones, entonces aparecen dos botones: Editar (abre US12) | Borrar (abre US13). Botones siempre visibles (permisos validados en backend).

* **CA9 (Acceso y aislamiento):** Dado que soy usuario de un colegio, cuando accedo al listado de profesores, entonces solo veo los profesores de mi colegio; sin sesión iniciada, la API responde `401`.

* **CA10 (Responsive: Desktop tabla, Móvil cards):** Dado que veo en desktop (>1024px), cuando carga listado, entonces veo tabla horizontal. Dado que veo en móvil (<768px), cuando carga listado, entonces veo cards apilados verticalmente, cada card: Nombre | Asignaturas | Rol | Editar/Borrar.

* **CA11 (Nombres y asignaturas largos en móvil):** Dado que nombre profesor es muy largo (>30 chars) O tiene 3+ asignaturas, cuando veo en móvil, entonces nombre se trunca con ellipsis (...) y asignaturas se muestran en badge "N asignaturas" expandible. Tooltip muestra nombre completo y asignaturas completas al hover.

* **CA12 (Actualización inmediata post-acción):** Dado que otro usuario crea/edita/borra profesor mientras estoy viendo listado, cuando se ejecuta la acción, entonces listado se actualiza automáticamente en <3 segundos sin recargar manualmente.

* **CA13 (Filtrar por asignatura):** Dado que presiono filtro "Asignatura: Inglés", cuando filtra, entonces veo solo profesores que imparten Inglés (consultando professor_subjects).

**Requisitos Técnicos:**
* Frontend: Componentes ProfessorList (contenedor), ProfessorTable (desktop), ProfessorCard (móvil), Pagination (controles), EmptyState (sin profesores), SubjectsExpandable (badge + detalle expandible), FilterBySubject (dropdown filtro). API: GET /api/professors?page=1&limit=20&filterSubjectId=1.
* Backend: Ruta GET /api/professors?page=1&limit=20 con autenticación (usuario `ADMIN` o `MEMBER`; filtra por el colegio del usuario), filtro WHERE status = 'ACTIVE', ordenamiento por firstName/lastName, paginación LIMIT 20 OFFSET (page-1)*20. JOIN a classes para obtener nombre clase. JOIN a professor_subjects + subjects para obtener asignaturas. Optional query param ?filterSubjectId=N para filtrar por asignatura. Response: { professors: [...], pagination: { currentPage, totalPages, total }, subjects: [...] }.
* BD: Tabla professors con id, firstName, lastName, specialty (DEPRECATED), classId (nullable), status, created_at. Tabla professor_subjects con id, profesorId FK✗

**Decisiones Tomadas:**
| Decisión | Justificación |
|----------|---------------|
| **Mostrar asignaturas en lugar de especialidad** | Refleja realidad: profesor imparte múltiples materias (mejora US09) |
| **Badge expandible ≥3 asignaturas** | Mejora UX: evita filas muy largas, permite ver detalle |
| **Orden alfabético defecto** | Predecible + consistente, fácil encontrar profesor |
| **20 items por página** | Balance: performance + usabilidad |
| **Solo ACTIVE** | No confundir con inactivos/borrados |
| **Rol = "Tutor de X" o "Sin tutoría"** | Claro, heredado de US09 |
| **Responsive: tabla/cards** | Mejor UX según dispositivo |
| **Polling cada 3s** | Actualizaciones cerca real-time |
| **Permisos: cualquier usuario del colegio** | `ADMIN` y `MEMBER` gestionan profesores |
| **Botones siempre visibles** | Permisos validados en backend |
| **Filtro opcional por asignatura** | Permite buscar profesores que enseñan materia específica |

### US11: Buscar profesores por nombre/apellido

**Épica:** [3. Gestión de Profesores](#epica-3-gestion-de-profesores)

**Historia:** Como usuario del colegio, quiero buscar profesores por nombre, apellido o asignatura para encontrar rápidamente a un docente específico que imparte una materia.

**Casos de uso y reglas de negocio:**

* **Acceso a búsqueda:** Campo búsqueda disponible en header del listado (US10). Cualquier usuario del colegio ve el campo (mismos permisos que US10).

* **Tipo de búsqueda:** Búsqueda PARCIAL (substring) - NO Levenshtein (sin tolerancia a typos). Busca en firstName + lastName + asignaturas (nombre asignatura desde professor_subjects). NO busca en rol o clase. Ejemplos: "Juan" encuentra "Juan García", "Juanjo", "Juana"; "Hern" encuentra "Hernández", "Hernán", "Hernando"; "Inglés" encuentra todos profesores que imparten Inglés.

* **Sensibilidad de caracteres:**
  - Case-INSENSITIVE: "Juan", "juan", "JUAN" retornan mismos resultados.
  - IGNORA ACENTOS: "Garcia" encuentra "García", "garcia", "GARCÀA".
  - ACEPTA caracteres especiales: guiones, apóstrofos, espacios.

* **Campo búsqueda:** Input text en header de listado. Placeholder: "Buscar por nombre o apellido". Límite: máximo 100 caracteres. Debounce: 300ms en tiempo real. Botón X en input para limpiar búsqueda.

* **Resultados de búsqueda:** Busca EN TODOS los profesores (no solo página actual). Retorna todos los resultados con paginación: 20 items/página. Cambiar página mantiene búsqueda activa.

* **Búsqueda vacía:** Si campo vacío o solo espacios: mostrar listado completo (sin filtro).

* **Resultados vacíos:** Si 0 resultados: mostrar mensaje "No hay profesores que coincidan con 'tu_búsqueda'" con botón "Limpiar búsqueda".

* **Búsqueda en tiempo real:** Mientras se escribe: loading spinner (300ms debounce). Resultados aparecen sin presionar Enter. Editar búsqueda: resultados se actualizan en tiempo real.

* **Sincronización:** Si búsqueda activa y se crea profesor que coincide: aparece en <3 segundos. Si se edita/borra profesor: búsqueda refleja cambio inmediatamente.

* **Performance:** Búsqueda debe completarse en <2 segundos. Àndices en firstName, lastName. Rate limiting: máximo 10 búsquedas/min por usuario.

**Criterios de Aceptación:**
* **CA1 (Búsqueda parcial por nombre):** Dado que estoy viendo listado de profesores, cuando escribo "Juan" en campo búsqueda, entonces se filtran y muestran profesores con "Juan" en nombre (ej: "Juan García", "Juanjo Pérez", "Juana López").

* **CA2 (Búsqueda parcial por apellido):** Dado que escribo "Hern" en campo búsqueda, cuando el sistema ejecuta la búsqueda, entonces aparecen todos con "Hern" en apellido ("Hernández", "Hernán", "Hernando").

* **CA3 (Case-insensitive):** Dado que busco "juan" (minúsculas), cuando el sistema busca, entonces encuentra "Juan", "JUAN", "juan" (sin diferencia).

* **CA4 (Ignora acentos):** Dado que busco "Garcia" (sin acento), cuando el sistema busca, entonces encuentra "García", "garcia", "GARCÀA".

* **CA5 (Búsqueda con caracteres especiales):** Dado que busco "García-López" o "O'Neill", cuando el sistema busca, entonces encuentra profesores con esos caracteres exactos (guiones, apóstrofos).

* **CA6 (Limpiar búsqueda):** Dado que escribo "Juan" y veo resultados filtrados, cuando borro el texto o presiono botón X en input, entonces listado se restaura mostrando todos los ACTIVE profesores de nuevo.

* **CA7 (Sin resultados):** Dado que busco "Zzzzzzz" (que no existe), cuando el sistema busca, entonces muestra mensaje "No hay profesores que coincidan con 'Zzzzzzz'" con botón "Limpiar búsqueda".

* **CA8 (Búsqueda + paginación):** Dado que busco "Juan" y hay 50 resultados, cuando veo listado, entonces muestra primeros 20 resultados con controles paginación Anterior | Página 1 de 3 | Siguiente.

* **CA9 (Debounce en tiempo real):** Dado que escribo "J", "Ju", "Jua", "Juan" (letra por letra), cuando escribo cada letra, entonces búsqueda ejecuta con debounce 300ms (no en cada keystroke), mostrar loading spinner mientras busca.

* **CA10 (Búsqueda con sincronización):** Dado que busco "Juan" y otro usuario crea "Juana García", cuando se crea el profesor, entonces "Juana" aparece en mis resultados en <3 segundos sin re-buscar.

* **CA11 (Límite de caracteres):** Dado que intento escribir más de 100 caracteres en búsqueda, cuando alcanzo el límite, entonces input no acepta caracteres adicionales.

* **CA12 (Permisos heredados de US10):** Dado que soy `MEMBER`, cuando uso el campo de búsqueda, entonces busco entre los profesores de mi colegio, con los mismos permisos que en US10.

* **CA13 (Buscar por asignatura):** Dado que escribo "Inglés" en búsqueda, cuando el sistema busca, entonces aparecen todos profesores que imparten Inglés (consultando professor_subjects JOIN subjects). Ejemplos: "Smith, John | Inglés, Arts | 1º A" aparece si imparte Inglés.

* **CA14 (Mostrar asignaturas en resultado búsqueda):** Dado que busco profesor "Smith" y hay resultados, cuando veo cada resultado en listado, entonces aparecen sus asignaturas (ej: "Smith, John | Inglés, Arts, Matemáticas").

**Requisitos Técnicos:**
* Frontend: Componentes SearchProfessorInput (input con debounce + botón X), SearchResults (resultados filtrados con asignaturas), LoadingSpinner (mientras busca), EmptySearchState (0 resultados). API: GET /api/professors/search?q=Juan&page=1&limit=20.
* Backend: Ruta GET /api/professors/search?q=Juan&page=1&limit=20 con autenticación (usuario `ADMIN` o `MEMBER`; filtra por el colegio del usuario), filtro WHERE status='ACTIVE' AND (firstName LIKE '%q%' OR lastName LIKE '%q%' OR subjects.name LIKE '%q%' via JOIN professor_subjects), case-insensitive, ignora acentos, paginación LIMIT 20. Query: SELECT DISTINCT p.* FROM professors p LEFT JOIN professor_subjects ps ON p.id = ps.profesorId LEFT JOIN subjects s ON ps.subjectId = s.id WHERE p.status='ACTIVE' AND (LOWER(p.firstName) LIKE LOWER('%q%') OR LOWER(p.lastName) LIKE LOWER('%q%') OR LOWER(s.name) LIKE LOWER('%q%')). Response: { professors con asignaturas relación, pagination, query }.
* BD: Àndices en firstName, lastName en professors. Àndice en profesorId en professor_subjects. Búsqueda case-insensitive: LOWER(). Ignora acentos: UNACCENT() o normalización en app.

**Decisiones Tomadas:**
| Decisión | Justificación |
|----------|---------------|
| **Búsqueda parcial (substring)** | Más flexible que exacta, mejor UX |
| **Case-insensitive** | Usuario típico no piensa en mayúsculas |
| **Ignora acentos** | "Garcia" es más fácil de escribir que "García" |
| **Buscar por asignatura** | Mejoría: encuentra profesores que enseñan materia específica |
| **Debounce 300ms** | Balance: rápido + no overhead |
| **Paginación 20 items** | Heredado de US10 |
| **Botón X en input** | Limpieza rápida y predecible |
| **Sincronización <3s** | Balance: real-time sin exceso queries |
| **Rate limiting 10/min** | Prevención de abuso |
| **Permisos heredados** | Coherencia con US10 |
| **LEFT JOIN en búsqueda** | Permite encontrar por nombre O asignatura |

### US12: Editar profesor

**Épica:** [3. Gestión de Profesores](#epica-3-gestion-de-profesores)

**Historia:** Como usuario del colegio, quiero editar los datos de un profesor existente para mantener su información actualizada.

**Casos de uso y reglas de negocio:**

* **Acceso a edición:** Botón "Editar" en listado de profesores (US10). Cualquier usuario del colegio (`ADMIN` o `MEMBER`) puede editar. Abre modal o página con formulario edición.

* **Campos editables:** Nombre (heredadas validaciones de US09), Apellido (heredadas validaciones de US09), Asignaturas (multiselect, mínimo 1 - actualización de US09), Clase (tutoría) - opcional, Cargo (director, jefe de estudios o ninguno) - opcional.

* **Campos NO editables:** ID, Status (estado), Fechas (created_at, updated_at), Email (no incluir en MVP).

* **Validaciones heredadas de US09:** Nombre/apellido: alfanuméricos + acentos + guiones + apóstrofos + espacios. Límite: 100 caracteres máximo. No puede ser solo espacios. NO validar unicidad.

* **Cambio de tutoría:** Profesor puede tutorizar UNA sola clase (heredada US09). Puede asignar a clase diferente o quitar tutoría (classId = NULL). Si asigna a clase que ya tiene tutor: error. Si asigna a clase que no existe: error.

* **Impacto en alumnos:** Si quito tutoría: alumnos mantienen asignación a clase. Clase queda sin tutor (tutor_id = NULL). Alumnos NO se reasignan.

* **Validación de cambios:** Validación inline en tiempo real (frontend) + validación definitiva en backend. Botón Guardar deshabilitado si NO hay cambios (double-submit protection).

* **Concurrencia:** Si profesor editado por otro usuario: error "Profesor actualizado por otro usuario". Si profesor borrado por otro usuario: error "Este profesor ha sido eliminado" + cerrar formulario.

* **Transacción atómica:** Si falla durante guardado: ROLLBACK (nada se guarda). No hay cambios parciales: TODO o NOTHING.

* **Permisos:** Cualquier usuario del colegio (`ADMIN` o `MEMBER`). Un profesor de otro colegio responde `404 NOT_FOUND`.

* **Feedback post-edición:** Formulario cierra. Listado se actualiza inmediatamente. Toast: "Profesor actualizado correctamente". Búsqueda (US11) refleja cambios (<3 segundos).

* **Cancelación:** Si hay cambios: confirmación "Descartar cambios?". Si sin cambios: cerrar sin confirmación.

**Criterios de Aceptación:**
* **CA1 (Abrir formulario edición):** Dado que veo listado de profesores, cuando hago clic en botón "Editar" para un profesor, entonces se abre modal/página con formulario edición con campos: Nombre | Apellido | Asignaturas | Clase, con valores actuales precargados.

* **CA2 (Cambiar nombre/apellido):** Dado que estoy editando profesor, cuando cambio nombre de "Juan" a "Juanito", entonces cambio se valida inline (caracteres, longitud, no solo espacios) y cuando guardo, se actualiza en BD.

* **CA3 (Cambiar asignaturas - multiselect):** Dado que edito profesor con asignaturas [Inglés, Arts], cuando deselecciono Arts (✗

* **CA4 (Reasignar a otra clase):** Dado que profesor tutoriza 1º A, cuando cambio a 1º B (clase sin tutor), entonces profesor se reasigna: 1º A pierde tutor, 1º B gana tutor, alumnos de 1º A mantienen asignación.

* **CA5 (Quitar tutoría - profesor sin clase):** Dado que profesor tutoriza 1º A, cuando quito tutoría (classId = NULL), entonces profesor queda "Sin tutoría", clase pierde tutor (tutor_id = NULL), alumnos de 1º A mantienen asignación a clase.

* **CA6 (No hay cambios - botón deshabilitado):** Dado que abro formulario y NO cambio nada, cuando intento guardar, entonces botón Guardar está deshabilitado o muestra mensaje "Sin cambios realizados".

* **CA7 (Concurrencia - profesor editado por otro):** Dado que otro usuario edita mismo profesor mientras yo edito, cuando intento guardar, entonces error "Profesor actualizado por otro usuario" con opción recargar.

* **CA8 (Profesor borrado mientras se edita):** Dado que otro usuario borra profesor mientras yo lo edito, cuando intento guardar, entonces error "Este profesor ha sido eliminado" y formulario cierra.

* **CA9 (Validación clase existe y sin tutor):** Dado que intento asignar profesor a clase que no existe, cuando guardo, entonces error "Clase no existe". Dado que intento asignar a clase que ya tiene tutor, entonces error "Esta clase ya tiene tutor asignado".

* **CA10 (Transacción atómica):** Dado que se inicia guardado con múltiples cambios, cuando algo falla (BD error, timeout), entonces ROLLBACK: nada se guarda y error claro "No se pudo guardar. Intenta de nuevo".

* **CA11 (Confirmación al cancelar):** Dado que cambio datos y presiono Cancelar, cuando hay cambios sin guardar, entonces confirmación "Descartar cambios?" con botones Descartar | Volver a editar.

* **CA12 (Aislamiento entre colegios):** Dado que soy usuario de un colegio, cuando intento editar vía API un profesor de otro colegio, entonces recibo `404 NOT_FOUND` y el profesor no se modifica.

* **CA13 (Validación - mínimo 1 asignatura):** Dado que intento desseleccionar todas las asignaturas (dejar multiselect vacío), cuando intento guardar, entonces error "Debe seleccionar al menos 1 asignatura" y cambios no se guardan.

* **CA14 (Impacto cascada en US-PROF-ASSIGN):** Dado que edito profesor y cambio asignaturas [Inglés, Arts] a [Inglés], cuando guardo, entonces si existe asignación en US-PROF-ASSIGN de profesor+Arts+curso, esa asignación se marca NEEDS_REVIEW (requiere revisión).

* **CA15 (Cambiar el cargo):** Dado que edito un profesor sin cargo, cuando le asigno "Director" y guardo, entonces el profesor queda con ese cargo; y si después se lo quito, queda sin cargo.

**Requisitos Técnicos:**
* Frontend: Componentes EditProfessorForm (campos), NameInput/LastNameInput (validación inline), SubjectsCheckboxList (multiselect, mínimo 1), ClassDropdown (clases disponibles), SubmitButton (deshabilitado si sin cambios), ConfirmationDialog (cancelar con cambios). API: GET /api/professors/:id, PUT /api/professors/:id.
* Backend: Rutas GET /api/professors/:id (obtener profesor con asignaturas relación de professor_subjects) y PUT /api/professors/:id (actualizar) con autenticación (usuario `ADMIN` o `MEMBER`; filtra por el colegio del usuario), validación firstName/lastName/subjectIds (mínimo 1, máximo N)/classId/position, transacción BD: DELETE professor_subjects + INSERT nuevos + UPDATE profesor, ROLLBACK si falla. Si cambios en asignaturas: consultar tabla professor_assignments y marcar NEEDS_REVIEW si hay conflictos. Response: { professor: { id, firstName, lastName, subjectIds, subjects, classId }, warnings: [...] }.
* BD: Tabla professors. Tabla professor_subjects (DELETE todos + INSERT nuevos). Si existe tabla professor_assignments: UPDATE status = 'NEEDS_REVIEW' donde profesorId = ? AND subjectId NOT IN (nuevasAsignaturas). Transacción garantiza consistencia.

**Decisiones Tomadas:**
| Decisión | Justificación |
|----------|---------------|
| **Campos editables** | Nombre, Apellido, Asignaturas (multiselect), Clase (tutor) |
| **Campos NO editables** | ID, Status, Fechas, Email |
| **Asignaturas mínimo 1** | Profesor debe poder enseñar algo |
| **Cambio asignaturas cascada** | Marcar assignments NEEDS_REVIEW si profesor pierde asignatura |
| **DELETE + INSERT profesor_subjects** | Cambia completamente set de asignaturas (más limpio que UPDATE) |
| **Quitar tutoría** | Alumnos mantienen clase, clase sin tutor |
| **Un tutor por clase** | Restricción heredada US09 |
| **Transacción atómica** | ROLLBACK si falla, TODO o NOTHING |
| **Validación inline** | Frontend + backend |
| **Botón Guardar si sin cambios** | Deshabilitado (double-submit protection) |
| **Concurrencia** | Error si otro usuario edita |
| **Profesor borrado** | Error 404 + cerrar formulario |
| **Confirmación Cancelar** | Sí, si hay cambios |
| **Permisos** | Cualquier usuario del colegio (`ADMIN` o `MEMBER`) |
| **Email en edición** | NO incluir en MVP |

### US13: Borrar profesor

**Épica:** [3. Gestión de Profesores](#epica-3-gestion-de-profesores)

**Historia:** Como usuario del colegio, quiero borrar un profesor del sistema para eliminar registros de docentes que ya no trabajan en el colegio.

> **Nota (US05, 2026-10-19):** la cascada que describía US05 (CA11 antiguo) es de esta historia: al borrar un profesor, sus clases quedan «Sin tutor» (`tutor_id` a `NULL`) y se retira de los horarios en los que esté asignado.

**Casos de uso y reglas de negocio:**

* **Acceso a borrado:** Botón "Borrar" en listado de profesores (US10). Cualquier usuario del colegio (`ADMIN` o `MEMBER`) puede borrar. Abre diálogo de confirmación.

* **Restricción: profesor tutoriza clase:** Si profesor tutoriza una clase (classId != NULL): SÀ se puede borrar. Diálogo muestra advertencia clara: "Este profesor tutoriza: [Curso] [Clase] ([N] alumnos). La clase quedará sin tutor. Los alumnos mantendrán su asignación de clase". Botón Confirmar habilitado. Usuario confirma explícitamente conociendo el impacto.

* **Profesor sin tutoría:** Si profesor NO tutoriza (classId IS NULL): se borra sin restricción.

* **Diálogo de confirmación:** Muestra nombre del profesor: "Â¿Eliminar profesor [Nombre]?". Si tutoriza: mostrar advertencia detallada + impacto. Si sin tutoría: mostrar solo nombre. Texto: "Esta acción no se puede deshacer". Botones: Cancelar | Confirmar (ambos habilitados, advertencia es mecanismo de protección).

* **Integridad referencial:** Si profesor tutoriza: UPDATE classes SET tutor_id = NULL (clase queda sin tutor). Alumnos mantienen asignación a clase (enrollments no cambian). Vista US06: clase muestra ✗

* **Transacción atómica:** Si falla: ROLLBACK (nada se borra). Error claro: "No se pudo eliminar el profesor. Intenta de nuevo".

* **Rate limiting:** Máximo 10 borrados/min por usuario.

* **Permisos:** Cualquier usuario del colegio (`ADMIN` o `MEMBER`). Un profesor de otro colegio responde `404 NOT_FOUND`.

* **Feedback post-borrado:** Diálogo cierra. Listado se actualiza inmediatamente. Toast: "Profesor eliminado correctamente". Búsqueda (US11) refleja cambio (<3 segundos).

* **Logging:** Evento PROFESSOR_DELETED con timestamp, usuario, nombre profesor (NO datos sensibles).

* **Loading state:** Botones deshabilitados, spinner "Eliminando profesor...".

**Criterios de Aceptación:**
* **CA1 (Diálogo de confirmación):** Dado que veo listado de profesores, cuando hago clic en botón "Borrar" para un profesor, entonces se abre diálogo mostrando "Â¿Eliminar profesor [Nombre]?" con texto "Esta acción no se puede deshacer" y botones Cancelar | Confirmar.

* **CA2 (Borrar profesor sin tutoría):** Dado que confirmo eliminación de profesor que NO tutoriza, cuando presiono "Confirmar", entonces profesor se borra permanentemente del sistema, diálogo cierra, listado se actualiza, y toast muestra "Profesor eliminado correctamente".

* **CA3 (Borrar profesor que tutoriza - con advertencia):** Dado que intento borrar profesor que tutoriza clase "1º A" con 30 alumnos, cuando se abre diálogo, entonces aparece advertencia clara "Este profesor tutoriza: 1º A (30 alumnos). La clase quedará sin tutor. Los alumnos mantendrán su asignación de clase" + botón Confirmar habilitado.

* **CA4 (Confirmar borrado con advertencia):** Dado que veo advertencia de que profesor tutoriza, cuando presiono "Confirmar", entonces profesor se borra, clase queda sin tutor (tutor_id = NULL), alumnos mantienen asignación a clase, y listado se actualiza mostrando clase con ✗

* **CA5 (Transacción atómica):** Dado que se inicia borrado de profesor, cuando algo falla durante operación (BD error, timeout), entonces ROLLBACK: profesor NO se borra y error claro "No se pudo eliminar. Intenta de nuevo".

* **CA6 (Loading state durante borrado):** Dado que presiono "Confirmar" en diálogo, cuando se procesa borrado, entonces botones se deshabilitan, aparece spinner "Eliminando profesor...", y se previene doble clic.

* **CA7 (Rate limiting):** Dado que intento borrar más de 10 profesores en 1 minuto, cuando excedo límite, entonces error "Demasiadas eliminaciones. Intenta después" y borrado se bloquea temporalmente.

* **CA8 (Logging/auditoría):** Dado que se borra profesor "Juan García", cuando se completa operación, entonces se registra evento PROFESSOR_DELETED con timestamp, usuario que borró, nombre profesor (NO datos sensibles).

* **CA9 (Sincronización post-borrado):** Dado que borro profesor mientras otro usuario lo ve en listado, cuando se completa borrado, entonces listado del otro usuario se actualiza en <3 segundos, profesor desaparece sin refresh manual.

* **CA10 (Profesor borrado mientras se edita):** Dado que otro usuario borra profesor mientras yo lo edito (US12), cuando intento guardar cambios, entonces error "Este profesor ha sido eliminado por otro usuario" y formulario edición cierra.

* **CA11 (Clase queda sin tutor - alumnos mantienen asignación):** Dado que borro profesor que tutoriza clase "1º A", cuando se completa borrado, entonces clase pierde tutor (tutor_id = NULL), alumnos de 1º A mantienen enrollments (no se desasignan), y US06 muestra clase con ✗

* **CA12 (Aislamiento entre colegios):** Dado que soy usuario de un colegio, cuando intento borrar vía API un profesor de otro colegio, entonces recibo `404 NOT_FOUND` y el profesor no se borra.

**Requisitos Técnicos:**
* Frontend: Componentes DeleteProfessorDialog (modal confirmación), ConfirmationMessage (nombre + advertencia si tutoriza), LoadingOverlay (spinner), NotificationToast (éxito/error). API: DELETE /api/professors/:id.
* Backend: Ruta DELETE /api/professors/:id con autenticación (usuario `ADMIN` o `MEMBER`; filtra por el colegio del usuario). Transacción: si tutoriza, UPDATE classes SET tutor_id = NULL; luego DELETE FROM professors. ROLLBACK si falla. Response: { message, hadTutorship }.
* BD: Transacción desasigna tutor explícitamente. Alumnos no se modifican (enrollments mantienen class_id). Clase queda sin tutor (tutor_id = NULL).

**Decisiones Tomadas:**
| Decisión | Justificación |
|----------|---------------|
| **Permitir si tutoriza** | Advertencia clara + confirmación en diálogo, desasignar tutor |
| **Clase sin tutor** | Alumnos mantienen asignación, clase con ✗
| **Transacción atómica** | ROLLBACK si falla, TODO o NOTHING |
| **Desasignar tutor explícito** | Transacción atómica, claridad de impacto |
| **Rate limiting 10/min** | Prevención de abuso |
| **Logging PROFESSOR_DELETED** | Auditoría y compliance |
| **Sincronización <3s** | Balance: actualizaciones cerca real-time |
| **Permisos: cualquier usuario del colegio** | Coherencia con US09/US10/US12 |
| **Loading state** | UX: usuario ve operación en curso |
| **Advertencia clara** | Mecanismo de protección contra borrados accidentales |

---

## Módulo: Gestión de Alumnos

### US14: Crear alumno

**Épica:** [4. Gestión de Alumnos](#epica-4-gestion-de-alumnos)

**Historia:** Como usuario del colegio, quiero crear un alumno indicando su nombre, apellido, curso, clase (opcional), inscripción a comedor y observaciones, para registrar a los estudiantes del colegio.

> **Nota (US06, 2026-10-19):** el listado de `/cursos` no muestra alumnos: esta historia (o la del listado de alumnos) añade el número de alumnos de cada curso y de cada clase.

**Casos de uso y reglas de negocio:**

* **Acceso a creación:** Cualquier usuario del colegio (`ADMIN` o `MEMBER`) puede crear alumnos. Botón "Crear Alumno" en listado de alumnos (US15). Se abre formulario con campos: nombre, apellido, curso, clase, inscrito comedor, tipo comida, beca, observaciones.

* **Campos obligatorios:** Nombre (obligatorio), Apellido (obligatorio), Curso (obligatorio - dropdown de cursos), Clase (OPCIONAL - dropdown dinámico según curso seleccionado), Inscrito a comedor (obligatorio sí/no).

* **Campos opcionales:** Tipo de comida (string 255 chars, solo si inscrito=sí), Beca (solo si inscrito=sí), Observaciones (blob 5000 chars máximo).

* **Validación nombre/apellido:** Heredadas de US09 (alfanuméricos + acentos + guiones + apóstrofos + espacios, 100 chars máximo, no solo espacios, sin validar unicidad).

* **Asignación Curso/Clase en dos pasos:** Paso 1: Seleccionar CURSO (obligatorio, dropdown de cursos ACTIVE). Paso 2: Seleccionar CLASE (opcional, dropdown con clases del curso seleccionado). Si no se selecciona clase: alumno asignado a curso pero sin clase (class_id = NULL). Dropdown de clases se actualiza dinámicamente al cambiar curso.

* **Tipo de comida:** Solo visible si inscrito = sí. String de texto libre (máximo 255 caracteres). Ejemplos: "Alérgico a frutos secos", "Vegetariano", "Sin gluten". Si inscrito = no: tipo_comida = NULL.

* **Observaciones:** Campo blob/textarea, OPCIONAL (máximo 5000 caracteres). Para notas sobre alumno ("Necesita apoyo", "Trabaja medio tiempo", etc.). Visible siempre.

* **Estado del alumno:** Alumno se crea en estado ACTIVE automáticamente.

* **Permisos:** Cualquier usuario del colegio (`ADMIN` o `MEMBER`); el alumno se crea en su colegio. Sin sesión iniciada, la API responde `401`.

* **Transacción atómica:** Si falla durante creación: ROLLBACK (alumno no se crea). Error claro: "No se pudo crear el alumno. Intenta de nuevo".

* **Feedback post-creación:** Formulario cierra. Listado se actualiza inmediatamente. Toast: "Alumno creado correctamente". Listado se filtra por curso del alumno.

**Criterios de Aceptación:**
* **CA1 (Crear alumno exitoso):** Dado que completo formulario con nombre "Juan", apellido "García", curso "1º Primaria", clase "A", inscrito "Sí", beca "Sí", tipo comida "Normal", observaciones "Alumno aplicado", entonces alumno se crea en estado ACTIVE.

* **CA2 (Nombre y apellido obligatorios):** Dado que intento crear sin nombre o sin apellido, entonces veo error "Nombre y apellido son obligatorios".

* **CA3 (Curso obligatorio):** Dado que intento crear sin seleccionar curso, entonces veo error "Curso es obligatorio".

* **CA3b (Clase OPCIONAL):** Dado que creo alumno sin seleccionar clase (solo curso), entonces alumno se crea con class_id = NULL (sin clase específica).

* **CA4 (Beca solo si inscrito):** Dado que marco inscrito = "No", entonces campo beca se deshabilita y si guardo, beca = NULL.

* **CA5 (Tipo de comida solo si inscrito):** Dado que marco inscrito = "No", entonces campo "tipo de comida" se deshabilita y si guardo, tipo_comida = NULL.

* **CA5b (Tipo de comida se guarda):** Dado que creo alumno con inscrito = "Sí" y tipo comida = "Vegetariano", entonces tipo_comida se almacena en BD.

* **CA6 (Observaciones se guardan):** Dado que completo observaciones con "Alumno con excelente rendimiento", entonces observaciones se almacenan (hasta 5000 caracteres).

* **CA7 (Clases dinámicas según curso):** Dado que selecciono curso "1º Primaria", cuando veo dropdown de clases, entonces muestro solo clases de 1º Primaria ("A", "B", "C"). Dado que cambio a curso "2º Primaria", entonces dropdown se actualiza.

* **CA8 (Alumno aparece en listado):** Dado que creo alumno "Juan García" en curso "1º Primaria", clase "A", entonces aparece en listado filtrado por 1º A: "Juan García | 1º Primaria A | Inscrito a comedor: Sí".

* **CA9 (Caracteres especiales permitidos):** Dado que creo alumno con nombre "José María García-López", entonces se acepta (acentos, guiones permitidos).

* **CA10 (Nombre no solo espacios):** Dado que intento crear con nombre "     ", entonces error "Nombre debe contener caracteres alfanuméricos".

* **CA11 (Validar curso existe):** Dado que intento asignar alumno a curso que no existe, entonces error "Curso no encontrado".

* **CA12 (Validar clase si está seleccionada):** Dado que intento asignar a clase inexistente pero curso válido, entonces error "Clase no encontrada".

* **CA13 (Double-submit protection):** Dado que presiono botón Guardar, cuando se procesa creación, entonces botón se deshabilita, spinner aparece, se previene doble clic.

* **CA14 (Transacción atómica):** Dado que se inicia creación de alumno, cuando algo falla (BD error), entonces ROLLBACK: alumno NO se crea, error "No se pudo crear el alumno".

* **CA15 (Acceso de cualquier usuario del colegio):** Dado que soy `MEMBER`, cuando creo un alumno, entonces se crea en mi colegio igual que si fuera `ADMIN`; sin sesión iniciada, la API responde `401`.

* **CA16 (Validación inline en tiempo real):** Dado que escribo caracteres inválidos en nombre, entonces veo error inline en rojo en tiempo real.

* **CA17 (Observaciones máximo 5000 chars):** Dado que escribo más de 5000 caracteres en observaciones, entonces error "Máximo 5000 caracteres".

**Requisitos Técnicos:**
* Frontend: Componentes CreateStudentForm, NameInput/LastNameInput (validación inline), CourseDropdown (dinámico), ClassDropdown (dinámico según curso), CafeteriaToggle, FoodTypeInput (habilitado si inscrito, máximo 255), ScholarshipToggle (deshabilitado si inscrito=no), ObservationsTextarea (máximo 5000), SubmitButton (deshabilitado mientras guarda), NotificationToast.
* Backend: POST /api/students con autenticación (usuario `ADMIN` o `MEMBER`; el alumno se crea en el colegio del usuario), validación firstName/lastName, courseId (obligatorio), classId (opcional, debe pertenecer a courseId si existe), cafeteria, foodType (máximo 255 si cafeteria=true, else null), scholarship (null si cafeteria=false), observations (máximo 5000). Transacción atómica, ROLLBACK si falla. Response: { student: { id, firstName, lastName, courseId, classId, cafeteria, scholarship, foodType, observations, status } }.
* BD: Tabla students con: id, firstName, lastName, courseId, classId (nullable), cafeteria (bool), scholarship (bool/nullable), foodType (varchar 255, nullable), observations (longtext, nullable), status, created_at. Foreign keys: courseId ✗

**Decisiones Tomadas:**
| Decisión | Justificación |
|----------|---------------|
| **Curso obligatorio, Clase opcional** | Flexibilidad: alumno sin clase específica permitido |
| **Dos dropdowns dinámicos** | Curso filtra clases disponibles automáticamente |
| **Tipo de comida + Observaciones** | Campos adicionales para contexto alumno |
| **Validación heredada US09** | Consistencia en formato nombre/apellido |
| **Transacción atómica** | Integridad: TODO o NOTHING |
| **Permisos: cualquier usuario del colegio** | `ADMIN` y `MEMBER` crean alumnos |
| **Observaciones 5000 chars** | Limite práctico para notas extensas |

### US15: Ver listado de alumnos con filtros múltiples

**Épica:** [4. Gestión de Alumnos](#epica-4-gestion-de-alumnos)

**Historia:** Como usuario del colegio, quiero ver el listado de alumnos filtrado por nombre, apellido, curso, clase, comedor o beca, para gestionar los grupos de forma organizada.

**Casos de uso y reglas de negocio:**

* **Acceso al listado:** Cualquier usuario del colegio (`ADMIN` o `MEMBER`) puede ver el listado, que solo incluye los alumnos de su colegio. Acceso desde menú principal o sección "Gestión de Alumnos".

* **Contenido del listado:** Muestra TODOS los alumnos en estado ACTIVE. Tabla con columnas: Nombre | Apellido | Curso | Clase | Comedor | Acciones. Ordenado alfabéticamente A-Z por nombre + apellido. Paginación: 20 alumnos/página si >20.

* **Filtros disponibles (todos OPCIONALES y COMBINABLES):**
  - **Nombre**: Input text, búsqueda parcial case-insensitive, ignora acentos.
  - **Apellido**: Input text, búsqueda parcial case-insensitive, ignora acentos.
  - **Curso**: Dropdown de cursos disponibles.
  - **Clase**: Dropdown de clases (dinámico si Curso seleccionado; todas si sin Curso).
  - **Comedor**: Dropdown "Ver todos | Inscrito | No inscrito".
  - **Beca**: Dropdown "Ver todos | Con beca | Sin beca" (solo si Comedor="Inscrito").

* **Comportamiento de filtros:** Todos los filtros son opcionales e independientes. Nombre y Apellido: búsqueda substring case-insensitive. Clase: puede seleccionarse sin Curso. Beca: deshabilitado si Comedor="No inscrito". Filtros persistentes en URL (?name=Juan&course=1&class=2&cafeteria=true&scholarship=true).

* **Listado vacío:** Si sin alumnos: "No hay alumnos registrados" con CTA crear. Si filtros sin resultados: "No hay alumnos que coincidan con los filtros" con opción limpiar.

* **Botones de acción:** Editar (abre US17) | Borrar (abre US18).

* **Responsive design:** Desktop: tabla horizontal. Móvil: cards apilados.

* **Sincronización:** Listado se actualiza automáticamente <3 segundos cuando se crea/edita/borra alumno.

* **Permisos:** Cualquier usuario del colegio (`ADMIN` o `MEMBER`). Sin sesión iniciada, la API responde `401`.

**Criterios de Aceptación:**
* **CA1 (Listado completo):** Dado que accedo a gestión de alumnos, cuando carga la página, entonces veo listado de todos los alumnos ACTIVE ordenados A-Z por nombre + apellido.

* **CA2 (Filtrar por Nombre):** Dado que escribo "Juan" en campo Nombre, entonces listado se filtra mostrando alumnos con "Juan" en nombre (búsqueda parcial, case-insensitive).

* **CA3 (Filtrar por Apellido):** Dado que escribo "García" en campo Apellido, entonces listado se filtra mostrando alumnos con "García" en apellido (case-insensitive, ignora acentos).

* **CA4 (Filtrar por Curso):** Dado que selecciono Curso "1º Primaria", entonces listado filtra solo alumnos de ese curso.

* **CA5 (Filtrar por Clase):** Dado que selecciono Clase "A", entonces listado filtra solo alumnos de Clase "A" (dinámico si Curso; todas si sin Curso).

* **CA6 (Filtrar por Comedor - Inscrito):** Dado que selecciono Comedor "Inscrito", entonces listado filtra solo alumnos inscritos a comedor.

* **CA7 (Filtrar por Comedor - No inscrito):** Dado que selecciono Comedor "No inscrito", entonces listado filtra solo alumnos NO inscritos a comedor.

* **CA8 (Filtrar por Beca - Con beca):** Dado que selecciono Comedor "Inscrito" y Beca "Con beca", entonces listado filtra alumnos inscritos a comedor Y con beca.

* **CA9 (Filtrar por Beca - Sin beca):** Dado que selecciono Comedor "Inscrito" y Beca "Sin beca", entonces listado filtra alumnos inscritos a comedor PERO sin beca.

* **CA10 (Beca deshabilitada si Comedor=No inscrito):** Dado que selecciono Comedor "No inscrito", cuando veo dropdown Beca, entonces está deshabilitado (beca no aplica).

* **CA11 (Filtros combinables):** Dado que selecciono Nombre "Juan" + Curso "1º" + Comedor "Inscrito", entonces listado filtra: alumnos con "Juan" EN Curso 1º e inscritos a comedor.

* **CA12 (Alumno sin Clase):** Dado que alumno sin Clase específica, cuando veo listado, entonces aparece fila: "Nombre | Apellido | Curso | Sin clase | Comedor | Acciones".

* **CA13 (Listado vacío con filtros):** Dado que filtro por Nombre "Zzzzz" sin resultados, entonces aparece "No hay alumnos que coincidan con los filtros" con opción "Limpiar filtros".

* **CA14 (Paginación):** Dado que hay 50 alumnos en resultados, entonces muestra primeros 20 con controles: Anterior | Página 1 de 3 | Siguiente e indicador "Mostrando 20 de 50".

* **CA15 (Botones de acción):** Dado que veo fila alumno, entonces aparecen botones: Editar (abre US17) | Borrar (abre US18).

* **CA16 (Acceso y aislamiento):** Dado que soy `MEMBER` de un colegio, cuando accedo al listado, entonces veo los alumnos de mi colegio y ninguno de otro colegio; sin sesión iniciada, la API responde `401`.

* **CA17 (Responsive):** Dado que veo en desktop, entonces tabla horizontal. Dado que veo en móvil, entonces cards apilados.

* **CA18 (Sincronización):** Dado que estoy viendo listado, cuando otro usuario crea/edita/borra alumno, entonces listado se actualiza en <3 segundos.

**Requisitos Técnicos:**
* Frontend: Componentes StudentList, StudentTable (desktop), StudentCard (móvil), FilterBar (barra de filtros), NameInput, LastNameInput, CourseDropdown, ClassDropdown, CafeteriaDropdown, ScholarshipDropdown, Pagination, EmptyState. API: GET /api/students?name=X&lastName=Y&course=Z&class=W&cafeteria=true&scholarship=true&page=1&limit=20.
* Backend: GET /api/students con autenticación (usuario `ADMIN` o `MEMBER`; filtra por el colegio del usuario), filtros opcionales (name, lastName, courseId, classId, cafeteria, scholarship), búsqueda case-insensitive, ignora acentos en nombre/apellido, paginación LIMIT 20. Response: { students, pagination }.
* BD: Búsqueda LOWER(firstName/lastName) LIKE, índices en firstName, lastName, courseId, classId, cafeteria, scholarship.

**Decisiones Tomadas:**
| Decisión | Justificación |
|----------|---------------|
| **Todos los filtros OPCIONALES** | Máxima flexibilidad, cada filtro independiente |
| **Nombre/Apellido texto libre** | UX: más rápido que dropdowns |
| **Búsqueda case-insensitive** | Usuario no piensa en mayúsculas |
| **Búsqueda parcial** | Más flexible que exacta |
| **Clase sin requerir Curso** | Alumno filtrable directamente por clase |
| **Beca condicional a Comedor** | Beca solo relevante si inscrito |
| **Filtros en URL** | Persistencia y compartibilidad |
| **18 CAs** | Cobertura completa de 6 filtros |

### US16: Filtrar alumnos por nombre o apellido

**Épica:** [4. Gestión de Alumnos](#epica-4-gestion-de-alumnos)

**STATUS:** ✗

---

### US17: Editar alumno

**Épica:** [4. Gestión de Alumnos](#epica-4-gestion-de-alumnos)

**Historia:** Como usuario del colegio, quiero editar los datos de un alumno (nombre, apellido, curso, clase, comedor, tipo comida, beca, observaciones) para mantener su información actualizada.

**Casos de Uso:**
* Botón "Editar" en listado de alumnos (US15).
* Cualquier usuario del colegio (`ADMIN` o `MEMBER`) puede editar los alumnos de su colegio.
* Abre modal o página con formulario edición.
* Un alumno de otro colegio responde `404 NOT_FOUND`; sin sesión iniciada, la API responde `401`.

**Campos Editables:**
* Nombre, Apellido: alfanuméricos + acentos + guiones + apóstrofos + espacios, 100 chars máximo (heredado US14).
* Curso: dropdown de cursos ACTIVE, cambiar resetea Clase a NULL.
* Clase: dropdown dinámico de clases del Curso, OPCIONAL (se puede dejar NULL).
* Inscrito a comedor: sí/no; si cambia a "No", Beca y Tipo comida se resetean a NULL.
* Tipo de comida: string 255 chars, OPCIONAL (solo si Inscrito=sí).
* Beca: sí/no, OPCIONAL (solo si Inscrito=sí).
* Observaciones: blob 5000 chars máximo, OPCIONAL.

**Campos NO Editables:** ID, Status, created_at, updated_at.

**Reglas de Negocio:**
* **Cambio Curso:** Clase se resetea automáticamente a NULL.
* **Cambio Comedor Sí✗
* **Cambio Comedor No✗
* **Botón Guardar:** Deshabilitado si no hay cambios (comparar original vs actual).
* **Concurrencia - Alumno editado:** Error "Alumno actualizado por otro usuario" con opción recargar.
* **Concurrencia - Alumno borrado:** Error 404 "Alumno no encontrado", cerrar formulario.
* **Validación Clase:** Si existe, debe pertenecer al Curso seleccionado.
* **Transacción atómica:** ROLLBACK si algo falla, TODO o NOTHING (sin cambios parciales).
* **Cancelación:** Si cambios sin guardar, confirmar "Â¿Descartar cambios?".
* **Feedback post-edición:** Formulario cierra, listado se actualiza (<3s), toast "Alumno actualizado correctamente".

**Criterios de Aceptación (16 CAs):**
* **CA1 (Abrir formulario):** Dado que veo listado de alumnos, cuando hago clic en "Editar", entonces se abre modal/página con formulario con campos: Nombre | Apellido | Curso | Clase | Comedor | Tipo comida | Beca | Observaciones, con valores actuales precargados.
* **CA2 (Cambiar Nombre/Apellido):** Dado que cambio nombre de "Juan" a "Juanito", cuando valido inline y guardo, entonces se actualiza en BD.
* **CA3 (Cambiar Curso):** Dado que cambio Curso de "1º Primaria" a "2º Primaria", cuando guardo, entonces Curso se actualiza y Clase se resetea a NULL.
* **CA4 (Cambiar Clase):** Dado que cambio Clase de "A" a "B" (mismo Curso), cuando guardo, entonces Clase se actualiza.
* **CA5 (Quitar Clase):** Dado que alumno con Clase "A", cuando dejo Clase NULL, entonces alumno queda sin Clase asignada.
* **CA6 (Cambiar Comedor Sí):** Dado que cambio Comedor de "No" a "Sí", cuando veo formulario, entonces campos Tipo comida y Beca se habilitan.
* **CA7 (Cambiar Comedor No):** Dado que cambio Comedor de "Sí" a "No", cuando guardo, entonces Beca = NULL y Tipo comida = NULL automáticamente.
* **CA8 (Cambiar Beca):** Dado que cambio Beca de "No" a "Sí" (si Comedor=Sí), cuando guardo, entonces Beca se actualiza.
* **CA9 (Editar Observaciones):** Dado que escribo en Observaciones, cuando guardo, entonces se actualiza (máximo 5000 chars).
* **CA10 (Sin cambios):** Dado que abro formulario sin cambiar nada, cuando intento guardar, entonces botón Guardar está deshabilitado o muestra "Sin cambios realizados".
* **CA11 (Concurrencia - editado):** Dado que otro usuario edita mismo alumno mientras yo edito, cuando intento guardar, entonces error "Alumno actualizado por otro usuario" con opción recargar.
* **CA12 (Concurrencia - borrado):** Dado que otro usuario borra alumno mientras yo lo edito, cuando intento guardar, entonces error 404 "Alumno no encontrado" y formulario cierra.
* **CA13 (Validación Clase vs Curso):** Dado que Clase no pertenece al Curso, cuando guardo, entonces error "Clase no pertenece a este Curso".
* **CA14 (Transacción atómica):** Dado que falla BD durante guardado, cuando intento guardar, entonces ROLLBACK: alumno NO se modifica, error "No se pudo guardar los cambios".
* **CA15 (Acceso y aislamiento):** Dado que soy `MEMBER`, cuando edito un alumno de mi colegio, entonces se permite; y cuando intento editar vía API un alumno de otro colegio, recibo `404 NOT_FOUND` y no se modifica.
* **CA16 (Validación inline):** Dado que escribo caracteres inválidos, cuando escribo, entonces veo error inline en rojo en tiempo real.

**Requisitos Técnicos:**
* **Frontend:** Componentes EditStudentForm, NameInput, LastNameInput, CourseDropdown (dinámico), ClassDropdown (dinámico), CafeteriaToggle, FoodTypeInput (habilitado si inscrito), ScholarshipToggle (deshabilitado si inscrito=false), ObservationsTextarea (máximo 5000), SubmitButton (deshabilitado si sin cambios), ConfirmationDialog. API: GET /api/students/:id, PUT /api/students/:id. Estado (React): originalData, formData, hasChanges, loading, error. Lógica: Detectar cambios, botón deshabilitado si hasChanges=false, si Comedor=false deshabilitar Beca/Tipo comida, si Curso cambia recargar clases + resetear Clase, validación inline onChange, confirmación Cancelar si cambios.
* **Backend:** Rutas GET /api/students/:id (obtener alumno actual, validar permiso), PUT /api/students/:id (actualizar, validar permiso, payload firstName, lastName, courseId, classId nullable, cafeteria, scholarship nullable, foodType nullable, observations nullable). Validación Vine: firstName, lastName requeridos, caracteres válidos, no solo espacios; courseId obligatorio, debe existir; classId opcional, si existe debe pertenecer a courseId; cafeteria obligatorio; si cafeteria=false, scholarship y foodType deben ser null; observations máximo 5000 chars. Controlador: validar permiso, obtener alumno actual (verificar concurrencia), validar payload, validar courseId existe, validar classId pertenece a courseId, validar cafeteria✗
* **BD:** Tabla students existente, transacción para consistencia, foreign keys courseId ✗

**Decisiones Clave:**
| Decisión | Justificación |
|----------|---------------|
| Campos editables | Nombre, Apellido, Curso, Clase, Comedor, Tipo comida, Beca, Observaciones |
| Cambio Curso resetea Clase | UX: usuario debe seleccionar clase de nuevo curso |
| Beca NULL si Comedor=No | Beca no aplica si no inscrito |
| Validación heredada US14 | Consistencia nombre/apellido |
| Transacción atómica | Integridad: TODO o NOTHING |
| Botón Guardar si sin cambios | Deshabilitado (double-submit protection) |
| Concurrencia | Error si otro usuario edita/borra |
| Permisos | Cualquier usuario del colegio (`ADMIN` o `MEMBER`) |
| Confirmación Cancelar | Si cambios sin guardar |

**Dependencias:** Depende de US15 (botón "Editar" en listado), US14 (alumnos creados), US18 (borrar alumno). Integración con US15: cambios reflejan en listado/filtros.

**Riesgos y Mitigaciones:**
* SQL Injection: Parametrized queries (Lucid ORM), Vine validation.
* XSS: React escapa automáticamente, validación backend.
* Clase no pertenece a Curso: Validación clase pertenece antes UPDATE.
* Concurrencia: Comparar versión actual vs BD antes guardar.
* Clase desaparece: Validar clase EXISTS justo antes UPDATE.

### US18: Borrar alumno

**Épica:** [4. Gestión de Alumnos](#epica-4-gestion-de-alumnos)

**Historia:** Como usuario del colegio, quiero borrar un alumno del sistema para eliminar registros de estudiantes que ya no están en el colegio.

**Casos de Uso:**
* Botón "Borrar" (papelera roja) en listado de alumnos (US15).
* Opcionalmente: botón "Borrar" en formulario edición (US17).
* Cualquier usuario del colegio (`ADMIN` o `MEMBER`) puede borrar los alumnos de su colegio.
* Un alumno de otro colegio responde `404 NOT_FOUND`; sin sesión iniciada, la API responde `401`.

**Diálogo de Confirmación:**
* Muestra nombre del alumno: "Â¿Borrar a [Nombre Apellido]?"
* Texto advertencia: "Esta acción no se puede deshacer"
* Si alumno tiene registros de comedor: "Se eliminarán X registros de comedor"
* Botones: Cancelar (gris) | Confirmar Borrado (rojo/peligroso)
* Usuario debe hacer clic adicional en "Confirmar" (doble confirmación).

**Reglas de Negocio:**
* **Borrado en cascada:** Alumno se borra completamente (hard delete). Registros de comedor se borran automáticamente (ON DELETE CASCADE).
* **Borrado permanente:** No hay undo/restore. Borrado es irreversible.
* **Transacción atómica:** Alumno + registros comedor se borran juntos. Si algo falla: ROLLBACK (nada se modifica).
* **Validaciones pre-borrado:** Alumno debe existir (error 404 si no). El alumno debe ser del colegio del usuario (error 404 si no). Si ok: mostrar diálogo.
* **Concurrencia - Alumno ya borrado:** Si otro usuario borra alumno mientras yo confirmo: error "Alumno ya fue eliminado" o 404.
* **Sincronización post-borrado:** Diálogo cierra automáticamente. Listado se actualiza (<3s). Alumno desaparece de resultados y filtros. Toast: "Alumno eliminado correctamente".
* **Cancelación:** Si presiona "Cancelar": diálogo cierra, alumno permanece sin cambios.
* **Permisos:** Cualquier usuario del colegio (`ADMIN` o `MEMBER`). Un alumno de otro colegio responde `404 NOT_FOUND`.

**Criterios de Aceptación (12 CAs):**
* **CA1 (Botón visible):** Dado que soy usuario del colegio, cuando veo listado, entonces veo botón "Borrar" (papelera roja) en cada fila, habilitado.
* **CA2 (Aislamiento entre colegios):** Dado que soy usuario de un colegio, cuando intento borrar vía API un alumno de otro colegio, entonces recibo `404 NOT_FOUND` y el alumno no se borra.
* **CA3 (Abrir diálogo):** Dado que hago clic en "Borrar" para un alumno, cuando se abre diálogo, entonces muestra: "Â¿Borrar a [Nombre Apellido]?" + "Esta acción no se puede deshacer" + botones Cancelar | Confirmar Borrado.
* **CA4 (Preview comedor):** Dado que alumno tiene 5 registros de comedor, cuando abro diálogo, entonces muestra "Se eliminarán 5 registros de comedor".
* **CA5 (Cancelar):** Dado que abro diálogo, cuando hago clic en "Cancelar", entonces diálogo cierra sin borrar, alumno permanece en BD.
* **CA6 (Confirmar sin comedor):** Dado que confirmo borrado de alumno sin registros comedor, cuando presiono "Confirmar Borrado", entonces alumno se borra, diálogo cierra, listado se actualiza, toast "Alumno eliminado correctamente".
* **CA7 (Confirmar con comedor):** Dado que alumno tiene 10 registros de comedor, cuando confirmo borrado, entonces alumno se borra, registros comedor también se borran (ON DELETE CASCADE), listado actualiza.
* **CA8 (Error 404):** Dado que intento borrar alumno que fue borrado por otro, cuando intento confirmar, entonces error "Alumno no encontrado" (404), diálogo cierra.
* **CA9 (Transacción atómica):** Dado que BD falla durante borrado, cuando intento confirmar, entonces ROLLBACK: alumno NO se borra, error "No se pudo eliminar al alumno. Intenta de nuevo".
* **CA10 (Sincronización listado):** Dado que estoy viendo listado, cuando otro usuario borra un alumno, entonces listado se actualiza automáticamente (<3s) y alumno desaparece de resultados y filtros.
* **CA11 (Sin sesión):** Dado que no he iniciado sesión, cuando intento borrar vía API (DELETE /api/students/:id), entonces recibo `401` y el alumno no se borra.
* **CA12 (Responsive mobile):** Dado que veo listado en móvil, cuando hago clic en "Borrar", entonces diálogo aparece full-screen o modal adaptativo con botones accesibles.

**Requisitos Técnicos:**
* **Frontend:** Componentes StudentList, DeleteButton (ícono papelera roja), ConfirmDeleteDialog (diálogo modal), ConfirmDeleteContent (texto, nombre, registros comedor), NotificationToast (éxito/error). API: DELETE /api/students/:id. Estado: studentToDelete, dialogOpen, loading, error. Lógica: clic "Borrar" abre diálogo, clic "Cancelar" cierra, clic "Confirmar" envía DELETE, actualiza listado.
* **Backend:** Ruta DELETE /api/students/:id (validar autenticación y que el alumno sea del colegio del usuario, obtener ID, validar alumno existe error 404, iniciar transacción, contar comedor, DELETE FROM students WHERE id, registros comedor borran automático ON DELETE CASCADE, COMMIT, si falla ROLLBACK, retornar { message: 'Alumno eliminado correctamente' }). Errores: 401 sin sesión, 404 si no existe o es de otro colegio, 500 si falla transacción. Validación: ID número positivo, alumno existe y es del colegio del usuario.
* **BD:** Tabla students con ON DELETE CASCADE a students_meals. Transacción para atomicidad.

**Decisiones Clave:**
| Decisión | Justificación |
|----------|---------------|
| Permisos | Cualquier usuario del colegio (`ADMIN` o `MEMBER`) |
| Hard delete | Permanente, sin undo en MVP |
| Cascada comedor | ON DELETE CASCADE, registros borran automático |
| Transacción atómica | Integridad: TODO o NOTHING |
| Diálogo confirmación | Previene accidentes, doble confirmación |
| Botón rojo | Señala peligro visual obvious |
| Sincronización <3s | Listado + filtros actualizan automático |
| Error 404 si no existe | Manejo race condition (otro usuario borró) |

**Dependencias:** Depende de US15 (botón en listado), US14 (alumnos creados), opcionalmente US17 (edición). Cascada automática con registros de comedor.

**Riesgos y Mitigaciones:**
* SQL Injection: Parametrized queries (Lucid ORM), validación número.
* Registros huérfanos: ON DELETE CASCADE, transacción atómica.
* Borrado accidental: Diálogo confirmación obligatorio, botón rojo, doble clic.
* Concurrencia: Error 404 si alumno ya borrado, diálogo cierra, listado recarga.
* Petición para un alumno de otro colegio: error 404 en el backend, como si no existiera.

---

## Módulo: Configuración de Horarios

### US-BASE: Configurar Calendario Base del Horario Escolar

**Épica:** [5. Configuración de Horarios (Base + Asignaturas + Restricciones)](#epica-5-configuracion-de-horarios-base--asignaturas--restricciones)

**Historia:** Como administrador del colegio, quiero configurar la estructura temporal del colegio (sesiones, horas, recreo) para que sirva como base de todos los horarios generados automáticamente.

---

#### Casos de Uso y Reglas de Negocio

* **Acceso a configuración:**
  * Menú: Configuración ✗
  * Solo los usuarios `ADMIN` pueden editarla; los `MEMBER` la ven en modo lectura (PRD §3.1)
  * Si un `MEMBER` intenta modificarla vía API: `403 FORBIDDEN`
  * Transacción atómica en todas las operaciones

* **Estructura del calendario:**
  * Un calendario por colegio (o por nivel: Primaria, Secundaria, Bachillerato)
  * Se aplica a TODOS los días laborales (Lunes-Viernes)
  * Todos los días tienen idéntica estructura
  * Recreo es sesión especial (no se rellena con asignatura)

* **Sesiones:**
  * Máximo 8 sesiones por día
  * Mínimo 1 sesión por día
  * Cada sesión tiene: hora inicio, hora fin, duración calculada
  * Duración máxima por sesión: 90 minutos
  * No puede haber solapamiento entre sesiones
  * No puede haber solapamiento entre sesión y recreo

* **Recreo:**
  * Opcional (puede no haber recreo)
  * Pueden haber uno o dos recreos
  * Duración máxima: 90 minutos
  * Posición: puede ir entre cualquier sesión (ej: después sesión 3)
  * Recreo NO se rellena con asignatura/profesor en horario final
  * Se visualiza con color/estilo diferente (gris, marcado como "RECREO")

* **Edición post-creación:**
  * Se puede editar cualquier sesión (hora, duración)
  * Se puede mover recreo
  * Se puede agregar/quitar sesión
  * Se puede borrar calendario
  * **IMPORTANTE:** Si calendario ya está en uso (horarios generados), permitir edición pero avisar y permitir que user continúe

* **Validaciones:**
  * No hay solapamientos
  * Duración sesión válida (positiva, ✗
  * Duración recreo válida (positiva, ✗
  * Hora inicio < Hora fin
  * Total de sesiones ✗

* **Permisos:**
  * `ADMIN`: CRUD
  * `MEMBER`: solo lectura (ver calendario)
  * `403 FORBIDDEN` si un `MEMBER` intenta modificarla

#### Criterios de Aceptación (18 CAs)

* **CA1 (Abrir formulario crear):** Dado que accedo a "Configurar Calendario Base", cuando hago clic en "Crear Nuevo", entonces se abre formulario vacío con campos: Nombre, Hora inicio, # Sesiones, Duración sesión, Â¿Recreo?, Posición recreo, Duración recreo.

* **CA2 (Auto-generación sesiones):** Dado que ingreso: hora inicio 09:00, 6 sesiones, 45 min cada una, recreo después sesión 3, cuando presiono "Generar Automático", entonces sistema calcula automáticamente cada sesión y recreo con horas corrrectas sin solapamientos.

* **CA3 (Validación duración sesión):** Dado que intento crear sesión con duración > 90 minutos, cuando guardo, entonces error "Sesión no puede durar más de 90 minutos".

* **CA4 (Validación duración recreo):** Dado que intento crear recreo con duración > 90 minutos, cuando guardo, entonces error "Recreo no puede durar más de 90 minutos".

* **CA5 (Validación solapamiento):** Dado que intento crear sesión 1: 09:00-09:50 y sesión 2: 09:30-10:15 (solapan), cuando guardo, entonces error "Sesión 2 solapa con Sesión 1".

* **CA6 (Validación recreo solapamiento):** Dado que intento crear recreo 11:00-11:30 pero sesión 4 es 10:45-11:15, cuando guardo, entonces error "Recreo solapa con Sesión 4".

* **CA7 (Validación max sesiones):** Dado que intento crear 9 sesiones, cuando guardo, entonces error "Máximo 8 sesiones permitidas".

* **CA8 (Validación hora inicio < fin):** Dado que intento crear sesión con inicio 10:00 y fin 09:00, cuando guardo, entonces error "Hora inicio debe ser menor que hora fin".

* **CA9 (Guardar calendario):** Dado que completé formulario correctamente (6 sesiones 45 min, recreo), cuando presiono "Guardar", entonces se crea calendario en BD, toast "Calendario creado exitosamente", formulario cierra.

* **CA10 (Ver listado calendarios):** Dado que accedo a "Calendario Base", cuando carga, entonces veo tabla con Nombre | Hora inicio | Hora fin | # Sesiones | Recreo | Status | Acciones, paginado (20 por página).

* **CA11 (Editar sesión individual):** Dado que veo calendario con sesión 1: 09:00-09:45, cuando hago clic en "Editar", entonces puedo cambiar hora inicio/fin, sistema valida no solapamientos, al guardar se actualiza.

* **CA12 (Editar después de crear):** Dado que calendario está creado y presiono "Editar", cuando calendario NO está en uso permite edición libre; cuando está EN USO muestra advertencia pero permite continuar.

* **CA13 (Mover recreo):** Dado que recreo está después sesión 3, cuando presiono "Mover recreo", entonces puedo seleccionar nueva posición, sistema recalcula sesiones posteriores, se valida no solapamientos.

* **CA14 (Agregar sesión):** Dado que calendario tiene 6 sesiones, cuando presiono "Agregar Sesión", entonces aparece fila nueva para sesión 7 con campos editables, al guardar se agrega.

* **CA15 (Quitar sesión):** Dado que calendario tiene 6 sesiones, cuando presiono "Quitar" en sesión 6, entonces confirmación, al confirmar sesión se elimina y posteriores se renumeran.

* **CA16 (Borrar calendario):** Dado que tengo calendario creado, cuando presiono "Borrar", entonces confirmación "Â¿Borrar calendario?", al confirmar se borra y horarios vinculados se marcan como NEEDS_REVIEW.

* **CA17 (Mostrar disponibilidad):** Dado que veo calendario con 6 sesiones À— 45 min + recreo 30 min, entonces se muestra "Total franjas útiles: 270 minutos = 4.5 horas/día" con comparación "25 franjas de 45 min disponibles".

* **CA18 (Permisos):** Dado que soy `MEMBER`, cuando accedo al calendario base, entonces puedo verlo pero no editarlo (botones deshabilitados), y si intento modificarlo vía API recibo `403 FORBIDDEN`.

---

### US-SUBJECT: Gestionar Asignaturas (AMPLIADA CON CURSOS + CARGAS ESTÀNDAR)

**Épica:** [5. Configuración de Horarios (Base + Asignaturas + Restricciones)](#epica-5-configuracion-de-horarios-base--asignaturas--restricciones)

**Historia:** Como usuario del colegio, quiero crear y gestionar asignaturas (Inglés, Programación, Educación Física, etc.) especificando a qué cursos aplican y cuáles son las cargas horarias estándar para cada curso, para que el sistema pueda pre-rellenar restricciones de carga automáticamente y acelerar la configuración de horarios.

---

#### Casos de Uso y Reglas de Negocio

* **Acceso a gestión:**
  * Menú: Configuración ✗
  * Cualquier usuario del colegio (`ADMIN` o `MEMBER`) puede CRUD
  * Solo se ven las asignaturas del propio colegio

* **Creación de asignatura (AMPLIADO):**
  * Nombre único obligatorio
  * Tipo de asignatura: CORE, ELECTIVE, CUSTOM
  * Status: ACTIVE, INACTIVE
  * Descripción opcional
  * **NUEVO:** Cursos aplicables (multiselect: [1º, 2º, 3º, 4º, 5º, 6º])
  * **NUEVO:** Carga estándar por curso (tabla: Curso | Sesiones/Semana 1-5)
  * Transacción atómica

* **Ejemplo de asignatura completa:**
  * Nombre: "Inglés"
  * Tipo: CORE
  * Cursos aplicables: [1º, 2º, 3º, 4º, 5º, 6º]
  * Cargas estándar: 1º(3), 2º(3), 3º(3), 4º(3), 5º(3), 6º(3) sesiones/semana

* **Edición (AMPLIADA):**
  * Puedo cambiar: nombre, tipo, status, descripción, cursos, cargas estándar
  * Si cambio cursos o cargas:
    - Avisar: "✗
    - Ofrecer: "Â¿Deseas actualizar restricciones automáticamente?"
    - Si "Sí": UPDATE todas restricciones asociadas
    - Si "No": mantener restricciones antiguas

* **Borrado:**
  * Cascada borra restricciones (con ROLLBACK si error)
  * Transacción atómica

* **Listado (AMPLIADO):**
  * Mostrar: Nombre | Tipo | Status | Cursos Aplicables | Uso | Acciones
  * Badge "Cursos Aplicables" es expandible: click ✗
  * Ejemplo: Badge "1º-6º" ✗

* **Pre-rellenar restricciones (NUEVO):**
  * Cuando un usuario crea la restricción "Inglés en 1º Primaria":
    - Sistema busca carga estándar de Inglés en 1º
    - Pre-rellena campo "Sesiones/Semana" con 3
    - User ve: "Sugerencia: 3 sesiones/semana (basada en configuración estándar)"
    - User puede cambiar si lo desea
  * En matriz bulk (US19 CA17): todas asignaturas pre-rellenadas con estándares

* **Permisos:**
  * `ADMIN` y `MEMBER`: CRUD
  * Datos de otro colegio: `404 NOT_FOUND`

#### Criterios de Aceptación (20 CAs - Ampliada)

* **CA1 (Abrir formulario crear):** Dado que accedo a "Gestionar Asignaturas", cuando hago clic en "Crear Nueva", entonces se abre formulario con campos: Nombre, Tipo, Status, Descripción, **Cursos Aplicables (checkboxes 1º-6º)**, **Cargas Estándar (tabla editable)**.

* **CA2 (Crear asignatura CORE con cursos y cargas):** Dado que completo: Nombre="Inglés", Tipo="CORE", Status="ACTIVE", Cursos=[1º-6º], Cargas=[3,3,3,3,3,3], cuando presiono "Guardar", entonces:
  - Asignatura se crea en BD con cursos y cargas estándar
  - Toast: "Asignatura 'Inglés' creada (6 cursos)"
  - Listado muestra: "Inglés | CORE | ACTIVE | 1º-6º | 0 usos"

* **CA3 (Crear asignatura CUSTOM con cursos parciales):** Dado que completo: Nombre="Programación", Tipo="CUSTOM", Cursos=[4º,5º,6º], Cargas=[2,3,4], cuando presiono "Guardar", entonces:
  - Asignatura se crea
  - Listado muestra: "Programación | CUSTOM | ACTIVE | 4º-6º"
  - Cuando cree restricción "Programación en 4º", pre-rellena 2 sesiones

* **CA4 (Validación nombre único):** Dado que intento crear "Inglés" y ya existe, cuando presiono "Guardar", entonces error "Asignatura 'Inglés' ya existe".

* **CA5 (Validación nombre requerido):** Dado que dejo "Nombre" vacío, cuando presiono "Guardar", entonces error "Nombre es obligatorio".

* **CA6 (Validación cursos requeridos - NUEVO):** Dado que no selecciono ningún curso, cuando presiono "Guardar", entonces error "Debes seleccionar al menos 1 curso".

* **CA7 (Validación cargas estándar - NUEVO):** Dado que selecciono cursos [1º,2º,3º] pero dejo "Cargas" vacío, cuando presiono "Guardar", entonces error "Debes especificar sesiones/semana para cada curso".

* **CA8 (Validación rango sesiones - NUEVO):** Dado que ingreso carga estándar 0 o 6, cuando presiono "Guardar", entonces error "Sesiones debe estar entre 1 y 5".

* **CA9 (Ver listado con cursos - NUEVO):** Dado que accedo a "Gestionar Asignaturas", cuando carga, entonces veo tabla: Nombre | Tipo | Status | Cursos Aplicables | Usos | Acciones, con badges expandibles.

* **CA10 (Expandir badge cursos - NUEVO):** Dado que veo asignatura "Inglés" con badge "1º-6º", cuando hago clic en badge, entonces expande para mostrar cargas: "1º: 3 sesiones, 2º: 3 sesiones, ..., 6º: 3 sesiones".

* **CA11 (Filtrar por tipo):** Dado que presiono filtro "CORE", cuando filtra, entonces veo solo asignaturas CORE.

* **CA12 (Filtrar por status):** Dado que presiono filtro "INACTIVE", cuando filtra, entonces veo solo asignaturas inactivas.

* **CA13 (Búsqueda por nombre):** Dado que escribo "Prog" en buscador, cuando busca, entonces veo asignaturas con "Prog" en nombre.

* **CA14 (Editar asignatura - cambiar cursos - NUEVO):** Dado que edito "Inglés" para cambiar cursos [1º-6º] ✗
  - Avisar: "✗
  - Ofrecer: "Â¿Deseas actualizar restricciones automáticamente?"
  - Si "Sí": UPDATE restricciones
  - Si "No": mantener actuales
  - Listado muestra "Inglés | CORE | ACTIVE | 1º-5º"

* **CA15 (Editar cargas estándar - NUEVO):** Dado que edito cargas de Inglés [3,3,3,3,3,3] ✗
  - Avisar: "✗
  - Sugerir: "Â¿Actualizar restricciones de Inglés a 4 sesiones?"
  - Permitir actualización automática o manual

* **CA16 (Editar con advertencia restricciones):** Dado que "Inglés" está en uso en 5 restricciones, cuando presiono "Editar", entonces avisar pero permitir edición.

* **CA17 (Borrar asignatura sin uso):** Dado que creo "Yoga" sin restricciones, cuando presiono "Borrar", entonces confirma y borra.

* **CA18 (Borrar asignatura en uso):** Dado que "Inglés" está en uso en 5 restricciones, cuando presiono "Borrar", entonces confirma y borra en cascada con ROLLBACK si error.

* **CA19 (Inactivar asignatura - NUEVO):** Dado que veo "Inglés" con status="ACTIVE", cuando presiono "Inactivar", entonces status ✗

* **CA20 (Pre-rellenar restricción con carga estándar - NUEVO):** Dado que creo restricción: Asignatura="Inglés", Curso="1º Primaria", cuando sistema carga, entonces:
  - Campo "Sesiones/Semana" pre-rellena con 3
  - Muestra: "Sugerencia: 3 sesiones/semana (configuración estándar)"
  - User puede cambiar si desea
  - Acelera configuración en matriz bulk (US19 CA17-CA18)

---

### US19: Crear Restricción de Carga Horaria

**Épica:** [5. Configuración de Horarios (Base + Asignaturas + Restricciones)](#epica-5-configuracion-de-horarios-base--asignaturas--restricciones)

**Historia:** Como usuario del colegio, quiero definir restricciones de carga horaria (sesiones por asignatura) y otras restricciones (disponibilidad profesor, descansos) para que el algoritmo de generación de horarios las respete.

---

#### Casos de Uso y Reglas de Negocio

* **Acceso a restricciones:**
  * Menú: Configuración ✗
  * Cualquier usuario del colegio (`ADMIN` o `MEMBER`) puede crear/editar/borrar

* **Tipos de restricciones:**
  
  **Tipo 1: HOURS_PER_WEEK (Carga Horaria)**
  * Parámetros: subjectId, courseId, sessionsPerWeek (1-5), maxPerDay (opcional)
  * Ejemplo: "Inglés en 1º Primaria: 3 sesiones/semana"
  
  **Tipo 2: AVAILABILITY (Disponibilidad Profesor)**
  * Parámetros: profesorId, unavailableDays
  * Ejemplo: "Prof. García no disponible miércoles"
  
  **Tipo 3: NO_DUPLICATE (No Duplicidad)**
  * Parámetros: subjectId, courseId, maxPerDay
  * Ejemplo: "Inglés máximo 1 vez/día"
  
  **Tipo 4: SINGLE_LOCATION (Ubicación Simultánea Unitaria) - CRÀTICO**
  * Descripción: "Un docente NO puede estar en dos sitios a la vez"
  * Cuando especialista entra en un aula, tutor queda liberado y se marca como "Refuerzo"/"Coordinación"/"Sesión Libre"
  * Validación: UNIQUE KEY (profesorId, dayOfWeek, sessionNumber)
  * No permitir profesor en 2+ registros mismo tiempo

* **Restricción por Curso (NO por Clase):**
  * Una restricción se aplica a TODO el curso (todas sus clases)
  * Ejemplo: "Inglés en 1º Primaria: 3" aplica a 1º A, 1º B, 1º C

* **Validaciones:**
  * Asignatura debe existir
  * Curso debe existir
  * sessionsPerWeek: 1-5
  * maxPerDay (si existe): 1 a sessionsPerWeek
  * UNIQUE (asignatura + curso + tipo): no duplicados
  * **Avisar si suma > 25 franjas:** permite pero avisa
  * **CRÀTICO - Ubicación Simultánea Unitaria:** Validar profesor NO en 2 clases mismo tiempo

* **Cálculo de disponibilidad:**
  * Sistema calcula total sesiones útiles del calendario
  * Muestra: "Total actual: 18/25 franjas"
  * Si suma > 25: avisar "✗

* **Permisos:**
  * `ADMIN` y `MEMBER`: crear, ver
  * Datos de otro colegio: `404 NOT_FOUND`

* **Configuración bulk por grupo:**
  * El user puede crear/editar todas las restricciones HOURS_PER_WEEK de un grupo en una sola matriz
  * Opción "Cargar Configuración por Grupo" en formulario principal
  * Matriz editable: Asignatura | Sesiones/Semana | Máximo/Día
  * Pre-población con valores actuales o vacíos si es nuevo
  * Display dinámico de suma total vs disponible
  * Guardado atómico: crear/actualizar/borrar múltiples restricciones simultáneamente
  * Advertencia si suma > 25 franjas (pero permite continuar)

#### Criterios de Aceptación (20 CAs - Incluye Configuración Bulk por Grupo)

* **CA1 (Abrir formulario crear):** Dado que accedo a "Crear Restricción", cuando hago clic en "Nueva Restricción", entonces se abre formulario con campos: Tipo (dropdown), Asignatura (dropdown), Curso (dropdown), Sesiones/Semana (input), Â¿Máximo/Día? (checkbox), Máximo/Día (input si marcado).

* **CA2 (Crear restricción HOURS_PER_WEEK):** Dado que completo: Tipo=HOURS_PER_WEEK, Asignatura=Inglés, Curso=1º Primaria, Sesiones=3, cuando presiono "Guardar", entonces restricción se crea, toast "Restricción creada: Inglés 3 sesiones/semana", muestra suma "Total ahora: 15/25 franjas".

* **CA3 (Validación asignatura requerida):** Dado que dejo asignatura vacía, cuando presiono "Guardar", entonces error "Asignatura es obligatoria".

* **CA4 (Validación curso requerido):** Dado que dejo curso vacío, cuando presiono "Guardar", entonces error "Curso es obligatorio".

* **CA5 (Validación sessionsPerWeek):** Dado que ingreso sessionsPerWeek=0 o 6, cuando presiono "Guardar", entonces error "Sesiones deben estar entre 1 y 5".

* **CA6 (Validación duplicada):** Dado que existe restricción "Inglés en 1º Primaria: 3", cuando intento crear otra idéntica, entonces error "Restricción ya existe para esta asignatura/curso".

* **CA7 (Validación maxPerDay):** Dado que ingreso sessionsPerWeek=3, maxPerDay=5, cuando presiono "Guardar", entonces error "Máximo/día no puede ser mayor que sesiones/semana".

* **CA8 (Avisar si suma > 25):** Dado que suma actual es 24 franjas, cuando creo restricción "Matemáticas 2 sesiones" (total 26), entonces advertencia "✗

* **CA9 (Mostrar suma disponible):** Dado que creo restricción, cuando completo formulario, entonces veo display dinámico: "Calendario base: 25 franjas disponibles", "Restricciones actuales: 15 franjas (Inglés 3 + Lengua 5 + ...)", "Disponible: 10 franjas".

* **CA10 (Ver listado restricciones):** Dado que accedo a "Restricciones", cuando carga, entonces veo tabla: Asignatura | Curso | Tipo | Sesiones | Máx/Día | Acciones, todas las restricciones, paginado (20 por página), ordenado por Curso.

* **CA11 (Filtrar por tipo):** Dado que presiono filtro "Tipo=HOURS_PER_WEEK", cuando filtra, entonces veo solo restricciones de carga horaria.

* **CA12 (Filtrar por curso):** Dado que presiono filtro "Curso=1º Primaria", cuando filtra, entonces veo solo restricciones de ese curso.

* **CA13 (Búsqueda por asignatura):** Dado que escribo "Inglés" en buscador, cuando busca, entonces veo restricciones con "Inglés" (case-insensitive).

* **CA13.5 (CRÀTICO - Validar Ubicación Simultánea Unitaria):** Dado que intento asignar Prof. García a Inglés en 1º A lunes 09:00-09:45, cuando Prof. García YA está enseñando Lengua en 1º B lunes 09:00-09:45, entonces error "Prof. García ya está enseñando Lengua en 1º B en ese horario. No puede estar en dos sitios a la vez", no se guarda restricción, sistema valida UNIQUE KEY (profesorId, dayOfWeek, sessionNumber).

* **CA13.6 (Tutor liberado por especialista):** Dado que Prof. Smith (especialista Inglés) entra a 1º A lunes 09:00, cuando genera horario, entonces Prof. García (tutor) se marca como "Refuerzo"/"Coordinación"/"Sesión Libre" esa sesión, NO aparece como docente de clase, horario refleja "Lunes 09:00 | Prof. Smith (Inglés) | 1º A".

* **CA14 (Mostrar contador sesiones totales):** Dado que veo listado con 10 restricciones, entonces veo pie de tabla "Total: 23/25 franjas en uso", barra visual [✗

* **CA15 (Validación asignatura existe):** Dado que intento crear restricción para asignatura que no existe (o fue eliminada), cuando presiono "Guardar", entonces error "Asignatura no encontrada" (error 404).

* **CA16 (Acceso de cualquier usuario del colegio):** Dado que soy `MEMBER`, cuando accedo a "Crear Restricción", entonces puedo crear restricciones igual que un `ADMIN`; y una restricción de otro colegio responde `404 NOT_FOUND`.

* **CA17 (Configuración bulk por grupo - Abrir matriz):** Dado que accedo a "Crear Restricción" y presiono "Cargar Configuración por Grupo", cuando selecciono curso (ej: "1º Primaria"), entonces se abre matriz editable con todas las asignaturas del grupo:
  - Columnas: Asignatura | Sesiones/Semana | Máximo/Día | Acciones
  - Filas: Una por cada asignatura activa (Medi, Música, Arts, E.F, ValenciÀ , CastellÀ , AnglÀ¨s, Mate, Tutoria, Projectes, Reli/AE, etc.)
  - Pre-población: Si existen restricciones previas, muestra valores actuales; si no, campos vacíos
  - Ejemplo de matriz para 1º Primaria:
    ```
    | Medi | 3 | (vacío) | [editar] |
    | Música | 2 | (vacío) | [editar] |
    | Arts | 1 | (vacío) | [editar] |
    | E.F | 3 | (vacío) | [editar] |
    | ValenciÀ  | 4 | (vacío) | [editar] |
    | CastellÀ  | 3 | (vacío) | [editar] |
    | AnglÀ¨s | 3 | (vacío) | [editar] |
    | Mate | 5 | (vacío) | [editar] |
    | Tutoria | 1 | (vacío) | [editar] |
    | Projectes | 3 | (vacío) | [editar] |
    | Reli/AE | 2 | (vacío) | [editar] |
    ```
  - Display de suma: "Total: 30/25 franjas (✗
  - Botones: Guardar Todo | Cancelar

* **CA18 (Configuración bulk por grupo - Guardar atómicamente):** Dado que edito matriz de 1º Primaria (cambio Medi: 3✗
  - Transacción atómica: CREAR/ACTUALIZAR todas restricciones HOURS_PER_WEEK para el grupo simultáneamente
  - Validación previa:
    - Cada sessionsPerWeek está en rango 1-5
    - Suma total ✗
    - Todas asignaturas existen en BD
  - Si validación OK:
    - INSERT nuevas restricciones (si no existen)
    - UPDATE restricciones existentes (si cambiaron valores)
    - DELETE restricciones (si user las dejó vacías ✗
  - Si error en BD: ROLLBACK, error "Error guardando configuración: [detalle]"
  - Si éxito: Toast "Configuración de 1º Primaria guardada (11 restricciones actualizadas)", matriz cierra, vuelve a listado de restricciones
  - Listado refleja cambios (<3s): suma disponibilidad actualiza, barra visual recalcula

---

### US20: Ver Listado de Restricciones Activas

**Épica:** [5. Configuración de Horarios (Base + Asignaturas + Restricciones)](#epica-5-configuracion-de-horarios-base--asignaturas--restricciones)

**Historia:** Como usuario del colegio, quiero ver todas las restricciones configuradas (carga horaria, disponibilidad, descansos) para tener claridad sobre qué reglas aplican antes de generar horarios.

---

#### Casos de Uso y Reglas de Negocio

* **Acceso al listado:**
  * Menú: Configuración ✗
  * Cualquier usuario del colegio (`ADMIN` o `MEMBER`) puede CRUD
  * Solo se ven las restricciones del propio colegio

* **Visualización del listado:**
  * Ver todas las restricciones (activas + inactivas)
  * Tabla: Asignatura | Curso | Tipo | Parámetros | Status | Acciones
  * Paginado (20 por página)
  * Ordenado por Curso + Asignatura (A-Z)
  * Mostrar contador total: "Total: X restricciones"
  * Mostrar suma disponibilidad: "Total: 23/25 franjas en uso"
  * Barra visual: [✗

* **Tipos de restricción (Mostrar todos):**
  * HOURS_PER_WEEK: "Inglés en 1º Primaria: 3 sesiones/semana"
  * AVAILABILITY: "Prof. García no disponible miércoles"
  * NO_DUPLICATE: "Inglés máximo 1 vez/día"
  * SINGLE_LOCATION: "Prof. X no puede estar en 2 sitios simultáneamente"

* **Parámetros mostrados:**
  * HOURS_PER_WEEK: "3 sesiones/semana" + "máx 1/día" (si existe)
  * AVAILABILITY: "No disponible: Lun, Mié" + profesor
  * NO_DUPLICATE: "Máximo 1 vez/día"
  * SINGLE_LOCATION: "Ubicación única"

* **Filtros (Combinables):**
  * Por Tipo: HOURS_PER_WEEK, AVAILABILITY, NO_DUPLICATE, SINGLE_LOCATION
  * Por Curso: 1º Primaria, 2º Primaria, etc.
  * Por Status: ACTIVE, INACTIVE
  * Búsqueda: Por nombre asignatura (case-insensitive)
  * Se pueden combinar

* **Disponibilidad visual (Barra):**
  * Mostrar total franjas disponibles (del calendario base)
  * Mostrar franjas en uso (suma de todas restricciones HOURS_PER_WEEK)
  * Código de colores: Verde ✗
  * Ejemplo: [✗

* **Desglose de restricciones (Hover/Expandible):**
  * Al pasar mouse sobre barra, mostrar desglose: "Inglés: 3 franjas", "Lengua: 5 franjas", etc.
  * Mostrar total suma

* **Responsividad:**
  * Desktop: tabla completa con todos los detalles
  * Tablet: tabla con columnas reducidas
  * Móvil: cards apiladas (Asignatura + Tipo + Parámetros expandibles)

* **Permisos:**
  * `ADMIN` y `MEMBER`: ver todo
  * Botones editar/borrar deshabilitados (futuro)
  * Datos de otro colegio: `404 NOT_FOUND`

#### Criterios de Aceptación (15 CAs)

* **CA1 (Abrir listado):** Dado que accedo a "Ver Restricciones", cuando carga, entonces veo tabla con todas las restricciones: Asignatura | Curso | Tipo | Parámetros | Status | Acciones, mínimo 1 restricción visible, paginado (20 por página).

* **CA2 (Ver barra disponibilidad):** Dado que veo listado, cuando visualizo, entonces veo "Total: 23/25 franjas en uso", barra visual [✗

* **CA3 (Barra roja si suma > 25):** Dado que suma restricciones > 25 franjas, cuando visualizo barra, entonces barra en color rojo, texto "✗

* **CA4 (Filtrar por tipo):** Dado que presiono filtro "Tipo", cuando selecciono "HOURS_PER_WEEK", entonces veo solo restricciones de carga horaria, otros tipos desaparecen.

* **CA5 (Filtrar por curso):** Dado que presiono filtro "Curso", cuando selecciono "1º Primaria", entonces veo solo restricciones de 1º Primaria, otros cursos desaparecen.

* **CA6 (Filtrar por status):** Dado que presiono filtro "Status", cuando selecciono "ACTIVE", entonces veo solo restricciones activas, inactivas desaparecen.

* **CA7 (Combinación filtros):** Dado que aplico: Tipo=HOURS_PER_WEEK + Curso=1º Primaria + Status=ACTIVE, cuando filtra, entonces veo solo restricciones que cumplen TODOS los criterios.

* **CA8 (Búsqueda por asignatura):** Dado que escribo "Inglés" en buscador, cuando busca, entonces veo restricciones con "Inglés" (case-insensitive), desaparecen otras asignaturas.

* **CA9 (Búsqueda sin resultados):** Dado que escribo "Yoga" en buscador y no existe restricción, cuando busca, entonces mensaje "No se encontraron restricciones con 'Yoga'", tabla vacía.

* **CA10 (Ver desglose disponibilidad):** Dado que paso mouse sobre barra de disponibilidad, cuando hover, entonces pop-up con desglose: "Inglés: 3", "Lengua: 5", "Matemáticas: 5", "Total: 13 franjas".

* **CA11 (Ver parámetros tipo HOURS_PER_WEEK):** Dado que veo restricción "Inglés en 1º Primaria", cuando visualizo, entonces Tipo badge "HOURS_PER_WEEK", Parámetros "3 sesiones/semana, máx 1/día".

* **CA12 (Ver parámetros tipo AVAILABILITY):** Dado que veo restricción "Prof. García", cuando visualizo, entonces Tipo badge "AVAILABILITY", Parámetros "No disponible: Lun, Mié, Vie".

* **CA13 (Responsive desktop):** Dado que veo listado en desktop, cuando visualizo, entonces tabla completa horizontal, todas las columnas visibles.

* **CA14 (Responsive móvil):** Dado que veo listado en móvil, cuando visualizo, entonces cards apiladas verticales, cada card: Asignatura + Tipo + Parámetros expandibles.

* **CA15 (Acceso y aislamiento):** Dado que soy `MEMBER`, cuando accedo a "Ver Restricciones", entonces veo las restricciones de mi colegio con los mismos permisos que un `ADMIN`, y ninguna de otro colegio.

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

### 1. Definición

**Historia:** Como administrador del colegio, quiero disparar la generación automática de horarios seleccionando un algoritmo (CSP o Backtracking), para obtener un cuadrante horario semanal completo que respete todas las restricciones pedagógicas, laborales y de disponibilidad configuradas (Hard Constraints HC1-HC6 y Soft Constraints SC1-SC3).

---

### 2. Criterios de Aceptación (Gherkin)

* **CA1 (Abrir modal selector de algoritmo):** Dado que accedo a "Generar Horarios" desde el menú de Configuración, cuando hago clic en el botón "Generar Nuevo Horario", entonces se abre un modal con dos opciones: "(✓) CSP (Constraint Satisfaction Problem) — Recomendado (rápido, 1-15s típicamente)" y "( ) Backtracking (exhaustivo, hasta 120s)". CSP está preseleccionado por defecto.

* **CA2 (Seleccionar algoritmo y disparar generación):** Dado que el modal está abierto con CSP preseleccionado, cuando hago clic en "Generar", entonces el sistema valida que todas las dependencias están completadas (US-BASE, US-SUBJECT, US19, US-PROF-AVAIL, US-PROF-ASSIGN con restricciones consistentes), dispara un job de generación en background vía BullMQ (no bloquea UI), y muestra spinner de progreso con "Generando horarios... (0%)" y botón "Cancelar".

* **CA3 (Polling de progreso durante ejecución):** Dado que la generación está en progreso, cuando cada 2 segundos el frontend hace polling a GET /api/schedule/generate/:jobId, entonces recibe respuesta con estado (RUNNING, COMPLETED, FAILED) y porcentaje de progreso (0-100%), y muestra "Generando horarios... (45%)" actualizado en tiempo real. Timeout máximo CSP: 60 segundos; Timeout máximo Backtracking: 120 segundos. Si excede, error "Generación tardó más del máximo permitido (60s/120s según algoritmo). Intenta con menos restricciones o elige Backtracking."

* **CA4 (Hard Constraints HC1-HC6 aplicados):** Dado que la generación completa exitosamente, cuando se valida el horario generado, entonces cumple:
  - HC1 (Carga exacta): Cada asignatura en cada grupo tiene EXACTAMENTE N sesiones/semana (según restricción US19).
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

* **CA7 (Error INFEASIBLE: restricciones imposibles):** Dado que suma total de restricciones HOURS_PER_WEEK > 25 franjas disponibles, cuando se dispara generación, entonces algoritmo falla rápidamente (<2s) con error INFEASIBLE: "No es posible generar horarios. La suma de restricciones (28 sesiones) excede las franjas disponibles (25). Revisa US19 y reduce cargas horarias." Usuario puede volver a US19 para ajustar.

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
  - `US19`: Restricciones de carga deben estar definidas (alimentan HC1 sesionsPerWeek).
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
| **Infraestructura Técnica** | US00, US00_b | 16 | US00 implementada; US00_b especificada |
| **Autenticación y Sesión** | US01 (US01_a-US01_f), US02, US02_b, US02_c, US03, US04 | 56+ | ✓ Completadas (US01 con pendientes antes de publicar en sus partes) |
| **Gestión de Cursos** | US05-08 | 25+ | ✓ Completadas |
| **Gestión de Profesores** | US09-13 | 22+ | ✓ Completadas |
| **Gestión de Alumnos** | US14-18 | 50+ | ✓ Completadas |
| **Configuración de Horarios** | US-BASE, US-SUBJECT, US19, US20 | 73+ | ✓ Completadas |
| **Disponibilidad de Profesores** | US-PROF-AVAIL, US-PROF-ASSIGN, US-PROF-SUMMARY | 48+ | ✓ Completadas |
| **Generación de Horarios (Fase 2)** | US-ALGO-RUN, US-ALGO-CONFIRM, US-ALGO-VIEW | 25+ | ✓ Especificada (3 US) |

**Total Criterios de Aceptación (MVP):** 281+ CAs  
**Total Criterios de Aceptación (Fase 2 Post-MVP):** 25+ CAs

---

## Arquitectura: Horarios + Profesores

El sistema de generación de horarios se compone de **9 historias vinculadas en 3 bloques:**

### Bloque 1: Configuración Base de Horarios
1. **US-BASE (Calendario Base):** Define estructura temporal (sesiones, recreos, horas)
2. **US-SUBJECT (Asignaturas):** Gestiona materias educativas (CORE, ELECTIVE, CUSTOM)
3. **US19 (Restricciones):** Define restricciones de carga horaria (sesiones/semana por asignatura/curso)
4. **US20 (Ver Restricciones):** Visualiza restricciones + disponibilidad con filtros

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
- **Ubicación:** US19 CA13.5 y CA13.6

---

## Notas de Implementación

- **Dependencias técnicas:** US01-04 (Autenticación) deben completarse antes de cualquier otra funcionalidad, ya que protegen todas las rutas.
- **Orden de implementación recomendado:** 
  * **Fase 0:** Autenticación
  * **Fase 1:** US-BASE + US-SUBJECT (1.5-2 semanas)
  * **Fase 2:** US19 + US20 (2 semanas)
  * **Fase 3:** US-PROF-AVAIL + US-PROF-ASSIGN + US-PROF-SUMMARY (2-3 semanas)
  * **Fase 4:** US-ALGO (3-4 semanas)
- **Validaciones:** Todas las historias asumen validación de entrada tanto en frontend (UX) como en backend (seguridad).
- **Responsive:** Todas las interfaces deben ser usables en navegadores de escritorio, tablet y móvil (Tailwind v4 + shadcn/ui facilita esto).
- **Transacciones atómicas:** Todas las operaciones de escritura (crear, editar, borrar) deben ser transaccionales con ROLLBACK automático en caso de error.
- **Permisos:** Todas las rutas API exigen sesión iniciada y solo dan acceso a los datos del colegio del usuario (`404 NOT_FOUND` para datos de otro colegio). Las acciones reservadas al rol `ADMIN` (gestión de usuarios, calendario base y generación, oficialización y exportación de horarios; PRD §3.1) responden `403 FORBIDDEN` a un `MEMBER`.

---

## Antes de ejecutar la Fase 2 (US-ALGO-RUN, US-ALGO-CONFIRM, US-ALGO-VIEW), validar que se ha completado:

**Fase 1 (Configuración Base):**
- [ ] Calendario base configurado (# sesiones, recreos confirmados)
- [ ] Asignaturas creadas (CORE, ELECTIVE, CUSTOM según necesidad)

**Fase 2 (Restricciones):**
- [ ] Restricciones de carga definidas para todas asignaturas/cursos
- [ ] Suma total restricciones ≤ 25 franjas disponibles (sin advertencias críticas)
- [ ] Visualización de restricciones y disponibilidad validada

**Fase 3 (Profesores):**
- [ ] Disponibilidad horaria de todos profesores configurada
- [ ] Asignaturas asignadas a todos profesores (no hay restricciones sin asignar)
- [ ] No hay profesores sobrecargados (>100% disponibilidad)
- [ ] Mismatches restricción resueltos (o deliberados y documentados)
- [ ] Resumen de carga verificado (alertas rojas resueltas)

**Condiciones previas de US-ALGO-RUN, US-ALGO-CONFIRM, US-ALGO-VIEW:**
- ✓ US-BASE completado (calendario define sesiones)
- ✓ US-SUBJECT completado (asignaturas disponibles)
- ✓ US19 completado (restricciones de carga definidas)
- ✓ US20 completado (restricciones visualizables)
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


