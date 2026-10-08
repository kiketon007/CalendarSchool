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
* PostgreSQL 18 en Docker Compose (`docker-compose.yml`) con dos bases de datos en el mismo contenedor: `calendarschool` (desarrollo) y `calendarschool_test` (tests). Los tests nunca usan la base de desarrollo.
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
  * `quality`: instalación con `CYPRESS_INSTALL_BINARY=0` (el `postinstall` genera el cliente Prisma), lint, tests (unitarios y de integración, con PostgreSQL 18 como contenedor de servicio con `POSTGRES_DB=calendarschool_test` y `TEST_DATABASE_URL` en el entorno del job), build y comprobación de enlaces simbólicos rotos en `.claude/` y `.cursor/` (`find .claude .cursor -xtype l`).
  * `e2e`: PostgreSQL 18 como contenedor de servicio con `POSTGRES_DB=calendarschool_test`, `TEST_DATABASE_URL` en el entorno del job, caché del binario de Cypress y ejecución de `npm run test:e2e` (que compila y migra por sí mismo).

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
* **PostgreSQL 18 en RDS:** comprobar al abordar `despliegue-aws` que RDS ofrece la versión 18; si no, bajar a la 17 es un cambio menor mientras no se usen funciones exclusivas de la 18.
* **Volumen de Docker existente:** si el volumen de PostgreSQL ya existía, no se crea `calendarschool_test` (ver regla de la base de datos).
* **Enlaces simbólicos en Windows:** los workspaces no deben romper los enlaces de `.claude/` y `.cursor/` (ver `README.md` §1.4). Se mitiga con workspaces explícitos, herramientas con rutas explícitas, la comprobación manual (listar `.claude/skills` tras `npm install` y confirmar que los enlaces siguen vivos) y el paso de CI contra enlaces rotos.
* **Migración por esquema (a verificar en un spike):** la documentación de Prisma 7 no confirma que `prisma migrate deploy` respete `?schema=test_N` en la `DATABASE_URL`. Si no lo respeta, hay que cambiar el mecanismo de migración por esquema antes de seguir con el aislamiento entre tests.
* **Comprobaciones técnicas pendientes en las tareas:** que las tareas de lint-staged encuentren `eslint` y `prettier` en el `node_modules/.bin` de la raíz desde el `cwd` del workspace; qué código de salida devuelve lint-staged con un commit que solo toca ficheros sin configuración; y que Prisma no regenera el cliente tras `migrate` (se asume que no; el cliente se genera siempre en `postinstall`).
* **Datos acumulados en el E2E:** desde US01 los E2E escribirán datos en el esquema `public` de `calendarschool_test`, que `resetDatabase()` rechaza a propósito. La estrategia de limpieza de esos datos se decide en la primera historia que escriba datos (US01), no en esta.
* **Imports ESM:** un `.js` omitido en un import relativo pasa en Vitest (resolvedor de Vite) y rompe en `node dist/server.js`; lo detecta el E2E, que ejecuta el backend compilado.

#### Tareas pendientes tras la revisión adversarial de US00

Hallazgos Minor y preguntas de la revisión adversarial del cambio `bootstrap-proyecto` (2026-10-07) que no bloquean su archivo. Cada tarea indica en qué cambio se aborda; al hacerlo, se incorpora a sus artefactos OpenSpec y se marca aquí.

* **Para US00_b (`despliegue-aws`):**
  * [ ] **Timeouts del pool de PostgreSQL:** con la base colgada, cada `GET /api/health` responde `503` a los 2 s, pero su consulta queda pendiente sin límite, porque el pool de `pg` no tiene `connectionTimeoutMillis`. Con las comprobaciones periódicas del balanceador las consultas se acumularían. Fijar `connectionTimeoutMillis` (y valorar `statement_timeout`) en `createPrismaClient.ts`.
  * [ ] **`prisma` en producción:** `prisma` es dependencia de desarrollo, pero el `postinstall` del backend ejecuta `prisma generate`, así que una instalación de producción (`npm ci --omit=dev`) fallaría. Decidir si se genera el cliente en el build o si `prisma` pasa a `dependencies`.
  * [ ] **Log estructurado de la configuración inválida:** si la configuración es inválida, `server.ts` termina por una excepción no capturada (traza de Node en stderr) y no con una línea JSON de pino. Capturar `ConfigError`, registrarlo con pino y salir con `process.exit(1)`, para que CloudWatch lo trate como el resto de logs.
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
Como equipo de desarrollo, quiero desplegar automáticamente en AWS el esqueleto de US00 cada vez que se integra un cambio en `main`, para validar la infraestructura de producción antes de que las historias funcionales dependan de ella.

**Fuentes:** `README.md` §2.4 (*Infraestructura y despliegue*), `docs/arquitectura/ARQUITECTURA_COMPLETA.md` §11 y las decisiones y tareas aplazadas de US00. El PRD no trata el despliegue, pero acota el MVP a un colegio piloto durante 2-3 semanas (§211), por lo que se prioriza un coste bajo y la simplicidad frente a la arquitectura objetivo de §11. Donde §11 contradice a US00 (Node.js 18 en CI, plugin de Python, workflow sobre `develop`), prevalece US00. Esta historia se aparta además de §11 y de `README.md` §2.4 en la herramienta de infraestructura (AWS CDK en lugar de Serverless Framework), la base de datos (RDS en lugar de Aurora Multi-AZ) y la región (`eu-south-2` en lugar de `us-east-1`); esos documentos se actualizan al completarla.

---

#### Casos de uso y reglas de negocio

* **Alcance: el esqueleto de US00, desplegado:**
* Igual que US00, no contiene lógica de dominio. Termina cuando la página inicial y `GET /api/health` responden en AWS por HTTPS, contra la base de datos gestionada, y el despliegue se ejecuta automáticamente desde `main`.
* Las piezas de la arquitectura objetivo ligadas a funcionalidades posteriores (ElastiCache/Redis y SQS para la generación de horarios, capa de OR-Tools, S3 para exportaciones, WebSockets y X-Ray) quedan fuera: cada una llega con la historia que la necesite. La caché y la monitorización avanzada quedan para cuando la aplicación esté más madura (`README.md` §2.4).

* **Región:** `eu-south-2` (España), para que los datos de los colegios permanezcan en España. Los recursos globales que AWS exige en `us-east-1` (p. ej. un certificado de ACM para CloudFront, si se añade un dominio propio) son la única excepción.

* **Arquitectura:**
```
navegador ──HTTPS──▶ CloudFront ──┬── /*      ──▶ S3 (build de Vite)
  (URL *.cloudfront.net)          └── /api/*  ──▶ API Gateway (HTTP API) ──▶ Lambda ──TLS──▶ RDS PostgreSQL 18
```
* **Backend:** AWS Lambda con Node.js 24 (`nodejs24.x`) detrás de una **HTTP API** de API Gateway, mediante el envoltorio `backend/src/lambda.ts` sobre la app Express de `createApp()`. El handler es `async` (el runtime de Node.js 24 ya no admite handlers con callback). Como `server.ts`, `lambda.ts` es un punto de entrada: no contiene lógica y queda excluido de la cobertura. La regla de US00 «solo `server.ts` llama a `loadConfig()`» pasa a ser «solo los puntos de entrada (`server.ts` y `lambda.ts`) llaman a `loadConfig()`».
* **Base de datos:** Amazon RDS for PostgreSQL 18 en una sola zona de disponibilidad, instancia `db.t4g.micro` y copias de seguridad automáticas con 7 días de retención. Aurora Multi-AZ con réplicas de lectura (§11) queda para cuando el uso lo justifique.
* **Frontend:** el build de Vite se sirve desde S3 a través de CloudFront.
* **Mismo origen:** CloudFront sirve el frontend y redirige `/api/*` a API Gateway, de modo que en producción frontend y API comparten origen, igual que con el proxy de Vite en local (US00): sin CORS y con el mismo comportamiento de cookies. La IP del cliente llega al backend en la cabecera `X-Forwarded-For` que añade CloudFront; cómo se usa para el límite de intentos lo decide US01_d.
* **Dominio:** en el MVP se usa la URL que asigna CloudFront (`*.cloudfront.net`), con HTTPS desde el primer despliegue. Un dominio propio (Route 53 y ACM) se puede añadir después sin cambiar la aplicación.
* **Infraestructura como código:** **AWS CDK en TypeScript**, en el directorio `infrastructure/`. Sin dependencias de cuentas externas a AWS.

* **Red y acceso a la base de datos (riesgo aceptado):**
* La Lambda se ejecuta **fuera de una VPC** y RDS es **accesible públicamente**, para evitar el coste fijo de una salida NAT: así la Lambda sale a internet sin coste adicional (la verificación de reCAPTCHA de US01_e lo necesita) y CI aplica las migraciones directamente. No es posible restringir el acceso por IP, porque ni Lambda ni los runners de GitHub tienen IPs fijas.
* Mitigaciones obligatorias: TLS obligatorio en todas las conexiones (`rds.force_ssl=1`); contraseñas generadas por AWS y guardadas solo en AWS; un usuario propietario del esquema, que solo usan las migraciones, y un usuario de aplicación, con el que se conecta la Lambda, sin privilegios para modificar el esquema.
* Revisar esta decisión (VPC con RDS privado) antes de ampliar el uso más allá del colegio piloto.

* **Conexiones y timeouts:**
* Cada instancia de la Lambda usa un pool de como máximo 2 conexiones, y la concurrencia reservada de la función se limita (p. ej. a 10), de modo que el total de conexiones queda acotado sin RDS Proxy.
* Timeout de la Lambda de unos 15 s: por encima de los 10 s de la petición (US00) y por debajo de los 30 s máximos de la HTTP API. Los 900 s de §11 corresponden a la generación de horarios (fase 2, asíncrona) y quedan fuera.

* **Configuración y secretos:**
* Las variables de entorno de producción (`DATABASE_URL` y las que añadan las historias, como el secreto de los JWT en US01_c) se guardan cifradas en AWS (SSM Parameter Store `SecureString` o Secrets Manager, donde CDK genera la contraseña de RDS; el mecanismo exacto se fija en el diseño) y llegan a la función como variables de entorno. Nunca se versionan.
* Se mantiene la validación Zod de US00: con una configuración inválida la función no atiende peticiones.

* **Despliegue continuo (GitHub Actions):**
* El despliegue se ejecuta en cada push a `main` y solo si pasan los jobs `quality` y `e2e` de CI. En orden: build → migraciones → despliegue del backend → publicación del frontend en S3 e invalidación de CloudFront → smoke test de `GET /api/health` contra la URL pública.
* **Migraciones:** `prisma migrate deploy` contra la base de producción, con el usuario propietario del esquema, es un paso explícito del despliegue, previo a publicar la nueva versión del backend (regla de US00: nunca se aplican de forma implícita). Si falla, no se publica nada.
* **Credenciales de despliegue:** GitHub Actions se autentica en AWS mediante **OIDC** con un rol de IAM limitado al repositorio y a `main`, sin claves de acceso de larga duración en los secretos de GitHub.
* **Entornos:** solo producción (`prod`). El nombre del entorno es un parámetro de la infraestructura, para poder añadir `staging` más adelante sin rehacerla. Los E2E siguen ejecutándose en CI antes de desplegar.
* **Rollback:** se despliega de nuevo un commit anterior mediante una ejecución manual del workflow (`workflow_dispatch`) indicando su referencia. Como las migraciones no se revierten, toda migración debe ser **compatible con la versión anterior del código** (patrón *expand/contract*: primero se añade, después se retira lo que ya no se usa), de modo que volver a la versión anterior sea siempre seguro.

* **Tareas heredadas de US00:** se incorporan las tareas pendientes de US00 marcadas para esta historia (timeouts del pool de PostgreSQL, `prisma` en producción y log estructurado de la configuración inválida). Las comprobaciones de sus riesgos ya están hechas: Lambda ofrece `nodejs24.x` en todas las regiones y RDS admite PostgreSQL 18 desde noviembre de 2025 (comprobado el 2026-10-07).

---

#### Criterios de Aceptación

* **CA1 (Despliegue automático):** Dado un push a `main`, cuando los jobs `quality` y `e2e` pasan, entonces el workflow despliega backend y frontend sin pasos manuales y termina con un smoke test de `GET /api/health` contra la URL pública; si alguno de esos jobs falla, no se despliega nada.
* **CA2 (Aplicación accesible por HTTPS):** Dado un despliegue completado, cuando abro la URL pública por HTTPS, entonces se carga la página inicial, y `GET /api/health` desde ese mismo origen responde `200` con `{ "success": true, "data": { "status": "ok", "database": "up" } }` contra la base de RDS. Una petición por HTTP se redirige a HTTPS.
* **CA3 (Migraciones explícitas):** Dado un despliegue que incluye una migración nueva, cuando se ejecuta el workflow, entonces la migración se aplica a la base de producción antes de publicar el nuevo backend; si falla, el despliegue se detiene y sigue en servicio la versión anterior.
* **CA4 (Secretos y configuración):** Dado el repositorio, ningún fichero versionado contiene credenciales de AWS ni de la base de datos; y si en producción falta una variable de entorno o es inválida, la función registra el error como una línea JSON de pino en CloudWatch y no atiende peticiones.
* **CA5 (Logs en CloudWatch):** Dado el backend desplegado, cuando atiende peticiones o se produce un error, entonces los logs llegan a CloudWatch como JSON estructurado de pino y se conservan 30 días (regla de datos personales de US01_b).
* **CA6 (Rollback):** Dada una versión desplegada, cuando lanzo manualmente el workflow de despliegue con la referencia de un commit anterior de `main`, entonces se despliega esa versión sin pasos manuales adicionales y el smoke test de `GET /api/health` pasa.
* **CA7 (Acceso a la base de datos):** Dada la base de datos de producción, cuando se intenta conectar sin TLS, entonces la conexión se rechaza; y el usuario con el que se conecta la Lambda no puede modificar el esquema.

---

#### Requisitos Técnicos, QA y Riesgos

* **Documentación a actualizar al completarla:** `README.md` §2.4, `CLAUDE.md` (estado del repositorio y comandos de despliegue) y `docs/arquitectura/ARQUITECTURA_COMPLETA.md` §11 (CDK, RDS y `eu-south-2` en lugar de lo que describen hoy).
* **Riesgos:**
* **Base de datos accesible desde internet (aceptado):** ver *Red y acceso a la base de datos*. Los datos incluirán información personal de menores (alumnado, comedor, becas), por lo que la revisión antes de ampliar el piloto no es opcional.
* **Conexiones a PostgreSQL desde Lambda:** cada instancia abre su propio pool; se acota con el pool máximo y la concurrencia reservada. Si se sube la concurrencia, revisar el límite de conexiones de `db.t4g.micro`.
* **Arranque en frío:** la primera petición tras un periodo sin uso tarda más (inicialización de la Lambda y de la conexión a la base). Aceptable para un colegio piloto.

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
* **Publicación en producción:** el registro no se publica en producción (US00_b) hasta que estén implementadas US01_d (límite de intentos) y US01_e (reCAPTCHA), porque hasta entonces el endpoint no tiene protección frente a altas automatizadas.
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

* **reCAPTCHA provisional hasta US01_e:** US01_b crea el puerto de verificación del captcha con un adaptador provisional que acepta cualquier token, y el formulario envía un token fijo. US01_e sustituye el adaptador por la verificación real y añade el widget, sin cambiar el resto del registro.

* **Tras el alta (hasta US01_c):** el formulario se sustituye por un mensaje de confirmación de que el colegio y la cuenta se han creado. US01_c lo cambia por el inicio de sesión y la redirección a Onboarding.

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

* **Longitud:** Mínimo **8 caracteres**, máximo **128 caracteres** *(corregido el límite inferior de 12)*.
* **Variedad requerida:** Al menos una letra mayúscula, una minúscula, un número y un carácter especial/símbolo (`!@#$%^&*()_+-=[]{}|;:,.<>?`).

---

#### Criterios de Aceptación (MVP)

* **CA8 (Alta del colegio y de la cuenta):** Dado que estoy en la pantalla de registro, cuando envío un nombre de colegio, un municipio, un nombre, unos apellidos, un email y una contraseña válidos, entonces el sistema responde `201`, crea en una única operación el colegio y la cuenta asociada a él en estado `ACTIVE` y con rol `ADMIN`, almacena el email en minúsculas y sin espacios al inicio ni al final y la contraseña solo como hash Bcrypt (cost 12), y registra el evento `USER_REGISTER_SUCCESS`. Si falla la creación de cualquiera de los dos, no se crea ninguno.
* **CA2 (Error de longitud de contraseña):** Dado que intento registrarme con una contraseña fuera del rango permitido (menos de 8 caracteres o más de 128), cuando intento enviar el formulario, veo un error inline "La contraseña debe tener entre 8 y 128 caracteres" y el formulario no se envía.
* **CA3 (Manejo de Email existente y Privacidad):** Dado que intento registrarme con un email que ya existe en el sistema, cuando envío el formulario, el sistema responde `409` con el código `EMAIL_ALREADY_REGISTERED`, muestra el mensaje "Este email ya está registrado" con un enlace hacia la pantalla de login, no crea ni el colegio ni la cuenta, y registra el evento `USER_REGISTER_DUPLICATE`. Si dos registros simultáneos usan el mismo email, solo uno se crea y el otro recibe esta misma respuesta.
* **CA4 (Formato de email inválido):** Dado que ingreso un email con sintaxis inválida (sin `@`, dominio incompleto, caracteres prohibidos o dirección IP), cuando envío el formulario, veo un error inline "Formato de email inválido" y el formulario no se envía.
* **CA6 (Nombre del colegio inválido):** Dado que dejo vacío el nombre del colegio o introduzco uno con menos de 2 o más de 150 caracteres, o con caracteres no permitidos, cuando intento enviar el formulario, veo un error inline "El nombre del colegio debe tener entre 2 y 150 caracteres válidos" y el formulario no se envía.
* **CA11 (Contraseña sin la variedad requerida):** Dado que introduzco una contraseña de entre 8 y 128 caracteres a la que le falta una mayúscula, una minúscula, un número o un símbolo, cuando intento enviar el formulario, veo un error inline "La contraseña debe contener al menos una mayúscula, una minúscula, un número y un símbolo" y el formulario no se envía; si la petición llega al backend, responde `400` con `VALIDATION_ERROR` y el código de campo `WEAK_PASSWORD` para `password`.
* **CA12 (Colegio ya registrado):** Dado que ya existe un colegio con el mismo nombre normalizado en el mismo municipio, cuando envío el formulario con un email no registrado, el sistema responde `409` con el código `SCHOOL_ALREADY_REGISTERED`, muestra el mensaje "Este colegio ya está registrado en ese municipio. Pide a un administrador del colegio que te invite.", no crea ni el colegio ni la cuenta, y registra el evento `USER_REGISTER_DUPLICATE` con `reason` `SCHOOL`. Si dos registros simultáneos crean el mismo colegio, solo uno se crea y el otro recibe esta misma respuesta.
* **CA13 (Municipio no válido):** Dado que no elijo ningún municipio de la lista, cuando intento enviar el formulario, veo un error inline "Selecciona el municipio del colegio en la lista" y el formulario no se envía; si la petición llega al backend sin municipio o con un código que no existe, responde `400` con `VALIDATION_ERROR` y el código de campo `REQUIRED` o `INVALID_FORMAT` para `municipalityCode`.

---

#### Requisitos Técnicos, QA y Riesgos

##### Requisitos de Testing

* **Unit Tests:** Validaciones de Regex de email, longitud/reglas de contraseña, sanitización `trim()`/`toLowerCase()` y generadores de hashing.
* **Tests de Seguridad:** Inyección SQL y XSS en campos de texto.
* **Tests de Accesibilidad:** Cumplimiento normativo **WCAG 2.1 AA** (foco en errores inline accesibles por lectores de pantalla via `aria-describedby` y `role="alert"`).
* **Datos de los E2E:** es la primera parte que escribe datos en los E2E. `scripts/e2e.mjs` vacía las tablas del esquema `public` de `calendarschool_test` (salvo `_prisma_migrations`) después de migrar y antes de arrancar el backend, con la misma salvaguarda que `resetDatabase()` (solo bases cuyo nombre termina en `_test`). Cada ejecución parte de cero, y los datos de una ejecución fallida quedan disponibles para investigarla.

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

* **Onboarding:** tras el registro, el usuario es redirigido automáticamente a la pantalla de bienvenida (US04 - Onboarding).

* **Compatibilidad con cookies deshabilitadas:** Mensaje inline notificando que se requieren cookies para mantener la sesión activa.

---

#### Criterios de Aceptación (MVP)

* **CA1 (Registro exitoso y Onboarding):** Dado que estoy en la pantalla de registro, cuando ingreso el nombre de mi colegio, un email válido, un nombre, apellidos y una contraseña válida de entre 8 y 128 caracteres, entonces se crean el colegio y la cuenta asociada a él, se almacena el email en minúsculas sanitizado, se inicia la sesión mediante cookie segura y soy redirigido automáticamente a la pantalla de bienvenida (US04 - Onboarding).

---

#### Requisitos Técnicos, QA y Riesgos

* **E2E Tests (Cypress):** Flujo completo de Registro -> Redirección a Onboarding.
* **Tests de Seguridad:** validación de políticas CORS, ataques de fijación de sesión y bypass CSRF.
* **Cookies:** Flag `HttpOnly` activado, flag `Secure` activado, propiedad `SameSite=Lax`.

---

#### Pendiente de decidir

* **Persistencia de los refresh tokens:** si la tabla `refresh_tokens` (`MODELO_DATOS.md`) se crea en esta parte o en US02.
* **Pantalla de Onboarding:** US04 aún no existe; decidir si se redirige a una página provisional hasta implementarla.

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

#### Pendiente de decidir

* **Dónde se guarda el contador:** en AWS Lambda (US00_b) un contador en memoria no se comparte entre instancias. Opciones: tabla en PostgreSQL, throttling de API Gateway o WAF, o aceptar un límite por instancia en el MVP.
* **"Fingerprint":** no está definido qué es ni cómo se calcula; decidir si el límite es solo por IP.
* **IP real del cliente:** detrás del proxy de Vite, o de CloudFront y API Gateway en producción (US00_b), la IP que ve Express no es la del cliente, que llega en `X-Forwarded-For`. Decidir cómo se lee esa cabecera y cómo se evita que un cliente la falsee (p. ej. llamando a API Gateway sin pasar por CloudFront).

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

#### Pendiente de decidir

* **reCAPTCHA en desarrollo, tests y E2E:** claves de prueba de Google o un verificador falso seleccionado por configuración, para que los tests no dependan de un servicio externo.
* **Google no responde:** decidir si el registro se rechaza o se permite cuando la verificación falla por un error del servicio.

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

#### Pendiente de decidir

* **Alcance de `sessionStorage`:** sobrevive a las recargas y a la restauración de sesión del navegador, pero no al cierre de la pestaña ni del navegador. Si el requisito es sobrevivir a un cierre, haría falta `localStorage`, con implicaciones de privacidad en equipos compartidos.
* **Token de formulario único por sesión:** antes del registro no hay sesión, y la unicidad del email en la base de datos (US01_b, CA3) ya impide que dos envíos simultáneos creen dos cuentas. Decidir si basta con eso y con desactivar el botón durante el envío, o si se mantiene el token.


### US02: Inicio de sesión de usuario registrado

**Épica:** [1. Autenticación y Gestión de Sesiones](#epica-1-autenticacion-y-gestion-de-sesiones)

**Historia:** Como usuario registrado, quiero iniciar sesión con mi email y contraseña, para acceder a los datos y funcionalidades de mi colegio de forma segura.

---

#### Casos de uso y reglas de negocio

* **Normalización de email:**
  * El email se normaliza automáticamente a minúsculas (sin importar cómo lo ingrese el usuario).
  * Se eliminan espacios al inicio y al final del email.
  * Ejemplo: ` JUAN@COLEGIO.ES ` ✗

* **Protección contra ataques de fuerza bruta:**
  * Máximo 5 intentos fallidos por IP cada 15 minutos.
  * Máximo 10 intentos por email cada 24 horas.
  * Si se superan estos límites, se bloquea temporalmente el acceso.
  * Se notifica al usuario si su cuenta recibe múltiples intentos de acceso desde diferentes IPs.

* **Mitigación de timing attacks:**
  * El tiempo de respuesta debe ser consistente (~500ms) independientemente de si el email existe o no.
  * Esto previene que atacantes enumeren usuarios válidos midiendo tiempos de respuesta.

* **Gestión de múltiples sesiones:**
  * El usuario puede tener múltiples sesiones activas simultáneamente desde diferentes dispositivos.
  * Cada sesión tiene su propio token de acceso y refresh token.

* **Renovación automática de tokens:**
  * El access token (15 minutos) expira pero se renueva automáticamente usando el refresh token (24 horas).
  * El usuario NO experimenta interrupciones ni logouts inesperados.
  * Si el refresh token también expira, el usuario es desconectado.

* **Flujos de resiliencia:**
  * Si las cookies están deshabilitadas en el navegador, se muestra una advertencia clara al usuario.
  * Validación de campos obligatorios (email y contraseña) se realiza tanto en frontend como en backend.

* **Almacenamiento seguro de tokens:**
  * Los tokens se almacenan en cookies con flags de seguridad (HttpOnly, Secure, SameSite).
  * NO se almacenan en localStorage (previene vulnerabilidades XSS).

* **Estado de la cuenta:**
  * Solo cuentas en estado `ACTIVE` pueden hacer login.
  * Cuentas `SUSPENDED` o `DELETED` ven un mensaje de error específico.

* **Verificación de email:**
  * Si el email del usuario no ha sido verificado, se permite login pero con acceso limitado.
  * Se muestra notificación: "Por favor, verifica tu email para acceso completo".

* **Detección de dispositivos desconocidos:**
  * Si el login ocurre desde un dispositivo o ubicación no vista anteriormente, se notifica al usuario por email.
  * El usuario recibe opción de "Asegurar su cuenta" si no reconoce el acceso.

* **Logging y auditoría:**
  * Todos los intentos de login (exitosos y fallidos) se registran con: email, timestamp, IP del cliente, User-Agent.
  * Los logs NO incluyen contraseñas, tokens ni datos sensibles.
  * Los logs se conservan durante 90 días para auditoría.

---

#### Restricciones de campos y formatos

##### Email en Login

* **Normalización:** Siempre convertido a minúsculas y trimado de espacios.
* **Validación:** Mismo formato RFC 5321 SMTP que en registro.
* **Longitud máxima:** 320 caracteres.

---

#### Criterios de Aceptación (Ampliados)

* **CA1 (Login exitoso - usuario con onboarding completado):** Dado que estoy registrado, mi email ha sido verificado, y he completado el onboarding, cuando ingreso mi email (normalizado automáticamente) y contraseña correcta y presiono "Iniciar Sesión", entonces se valida mi identidad, se crea una sesión segura con tokens (access 15min + refresh 24h), y soy redirigido al dashboard principal. Se registra el evento en logs (email, timestamp, IP, User-Agent).

* **CA2 (Contraseña incorrecta):** Dado que ingreso un email correcto pero contraseña incorrecta, cuando presiono "Iniciar Sesión", entonces veo un error genérico "Email o contraseña incorrectos" (sin revelar cuál es incorrecto). El tiempo de respuesta es consistente (~500ms). El intento se registra en logs.

* **CA3 (Email no existe):** Dado que intento iniciar sesión con un email que no está registrado, cuando presiono "Iniciar Sesión", entonces veo el MISMO error genérico "Email o contraseña incorrectos" (sin revelar que el email no existe). El tiempo de respuesta es idéntico al CA2. El intento se registra en logs.

* **CA4 (Almacenamiento seguro de tokens):** Dado que estoy autenticado, cuando reviso las cookies de la aplicación (no localStorage), entonces veo una cookie de sesión con flags de seguridad: HttpOnly, Secure, SameSite. La cookie contiene un refresh token válido (TTL 24 horas) que se envía automáticamente en cada petición.

* **CA5 (Renovación automática de tokens):** Dado que mi access token (TTL 15 minutos) expira durante una sesión activa, cuando intento hacer una petición después de su expiración, entonces el sistema automáticamente usa el refresh token para obtener un nuevo access token sin que el usuario lo perciba. La petición original se reintenta automáticamente.

* **CA6 (Rate limiting por IP):** Dado que intento hacer login 6 veces con contraseña incorrecta desde la misma IP en 15 minutos, cuando intento el sexto intento, entonces recibo error HTTP 429 "Demasiados intentos. Intenta de nuevo en 15 minutos". La IP queda bloqueada temporalmente.

* **CA7 (Rate limiting por email):** Dado que intento hacer login 11 veces con el mismo email en 24 horas, cuando intento el undécimo intento, entonces recibo error "Cuenta temporalmente bloqueada. Intenta mañana". Se envía notificación por email al usuario alertando de múltiples intentos fallidos.

* **CA8 (Email con mayúsculas y espacios):** Dado que intento hacer login con email en mayúsculas o con espacios (`  JUAN@COLEGIO.ES  `), cuando presiono "Iniciar Sesión", entonces el email se normaliza automáticamente a minúsculas y sin espacios. El login procede normalmente si las credenciales son correctas.

* **CA9 (Cuenta suspendida):** Dado que mi cuenta ha sido desactivada o suspendida por admin, cuando intento hacer login, entonces recibo error específico "Tu cuenta ha sido desactivada. Contacta al administrador" (diferente al error genérico). No se registra como "intento fallido" en rate limiting.

* **CA10 (Email no verificado):** Dado que intento hacer login con una cuenta cuyo email no ha sido verificado, cuando presiono "Iniciar Sesión", entonces se me permite hacer login pero con acceso limitado. Se muestra notificación "Por favor, verifica tu email para acceso completo" con opción de reenviar email de verificación.

* **CA11 (Campos obligatorios):** Dado que intento hacer login sin email o con contraseña vacía, cuando presiono "Iniciar Sesión", entonces veo errores inline "El email es obligatorio" / "La contraseña es obligatoria". El formulario no se envía.

* **CA12 (Validación de formato de email):** Dado que intento hacer login con un email con formato inválido, cuando presiono "Iniciar Sesión", entonces veo error inline "Formato de email inválido". El formulario no se envía.

* **CA13 (Redirección post-login):** Dado que completo login exitosamente, cuando la sesión se establece, entonces: Si completé onboarding (US04), soy redirigido al Dashboard. Si NO completé onboarding, soy redirigido a US04 (Onboarding). El sistema verifica el estado en la base de datos.

* **CA14 (Notificación de dispositivo desconocido):** Dado que hago login desde un dispositivo o ubicación no visto anteriormente, cuando el sistema detecta el nuevo dispositivo, entonces se me envía notificación por email: "Se detectó nuevo acceso a tu cuenta desde [Dispositivo/Ubicación]. Si no fuiste tú, haz clic aquí para asegurar tu cuenta".

* **CA15 (Logging de auditoría):** Dado que hago login (exitoso o fallido), cuando el sistema registra el evento, entonces se loguea: email, timestamp, IP del cliente, User-Agent, resultado (success/failure), motivo del fallo si aplica. NUNCA se loguea: contraseña, tokens, datos sensibles.

---

#### Requisitos Técnicos, QA y Riesgos

##### Requisitos de Testing (Pre-release)

* **Unit Tests:** Validaciones de email normalizado (lowercase, trim), verificación de Bcrypt, comparación de hashes.
* **E2E Tests (Cypress):** Flujo completo de Login -> Redirección según estado onboarding -> Validación de refresh token.
* **Tests de Seguridad:** Timing attacks (verificar tiempos de respuesta consistentes), brute force (verificar rate limiting), enumeración de usuarios.
* **Tests de Rendimiento:** Prueba de carga con 1000 logins simultáneos, verificar que respuestas se mantienen bajo 500ms.
* **Tests de Accesibilidad:** Errores inline accesibles por lectores de pantalla (aria-describedby, role="alert").

##### Riesgos y Mitigaciones

* **Seguridad:**
  * **Timing attacks:** El tiempo de respuesta debe ser idéntico para email existente vs. no existente.
  * **Brute force:** Rate limiting por IP y por email previene ataques de fuerza bruta.
  * **Session fixation:** Se regenera completamente el ID de sesión tras login exitoso.
  * **Cookies:** Flags HttpOnly, Secure, SameSite previenen XSS, MITM, CSRF.
  * **Enumeración de usuarios:** Mensajes de error genéricos sin revelar si email existe.
  * *Nota:* el registro (US01_b, CA3) sí revela si un email está registrado (riesgo aceptado). Estas medidas se mantienen porque siguen siendo buena práctica (no indican si falla el email o la contraseña) y quedarán completas si se añade la verificación por email, pero no son por sí solas una protección completa frente a la enumeración.

* **Observabilidad (Auditoría de Logs):**
  * Registrar eventos estructurados: `USER_LOGIN_SUCCESS`, `USER_LOGIN_FAILED_PASSWORD`, `USER_LOGIN_FAILED_NOT_FOUND`, `USER_LOGIN_RATE_LIMITED`.
  * **Payload del log:** `timestamp` + `email` enmascarado + `ip` + `user_agent` + `reason` (datos personales según la regla común de US01_b).

* **Internacionalización (i18n):**
  * Extraer todos los mensajes de error y notificaciones a archivos de recursos JSON para soporte multiidioma.



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
* **CA10 (Último administrador):** Dado que soy el único `ADMIN` activo del colegio, cuando intento cambiar mi rol a `MEMBER` o darme de baja, entonces veo el mensaje "El colegio debe tener al menos un administrador" y la API responde `409` con `LAST_ADMIN_REQUIRED` sin cambiar nada.
* **CA11 (Un miembro no gestiona usuarios):** Dado que soy `MEMBER`, cuando entro en la aplicación, entonces no veo las opciones de usuarios e invitaciones, y si llamo directamente a sus endpoints la API responde `403` con `FORBIDDEN`.
* **CA12 (Aislamiento entre colegios):** Dado que soy `ADMIN` de un colegio, cuando intento ver, cambiar o dar de baja un usuario, o revocar una invitación, de otro colegio, entonces la API responde `404` con `NOT_FOUND` y no se modifica nada.
* **CA13 (Aceptaciones simultáneas):** Dado un enlace de invitación válido, cuando se envía el formulario dos veces a la vez con emails distintos, entonces solo se crea un usuario y el otro envío recibe la respuesta de CA5.

---

#### Requisitos Técnicos, QA y Riesgos

* **Enlaces de acceso:** las invitaciones y los enlaces de restablecimiento de contraseña (US02_c) comparten el mismo mecanismo (tabla y lógica): token aleatorio guardado como hash, propósito (invitación o restablecimiento), caducidad de 72 horas, un solo uso y revocación.
* **Página del enlace:** se sirve con `Referrer-Policy: no-referrer` y no carga recursos de terceros.
* **Contrato:** los endpoints de invitaciones y usuarios y los códigos `FORBIDDEN`, `ACCESS_LINK_INVALID` y `LAST_ADMIN_REQUIRED` se definen primero en `docs/api-spec.yml` (con su `ERROR_CODES` en el backend).
* **Tests:** unitarios de la generación y verificación del token, de la caducidad y de la regla del último administrador; integración de la aceptación concurrente (CA13) y del aislamiento entre colegios (CA12); E2E del flujo completo: generar, copiar, aceptar e iniciar sesión.
* **Observabilidad:** eventos `INVITATION_CREATED`, `INVITATION_REVOKED`, `INVITATION_ACCEPTED`, `USER_ROLE_CHANGED` y `USER_SUSPENDED`, con el colegio y el usuario que actúa. Datos personales según la regla común de US01_b; el token nunca se registra.
* **Riesgos:**
* **Enlace reenviado a quien no debe:** cualquiera con el enlace puede crear una cuenta en el colegio. Se acota con el uso único, la caducidad de 72 horas, la revocación y la lista de usuarios, en la que el administrador ve quién se ha unido y puede darlo de baja.
* **Fuerza bruta sobre los tokens:** se acota con la longitud del token y el límite de intentos.

---

#### Pendiente de decidir

* **Reactivar un usuario dado de baja:** como el email es único, un usuario `SUSPENDED` no puede volver a unirse con una invitación usando el mismo email. Decidir si el administrador puede reactivarlo o si queda fuera del MVP.



### US03: Cierre de sesión

**Épica:** [1. Autenticación y Gestión de Sesiones](#epica-1-autenticacion-y-gestion-de-sesiones)

**Historia:** Como usuario autenticado, quiero cerrar sesión de forma segura, para desconectarme de CalendarSchool y proteger mi cuenta.

---

#### Casos de uso y reglas de negocio

* **Invalidación completa de tokens:**
  * Al cerrar sesión, se invalidan AMBOS: access token (15 min) y refresh token (24h).
  * Si alguien intenta reutilizar el refresh token después: recibe error 401 "Token revocado o inválido".
  * Los tokens revocados se registran en una lista de exclusión en el backend.

* **Limpieza de datos de sesión:**
  * Se eliminan todas las cookies de sesión (Set-Cookie con Max-Age=0).
  * Se limpian completamente: localStorage, sessionStorage.
  * Se cancelan todas las peticiones AJAX/XHR que estén en progreso.

* **Confirmación de logout:**
  * Antes de cerrar sesión, se muestra diálogo de confirmación: "Â¿Deseas cerrar sesión?".
  * Opciones: "Cancelar" (permanece autenticado) / "Cerrar Sesión" (procede logout).
  * Si el usuario tiene cambios sin guardar en formulario, se muestra advertencia adicional.

* **Validación en rutas protegidas:**
  * CADA endpoint protegido DEBE validar el token en backend.
  * Si token es inválido/expirado/revocado: responder con 401 Unauthorized.
  * Frontend captura 401 y redirige a login automáticamente.

* **Gestión de múltiples sesiones y dispositivos:**
  * Logout en un dispositivo (Desktop) NO cierra sesión en otros (Móvil).
  * Cada dispositivo tiene su propia sesión con token único.
  * Si policy es cerrar TODAS las sesiones, debe notificarse explícitamente.

* **Sincronización entre pestañas:**
  * Si el usuario tiene CalendarSchool abierto en 2 pestañas del mismo navegador.
  * Cuando cierra sesión en Pestaña 1, se invalida cookie globalmente.
  * Pestaña 2 recibe notificación (BroadcastChannel) y es redirigida a login automáticamente.

* **Manejo de logout con peticiones pendientes:**
  * Cuando usuario presiona "Cerrar Sesión" y hay peticiones AJAX en vuelo.
  * Todas las peticiones pendientes se cancelan inmediatamente.
  * Usuario NO ve datos parciales, errores técnicos, ni inconsistencias.

* **Redirección post-logout:**
  * Después de logout exitoso, usuario es redirigido a URL estándar: `/login`.
  * Esta redirección ocurre SIEMPRE, independientemente de qué ruta estaba visitando.

* **Control de caché del navegador:**
  * Headers HTTP incluyen: Cache-Control: no-cache, no-store, must-revalidate.
  * Si usuario presiona botón "Atrás" después de logout, NO ve datos sensibles en caché.
  * Peticiones a datos sensibles fallan con 401 Unauthorized.

* **Logout activado por admin:**
  * Administrador puede cerrar sesión de cualquier usuario desde admin panel (logout forzado).
  * Usuario recibe notificación por email: "Tu sesión fue cerrada por administrador".
  * En siguiente intento de petición, recibe: 401 "Sesión cerrada por administrador".

* **Auditoría y logging de logout:**
  * Todos los eventos de logout (exitosos y fallidos) se registran con:
    - Email del usuario
    - Timestamp exacto (ISO 8601)
    - IP del cliente
    - User-Agent
    - Motivo del logout (user-initiated vs. admin-forced vs. expired)
  * Logs se conservan 90 días para auditoría.
  * NUNCA se loguean: tokens, cookies, datos sensibles.

* **Soporte para sesiones offline:**
  * Si usuario intenta logout sin conexión a internet.
  * Se limpian tokens locales (cookies, localStorage) de forma inmediata.
  * Cuando hay conexión: sincronizar logout con backend (invalidar refresh token).

---

#### Restricciones y consideraciones

* **Tokens:** Ambos access + refresh tokens deben ser invalidados simultáneamente.
* **Cookies:** Deben tener flags de seguridad: HttpOnly, Secure, SameSite.
* **Validación:** Backend es source of truth para validación de token (no confiar solo en frontend).
* **Confirmación:** Usuario debe confirmar antes de logout (excepto en casos de sesión expirada).

---

#### Criterios de Aceptación (Ampliados - 15 CAs)

* **CA1 (Logout exitoso con confirmación):** Dado que estoy autenticado y presiono "Cerrar Sesión", cuando confirmo en el diálogo "Â¿Deseas cerrar sesión?", entonces SE INVALIDAN AMBOS tokens (access + refresh), se limpian cookies/localStorage/sessionStorage, se cancelan peticiones AJAX pendientes, soy redirigido a /login, y se registra el evento en logs (email, timestamp, IP, User-Agent).

* **CA2 (Acceso denegado post-logout):** Dado que he cerrado sesión correctamente, cuando intento acceder a cualquier ruta protegida (/dashboard), entonces backend rechaza con 401 Unauthorized, frontend redirige a /login automáticamente, y token inválido NO permite acceso aunque cookies residuales persistan.

* **CA3 (Sesión cerrada tras cerrar navegador):** Dado que he cerrado sesión y cierto el navegador, cuando reabre el navegador y accedo a /dashboard, entonces no hay cookies válidas enviadas al servidor, backend rechaza con 401, soy redirigido a /login automáticamente.

* **CA4 (Logout en múltiples dispositivos - sesiones aisladas):** Dado que tengo sesiones activas en Desktop y Móvil, cuando cierro sesión en Desktop, entonces SOLO la sesión de Desktop se invalida, sesión de Móvil permanece activa sin interrupciones.

* **CA5 (Logout en múltiples pestañas - sincronización):** Dado que tengo CalendarSchool abierto en 2 pestañas del mismo navegador, cuando cierro sesión en Pestaña 1, entonces cookie se invalida globalmente, Pestaña 2 recibe notificación (BroadcastChannel) de invalidación, Pestaña 2 es redirigida a /login automáticamente sin intervención manual.

* **CA6 (Peticiones pendientes se cancelan):** Dado que cierro sesión mientras hay peticiones AJAX en progreso, cuando el sistema procesa logout, entonces todas las peticiones pendientes se cancelan inmediatamente, usuario NO ve datos parciales ni errores técnicos, solo ve página de login.

* **CA7 (Confirmación de logout):** Dado que presiono "Cerrar Sesión", cuando aparece diálogo de confirmación, entonces veo mensaje "Â¿Deseas cerrar sesión?" con opciones "Cancelar" / "Cerrar Sesión". Solo si confirmo, se procesa logout.

* **CA8 (Advertencia de cambios sin guardar):** Dado que tengo cambios sin guardar en formulario, cuando intento cerrar sesión, entonces se muestra advertencia "Tienes cambios sin guardar. Â¿Deseas cerrar sesión de todas formas?" con opciones: "Continuar sin guardar" (descarta y logout) / "Cancelar" (vuelve a formulario).

* **CA9 (Refresh token invalido post-logout):** Dado que cierro sesión correctamente, cuando alguien intenta usar mi refresh token después, entonces backend rechaza con 401 "Token revocado o inválido" (token no puede ser reutilizado jamás).

* **CA10 (Auditoría de logout):** Dado que cierro sesión, cuando el sistema registra el evento, entonces se loguea: email, timestamp (ISO 8601), IP del cliente, User-Agent, resultado (success/failure), motivo. NUNCA se loguea: contraseña, tokens, cookies, datos sensibles.

* **CA11 (Logout forzado por admin):** Dado que admin cierra mi sesión desde admin panel, cuando intento hacer cualquier petición después, entonces petición falla con 401 "Sesión cerrada por administrador", soy redirigido a /login, recibo email notificando el cierre forzado.

* **CA12 (Cache del navegador limpiado):** Dado que cierro sesión y presiono botón "Atrás" en navegador, entonces página anterior NO es mostrada con datos sensibles desde caché. Headers HTTP incluyen: Cache-Control: no-store. Peticiones a datos sensibles fallan (401).

* **CA13 (Validación de token en cada ruta):** Dado que estoy navegando después de logout, cuando intento acceder a cualquier endpoint protegido, entonces backend SIEMPRE valida: Â¿token enviado? Â¿token válido (no expirado)? Â¿token no está revocado? Si falla: responder 401 Unauthorized. No hay excepciones.

* **CA14 (Redirección a URL estándar):** Dado que cierro sesión desde cualquier ruta (/cursos/1/editar), cuando logout se completa, entonces soy redirigido SIEMPRE a URL estándar /login (independientemente de la ruta anterior).

* **CA15 (Logout offline con sync posterior):** Dado que intento cerrar sesión sin conexión a internet, cuando presiono "Cerrar Sesión", entonces se limpian tokens locales (cookies, localStorage) de inmediato, usuario ve confirmación de logout, cuando hay conexión: sincronizar con backend para invalidar refresh token en servidor.

---

#### Requisitos Técnicos, QA y Riesgos

##### Requisitos de Testing (Pre-release)

* **Unit Tests:** Invalidación de tokens, limpieza de cookies/localStorage, validación de token en rutas.
* **E2E Tests (Cypress):** Flujo completo: Logout ✗
* **Tests de Seguridad:** Token revocation (refresh token no reutilizable), session fixation, cookie hijacking prevention.
* **Tests de Concurrencia:** Peticiones pendientes se cancelan durante logout, múltiples pestañas se sincronizan.
* **Tests de Performance:** Logout en < 200ms, cancelación de peticiones en < 100ms.
* **Tests de Accesibilidad:** Diálogo de confirmación accesible (aria-labels, navegación por teclado).

##### Riesgos y Mitigaciones

* **Seguridad:**
  * **Token reutilización:** Mantener lista de tokens revocados. Verificar en cada petición.
  * **Session fixation:** Cambiar completamente session ID en cada logout/login.
  * **Cache leakage:** Headers Cache-Control: no-store + validación en backend.
  * **Peticiones fantasma:** Cancelar todas AJAX pendientes al logout.
  * **Admin forced logout:** Comunicar inmediatamente al usuario (email + notificación).

* **Observabilidad (Auditoría de Logs):**
  * Registrar eventos estructurados: `USER_LOGOUT_SUCCESS`, `USER_LOGOUT_ADMIN_FORCED`, `USER_LOGOUT_EXPIRED`.
  * **Payload del log:** `timestamp` + `email` enmascarado + `ip` + `user_agent` + `reason` (datos personales según la regla común de US01_b).

* **Internacionalización (i18n):**
  * Extraer mensajes de confirmación, advertencias, notificaciones a archivos JSON para multiidioma.

### US04: Pantalla de bienvenida

**Épica:** [1. Autenticación y Gestión de Sesiones](#epica-1-autenticacion-y-gestion-de-sesiones)

**Historia:** Como usuario autenticado, quiero ver una pantalla de bienvenida con acceso a las dos funcionalidades principales de CalendarSchool, para acceder rápidamente a lo que necesito.

---

#### Casos de uso y reglas de negocio

* **Acceso directo sin validación:**
  * La pantalla de bienvenida NO es un onboarding obligatorio.
  * Usuario autenticado puede acceder directamente desde `/welcome` o post-registro.
  * Si usuario ya visitó `/welcome`, puede navegar directamente a `/dashboard` o a cualquier módulo.

* **Dos funcionalidades principales:**
  * "Gestión de Horarios": acceso a gestión de cursos, profesores, restricciones y generación de horarios.
  * "Gestión de Comedor": acceso a gestión de alumnos, inscripciones a comedor y registro de asistencia.

* **Navegación clara:**
  * Dos botones/tarjetas destacados, uno por funcionalidad.
  * Cada botón incluye icono representativo y descripción breve.
  * Usuario puede hacer clic en cualquiera sin obligación de elegir ambas.

* **Protección de ruta:**
  * Solo usuarios autenticados pueden ver `/welcome`.
  * Si usuario no autenticado intenta acceder: redirigido a `/login`.

* **Redirección post-registro:**
  * Tras registro exitoso (US01), usuario es redirigido automáticamente a `/welcome`.
  * Usuario está autenticado en este punto.

* **Acceso al dashboard:**
  * Desde `/welcome`, usuario puede hacer clic en "Ir al dashboard" (botón secundario).
  * O presionar botón "Atrás" del navegador para ir a `/dashboard`.
  * O hacer clic en logo de CalendarSchool para ir a `/dashboard`.

* **Responsive design:**
  * Pantalla es responsive en móvil y desktop.
  * Botones tienen tamaño adecuado para interacción en cualquier dispositivo.

* **Accesibilidad:**
  * Errores y elementos interactivos son accesibles (WCAG 2.1 AA).
  * Navegación por teclado funciona correctamente.
  * Contrastes de color cumplen estándares.

---

#### Criterios de Aceptación

* **CA1 (Pantalla de bienvenida tras registro):** Dado que acabo de registrarme exitosamente, cuando soy redirigido tras el registro, entonces veo pantalla de bienvenida con: título "Bienvenido", logo de CalendarSchool, dos botones destacados ("Gestión de Horarios" y "Gestión de Comedor") con descripciones breves, y botón secundario "Ir al dashboard".

* **CA2 (Acceso a Gestión de Horarios):** Dado que estoy en pantalla de bienvenida, cuando hago clic en "Gestión de Horarios", entonces soy redirigido a `/horarios` (dashboard de gestión de horarios) o `/cursos` (si no hay cursos creados).

* **CA3 (Acceso a Gestión de Comedor):** Dado que estoy en pantalla de bienvenida, cuando hago clic en "Gestión de Comedor", entonces soy redirigido a `/comedor` (dashboard de gestión de comedor) o `/alumnos` (si no hay alumnos creados).

* **CA4 (Protección de ruta):** Dado que intento acceder a `/welcome` sin estar autenticado, cuando cargo la URL directamente, entonces soy redirigido a `/login` automáticamente.

* **CA5 (Acceso directo a dashboard):** Dado que estoy en pantalla de bienvenida, cuando hago clic en "Ir al dashboard" o en el logo, entonces soy redirigido a `/dashboard` (página principal).

* **CA6 (Navegación flexible):** Dado que estoy en pantalla de bienvenida, cuando presiono botón "Atrás" del navegador, entonces soy redirigido a `/dashboard`. (La pantalla de bienvenida NO bloquea navegación).

* **CA7 (Responsive design):** Dado que accedo a `/welcome` desde dispositivo móvil, cuando la pantalla carga, entonces diseño es responsive, botones son fáciles de presionar (mínimo 44x44 px), y texto es legible sin zoom.

* **CA8 (Accesibilidad):** Dado que navego por la pantalla usando teclado, cuando utilizo Tab para recorrer elementos, entonces todos los botones son accesibles, etiquetas son descriptivas, y colores tienen contraste adecuado (WCAG 2.1 AA).

---

#### Requisitos Técnicos, QA y Riesgos

##### Requisitos de Testing (Pre-release)

* **Functional Tests:** Redireccionamiento post-registro, clic en botones, validación de autenticación.
* **E2E Tests:** Flujo completo: Registro ✗
* **Accesibilidad:** Navegación por teclado, contraste de colores, aria-labels, WCAG 2.1 AA.
* **Responsive:** Visualización correcta en móvil (iPhone 5+) y desktop.
* **Performance:** Carga en < 500ms, assets optimizados.

##### Riesgos y Mitigaciones

* **Seguridad:**
  * Validación de autenticación en ruta: sin token ✗
  * No exponer información sensible en pantalla de bienvenida.

* **Experiencia de Usuario:**
  * Pantalla no es bloqueante: usuario puede navegar a cualquier parte sin pasar por aquí.
  * No hay frustración por "onboarding obligatorio".

* **Internacionalización (i18n):**
  * Textos ("Gestión de Horarios", "Gestión de Comedor", etc.) extraídos a JSON para multiidioma (futura expansión).

---

## Módulo: Gestión de Cursos

### US05: Crear un curso con clases y tutores

**Épica:** [2. Gestión de Cursos y Estructura Base](#epica-2-gestion-de-cursos-y-estructura-base)

**Historia:** Como jefe de estudios, quiero crear un curso (ej. "1º Primaria") con sus clases (A, B, etc.) y asignar un tutor a cada una, para estructurar la organización del colegio.

---

#### Casos de uso y reglas de negocio

* **Estructura de curso y clases:**
  * Curso = nivel educativo (ej. "1º Primaria", "Infantil 3 años", "6º Primaria").
  * Cada curso puede tener múltiples clases (A, B, C, etc.).
  * Cada clase requiere un tutor asignado.

* **Validación de nombres:**
  * Nombre de curso debe ser único (no se permite duplicar nombres de cursos).
  * Nombre de clase debe ser único DENTRO del mismo curso (no puede haber dos "A" en "1º Primaria").
  * Caracteres permitidos: alfanuméricos (A-Z, a-z, 0-9) + caracteres especiales (º, Âª, -, espacio, etc.).
  * Ambos campos son obligatorios.

* **Gestión de tutores:**
  * Un tutor solo puede ser tutor de UNA clase (no puede tutorizar múltiples clases simultáneamente).
  * Tutor debe existir en BD como profesor del colegio y estar en estado ACTIVE.
  * Se muestra dropdown filtrable con lista de profesores disponibles (nombre + apellido).
  * Si no hay profesores disponibles, se muestra mensaje claro.

* **Protección de formulario:**
  * Botón "Guardar" se deshabilita tras primer clic (previene doble envío).
  * Si usuario intenta enviar dos veces rápidamente, solo se crea UN curso.

* **Sincronización y cascada:**
  * Si un profesor es borrado (US09 - Borrar profesor):
    * Se elimina automáticamente como tutor de la clase.
    * Se elimina de los horarios en los que esté asignado (US19).
    * Clase queda SIN tutor (requiere reasignar).

* **Manejo de errores:**
  * Errores de validación se muestran inline debajo del campo correspondiente.
  * Errores del servidor se muestran con mensaje claro, sin tecnicismos.
  * Si servidor falla: "No se pudo crear el curso. Intenta de nuevo".

---

#### Restricciones de campos y formatos

##### Nombre de Curso
* **Carácter obligatorio**: Sí.
* **Caracteres permitidos**: Alfanuméricos (A-Z, a-z, 0-9) + especiales (º, Âª, -, /, espacio).
* **Límite**: 100 caracteres máximo.
* **Unicidad**: No puede haber dos cursos con mismo nombre.
* **Ejemplos válidos**: "1º Primaria", "Infantil 3 años", "6º Primaria", "2Âª ESO".

##### Nombre de Clase
* **Carácter obligatorio**: Sí.
* **Caracteres permitidos**: Alfanuméricos (A-Z, a-z, 0-9) + especiales (º, Âª).
* **Límite**: 10 caracteres máximo.
* **Unicidad**: Dentro del MISMO curso (no puede haber dos "A").
* **Ejemplos válidos**: "A", "B", "1ÂªA", "Grupo A".
* **Sin límite máximo**: Se pueden crear N clases por curso.

##### Tutor
* **Carácter obligatorio**: Sí, una clase sin tutor no puede crearse.
* **Validación**: Profesor debe existir en BD y estar ACTIVE.
* **Restricción crítica**: Un tutor solo puede estar asignado a UNA clase en todo el colegio.
* **Interfaz**: Dropdown filtrable por nombre/apellido con búsqueda en tiempo real.
* **Fallback**: Si no hay profesores disponibles, mostrar mensaje "No hay profesores disponibles. Crea profesores primero en Gestión de Profesores".

---

#### Criterios de Aceptación (Ampliados - 10 CAs)

* **CA1 (Crear curso exitoso):** Dado que estoy en la sección de gestión de cursos, cuando completo el formulario con nombre de nivel ("1º Primaria"), clases ("A", "B") y asigno tutores VÀLIDOS para cada clase, entonces el curso se crea exitosamente, aparece en el listado, y cada clase muestra el tutor asignado.

* **CA2 (Nombre de nivel obligatorio):** Dado que intento crear un curso sin indicar nombre de nivel, cuando intento enviar el formulario, entonces veo error inline "El nombre del nivel es obligatorio" y el formulario no se envía.

* **CA3 (Al menos una clase obligatoria):** Dado que intento crear un curso sin asignar al menos una clase, cuando intento enviar el formulario, entonces veo error "Debe indicar al menos una clase para el curso" y el formulario no se envía.

* **CA4 (Tutor válido requerido):** Dado que intento asignar un tutor inválido o no existente a una clase, cuando intento enviar el formulario, entonces veo error inline "Debe asignar un tutor válido a cada clase".

* **CA5 (Curso aparece en listado):** Dado que cree exitosamente un curso "1º Primaria" con clases A (tutor Juan) y B (tutor María), cuando veo el listado de cursos, entonces aparece "1º Primaria" con estructura: Clase A - Juan, Clase B - María.

* **CA6 (Nombre de curso es único):** Dado que intento crear un segundo curso con mismo nombre "1º Primaria", cuando intento enviar el formulario, entonces veo error "Este curso ya existe en el sistema. Usa otro nombre".

* **CA7 (Nombre de clase es único dentro del curso):** Dado que intento crear dos clases con mismo nombre ("A") en el mismo curso "1º Primaria", cuando intento enviar el formulario, entonces veo error "Ya existe una clase A en este curso".

* **CA8 (Un tutor en una sola clase):** Dado que asigno profesor "Juan" como tutor de clase A en "1º Primaria", cuando intento asignar "Juan" como tutor de otra clase en el mismo u otro curso, entonces veo error "Este profesor ya es tutor de otra clase. Elige otro profesor".

* **CA9 (Protección contra doble envío):** Dado que presiono "Guardar" dos veces rápidamente, cuando intento guardar, entonces botón "Guardar" se deshabilita tras primer clic, y solo se crea UN curso (no duplicados).

* **CA10 (Interfaz de selección de tutor y fallback):** Dado que intento asignar tutor a una clase, cuando hago clic en campo de tutor, entonces aparece dropdown filtrable con lista de profesores disponibles (nombre + apellido). Si no hay profesores disponibles, veo mensaje "No hay profesores disponibles. Crea profesores primero en Gestión de Profesores".

* **CA11 (Sincronización cascada - profesor borrado):** Dado que un profesor es borrado del sistema (US09), cuando se ejecuta eliminación, entonces ese profesor se remueve automáticamente como tutor de la clase, se elimina de los horarios donde estaba asignado (US19), y clase queda sin tutor (requiere reasignación).

* **CA12 (Manejo de errores server-side):** Dado que frontend valida OK pero backend falla (ej., profesor borrado simultáneamente), cuando intento guardar, entonces veo error claro "No se pudo crear el curso. Intenta de nuevo" (SIN mensajes técnicos).

* **CA13 (Caracteres especiales permitidos):** Dado que intento crear curso con nombre "1º Primaria", "Infantil 3 años", "6Âª Primaria", cuando envío el formulario, entonces se acepta (alfanuméricos + º, Âª, -, / permitidos).

---

#### Requisitos Técnicos, QA y Riesgos

##### Requisitos de Testing (Pre-release)

* **Unit Tests:** Validación de uniqueness (curso, clase), validación de tutor, restricción "un tutor por clase".
* **E2E Tests:** Crear curso completo ✗
* **Tests de Seguridad:** Prevención de doble envío, SQL injection en nombre de curso.
* **Tests de Cascada:** Borrar profesor ✗
* **Performance:** Búsqueda de tutores en dropdown con 1000+ profesores (búsqueda filtrada).

##### Riesgos y Mitigaciones

* **Integridad referencial:**
  * Un tutor asignado a clase NO puede ser eliminado de profesor (cascade delete en BD).
  * Si profesor es borrado, clase debe quedar sin tutor (permitir null en BD).
  * Horarios con ese profesor deben ser actualizados/eliminados (cascada).

* **Concurrencia:**
  * Si dos admin crean clase y asignan mismo tutor simultáneamente, segundo intento falla.
  * Validación en BD: UNIQUE constraint en (class_id, teacher_id).

* **Observabilidad (Auditoría de Logs):**
  * Registrar eventos: `COURSE_CREATED`, `CLASS_CREATED`, `TEACHER_ASSIGNED`.
  * **Payload del log**: timestamp + usuario + course_id + clase_ids + teacher_ids.

* **Internacionalización (i18n):**
  * Extraer mensajes de error a archivos JSON para multiidioma (futura expansión).

---

## Dependencias

* **Depende de US09 (Crear profesor)**: Debe haber profesores disponibles para asignar como tutores.
* **Impacta en US19 (Generación de horarios)**: Horarios se crean basándose en profesores asignados a clases.
* **Impacta en US08 (Borrar curso)**: No se puede borrar curso con alumnos asignados.


### US06: Ver listado de cursos

**Épica:** [2. Gestión de Cursos y Estructura Base](#epica-2-gestion-de-cursos-y-estructura-base)

**Historia:** Como jefe de estudios, quiero ver el listado completo de todos los cursos del colegio y sus clases, para tener una visión rápida de la estructura.

---

#### Casos de uso y reglas de negocio

* **Acceso a listado:**
  * Solo jefes de estudios y administradores pueden ver `/cursos`.
  * Profesores son redirigidos a `/dashboard` (sin permiso).
  * Alumnos NO ven esta pantalla.

* **Estructura del listado:**
  * Se muestra una tabla (desktop) o cards (móvil) con todos los cursos creados.
  * Cada fila/card muestra:
    - Nombre del curso (ej. "1º Primaria")
    - Cantidad de clases (ej. "3 clases: A, B, C")
    - Tutores asignados (nombre + apellido de cada tutor)
    - Fecha de creación (formato: DD/MM/YYYY)
    - Cantidad de alumnos asignados (si aplica)
    - Botones de acción: Editar (US07), Borrar (US08), Ver detalles

* **Expansión de curso - Listado de clases:**
  * Al hacer clic en "Ver Detalles" o expandir un curso, se muestra acordeón/modal con tabla de clases.
  * Cada clase en la tabla incluye:
    - Nombre de la clase (ej. "A", "B", "C")
    - Tutor asignado (nombre + apellido)
    - Cantidad de alumnos en esa clase
    - Botón "Ver Horario" (linkea a horario de esa clase, US19+)
    - Icono ✗

* **Visualización de horarios por clase:**
  * Al hacer clic en botón "Ver Horario" en una clase específica, el usuario es redirigido a visualizar el horario de esa clase (cuando US19+ sea definida).
  * Placeholder actual: botón deshabilitado con tooltip "Horarios no disponibles aún" si no hay horarios generados.
  * Cuando US19 (Generación de horarios) esté desarrollada, enlace se activará automáticamente.
  * URL futura será: `/horarios/curso/:courseId/clase/:classId` (o similar, según estructura de US19)
  * Nota para desarrollo: Usar feature flag o condicional para activar botón cuando horarios estén disponibles.

* **Ordenamiento:**
  * Por defecto, cursos se ordenan alfabéticamente (A-Z) por nombre.

* **Paginación:**
  * Si hay ✗
  * Si hay >20 cursos, se pagina con 20 items por página.
  * Navegación: botones "Anterior" y "Siguiente" al pie de tabla.
  * Indicador: "Mostrando X-Y de Z cursos".

* **Búsqueda y filtrado:**
  * Barra de búsqueda en top del listado.
  * Busca en tiempo real por nombre de curso (case-insensitive).
  * Búsqueda server-side (backend filtra, no frontend).
  * Si búsqueda no devuelve resultados, mostrar: "No se encontraron cursos coincidentes".

* **Caso vacío:**
  * Si colegio NO tiene cursos, mostrar mensaje: "No hay cursos creados en el sistema".
  * Botón primario: "Crear Primer Curso" (enlaza a US05).
  * Descripción de ayuda: "Los cursos son niveles educativos como '1º Primaria'. Crea uno para empezar".

* **Clase sin tutor (cascada post-borrado):**
  * Si profesor fue borrado (US05 CA11), clase queda sin tutor.
  * En listado, mostrar: "Clase A (Sin tutor asignado)" con icono ✗
  * Tooltip al hover: "Tutor fue eliminado. Edita el curso para reasignar".

* **Interfaz responsive:**
  * Desktop (≥768px): Tabla HTML tradicional con columnas.
  * Tablet (480-768px): Cards con información condensada.
  * Móvil (<480px): Cards full-width con acordeón expandible.
  * Botones de acción siempre visibles (drawer en móvil).

---

#### Restricciones de campos y formatos

**Listado principal de cursos:**

| Campo | Tipo | Obligatorio | Ejemplo | Notas |
|-------|------|-------------|---------|-------|
| **Nombre del Curso** | Text | Sí | "1º Primaria" | Permite º, Âª, acentos |
| **Clases** | Text | Sí | "3 clases: A, B, C" | O cantidad si muchas clases |
| **Tutores** | Text | Sí | "Juan López, María García" | Nombres + apellidos |
| **Fecha Creación** | Date | Sí | "29/07/2026" | Formato DD/MM/YYYY |
| **Cantidad Alumnos** | Number | No | "45 alumnos" | Puede estar vacío si aún sin alumnos |

**Tabla de clases dentro de cada curso (expandida):**

| Campo | Tipo | Obligatorio | Ejemplo | Notas |
|-------|------|-------------|---------|-------|
| **Nombre de Clase** | Text | Sí | "A", "B", "C" | Alfanumérico + º, Âª |
| **Tutor Asignado** | Text | Sí | "Juan López" | Nombre + apellido; "Sin tutor" si cascada |
| **Cantidad Alumnos** | Number | No | "30 alumnos" | Puede estar vacío |
| **Ver Horario** | Button/Link | No | Botón activo o deshabilitado | Deshabilitado si no hay horarios generados (US19+) |

**Validaciones de búsqueda:**
* Mínimo 2 caracteres para disparar búsqueda.
* Búsqueda es case-insensitive.
* Caracteres especiales soportados (º, Âª, ñ).
* Máximo 1000 resultados (para performance).

---

#### Criterios de Aceptación (17 CAs - incluye preparación para horarios)

* **CA1 (Acceso a listado de cursos):** Dado que soy jefe de estudios y accedo a `/cursos`, cuando carga la página, entonces veo tabla (desktop) o cards (móvil) con listado de todos los cursos creados, cada uno mostrando nombre, cantidad de clases, tutores asignados, fecha de creación y botones de acción.

* **CA2 (Tabla con estructura clara):** Dado que veo el listado, cuando se carga, entonces se muestra tabla con columnas: Nombre | Clases | Tutores | Fecha Creación | Alumnos | Acciones. Cada curso ocupa una fila.

* **CA3 (Ordenamiento alfabético por defecto):** Dado que accedo al listado de cursos, cuando carga, entonces cursos aparecen ordenados alfabéticamente (A-Z) por nombre. Si hay cursos "6º Primaria", "1º Primaria", "Infantil", se muestran: "6º Primaria", "Infantil", "1º Primaria".

* **CA4 (Paginación con 20 items por página):** Dado que el colegio tiene 50 cursos, cuando veo el listado, entonces se muestran 20 cursos por página, con navegación "Anterior/Siguiente" al pie. Indicador: "Mostrando 1-20 de 50 cursos".

* **CA5 (Búsqueda en tiempo real):** Dado que escribo "Primaria" en barra de búsqueda, cuando escribo (sin presionar enter), entonces se filtran cursos en tiempo real: muestra solo "1º Primaria", "6º Primaria", etc. Búsqueda es case-insensitive.

* **CA6 (Búsqueda sin resultados):** Dado que busco "XYZ" en barra de búsqueda (término inexistente), cuando se ejecuta búsqueda, entonces se muestra: "No se encontraron cursos coincidentes con 'XYZ'". Botón: "Limpiar búsqueda".

* **CA7 (Caso vacío - sin cursos):** Dado que el colegio NO tiene cursos creados, cuando accedo a `/cursos`, entonces veo mensaje: "No hay cursos creados en el sistema" con botón primario "Crear Primer Curso" (enlaza a US05).

* **CA8 (Botones de acción por curso):** Dado que veo un curso en el listado, cuando miro cada fila/card, entonces veo botones: "Editar" (US07), "Borrar" (US08), "Ver Detalles" (expande información de clases). En móvil, botones están en menú desplegable (✗

* **CA9 (Ver detalles - expandir información de clases):** Dado que hago clic en "Ver Detalles" o expando un curso, cuando se abre detalles, entonces aparece acordeón/modal con tabla de clases mostrando: Nombre Clase | Tutor Asignado | Cantidad Alumnos | Botón "Ver Horario". Puedo cerrar detalles haciendo clic en X o fuera del modal.

* **CA10 (Clase sin tutor - indicación visual):** Dado que una clase tiene tutor asignado originalmente pero el profesor fue borrado (cascada, US05 CA11), cuando veo la tabla, entonces la clase muestra: "Clase A (Sin tutor asignado)" con icono ✗

* **CA16 (Botón Ver Horario - estado deshabilitado en MVP):** Dado que expando un curso y veo tabla de clases, cuando miro la columna "Ver Horario", entonces el botón aparece deshabilitado con tooltip: "Horarios no disponibles aún. Serán habilitados cuando se generen los horarios del colegio (US19+)". Botón permanece visible pero no clickeable (estado disabled).

* **CA17 (Preparación para integración de horarios futuro):** Dado que horarios están implementados (cuando US19 esté definida), cuando usuario hace clic en botón "Ver Horario" de una clase, entonces es redirigido a `/horarios/curso/:courseId/clase/:classId` para visualizar el horario específico de esa clase. NOTA: Esta funcionalidad será activada automáticamente cuando US19 sea implementada (usar feature flag o condicional en código).

* **CA11 (Permisos - solo jefe de estudios ve):** Dado que soy profesor (no jefe de estudios), cuando intento acceder a `/cursos`, entonces soy redirigido a `/dashboard` automáticamente.

* **CA12 (Responsive design - desktop, tablet, móvil):** Dado que accedo al listado desde diferentes dispositivos, cuando se carga, entonces: Desktop muestra tabla con todas las columnas; Tablet muestra cards condensadas; Móvil muestra cards full-width con acordeón. Botones siempre accesibles.

* **CA13 (Características especiales en nombres):** Dado que los cursos se llaman "1º Primaria", "Infantil 3 años", "6Âª Primaria", cuando veo el listado, entonces todos se renderizan correctamente con caracteres especiales sin problemas de encoding.

* **CA14 (Performance - búsqueda server-side):** Dado que hay 1000+ cursos en BD, cuando ejecuto búsqueda por nombre, entonces búsqueda completa en <500ms.

* **CA15 (Sincronización - datos desactualizados):** Dado que estoy viendo el listado y otro usuario crea/edita/borra un curso simultáneamente, cuando el cambio ocurre, entonces página se recarga automáticamente cada 30 segundos (o notificación "Datos actualizados" con botón "Recargar").

---

#### Requisitos Técnicos

**Frontend:**
* Componentes: `CourseListPage`, `CourseTable`, `CourseCards`, `SearchBar`, `Pagination`, `CourseDetails`, `ClassesTable`, `EmptyState`
* Responsive: Tailwind v4 + media queries (sm, md, lg)
* Accesibilidad: shadcn/ui con aria-labels y roles semánticos
* API: `GET /api/courses?page=1&limit=20&search=Primaria`
* API: `GET /api/courses/:courseId/classes` (obtiene clases + tutor + alumnos)
* API: `GET /api/schedules/course/:courseId/class/:classId` (futura - cuando US19 esté definida)
* Routing preparado: `/horarios/curso/:courseId/clase/:classId` (placeholder para navegación futura)

**Backend (AdonisJS):**
* Validación de permisos: role === 'jefe_estudios' || 'admin'
* Búsqueda server-side: LIKE query con índice en `courses.name`
* Paginación: offset/limit model
* Manejo de cascada: LEFT JOIN teachers para detectar clases sin tutor
* Rutas adicionales:
  ```
  GET /api/courses/:courseId/classes - Retorna clases de un curso
    Response: { classes: [{ id, name, tutor: { id, name }, studentCount, hasSchedule }] }
  
  GET /api/schedules/course/:courseId/class/:classId - Futura (US19+)
    Response: { schedule: { ... } } - Según estructura de US19
  ```
* Feature flag o condicional: `hasSchedule` boolean en respuesta de clases para determinar si botón "Ver Horario" está activo

**Seguridad:**
* SQL injection: Parametrized queries (Lucid ORM)
* XSS: Sanitización en React (automático con JSX)
* Validación: Vine schema (max 100 chars búsqueda)
* Rate limiting en búsqueda: 10 queries/minuto por usuario

**Performance:**
* Àndice: `CREATE INDEX idx_courses_name ON courses(name)`
* Paginación: 20 items/página (configurable)
* Timeout: <500ms en búsqueda
* Caching: 5 minutos en frontend

---

#### Riesgos y Mitigaciones

* **Seguridad - SQL Injection en búsqueda:** Usar parametrized queries (Lucid ORM). Validar input con Vine (max 100 chars).

* **Performance - 1000+ cursos:** Paginación server-side + índice en `courses.name` + búsqueda en backend.

* **Concurrencia - Datos desactualizados:** Polling cada 30 segundos o WebSocket (opcional). Notificación: "Datos actualizados" con botón "Recargar".

* **Cascada - Profesor borrado:** Query incluye LEFT JOIN para detectar clases sin tutor. Marcar con ✗

* **Preparación para horarios futuro (US19+):** Botón "Ver Horario" está deshabilitado en MVP. Cuando US19 sea desarrollada, activar botón mediante feature flag o condicional `hasSchedule`. URL será `/horarios/curso/:courseId/clase/:classId`. IMPORTANTE: Coordinar con estructura de US19 antes de implementar la integración completa.

* **i18n:** Extraer textos a JSON para multiidioma (futura expansión).

---

#### Dependencias

* **Depende de US05 (Crear curso):** Sin cursos, listado está vacío. Mostrar CTA hacia US05.
* **Depende de US09 (Crear profesor):** Cursos sin tutores asignados. Mostrar "Sin tutor asignado".
* **Impacta en US07 (Editar curso):** Botón "Editar" abre formulario de US07.
* **Impacta en US08 (Borrar curso):** Botón "Borrar" dispara lógica de US08.


### US07: Editar un curso

**Épica:** [2. Gestión de Cursos y Estructura Base](#epica-2-gestion-de-cursos-y-estructura-base)

**Historia:** Como jefe de estudios, quiero editar los detalles de un curso existente (nombre, clases, tutores, alumnos), para mantener la estructura actualizada si hay cambios.

---

#### Casos de uso y reglas de negocio

* **Acceso a edición:**
  * Solo jefes de estudios y administradores pueden editar cursos.
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

* **CA1 (Abrir formulario de edición):** Dado que soy jefe de estudios y veo un curso en el listado, cuando hago clic en "Editar", entonces se abre modal o página con formulario que contiene: campo nombre del curso, tabla de clases (nombre, tutor, alumnos, acciones), botones Guardar/Cancelar, y está pre-poblado con datos actuales del curso.

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
* Validación permisos: role === 'jefe_estudios' || 'admin'
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

**Historia:** Como jefe de estudios, quiero borrar un curso que ya no está activo, para mantener la estructura limpia.

---

#### Casos de uso y reglas de negocio

* **Acceso a borrado:**
  * Solo jefes de estudios y administradores pueden borrar cursos.
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
  * Solo jefes de estudios y administradores pueden ver botón Borrar.
  * Profesores y alumnos NO ven el botón.
  * Si intenta acceder vía API, recibe error 403 Forbidden.

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

* **CA4 (Permisos - solo jefe de estudios):** Dado que soy profesor (no jefe de estudios), cuando intento ver botón Borrar, entonces no veo el botón, o si intento acceder vía API, recibo error 403 Forbidden.

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
* Validación permisos: role === 'jefe_estudios' || 'admin'
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

**Historia:** Como jefe de estudios o director, quiero crear un profesor indicando su nombre, apellido, múltiples asignaturas que puede impartir, y si es tutor de un curso, para configurar la estructura docente del colegio con flexibilidad para profesores que enseñan varias materias.

**Casos de uso y reglas de negocio:**

* **Acceso a creación:** Solo jefes de estudios y directores pueden crear profesores. Botón "Crear Profesor" está en listado de profesores (US10). Se abre formulario con campos: nombre, apellido, asignaturas (multiselect), tutor de clase (opcional).

* **Campos obligatorios:** Nombre (obligatorio), Apellido (obligatorio), Asignaturas (obligatorio - multiselect, mínimo 1, máximo N), Tutor de clase (opcional, profesor puede crearse sin clase asignada, tutor_id = NULL), Email (NO obligatorio, no se solicita en formulario de creación).

* **Validación de nombre y apellido:** Caracteres permitidos: alfanuméricos (A-Z, a-z, 0-9), acentos (á, é, í, ó, ú, ñ), guiones (-), apóstrofos ('), espacios. Límite: 100 caracteres por campo. No puede ser solo espacios (debe tener caracteres alfanuméricos). NO hay validación de unicidad: pueden existir múltiples profesores con mismo nombre + apellido.

* **Gestión de asignaturas:** Asignaturas: checkboxes multiselect. Mínimo 1 asignatura requerida (validación). Máximo: N asignaturas (sin límite explícito, pero práctico ~10). Solo se muestran asignaturas con status ACTIVE (de US-SUBJECT). Múltiples profesores pueden tener las MISMAS asignaturas (sin restricción de unicidad). Ejemplos: Prof. Smith [Inglés, Arts], Prof. García [Inglés, Valenciano], Prof. López [Educación Física].

* **Integración con US-SUBJECT:** Sistema pre-carga lista de asignaturas desde tabla subjects WHERE status = 'ACTIVE'. Cada asignatura muestra tipo (CORE/ELECTIVE/CUSTOM) como ayuda visual. Si no hay asignaturas disponibles, mostrar aviso "No hay asignaturas ACTIVE disponibles. Crear primero en US-SUBJECT".

* **Gestión de tutoría:** Tutor de clase es opcional. Un profesor puede ser tutor de UNA sola clase (restricción heredada de US05). Profesor se crea SIN tutor (tutor_id = NULL) y se asigna después si es necesario.

* **Estado del profesor:** Profesor se crea en estado ACTIVE automáticamente. No hay campo para cambiar estado al crear.

* **Permisos:** Solo jefes de estudios y directores pueden crear profesores. Profesores y alumnos NO ven el botón crear. Si intenta acceder vía API, recibe error 403 Forbidden.

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

* **CA11 (Permisos: solo jefe_estudios o director):** Dado que soy profesor (no jefe de estudios/director), cuando intento ver formulario crear profesor, entonces no veo el formulario, o si intento acceder vía API, recibo error 403 Forbidden.

* **CA12 (Validar asignaturas existen y ACTIVE):** Dado que intento enviar asignatura con ID que no existe o está INACTIVE, cuando guardo vía API, entonces recibo error "Una o más asignaturas no existen o no están activas" y no se crea profesor.

* **CA13 (Transacción atómica: profesor + asignaturas):** Dado que guardo profesor con 3 asignaturas, cuando se produce error en INSERT INTO professor_subjects, entonces toda transacción hace ROLLBACK (no se crea profesor ni asignaturas parciales).

* **CA14 (Mostrar solo asignaturas ACTIVE):** Dado que hay asignaturas con status INACTIVE en BD, cuando abro formulario, entonces checkbox lista solo muestra asignaturas con status = 'ACTIVE' (filtro automático).

**Requisitos Técnicos:**
* Frontend: Componentes CreateProfessorForm (nombre, apellido, asignaturas multiselect, tutor), SubjectsCheckboxList (checkboxes multiselect con tipo CORE/ELECTIVE/CUSTOM), ClassDropdown (clases sin tutor), NotificationToast (éxito/error). API: POST /api/professors (crear profesor).
* Backend: Ruta POST /api/professors con validación de permiso (jefe_estudios || director), firstName + lastName (obligatorio, 100 chars, caracteres válidos), subjectIds array (obligatorio, mínimo 1, máximo N), cada subjectId validar existe y status='ACTIVE', classId (opcional, debe existir, sin otro tutor). Transacción BD completa (INSERT professors + INSERT professor_subjects). Response: { professor: { id, firstName, lastName, subjectIds, subjects: [...], classId, status: 'ACTIVE' } }.
* BD: Tabla professors con id, firstName, lastName, specialty (nullable, DEPRECATED - backward compat), classId (nullable), status, created_at. Àndices en firstName, lastName, status. NUEVA TABLA: professor_subjects (id, profesorId FK✗

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
| **Permisos: jefe_estudios O director** | Ambos roles administran profesores |
| **Transacción atómica** | INSERT profesor + INSERT professor_subjects en una transacción, ROLLBACK si falla alguna |

### US10: Ver listado de profesores

**Épica:** [3. Gestión de Profesores](#epica-3-gestion-de-profesores)

**Historia:** Como jefe de estudios o director, quiero ver el listado completo de profesores del colegio, para tener referencia de todo el personal docente.

**Casos de uso y reglas de negocio:**

* **Acceso al listado:** Solo jefes de estudios y directores pueden ver listado. Acceso desde menú principal o sección "Gestión de Profesores". Si intenta acceder vía API sin permiso, recibe error 403 Forbidden.

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

* **CA9 (Permisos: solo jefe_estudios/director):** Dado que soy profesor o alumno, cuando intento acceder a listado profesores, entonces no veo el listado, recibo error 403 Forbidden, y se redirecciona a pantalla no autorizada.

* **CA10 (Responsive: Desktop tabla, Móvil cards):** Dado que veo en desktop (>1024px), cuando carga listado, entonces veo tabla horizontal. Dado que veo en móvil (<768px), cuando carga listado, entonces veo cards apilados verticalmente, cada card: Nombre | Asignaturas | Rol | Editar/Borrar.

* **CA11 (Nombres y asignaturas largos en móvil):** Dado que nombre profesor es muy largo (>30 chars) O tiene 3+ asignaturas, cuando veo en móvil, entonces nombre se trunca con ellipsis (...) y asignaturas se muestran en badge "N asignaturas" expandible. Tooltip muestra nombre completo y asignaturas completas al hover.

* **CA12 (Actualización inmediata post-acción):** Dado que otro usuario crea/edita/borra profesor mientras estoy viendo listado, cuando se ejecuta la acción, entonces listado se actualiza automáticamente en <3 segundos sin recargar manualmente.

* **CA13 (Filtrar por asignatura):** Dado que presiono filtro "Asignatura: Inglés", cuando filtra, entonces veo solo profesores que imparten Inglés (consultando professor_subjects).

**Requisitos Técnicos:**
* Frontend: Componentes ProfessorList (contenedor), ProfessorTable (desktop), ProfessorCard (móvil), Pagination (controles), EmptyState (sin profesores), SubjectsExpandable (badge + detalle expandible), FilterBySubject (dropdown filtro). API: GET /api/professors?page=1&limit=20&filterSubjectId=1.
* Backend: Ruta GET /api/professors?page=1&limit=20 con validación de permiso (jefe_estudios || director), filtro WHERE status = 'ACTIVE', ordenamiento por firstName/lastName, paginación LIMIT 20 OFFSET (page-1)*20. JOIN a classes para obtener nombre clase. JOIN a professor_subjects + subjects para obtener asignaturas. Optional query param ?filterSubjectId=N para filtrar por asignatura. Response: { professors: [...], pagination: { currentPage, totalPages, total }, subjects: [...] }.
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
| **Permisos: jefe_estudios/director** | Solo admin gestiona profesores |
| **Botones siempre visibles** | Permisos validados en backend |
| **Filtro opcional por asignatura** | Permite buscar profesores que enseñan materia específica |

### US11: Buscar profesores por nombre/apellido

**Épica:** [3. Gestión de Profesores](#epica-3-gestion-de-profesores)

**Historia:** Como jefe de estudios o director, quiero buscar profesores por nombre, apellido o asignatura para encontrar rápidamente a un docente específico que imparte una materia.

**Casos de uso y reglas de negocio:**

* **Acceso a búsqueda:** Campo búsqueda disponible en header del listado (US10). Solo jefes de estudios y directores ven el campo (heredado de US10 permisos). Profesores y alumnos NO ven el campo.

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

* **CA12 (Permisos heredados de US10):** Dado que soy profesor o alumno, cuando intento usar campo búsqueda, entonces no veo el campo, heredando permisos de US10 (solo jefe_estudios/director).

* **CA13 (Buscar por asignatura):** Dado que escribo "Inglés" en búsqueda, cuando el sistema busca, entonces aparecen todos profesores que imparten Inglés (consultando professor_subjects JOIN subjects). Ejemplos: "Smith, John | Inglés, Arts | 1º A" aparece si imparte Inglés.

* **CA14 (Mostrar asignaturas en resultado búsqueda):** Dado que busco profesor "Smith" y hay resultados, cuando veo cada resultado en listado, entonces aparecen sus asignaturas (ej: "Smith, John | Inglés, Arts, Matemáticas").

**Requisitos Técnicos:**
* Frontend: Componentes SearchProfessorInput (input con debounce + botón X), SearchResults (resultados filtrados con asignaturas), LoadingSpinner (mientras busca), EmptySearchState (0 resultados). API: GET /api/professors/search?q=Juan&page=1&limit=20.
* Backend: Ruta GET /api/professors/search?q=Juan&page=1&limit=20 con validación permiso (jefe_estudios || director), filtro WHERE status='ACTIVE' AND (firstName LIKE '%q%' OR lastName LIKE '%q%' OR subjects.name LIKE '%q%' via JOIN professor_subjects), case-insensitive, ignora acentos, paginación LIMIT 20. Query: SELECT DISTINCT p.* FROM professors p LEFT JOIN professor_subjects ps ON p.id = ps.profesorId LEFT JOIN subjects s ON ps.subjectId = s.id WHERE p.status='ACTIVE' AND (LOWER(p.firstName) LIKE LOWER('%q%') OR LOWER(p.lastName) LIKE LOWER('%q%') OR LOWER(s.name) LIKE LOWER('%q%')). Response: { professors con asignaturas relación, pagination, query }.
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

**Historia:** Como jefe de estudios o director, quiero editar los datos de un profesor existente para mantener su información actualizada.

**Casos de uso y reglas de negocio:**

* **Acceso a edición:** Botón "Editar" en listado de profesores (US10). Solo jefes de estudios y directores pueden editar. Abre modal o página con formulario edición. Si intenta acceder vía API sin permiso: error 403 Forbidden.

* **Campos editables:** Nombre (heredadas validaciones de US09), Apellido (heredadas validaciones de US09), Asignaturas (multiselect, mínimo 1 - actualización de US09), Clase (tutoría) - opcional.

* **Campos NO editables:** ID, Status (estado), Fechas (created_at, updated_at), Email (no incluir en MVP).

* **Validaciones heredadas de US09:** Nombre/apellido: alfanuméricos + acentos + guiones + apóstrofos + espacios. Límite: 100 caracteres máximo. No puede ser solo espacios. NO validar unicidad.

* **Cambio de tutoría:** Profesor puede tutorizar UNA sola clase (heredada US09). Puede asignar a clase diferente o quitar tutoría (classId = NULL). Si asigna a clase que ya tiene tutor: error. Si asigna a clase que no existe: error.

* **Impacto en alumnos:** Si quito tutoría: alumnos mantienen asignación a clase. Clase queda sin tutor (tutor_id = NULL). Alumnos NO se reasignan.

* **Validación de cambios:** Validación inline en tiempo real (frontend) + validación definitiva en backend. Botón Guardar deshabilitado si NO hay cambios (double-submit protection).

* **Concurrencia:** Si profesor editado por otro usuario: error "Profesor actualizado por otro usuario". Si profesor borrado por otro usuario: error "Este profesor ha sido eliminado" + cerrar formulario.

* **Transacción atómica:** Si falla durante guardado: ROLLBACK (nada se guarda). No hay cambios parciales: TODO o NOTHING.

* **Permisos:** Solo jefes de estudios y directores. Profesores y alumnos NO ven botón "Editar". Si intenta acceder vía API: error 403 Forbidden.

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

* **CA12 (Permisos: solo jefe_estudios/director):** Dado que soy profesor, cuando intento editar profesor, entonces error 403 Forbidden y botón "Editar" no visible en listado.

* **CA13 (Validación - mínimo 1 asignatura):** Dado que intento desseleccionar todas las asignaturas (dejar multiselect vacío), cuando intento guardar, entonces error "Debe seleccionar al menos 1 asignatura" y cambios no se guardan.

* **CA14 (Impacto cascada en US-PROF-ASSIGN):** Dado que edito profesor y cambio asignaturas [Inglés, Arts] a [Inglés], cuando guardo, entonces si existe asignación en US-PROF-ASSIGN de profesor+Arts+curso, esa asignación se marca NEEDS_REVIEW (requiere validación jefe).

**Requisitos Técnicos:**
* Frontend: Componentes EditProfessorForm (campos), NameInput/LastNameInput (validación inline), SubjectsCheckboxList (multiselect, mínimo 1), ClassDropdown (clases disponibles), SubmitButton (deshabilitado si sin cambios), ConfirmationDialog (cancelar con cambios). API: GET /api/professors/:id, PUT /api/professors/:id.
* Backend: Rutas GET /api/professors/:id (obtener profesor con asignaturas relación de professor_subjects) y PUT /api/professors/:id (actualizar) con validación permiso (jefe_estudios || director), validación firstName/lastName/subjectIds (mínimo 1, máximo N)/classId, transacción BD: DELETE professor_subjects + INSERT nuevos + UPDATE profesor, ROLLBACK si falla. Si cambios en asignaturas: consultar tabla professor_assignments y marcar NEEDS_REVIEW si hay conflictos. Response: { professor: { id, firstName, lastName, subjectIds, subjects, classId }, warnings: [...] }.
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
| **Permisos** | jefe_estudios OR director |
| **Email en edición** | NO incluir en MVP |

### US13: Borrar profesor

**Épica:** [3. Gestión de Profesores](#epica-3-gestion-de-profesores)

**Historia:** Como jefe de estudios o director, quiero borrar un profesor del sistema para eliminar registros de docentes que ya no trabajan en el colegio.

**Casos de uso y reglas de negocio:**

* **Acceso a borrado:** Botón "Borrar" en listado de profesores (US10). Solo jefes de estudios y directores pueden borrar. Abre diálogo de confirmación. Si intenta acceder vía API sin permiso: error 403 Forbidden.

* **Restricción: profesor tutoriza clase:** Si profesor tutoriza una clase (classId != NULL): SÀ se puede borrar. Diálogo muestra advertencia clara: "Este profesor tutoriza: [Curso] [Clase] ([N] alumnos). La clase quedará sin tutor. Los alumnos mantendrán su asignación de clase". Botón Confirmar habilitado. Usuario confirma explícitamente conociendo el impacto.

* **Profesor sin tutoría:** Si profesor NO tutoriza (classId IS NULL): se borra sin restricción.

* **Diálogo de confirmación:** Muestra nombre del profesor: "Â¿Eliminar profesor [Nombre]?". Si tutoriza: mostrar advertencia detallada + impacto. Si sin tutoría: mostrar solo nombre. Texto: "Esta acción no se puede deshacer". Botones: Cancelar | Confirmar (ambos habilitados, advertencia es mecanismo de protección).

* **Integridad referencial:** Si profesor tutoriza: UPDATE classes SET tutor_id = NULL (clase queda sin tutor). Alumnos mantienen asignación a clase (enrollments no cambian). Vista US06: clase muestra ✗

* **Transacción atómica:** Si falla: ROLLBACK (nada se borra). Error claro: "No se pudo eliminar el profesor. Intenta de nuevo".

* **Rate limiting:** Máximo 10 borrados/min por usuario.

* **Permisos:** Solo jefes de estudios y directores. Si intenta acceder vía API: error 403 Forbidden.

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

* **CA12 (Permisos: solo jefe_estudios/director):** Dado que soy profesor, cuando intento borrar profesor, entonces botón "Borrar" no visible en listado o si accedo vía API, recibo error 403 Forbidden.

**Requisitos Técnicos:**
* Frontend: Componentes DeleteProfessorDialog (modal confirmación), ConfirmationMessage (nombre + advertencia si tutoriza), LoadingOverlay (spinner), NotificationToast (éxito/error). API: DELETE /api/professors/:id.
* Backend: Ruta DELETE /api/professors/:id con validación permiso (jefe_estudios || director). Transacción: si tutoriza, UPDATE classes SET tutor_id = NULL; luego DELETE FROM professors. ROLLBACK si falla. Response: { message, hadTutorship }.
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
| **Permisos jefe_estudios/director** | Coherencia con US09/US10/US12 |
| **Loading state** | UX: usuario ve operación en curso |
| **Advertencia clara** | Mecanismo de protección contra borrados accidentales |

---

## Módulo: Gestión de Alumnos

### US14: Crear alumno

**Épica:** [4. Gestión de Alumnos](#epica-4-gestion-de-alumnos)

**Historia:** Como jefe de estudios o director, quiero crear un alumno indicando su nombre, apellido, curso, clase (opcional), inscripción a comedor y observaciones, para registrar a los estudiantes del colegio.

**Casos de uso y reglas de negocio:**

* **Acceso a creación:** Solo jefes de estudios y directores pueden crear alumnos. Botón "Crear Alumno" en listado de alumnos (US15). Se abre formulario con campos: nombre, apellido, curso, clase, inscrito comedor, tipo comida, beca, observaciones.

* **Campos obligatorios:** Nombre (obligatorio), Apellido (obligatorio), Curso (obligatorio - dropdown de cursos), Clase (OPCIONAL - dropdown dinámico según curso seleccionado), Inscrito a comedor (obligatorio sí/no).

* **Campos opcionales:** Tipo de comida (string 255 chars, solo si inscrito=sí), Beca (solo si inscrito=sí), Observaciones (blob 5000 chars máximo).

* **Validación nombre/apellido:** Heredadas de US09 (alfanuméricos + acentos + guiones + apóstrofos + espacios, 100 chars máximo, no solo espacios, sin validar unicidad).

* **Asignación Curso/Clase en dos pasos:** Paso 1: Seleccionar CURSO (obligatorio, dropdown de cursos ACTIVE). Paso 2: Seleccionar CLASE (opcional, dropdown con clases del curso seleccionado). Si no se selecciona clase: alumno asignado a curso pero sin clase (class_id = NULL). Dropdown de clases se actualiza dinámicamente al cambiar curso.

* **Tipo de comida:** Solo visible si inscrito = sí. String de texto libre (máximo 255 caracteres). Ejemplos: "Alérgico a frutos secos", "Vegetariano", "Sin gluten". Si inscrito = no: tipo_comida = NULL.

* **Observaciones:** Campo blob/textarea, OPCIONAL (máximo 5000 caracteres). Para notas sobre alumno ("Necesita apoyo", "Trabaja medio tiempo", etc.). Visible siempre.

* **Estado del alumno:** Alumno se crea en estado ACTIVE automáticamente.

* **Permisos:** Solo jefes de estudios y directores. Si intenta acceder vía API sin permiso: error 403 Forbidden.

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

* **CA15 (Permisos: solo jefe_estudios/director):** Dado que soy profesor, entonces no veo botón "Crear alumno" o recibo error 403 vía API.

* **CA16 (Validación inline en tiempo real):** Dado que escribo caracteres inválidos en nombre, entonces veo error inline en rojo en tiempo real.

* **CA17 (Observaciones máximo 5000 chars):** Dado que escribo más de 5000 caracteres en observaciones, entonces error "Máximo 5000 caracteres".

**Requisitos Técnicos:**
* Frontend: Componentes CreateStudentForm, NameInput/LastNameInput (validación inline), CourseDropdown (dinámico), ClassDropdown (dinámico según curso), CafeteriaToggle, FoodTypeInput (habilitado si inscrito, máximo 255), ScholarshipToggle (deshabilitado si inscrito=no), ObservationsTextarea (máximo 5000), SubmitButton (deshabilitado mientras guarda), NotificationToast.
* Backend: POST /api/students con validación permiso (jefe_estudios || director), validación firstName/lastName, courseId (obligatorio), classId (opcional, debe pertenecer a courseId si existe), cafeteria, foodType (máximo 255 si cafeteria=true, else null), scholarship (null si cafeteria=false), observations (máximo 5000). Transacción atómica, ROLLBACK si falla. Response: { student: { id, firstName, lastName, courseId, classId, cafeteria, scholarship, foodType, observations, status } }.
* BD: Tabla students con: id, firstName, lastName, courseId, classId (nullable), cafeteria (bool), scholarship (bool/nullable), foodType (varchar 255, nullable), observations (longtext, nullable), status, created_at. Foreign keys: courseId ✗

**Decisiones Tomadas:**
| Decisión | Justificación |
|----------|---------------|
| **Curso obligatorio, Clase opcional** | Flexibilidad: alumno sin clase específica permitido |
| **Dos dropdowns dinámicos** | Curso filtra clases disponibles automáticamente |
| **Tipo de comida + Observaciones** | Campos adicionales para contexto alumno |
| **Validación heredada US09** | Consistencia en formato nombre/apellido |
| **Transacción atómica** | Integridad: TODO o NOTHING |
| **Permisos jefe_estudios/director** | Solo admin crea alumnos |
| **Observaciones 5000 chars** | Limite práctico para notas extensas |

### US15: Ver listado de alumnos con filtros múltiples

**Épica:** [4. Gestión de Alumnos](#epica-4-gestion-de-alumnos)

**Historia:** Como jefe de estudios, director o profesor, quiero ver el listado de alumnos filtrado por nombre, apellido, curso, clase, comedor o beca, para gestionar los grupos de forma organizada.

**Casos de uso y reglas de negocio:**

* **Acceso al listado:** Jefes de estudios, directores y profesores pueden ver listado. Alumnos NO ven listado de alumnos. Acceso desde menú principal o sección "Gestión de Alumnos".

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

* **Permisos:** Roles autorizados: jefe_estudios, director, profesor. Alumnos: error 403 Forbidden.

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

* **CA16 (Permisos):** Dado que soy profesor, cuando accedo a listado, entonces veo listado. Dado que soy alumno, entonces error 403 Forbidden.

* **CA17 (Responsive):** Dado que veo en desktop, entonces tabla horizontal. Dado que veo en móvil, entonces cards apilados.

* **CA18 (Sincronización):** Dado que estoy viendo listado, cuando otro usuario crea/edita/borra alumno, entonces listado se actualiza en <3 segundos.

**Requisitos Técnicos:**
* Frontend: Componentes StudentList, StudentTable (desktop), StudentCard (móvil), FilterBar (barra de filtros), NameInput, LastNameInput, CourseDropdown, ClassDropdown, CafeteriaDropdown, ScholarshipDropdown, Pagination, EmptyState. API: GET /api/students?name=X&lastName=Y&course=Z&class=W&cafeteria=true&scholarship=true&page=1&limit=20.
* Backend: GET /api/students con validación permiso (jefe_estudios || director || profesor), filtros opcionales (name, lastName, courseId, classId, cafeteria, scholarship), búsqueda case-insensitive, ignora acentos en nombre/apellido, paginación LIMIT 20. Response: { students, pagination }.
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

**Historia:** Como jefe de estudios, director o profesor, quiero editar los datos de un alumno (nombre, apellido, curso, clase, comedor, tipo comida, beca, observaciones) para mantener su información actualizada.

**Casos de Uso:**
* Botón "Editar" en listado de alumnos (US15).
* Solo jefes de estudios, directores y profesores pueden editar.
* Abre modal o página con formulario edición.
* Si intenta acceder sin permiso: error 403 Forbidden.

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
* **CA15 (Permisos):** Dado que soy profesor, cuando intento editar, entonces se permite. Dado que soy alumno, entonces botón "Editar" no visible o error 403 vía API.
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
| Permisos | jefe_estudios, director, profesor (NO alumnos) |
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

**Historia:** Como jefe de estudios o director, quiero borrar un alumno del sistema para eliminar registros de estudiantes que ya no están en el colegio.

**Casos de Uso:**
* Botón "Borrar" (papelera roja) en listado de alumnos (US15).
* Opcionalmente: botón "Borrar" en formulario edición (US17).
* Solo jefes de estudios y directores pueden borrar.
* Profesores NO pueden borrar (botón deshabilitado o no visible).
* Si intenta acceder sin permiso: error 403 Forbidden.

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
* **Validaciones pre-borrado:** Alumno debe existir (error 404 si no). Usuario debe tener permiso (error 403 si no). Si ok: mostrar diálogo.
* **Concurrencia - Alumno ya borrado:** Si otro usuario borra alumno mientras yo confirmo: error "Alumno ya fue eliminado" o 404.
* **Sincronización post-borrado:** Diálogo cierra automáticamente. Listado se actualiza (<3s). Alumno desaparece de resultados y filtros. Toast: "Alumno eliminado correctamente".
* **Cancelación:** Si presiona "Cancelar": diálogo cierra, alumno permanece sin cambios.
* **Permisos:** Solo jefes de estudios y directores. Profesores NO ven botón "Borrar" (deshabilitado/no visible). Alumnos tampoco. Si intenta vía API: error 403.

**Criterios de Aceptación (12 CAs):**
* **CA1 (Botón visible):** Dado que soy jefe de estudios o director, cuando veo listado, entonces veo botón "Borrar" (papelera roja) en cada fila, habilitado.
* **CA2 (Botón deshabilitado sin permiso):** Dado que soy profesor o alumno, cuando veo listado, entonces botón "Borrar" está gris/deshabilitado o no visible.
* **CA3 (Abrir diálogo):** Dado que hago clic en "Borrar" para un alumno, cuando se abre diálogo, entonces muestra: "Â¿Borrar a [Nombre Apellido]?" + "Esta acción no se puede deshacer" + botones Cancelar | Confirmar Borrado.
* **CA4 (Preview comedor):** Dado que alumno tiene 5 registros de comedor, cuando abro diálogo, entonces muestra "Se eliminarán 5 registros de comedor".
* **CA5 (Cancelar):** Dado que abro diálogo, cuando hago clic en "Cancelar", entonces diálogo cierra sin borrar, alumno permanece en BD.
* **CA6 (Confirmar sin comedor):** Dado que confirmo borrado de alumno sin registros comedor, cuando presiono "Confirmar Borrado", entonces alumno se borra, diálogo cierra, listado se actualiza, toast "Alumno eliminado correctamente".
* **CA7 (Confirmar con comedor):** Dado que alumno tiene 10 registros de comedor, cuando confirmo borrado, entonces alumno se borra, registros comedor también se borran (ON DELETE CASCADE), listado actualiza.
* **CA8 (Error 404):** Dado que intento borrar alumno que fue borrado por otro, cuando intento confirmar, entonces error "Alumno no encontrado" (404), diálogo cierra.
* **CA9 (Transacción atómica):** Dado que BD falla durante borrado, cuando intento confirmar, entonces ROLLBACK: alumno NO se borra, error "No se pudo eliminar al alumno. Intenta de nuevo".
* **CA10 (Sincronización listado):** Dado que estoy viendo listado, cuando otro usuario borra un alumno, entonces listado se actualiza automáticamente (<3s) y alumno desaparece de resultados y filtros.
* **CA11 (Permiso 403):** Dado que soy profesor, cuando intento borrar vía API (DELETE /api/students/:id), entonces error 403 Forbidden.
* **CA12 (Responsive mobile):** Dado que veo listado en móvil, cuando hago clic en "Borrar", entonces diálogo aparece full-screen o modal adaptativo con botones accesibles.

**Requisitos Técnicos:**
* **Frontend:** Componentes StudentList, DeleteButton (ícono papelera roja, deshabilitado si sin permiso), ConfirmDeleteDialog (diálogo modal), ConfirmDeleteContent (texto, nombre, registros comedor), NotificationToast (éxito/error). API: DELETE /api/students/:id. Estado: studentToDelete, dialogOpen, loading, error. Lógica: validar permiso (mostrar botón solo si jefe || director), clic "Borrar" abre diálogo, clic "Cancelar" cierra, clic "Confirmar" envía DELETE, actualiza listado.
* **Backend:** Ruta DELETE /api/students/:id (validar permiso jefe_estudios || director, obtener ID, validar alumno existe error 404, iniciar transacción, contar comedor, DELETE FROM students WHERE id, registros comedor borran automático ON DELETE CASCADE, COMMIT, si falla ROLLBACK, retornar { message: 'Alumno eliminado correctamente' }). Errores: 403 sin permiso, 404 si no existe, 500 si falla transacción. Validación: ID número positivo, alumno existe, usuario tiene permiso.
* **BD:** Tabla students con ON DELETE CASCADE a students_meals. Transacción para atomicidad.

**Decisiones Clave:**
| Decisión | Justificación |
|----------|---------------|
| Permisos | jefe_estudios, director (NO profesores) |
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
* Profesor intenta borrar: Botón deshabilitado frontend, error 403 backend.

---

## Módulo: Configuración de Horarios

### US-BASE: Configurar Calendario Base del Horario Escolar

**Épica:** [5. Configuración de Horarios (Base + Asignaturas + Restricciones)](#epica-5-configuracion-de-horarios-base--asignaturas--restricciones)

**Historia:** Como jefe de estudios, quiero configurar la estructura temporal del colegio (sesiones, horas, recreo) para que sirva como base de todos los horarios generados automáticamente.

---

#### Casos de Uso y Reglas de Negocio

* **Acceso a configuración:**
  * Menú: Configuración ✗
  * Solo jefes de estudios y directores pueden acceder/editar
  * Error 403 si profesor o alumno intenta acceder
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
  * jefe_estudios, director: CRUD
  * profesor: Solo lectura (ver calendario)
  * alumno: No acceso
  * Error 403 si intenta sin permiso

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

* **CA18 (Permisos):** Dado que soy profesor, cuando intento acceder a "Editar Calendario", entonces puedo VER pero NO EDITAR, botones deshabilitados, si intento vía API error 403.

---

### US-SUBJECT: Gestionar Asignaturas (AMPLIADA CON CURSOS + CARGAS ESTÀNDAR)

**Épica:** [5. Configuración de Horarios (Base + Asignaturas + Restricciones)](#epica-5-configuracion-de-horarios-base--asignaturas--restricciones)

**Historia:** Como jefe de estudios, quiero crear y gestionar asignaturas (Inglés, Programación, Educación Física, etc.) especificando a qué cursos aplican y cuáles son las cargas horarias estándar para cada curso, para que el sistema pueda pre-rellenar restricciones de carga automáticamente y acelerar la configuración de horarios.

---

#### Casos de Uso y Reglas de Negocio

* **Acceso a gestión:**
  * Menú: Configuración ✗
  * Solo jefes de estudios y directores pueden CRUD
  * Profesores: solo lectura
  * Alumnos: no acceso
  * Error 403 si intenta sin permiso

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
  * Cuando jefe crea restricción "Inglés en 1º Primaria":
    - Sistema busca carga estándar de Inglés en 1º
    - Pre-rellena campo "Sesiones/Semana" con 3
    - User ve: "Sugerencia: 3 sesiones/semana (basada en configuración estándar)"
    - User puede cambiar si lo desea
  * En matriz bulk (US19 CA17): todas asignaturas pre-rellenadas con estándares

* **Permisos:**
  * jefe_estudios, director: CRUD
  * profesor: Solo lectura
  * alumno: No acceso
  * Error 403 si intenta sin permiso

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

**Historia:** Como jefe de estudios, quiero definir restricciones de carga horaria (sesiones por asignatura) y otras restricciones (disponibilidad profesor, descansos) para que el algoritmo de generación de horarios las respete.

---

#### Casos de Uso y Reglas de Negocio

* **Acceso a restricciones:**
  * Menú: Configuración ✗
  * Solo jefes de estudios y directores pueden crear/editar/borrar
  * Profesores: lectura (ver listado, pero no crear)
  * Error 403 si intenta sin permiso

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
  * jefe_estudios, director: crear, ver
  * profesor: ver solo
  * alumno: no acceso
  * Error 403 si intenta sin permiso

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

* **CA16 (Permisos - profesor):** Dado que soy profesor, cuando accedo a "Crear Restricción", entonces botones deshabilitados o no visibles, si intento vía API error 403, puedo VER listado (lectura).

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

**Historia:** Como jefe de estudios, quiero ver todas las restricciones que he configurado (carga horaria, disponibilidad, descansos) para tener claridad sobre qué reglas aplican antes de generar horarios.

---

#### Casos de Uso y Reglas de Negocio

* **Acceso al listado:**
  * Menú: Configuración ✗
  * Solo jefes de estudios y directores pueden CRUD
  * Profesores: lectura (ver listado)
  * Alumnos: no acceso
  * Error 403 si intenta sin permiso

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
  * jefe_estudios, director: ver todo
  * profesor: ver todo (lectura)
  * alumno: no acceso
  * Botones editar/borrar deshabilitados (futuro)
  * Error 403 si intenta acceso

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

* **CA15 (Permisos profesor):** Dado que soy profesor, cuando accedo a "Ver Restricciones", entonces puedo ver listado (lectura), botones editar/borrar deshabilitados o no visibles, si intento vía API error 403.

---

## Módulo: Disponibilidad y Reparto de Profesores

### US-PROF-AVAIL: Configurar Disponibilidad Horaria de Profesor

**Épica:** [6. Asignación de Horarios y Disponibilidad de Profesores](#epica-6-asignacion-de-horarios-y-disponibilidad-de-profesores)

**Historia:** Como jefe de estudios, quiero definir qué sesiones (horas) está disponible cada profesor para que el sistema respete sus limitaciones horarias al generar horarios.

---

#### Casos de Uso y Reglas de Negocio

* **Interfaz de configuración:** Grid visual semanal [Lun-Vie À— Sesiones 1-N], cada celda toggle disponible/no disponible
* **Botones conveniencia:** "Marcar Todo Disponible", "Solo Mañana", "Solo Tarde", "Inversión Rápida"
* **Color visual:** Verde (disponible ✓), Gris (no disponible ✓)
* **Display dinámico:** Total franjas disponibles + barra visual (ej: 20/30 = 67%)
* **Validaciones:** Profesor debe existir, días/sesiones válidas, avisar si cambio reduce disponibilidad >50%
* **Cascada:** Avisar si hay asignaciones conflictivas (horarios marcan NEEDS_REVIEW pero no borran)
* **Transacción atómica:** DELETE antiguas + INSERT nuevas simultáneamente
* **Permisos:** jefe_estudios/director configuran, profesor lectura, alumno no acceso

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

* **CA15 (Ver disponibilidad como profesor):** Dado que soy profesor, cuando accedo "Mi Disponibilidad", entonces veo grid lectura, botones deshabilitados.

* **CA16 (Permisos):** Dado que soy jefe, puedo editar cualquier profesor. Dado que soy profesor, puedo editar solo la mía.

---

### US-PROF-ASSIGN: Asignar Asignaturas a Profesor

**Épica:** [6. Asignación de Horarios y Disponibilidad de Profesores](#epica-6-asignacion-de-horarios-y-disponibilidad-de-profesores)

**Historia:** Como jefe de estudios, quiero asignar qué asignaturas imparte cada profesor y a qué cursos, para que el sistema respete estas asignaciones al generar horarios.

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
* **Permisos:** jefe_estudios/director CRUD, profesor lectura, alumno no acceso

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

* **CA18 (Ver asignaciones como profesor):** Dado que soy profesor, cuando accedo "Mis Asignaciones", entonces veo tabla lectura, botones deshabilitados, API error 403 si intento editar.

---

### US-PROF-SUMMARY: Ver Resumen de Carga de Profesores

**Épica:** [6. Asignación de Horarios y Disponibilidad de Profesores](#epica-6-asignacion-de-horarios-y-disponibilidad-de-profesores)

**Historia:** Como jefe de estudios, quiero ver un resumen de la carga horaria asignada a cada profesor (asignaturas, cursos, sesiones totales, disponibilidad) para identificar desbalances, sobrecarga o asignaciones incompletas antes de generar horarios.

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
* **Permisos:** jefe_estudios/director ven todos, profesor ve solo su resumen (lectura), alumno no acceso

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

* **CA14 (Ver resumen propio como profesor):** Dado que soy profesor, cuando accedo "Mi Resumen", entonces veo solo mi resumen (lectura), botones deshabilitados, API error 403 si intento otro profesor.

---

### US-ALGO-RUN: Generar Horarios Automáticamente (Motor)

**Épica:** [7. Generación Automática de Horarios](#epica-7-generacion-automatica-de-horarios) — **FASE 2 POST-MVP**

### 1. Definición

**Historia:** Como jefe de estudios o director, quiero disparar la generación automática de horarios seleccionando un algoritmo (CSP o Backtracking), para obtener un cuadrante horario semanal completo que respete todas las restricciones pedagógicas, laborales y de disponibilidad configuradas (Hard Constraints HC1-HC6 y Soft Constraints SC1-SC3).

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
  - Access control: solo jefe_estudios y director pueden disparar.

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

**Historia:** Como jefe de estudios o director, quiero confirmar y guardar un horario generado como versión oficial/activa del colegio, para que pase a ser el horario vinculante, o descartarlo y regenerar si no es satisfactorio.

---

### 2. Criterios de Aceptación (Gherkin)

* **CA1 (Ver horario generado en estado borrador):** Dado que un horario fue generado por US-ALGO-RUN y está en estado DRAFT, cuando accedo a "Mis Horarios Generados", entonces veo tabla con: Horario | Algoritmo | Generado | Estado (DRAFT) | Acciones (Ver, Confirmar, Descartar, Regenerar).

* **CA2 (Confirmar y guardar como oficial):** Dado que veo un horario en estado DRAFT, cuando hago clic en "Confirmar como Oficial", entonces se abre diálogo de confirmación: "¿Marcar este horario como oficial? Esto reemplazará el horario anterior (si existe) y pasará a ser el horario activo del colegio." Al confirmar, status pasa a OFFICIAL, fecha officializedAt se registra, se muestra toast "Horario oficializado exitosamente" y tabla muestra Estado=OFFICIAL. Solo UN horario puede estar OFFICIAL a la vez.

* **CA3 (Descartar horario borrador):** Dado que veo un horario en estado DRAFT, cuando hago clic en "Descartar", entonces diálogo: "¿Descartar este horario? No se puede recuperar." Al confirmar, horario se marca deleted=true (soft delete), se remueve de listado, toast "Horario descartado."

* **CA4 (Regenerar a partir de borrador):** Dado que veo un horario DRAFT que no me gusta, cuando hago clic en "Regenerar", entonces se dispara de nuevo US-ALGO-RUN (abre modal selector de algoritmo), y nuevo horario generado se crea con status=DRAFT aparte (no sobrescribe el anterior hasta confirmar).

* **CA5 (Historial de horarios oficiales):** Dado que confirmo múltiples horarios como OFFICIAL en días distintos, cuando accedo a "Historial de Horarios Oficiales", entonces veo tabla con: Oficializado | Algoritmo | Generado | Generado Por (usuario) | Acciones (Ver detalles, Revertir). Permite auditoría y opcionalmente revertir a un horario oficial anterior (soft-revert: crea nuevo DRAFT basado en horario histórico).

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
  - `ScheduleController::confirm(PATCH)` — validar permiso, actualizar status a OFFICIAL, registrar officializedAt.
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

**Historia:** Como jefe de estudios o director, quiero visualizar el horario generado (oficial o borrador) en formato tabla clara (Lunes-Viernes × Sesiones), ver horario individual de cada profesor para auditar solapamientos, y exportar horarios en formatos Markdown (por grupo) y PDF (individual o agregado del colegio completo) para distribuir o archivar.

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

---

### 3. Datos Técnicos a Tener en Cuenta

* **API Endpoints:**
  - `GET /api/schedule/:scheduleId/view` — obtener datos horario para visualización. Response: `{ scheduleId, status, courseGroups: [{ courseId, groupId, groupName, entries: [...] }], scheduleMetadata: { generatedAt, algorithm, generatedBy } }`.
  - `GET /api/schedule/:scheduleId/export/markdown?groupId=x` — descargar Markdown de un grupo. Response: file (text/markdown).
  - `GET /api/schedule/:scheduleId/export/pdf?groupId=x` — descargar PDF de un grupo. Response: file (application/pdf).
  - `GET /api/schedule/:scheduleId/export/markdown-all` — descargar Markdown de todos los grupos. Response: file (text/markdown).
  - `GET /api/schedule/:scheduleId/export/pdf-all` — descargar PDF de todos los grupos. Response: file (application/pdf).

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
| **Autenticación y Sesión** | US01 (US01_a-US01_f), US02, US02_b, US03, US04 | 45+ | ✓ Completadas (US01 con decisiones pendientes en sus partes) |
| **Gestión de Cursos** | US05-08 | 25+ | ✓ Completadas |
| **Gestión de Profesores** | US09-13 | 20+ | ✓ Completadas |
| **Gestión de Alumnos** | US14-18 | 50+ | ✓ Completadas |
| **Configuración de Horarios** | US-BASE, US-SUBJECT, US19, US20 | 73+ | ✓ Completadas |
| **Disponibilidad de Profesores** | US-PROF-AVAIL, US-PROF-ASSIGN, US-PROF-SUMMARY | 48+ | ✓ Completadas |
| **Generación de Horarios (Fase 2)** | US-ALGO-RUN, US-ALGO-CONFIRM, US-ALGO-VIEW | 22+ | ✓ Especificada (3 US) |

**Total Criterios de Aceptación (MVP):** 268+ CAs  
**Total Criterios de Aceptación (Fase 2 Post-MVP):** 22+ CAs

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

## ✗

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
- **Permisos:** Todas las rutas API deben validar permisos (jefe_estudios, director, profesor, alumno).

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


