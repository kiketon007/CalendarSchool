# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@docs/base-standards-castellano.md

## Estado actual del repositorio

CalendarSchool (gestión y generación automática de horarios escolares, normativa de la Comunidad Valenciana) tiene el **esqueleto técnico de US00** (cambio OpenSpec `bootstrap-proyecto`): monorepo con npm workspaces (`backend`, `frontend`), Node.js 24 LTS (`.nvmrc`), PostgreSQL 18 en Docker Compose y CI en GitHub Actions. La primera lógica de dominio es el registro de colegio y usuario administrador (US01_a a US01_f): `POST /api/auth/register`, `POST /api/auth/refresh`, `GET /api/municipalities`, la página `/registro` y la página provisional `/onboarding`. El registro inicia la sesión con una cookie. El registro limita los intentos por IP (5 cada 15 minutos) y verifica reCAPTCHA (v3 con reto v2). El formulario conserva lo escrito (salvo la contraseña) en la pestaña. US01 está completa, pero antes de publicar el registro en producción hay que probar el captcha con claves reales de Google Cloud (aún no existen) y cerrar lo que `despliegue-aws` debe aportar (`TRUST_PROXY_HOPS`, la cabecera secreta de CloudFront y los secretos). El despliegue en AWS (`infrastructure/`, `lambda.ts`) queda para el cambio `despliegue-aws`. El stack y las versiones están en `README.md` §2.3.

### Comandos

Desde la raíz (instalación completa en `README.md` §1.4). Antes de `npm test`, `npm run test:e2e` o cualquier test de integración, PostgreSQL debe estar levantado (`docker compose up -d`) y la base de desarrollo migrada (`npm run db:migrate`); `npm run test:unit` no los necesita.

```bash
npm install                      # genera también el cliente Prisma (postinstall del backend)
cp backend/.env.example backend/.env
docker compose up -d             # PostgreSQL 18: calendarschool y calendarschool_test
npm run db:migrate               # aplica migraciones a la base de desarrollo (nunca es implícito)
npm run dev                      # backend (:3000) y frontend (:5173, proxy de /api) en paralelo
npm run build                    # build de ambos workspaces
npm run lint                     # ESLint (con tipos) en ambos workspaces + prettier --check
npm run format                   # prettier --write backend frontend
npm test                         # unitarios + integración (requiere PostgreSQL) y frontend, con cobertura
npm run test:unit                # backend unitario + frontend, sin base de datos
npm run test:e2e                 # compila, migra, arranca backend (:3001) y vite preview (:4173) y ejecuta Cypress
npm run test:e2e -- --spec cypress/e2e/session.cy.ts   # lo anterior, pero solo con una spec
npm run typecheck --workspaces   # tipos de código, tests y specs de Cypress
npm run api:types -w frontend    # regenera los tipos de la API desde docs/api-spec.yml
npm run api:types:check -w frontend  # falla si los tipos generados no están al día (lo ejecuta CI)
```

Un solo fichero o un solo test:

```bash
# Desde la raíz. Ojo: en Vitest `-w` es --watch, por eso el workspace se indica en npm exec.
npm exec -w backend -- vitest run src/app.test.ts
npm exec -w backend -- vitest run --project integration    # solo integración (requiere PostgreSQL)
npm exec -w backend -- vitest run -t "responds 200"         # por nombre de test
npm exec -w frontend -- vitest run src/pages/HomePage.test.tsx
```

### Arquitectura del backend

Se entiende leyendo `server.ts`, `app.ts` y una feature (`health`):

- **Raíz de composición única:** `server.ts` hace `loadConfig(process.env)` → `createLogger` → `createPrismaClient` → implementaciones de puertos → `createApp(deps)` → `listen`. Ninguna otra pieza lee `process.env` ni instancia Prisma.
- **Puertos y adaptadores:** `application/<feature>/` define el caso de uso (`CheckHealth`) y la interfaz del puerto (`DatabasePing`); `infrastructure/prisma/` la implementa (`PrismaDatabasePing`); `app.ts` los cablea al router. `AppDependencies` es el contrato de `createApp`: los tests de `app.test.ts` inyectan dobles y los `*.int.test.ts` usan Prisma real.
- **Capa HTTP común** (`presentation/http/`): `responses.ts` (formato `success`/`data`/`error`), `appError.ts` (errores de dominio con `code`), `errorHandler.ts` (`notFoundHandler` dentro del router `/api` + `errorHandler` global al final) y `requestTimeout.ts` (primer middleware). Cada feature añade su `presentation/<feature>/<feature>Router.ts` y lo monta en `api` en `app.ts`, antes de `notFoundHandler`.
- **Una feature completa es `registration`:** el caso de uso `RegisterSchool` (`application/registration/`) sigue captcha → validación Zod → municipio → email → colegio → alta. Sus puertos (`RegistrationRepository`, `MunicipalityRepository`, `PasswordHasher`, `IdGenerator`, `CaptchaVerifier`) los implementa `infrastructure/` y `server.ts` los cablea; `createApp` recibe los casos de uso ya construidos (en los tests que no los usan, `defaultDependencies` de `test/support/appDoubles.ts`; los `*.int.test.ts` usan `test/support/realApp.ts`, el mismo cableado que `server.ts` sobre la base de datos de test).
- **De errores de dominio a HTTP:** los casos de uso lanzan errores propios (`ValidationError`, `EmailAlreadyRegistered`, `SchoolAlreadyRegistered`, `CaptchaFailed`, `InvalidSession`, `DatabaseUnavailable`...) y solo `errorHandler.ts` los traduce a `400`, `401`, `409`, `422` o `503` (el `403` de `requireAllowedOrigin` es un `AppError`). Los repositorios Prisma traducen los fallos de conexión con `translateDatabaseErrors`, y las violaciones de unicidad se distinguen por el nombre del índice (con el adaptador de PostgreSQL llega en `meta.driverAdapterError.cause.constraint.index`, no en `meta.target`).
- **Sesión (US01_c):** el registro guarda en la misma transacción el colegio, el usuario y su `RefreshToken` (`CreateSession` prepara el registro; `RegisterSchool` devuelve `registration` y, aparte, el `refreshToken` en claro, que solo usa el router para la cookie). El token es aleatorio de 256 bits y en la base de datos solo está su SHA-256; la cookie `refresh_token` la construye `presentation/auth/sessionCookie.ts` y las demás capas no saben que existen las cookies. `POST /api/auth/refresh` (`RefreshSession`) es la única operación que emite access tokens (JWT HS256 de 15 min con `jose`, puerto `TokenIssuer`); no rota el refresh token. Lo protege `requireAllowedOrigin`, que compara `Origin` con `APP_ORIGIN`, y no hay CORS. `InvalidSession` lleva la causa solo para el log (`MISSING` a `info`, el resto a `warn`) y al cliente siempre le llega `401 INVALID_SESSION`. `loadConfig` exige `JWT_SECRET` (32 caracteres como mínimo) y `APP_ORIGIN`.
- **Límite de intentos (US01_d):** `AttemptLimiter` (`application/attempts`) es genérico: aplica una política (máximo y ventana) a una clave `<operación>:<ip>` y lanza `TooManyAttempts`, que `errorHandler` traduce a `429` con `Retry-After`. `LimitRegistrationAttempts` construye la clave `register:<ip>` y registra `USER_REGISTER_RATE_LIMITED`; el login y las invitaciones harán lo mismo con su política. `PrismaAttemptRepository` guarda un intento aceptado por fila y serializa por clave con `pg_advisory_xact_lock` dentro de una transacción (con `$executeRaw`, porque la función devuelve `void`): un intento rechazado no se guarda, así que el `429` no alarga el bloqueo, y si la base de datos no responde falla cerrado (`503`). El middleware va en `authRouter` antes del handler de `/register`, después de `express.json()` (un JSON roto responde `400` sin contar). `createApp` aplica `trust proxy` con `TRUST_PROXY_HOPS` para que `req.ip` sea la IP real y el cliente no pueda elegirla. En los tests, `defaultDependencies` deja pasar todos los intentos y `realApp` usa un máximo de 1000 salvo que el test fije otro; el E2E arranca con `REGISTRATION_ATTEMPTS_MAX=1000` porque todas sus peticiones vienen de la misma IP.
- **Captcha (US01_e):** el puerto `CaptchaVerifier` lo implementan `RecaptchaCaptchaVerifier` (Google `siteverify` con el `fetch` inyectado) y `FakeCaptchaVerifier`, y `createCaptchaVerifier` elige el real con `RECAPTCHA_V3_SECRET` y `RECAPTCHA_V2_SECRET` y el falso sin ellos (con un aviso en el log); `loadConfig` exige los secretos con `NODE_ENV=production`, así que el falso nunca llega a producción. El falso acepta cualquier token salvo los reservados `fake-low-score` (v3, pide el reto), `fake-fail` y `fake-unavailable`, y es el que usan los tests (`realApp`, E2E). El real acepta v3 con score >= 0,6 (constante), acción `register` y dominio de `APP_ORIGIN`, y v2 con éxito y dominio; un score bajo es `CaptchaChallengeRequired` (`422`), el resto de fallos del usuario es `CaptchaFailed` con un motivo solo para el log, y si Google no responde en 3 segundos, falla o responde algo inesperado falla cerrado con `CaptchaUnavailable` (`503 CAPTCHA_UNAVAILABLE`). El captcha va antes que la validación: un registro sin `captcha` es `422`, no `400`. Google valida primero el token, así que un secreto inválido solo se ve con un token de formato válido.
- **Código generado:** `backend/src/infrastructure/prisma/generated/` lo crea `prisma generate` (postinstall del backend; `output` en `prisma/schema.prisma`). No se edita ni se versiona, y está excluido de `.gitignore`, ESLint, Prettier y cobertura. Si falta o está desfasado tras cambiar `schema.prisma`, regenéralo en lugar de tocarlo a mano.

### Arquitectura del frontend

- **Arranque:** `main.tsx` (sin lógica, excluido de cobertura) carga Bootstrap CSS e i18n y monta `<BrowserRouter><SessionProvider><App/></SessionProvider></BrowserRouter>`; `App.tsx` solo declara las rutas (react-router) y cada una apunta a una página de `pages/`. Los tests montan `App` o la página con su propio router y, si usa la sesión, con `SessionProvider` y `sessionService.refresh` simulado.
- **i18n:** `i18n/i18n.ts` registra `es` (idioma por defecto y fallback) y `en`. Ningún texto visible va en los componentes; `locales.test.ts` falla si `es.json` y `en.json` no tienen exactamente las mismas claves o hay traducciones vacías.
- **Contrato de la API:** los tipos viven en `api/generated/schema.ts` (generado desde `docs/api-spec.yml`, ver abajo). `api/schema.test.ts` usa `expectTypeOf` para fijar los tipos del contrato; se comprueban con `npm run typecheck`, no con `vitest`.
- **Sesión (US01_c):** `session/SessionProvider` guarda el access token y el usuario solo en memoria (nunca en `localStorage`, `sessionStorage` ni cookies legibles) y hace una única renovación al montar, aunque `StrictMode` ejecute el efecto dos veces; `refresh()` ignora las respuestas de peticiones superadas. `services/sessionService.ts` interpreta `POST /api/auth/refresh` por `error.code` y nunca lanza. `OnboardingPage` (`/onboarding`) es provisional hasta US04: sin sesión redirige a `/registro`, porque `/login` aún no existe.
- **Captcha (US01_e):** el módulo `captcha/` tiene la configuración de las claves de sitio (`VITE_RECAPTCHA_SITE_KEY_V3` y `_V2`, las dos o ninguna; el único sitio que lee `import.meta.env`), el cliente de reCAPTCHA (carga el script de Google solo la primera vez que se necesita, con un límite de 10 segundos y reintento tras un fallo) y un cliente falso sin claves, con un reto simulado. `useCaptchaClient` elige uno por la configuración y admite otro inyectado con `CaptchaClientContext`, que es como lo controlan los tests. `RegisterPage` pide un token v3 nuevo en cada envío, muestra el reto v2 cuando el servidor lo pide (conservando todos los datos, contraseña incluida, y con el envío bloqueado hasta resolverlo) y trata un script que no carga como indisponibilidad sin llamar al backend.
- **Borrador del formulario (US01_f):** `services/registrationDraft.ts` guarda en `sessionStorage` (clave `calendarschool:registration-draft:v1`) el colegio, el municipio, el nombre, los apellidos y el email en cada cambio, y nunca la contraseña (lista explícita de campos). Todo acceso al almacenamiento va en `try/catch` y un borrador inválido se ignora. `RegisterPage` lo restaura al montar, lo borra tras el `201` (una `ref` impide que se vuelva a escribir) y descarta un municipio que no esté en la lista. La guarda contra envíos repetidos es una `ref` síncrona (`isSubmittingRef`), no el estado `isPending`. `setupTests.ts` vacía `sessionStorage` entre tests.
- **Registro:** la página `/registro` (`pages/RegisterPage.tsx`) usa `hooks/useMunicipalities`, `components/MunicipalitySearch` (combobox que solo admite elegir de la lista), `services/registrationService.ts` (usa `fetch` e interpreta la respuesta por `error.code` en estados como `created` o `emailAlreadyRegistered`) y `validation/registrationValidation.ts`. Ante un `429` muestra el aviso de demasiados intentos con los minutos de espera (`Retry-After` redondeado hacia arriba, mínimo 1) y conserva los datos salvo la contraseña. Tras el `201` llama a `refresh()` del contexto: con sesión navega a `/onboarding`; si la cookie no se acepta o la sesión no se puede comprobar, sustituye el formulario por un aviso (la cuenta ya existe y reenviarlo daría un `409`). El enlace de «email ya registrado» apunta a `/login`, que aún no existe (US02).
- **Proxy:** Vite proxifica `/api` a `API_PROXY_TARGET` (por defecto `http://localhost:3000`) tanto en `dev` como en `preview`, de modo que frontend y API comparten origen. El script de E2E apunta esa variable a su propio backend (:3001).

Puntos que no se deducen del código:

- **Tests:** los unitarios son `*.test.ts` y los de integración `*.int.test.ts`, junto al código. Cada worker de Vitest usa su propio esquema `test_<n>` en `calendarschool_test` y `resetDatabase()` vacía sus tablas antes de cada test; una salvaguarda impide ejecutarlo contra otra base o esquema. La URL sale de `TEST_DATABASE_URL`.
- **Validación compartida:** las reglas de cada campo del registro están en el backend (`registerSchoolRequest.ts`) y en el frontend (`registrationValidation.ts`), y ambos recorren la misma tabla `test-fixtures/registration-fields.json`: al cambiar una regla, se cambia primero esa tabla. La contraseña admite de 8 caracteres a 72 **bytes** en UTF-8, el límite de Bcrypt, y se rechaza lo que lo supera en lugar de truncarlo.
- **Datos de test:** `resetDatabase()` y la limpieza del E2E (`scripts/e2eData.mjs`, antes de cada ejecución y nunca al terminar) conservan `_prisma_migrations` y `municipalities`, datos fijos que carga la migración; ambas listas deben coincidir (hay un test). Los E2E usan datos únicos por test porque la base solo se vacía al empezar. `GET /api/municipalities` es cacheable un día: un E2E que simule su fallo debe vaciar antes la caché del navegador.
- **Cobertura:** 90 % en backend y 80 % en frontend, medida sobre unitarios + integración. `server.ts` y `main.tsx` están excluidos y no pueden contener lógica.
- **Backend:** `createApp()` recibe todas sus dependencias y nunca lee `process.env`; solo `server.ts` llama a `loadConfig()`. Formato de respuesta común (`success`/`data`/`error.code`) definido en `docs/api-spec.yml`.
- **Contrato primero:** cualquier cambio de la API empieza en `docs/api-spec.yml`. Los tipos del frontend se generan desde él en `frontend/src/api/generated/schema.ts` (`npm run api:types -w frontend`); ese fichero se versiona, no se edita a mano y está excluido de ESLint, Prettier y cobertura, porque `api:types:check` lo compara byte a byte. Un código de error nuevo se añade a la vez al enum `ErrorCode` del contrato y a `ERROR_CODES` de `backend/src/presentation/http/appError.ts`; `appError.test.ts` falla si no coinciden.
- **Dependencias con scripts de instalación (npm 11):** se aprueban o deniegan explícitamente en `allowScripts` del `package.json` raíz (`npm approve-scripts` / `npm deny-scripts`), nunca con `--all`.
- **TypeScript está fijado a `~6.0`** porque `typescript-eslint` aún no admite la 7. El `package.json` raíz lo fuerza además en todo el árbol (`"overrides": { "typescript": "~6.0.3" }`), porque `openapi-typescript` solo declara TypeScript 5 como peer; al subir TypeScript, sube también el override.
- **Hook de pre-commit:** husky + lint-staged con un `.lintstagedrc.json` por workspace; los ficheros fuera de `backend/` y `frontend/` no se procesan. El ESLint del hook del frontend lleva `--no-warn-ignored` para que un commit con el fichero de tipos generado no falle por el aviso de fichero ignorado.
- **Prettier siempre desde la raíz:** el `.prettierignore` (que excluye `frontend/src/api/generated/`, `docs/` y `openspec/`) solo se aplica con el directorio de trabajo en la raíz; ejecutar `prettier --write src` desde `frontend/` reformatea el fichero de tipos generado y `api:types:check` deja de pasar en CI. El shell de Bash conserva el directorio entre llamadas: comprueba `pwd` antes.
- **Windows:** el shell principal es PowerShell 5.1 (sin `&&`, `cp` es alias de `Copy-Item`); para los comandos POSIX anteriores usa Git Bash. Los enlaces simbólicos de `.claude/` y `.cursor/` requieren `core.symlinks=true` y Modo de desarrollador; si aparecen como ficheros de texto, las skills y agentes no funcionan (reparación en `README.md` §1.4, *Clonado del repositorio*). Si lint-staged deja un `lint-staged automatic backup` en `git stash list`, compruébalo con `git diff stash@{0}` y elimínalo con `git stash drop`.

`packages/specboot/` (herramienta de LIDR.co que arrancó el flujo OpenSpec) solo existe en local y está en `.gitignore`: no forma parte del producto, contiene copias desactualizadas de `ai-specs/` y de los estándares, y no debe ejecutarse sobre este repo ni tomarse como referencia.

## Comandos disponibles

El CLI `openspec` está instalado globalmente:

```bash
openspec list            # cambios activos (--specs para specs consolidadas)
openspec show <cambio>   # ver un cambio o spec
openspec validate <cambio>
openspec archive <cambio>  # archiva y fusiona deltas en openspec/specs/
```

## Fuentes de verdad

- Producto: `docs/PRD_CalendarSchool.md` (no crear features ni issues fuera del PRD sin validación humana).
- Historias de usuario: `docs/User_Stories_MVP.md` (épicas en `docs/ENTREGAS/EPICAS_MVP.md`, solo en local); algoritmo de generación: `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md` y `docs/RESEARCH_ALGORITMOS_GENERACION_HORARIOS.md`.
- Modelo de datos: `docs/Modelo_de_Datos/MODELO_DATOS.md` (v2.1, pendiente de migrar; lee su nota de estado). El modelo se construye de forma incremental: cada historia añade sus tablas en `backend/prisma/schema.prisma` y actualiza `MODELO_DATOS.md`. El DDL `MODELO_DATOS_SQL_DDAL.sql` (MySQL) está **obsoleto**: no lo uses para generar esquemas.
- Contrato API: `docs/api-spec.yml` (OpenAPI 3.1; los errores comunes están en `components.responses` para reutilizarlos).
- Arquitectura: `docs/arquitectura/ARQUITECTURA_COMPLETA.md` y diagramas C4.
- Linear (team/proyecto, labels obligatorios `size:*`, `type:*`): `docs/base-project.md`.
- `docsMIO/`, `CLAUDE_MIO.md`, `docs/ENTREGAS/`, `docs/docsApoyo/` y `docs/arquitectura/old/` son notas, copias o entregas que solo existen en local (están en `.gitignore`) y no son fuentes de verdad.

## Inconsistencias conocidas en la documentación

- El backend sigue DDD por capas (`src/domain`, `src/application`, `src/presentation`, `src/infrastructure`), alineado en `README.md` §2.3, `docs/backend-standards.md` y `openspec/config.yaml`.
- `docs/backend-standards.md` y `docs/frontend-standards.md` proceden de una plantilla: sus ejemplos (`Candidate`, Create React App) no son de este dominio. Aplica las reglas, no los nombres.

## Flujo de trabajo (Spec-Driven con OpenSpec)

- Los cambios se gestionan en `openspec/changes/` (archivados en `openspec/changes/archive/`), y las specs consolidadas en `openspec/specs/` (consulta los cambios activos con `openspec list` y las capacidades con `openspec list --specs`). Configuración y reglas por artefacto en `openspec/config.yaml`; al crear `tasks.md` aplica `docs/openspec-tasks-mandatory-steps.md`.
- Los comandos `/opsx:propose`, `/opsx:explore`, `/opsx:apply`, `/opsx:verify`, `/opsx:sync` y `/opsx:archive` recorren el ciclo de un cambio; sus definiciones están en `.cursor/commands/opsx-*.md` y las skills `openspec-*` correspondientes en `ai-specs/skills`.
- Para implementar, adopta el agente correspondiente de `ai-specs/agents/` (`backend-developer.md`, `frontend-developer.md`).
- `ai-specs/` es la fuente canónica de agentes y skills; `.claude/agents`, `.claude/skills`, `.cursor/agents` y `.cursor/skills` contienen enlaces a ella (ver README §1.4 para clonar en Windows). `AGENTS.md`, `codex.md` y `GEMINI.md` son ficheros de texto que solo apuntan a `docs/base-standards-castellano.md`. Usa la skill `sync-agent-symlinks` tras crear/mover artefactos.
- **Modelo por flujo (§5 de los estándares):** `enrich-us`, `openspec-ff-change` y `openspec-continue-change` se ejecutan con Opus y esfuerzo medio. Si la sesión no lo cumple, edita `.claude/settings.json` (`"model": "claude-opus-5-5"`, `"effortLevel": "medium"`) sin preguntar, y vuelve a Sonnet (`"model": "claude-sonnet-5-5"`, `"effortLevel": "medium"`) en el resto de pasos. Es un cambio esperado en un fichero versionado: el `model` de `settings.json` prevalece sobre el elegido con `/model` al reiniciar.
- Idioma: ver `docs/base-standards-castellano.md` §1. Commits en formato Conventional Commits.
