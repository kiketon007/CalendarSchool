# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@docs/base-standards-castellano.md

## Estado actual del repositorio

CalendarSchool (gestión y generación automática de horarios escolares, normativa de la Comunidad Valenciana) es un monorepo con npm workspaces (`backend`, `frontend`, `infrastructure`), Node.js 24 LTS (`.nvmrc`), PostgreSQL 17 en Docker Compose (la misma versión mayor que Supabase) y CI en GitHub Actions. Hoy cubre el registro de colegio, la sesión, la gestión de usuarios, las invitaciones, el restablecimiento de contraseña, los cursos con sus clases y tutores, los profesores, los alumnos, los calendarios base (crear, listar, editar y borrar) y las asignaturas con los cursos en los que se imparten (crear, listar, editar y borrar), con su SPA de React. El despliegue en AWS existe y el registro y el login están **abiertos** en producción: CloudFront reenvía `/api/*` al backend. La lista exacta de endpoints está en `docs/api-spec.yml`, el detalle de cada capacidad en `openspec/specs/` (`openspec list --specs`) y el stack y las versiones en `README.md` §2.3.

### Comandos

Desde la raíz (instalación completa en `README.md` §1.4). Antes de `npm test`, `npm run test:e2e` o cualquier test de integración, PostgreSQL debe estar levantado (`docker compose up -d`) y la base de desarrollo migrada (`npm run db:migrate`); `npm run test:unit` no los necesita.

```bash
npm install                      # genera también el cliente Prisma (postinstall del backend)
cp backend/.env.example backend/.env
docker compose up -d             # PostgreSQL 17: calendarschool y calendarschool_test (si vienes de la 18: docker compose down -v antes)
npm run db:migrate               # aplica migraciones a la base de desarrollo (nunca es implícito)
npm exec -w backend -- prisma migrate dev --name <nombre>   # crea una migración (revisa el SQL: hay CHECK e índices escritos a mano)
npm run dev                      # backend (:3000) y frontend (:5173, proxy de /api) en paralelo
npm run build                    # build de los tres workspaces
npm run lint                     # ESLint (con tipos) en los tres workspaces + prettier --check
npm run format                   # prettier --write backend frontend infrastructure
npm test                         # los tres workspaces: backend unitarios + integración (requiere PostgreSQL), frontend e infrastructure
npm run test:unit                # backend unitario + frontend, sin base de datos
npm run test:e2e                 # compila, migra, arranca backend (:3001) y vite preview (:4173) y ejecuta Cypress
npm run test:e2e -- --spec cypress/e2e/session.cy.ts   # lo anterior, pero solo con una spec
npm run typecheck --workspaces   # tipos de código, tests y specs de Cypress
npm run api:types -w frontend    # regenera los tipos de la API desde docs/api-spec.yml
npm run api:types:check -w frontend  # falla si los tipos generados no están al día (lo ejecuta CI)
npm test -w infrastructure       # tests de los stacks de CDK (plantilla), de la CloudFront Function y del smoke test; no necesitan AWS
npm run synth -w infrastructure  # sintetiza los stacks (empaqueta la Lambda con esbuild; necesita CDK_DEFAULT_ACCOUNT)
node scripts/smoke.mjs <url> [url-execute-api]   # smoke test contra el entorno desplegado
```

Un solo fichero o un solo test:

```bash
# Desde la raíz. Ojo: en Vitest `-w` es --watch, por eso el workspace se indica en npm exec.
npm exec -w backend -- vitest run src/app.test.ts
npm exec -w backend -- vitest run --project integration    # solo integración (requiere PostgreSQL)
npm exec -w backend -- vitest run -t "responds 200"         # por nombre de test
npm exec -w frontend -- vitest run src/pages/HomePage.test.tsx
```

### Arquitectura

El detalle de cada capa está en el `CLAUDE.md` de su carpeta, que Claude carga al trabajar en ella:

- `backend/CLAUDE.md`: raíz de composición, puertos y adaptadores, capa HTTP, sesión, login, límite de intentos, captcha, consentimiento y despliegue en Lambda.
- `frontend/CLAUDE.md`: arranque, i18n, sesión, captcha, formularios de registro y login, CSP y proxy de Vite.

### Puntos que no se deducen del código

- **Contrato primero:** cualquier cambio de la API empieza en `docs/api-spec.yml`. Los tipos del frontend se generan desde él en `frontend/src/api/generated/schema.ts` (`npm run api:types -w frontend`); ese fichero se versiona, no se edita a mano y está excluido de ESLint, Prettier y cobertura, porque `api:types:check` lo compara byte a byte. Un código de error nuevo se añade a la vez al enum `ErrorCode` del contrato y a `ERROR_CODES` de `backend/src/presentation/http/appError.ts`; `appError.test.ts` falla si no coinciden.
- **Prettier siempre desde la raíz:** el `.prettierignore` (que excluye `frontend/src/api/generated/`, `docs/` y `openspec/`) solo se aplica con el directorio de trabajo en la raíz; ejecutar `prettier --write src` desde `frontend/` reformatea el fichero de tipos generado y `api:types:check` deja de pasar en CI. El shell de Bash conserva el directorio entre llamadas: comprueba `pwd` antes.
- **Tests:** los unitarios son `*.test.ts` y los de integración `*.int.test.ts`, junto al código. Cada worker de Vitest usa su propio esquema `test_<n>` en `calendarschool_test` y `resetDatabase()` vacía sus tablas antes de cada test; una salvaguarda impide ejecutarlo contra otra base o esquema. La URL sale de `TEST_DATABASE_URL`.
- **Validación compartida:** las reglas de cada campo del registro están en el backend (`registerSchoolRequest.ts`) y en el frontend (`registrationValidation.ts`), y ambos recorren la misma tabla `test-fixtures/registration-fields.json`: al cambiar una regla, se cambia primero esa tabla. Los cursos tienen la suya, `test-fixtures/course-fields.json`, y las asignaturas también, `test-fixtures/subject-fields.json`. La contraseña admite de 8 caracteres a 72 **bytes** en UTF-8, el límite de Bcrypt, y se rechaza lo que lo supera en lugar de truncarlo.
- **Datos de test:** `resetDatabase()` y la limpieza del E2E (`scripts/e2eData.mjs`, antes de cada ejecución y nunca al terminar) conservan `_prisma_migrations` y `municipalities`, datos fijos que carga la migración; ambas listas deben coincidir (hay un test). Para lo que la aplicación aún no puede provocar (un miembro o un segundo administrador del colegio sin recorrer el flujo de invitación) y para forzar el estado de una cuenta, el E2E usa las tareas de Cypress `createUser` y `setUserStatus` (`scripts/e2eData.mjs`, solo sobre bases `*_test`). Los E2E usan datos únicos por test porque la base solo se vacía al empezar. `GET /api/municipalities` es cacheable un día: un E2E que simule su fallo debe vaciar antes la caché del navegador.
- **Cobertura:** 90 % en backend y 80 % en frontend, medida sobre unitarios + integración. `server.ts`, `lambda.ts` y `main.tsx` están excluidos y no pueden contener lógica.
- **Backend:** `createApp()` recibe todas sus dependencias y nunca lee `process.env`; solo `server.ts` y `lambda.ts` cargan la configuración. Formato de respuesta común (`success`/`data`/`error.code`) definido en `docs/api-spec.yml`.
- **Dependencias con scripts de instalación (npm 11):** se aprueban o deniegan explícitamente en `allowScripts` del `package.json` raíz (`npm approve-scripts` / `npm deny-scripts`), nunca con `--all`.
- **TypeScript está fijado a `~6.0`** porque `typescript-eslint` aún no admite la 7. El `package.json` raíz lo fuerza además en todo el árbol (`"overrides": { "typescript": "~6.0.3" }`), porque `openapi-typescript` solo declara TypeScript 5 como peer; al subir TypeScript, sube también el override.
- **Hook de pre-commit:** husky + lint-staged con un `.lintstagedrc.json` por workspace; los ficheros fuera de `backend/`, `frontend/` e `infrastructure/` no se procesan. El ESLint del hook del frontend lleva `--no-warn-ignored` para que un commit con el fichero de tipos generado no falle por el aviso de fichero ignorado.
- **Windows:** el shell principal es PowerShell 5.1 (sin `&&`, `cp` es alias de `Copy-Item`); para los comandos POSIX anteriores usa Git Bash. Los enlaces simbólicos de `.claude/` y `.cursor/` requieren `core.symlinks=true` y Modo de desarrollador; si aparecen como ficheros de texto, las skills y agentes no funcionan (reparación en `README.md` §1.4, *Clonado del repositorio*). Si lint-staged deja un `lint-staged automatic backup` en `git stash list`, compruébalo con `git diff stash@{0}` y elimínalo con `git stash drop`.
- **Infraestructura (`infrastructure/`):** dos stacks de CDK, `CalendarSchool-<env>-Certificate` (`us-east-1`, el certificado de CloudFront) y `CalendarSchool-<env>-App` (`eu-central-1`: S3 + CloudFront con la CloudFront Function de las rutas de la SPA y la CSP en su `ResponseHeadersPolicy`, HTTP API, Lambda, bucket de copias y roles de OIDC), con `-c env=prod`. Las CloudFront Functions (`functions/*.js`) se prueban evaluando su código fuente; los stacks, con `aws-cdk-lib/assertions` y la Lambda sin empaquetar (`aws:cdk:bundling-stacks: []`). El bundle se fuerza a Linux x64 (`npm_config_os/cpu/libc`) para que Bcrypt lleve el binario de Lambda aunque se empaquete desde Windows. `app-role.sql` crea el rol de aplicación de Supabase y se ejecuta **después** de la primera migración; los secretos viven en SSM bajo `/calendarschool/prod/`. Ningún secreto se pega en conversaciones ni se versiona: la guía `docs/despliegue/PUESTA_EN_MARCHA.md` los introduce con `read -rs`.

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
- Arquitectura: `docs/arquitectura/ARQUITECTURA_COMPLETA.md`, los diagramas C4 (`DIAGRAMA_C4.md`) y el modelo de Structurizr (`ARQUITECTURA_C4_STRUCTURIZR.dsl`). Separan lo **implementado** (✅: sección 0 y 2.0 de `ARQUITECTURA_COMPLETA.md`, parte A de `DIAGRAMA_C4.md`) de la **arquitectura objetivo** (🎯: el resto, y los elementos con la etiqueta `Objetivo` del DSL). Cuando una historia construya algo del objetivo, actualiza su estado en la tabla de la sección 0 y pasa el elemento a la parte implementada de los diagramas.
- Linear (team/proyecto, labels obligatorios `size:*`, `type:*`): `docs/base-project.md`.
- `docsMIO/`, `CLAUDE_MIO.md`, `docs/ENTREGAS/`, `docs/docsApoyo/` y `docs/arquitectura/old/` son notas, copias o entregas que solo existen en local (están en `.gitignore`) y no son fuentes de verdad.

## Inconsistencias conocidas en la documentación

- `docs/backend-standards.md` y `docs/frontend-standards.md` proceden de una plantilla: sus ejemplos (`Candidate`, Create React App) no son de este dominio. Aplica las reglas, no los nombres.

## Flujo de trabajo (Spec-Driven con OpenSpec)

- Los cambios se gestionan en `openspec/changes/` (archivados en `openspec/changes/archive/`), y las specs consolidadas en `openspec/specs/` (consulta los cambios activos con `openspec list` y las capacidades con `openspec list --specs`). Configuración y reglas por artefacto en `openspec/config.yaml`; al crear `tasks.md` aplica `docs/openspec-tasks-mandatory-steps.md`.
- Los comandos `/opsx:propose`, `/opsx:explore`, `/opsx:apply`, `/opsx:verify`, `/opsx:sync` y `/opsx:archive` recorren el ciclo de un cambio; sus definiciones están en `.cursor/commands/opsx-*.md` y las skills `openspec-*` correspondientes en `ai-specs/skills`.
- Para implementar, adopta el agente correspondiente de `ai-specs/agents/` (`backend-developer.md`, `frontend-developer.md`).
- `ai-specs/` es la fuente canónica de agentes y skills; `.claude/agents`, `.claude/skills`, `.cursor/agents` y `.cursor/skills` contienen enlaces a ella (ver README §1.4 para clonar en Windows). `AGENTS.md`, `codex.md` y `GEMINI.md` son ficheros de texto que solo apuntan a `docs/base-standards-castellano.md`. Usa la skill `sync-agent-symlinks` tras crear/mover artefactos.
- **Modelo por flujo:** `enrich-us`, `openspec-ff-change` y `openspec-continue-change` requieren Opus con esfuerzo medio, y el resto de pasos, Sonnet con esfuerzo medio. Si la sesión no lo cumple, corrige `.claude/settings.json` sin preguntar según `docs/base-standards-castellano.md` §5 (el `model` de `settings.json` prevalece sobre `/model` al reiniciar).
- **Reglas de sesión que se incumplen con facilidad** (`docs/base-standards-castellano.md`): un solo paso pequeño por interacción y TDD (§1); tras 3 fallos consecutivos de un test o compilación, detente y presenta log, hipótesis y propuesta, sin más intentos a ciegas (§2.1); una corrección pedida después de `apply` y antes de `archive` actualiza primero los artefactos OpenSpec (escenarios, specs, `tasks.md`, sin tareas de «bugfix») y solo después el código (§7).
- Idioma: ver `docs/base-standards-castellano.md` §1. Commits en formato Conventional Commits.
