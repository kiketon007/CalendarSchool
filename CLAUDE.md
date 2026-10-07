# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@docs/base-standards-castellano.md

## Estado actual del repositorio

CalendarSchool (gestión y generación automática de horarios escolares, normativa de la Comunidad Valenciana) tiene el **esqueleto técnico de US00** (cambio OpenSpec `bootstrap-proyecto`): monorepo con npm workspaces (`backend`, `frontend`), Node.js 24 LTS (`.nvmrc`), PostgreSQL 18 en Docker Compose y CI en GitHub Actions. Aún no hay lógica de dominio: solo `GET /api/health` y una página inicial vacía. El despliegue en AWS (`infrastructure/`, `lambda.ts`) queda para el cambio `despliegue-aws`. Stack en `README.md` §2.3: Express 5 + TypeScript 6 (ESM, `NodeNext`) + Prisma 7 + Zod + pino; React 19 + Vite 8 + react-bootstrap + react-i18next; Vitest 5 + Supertest + React Testing Library + Cypress 16.

### Comandos

Desde la raíz (instalación completa en `README.md` §1.4):

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
- **Código generado:** `backend/src/infrastructure/prisma/generated/` lo crea `prisma generate` (postinstall del backend; `output` en `prisma/schema.prisma`). No se edita ni se versiona, y está excluido de `.gitignore`, ESLint, Prettier y cobertura. Si falta o está desfasado tras cambiar `schema.prisma`, regenéralo en lugar de tocarlo a mano.

Puntos que no se deducen del código:

- **Tests:** los unitarios son `*.test.ts` y los de integración `*.int.test.ts`, junto al código. Cada worker de Vitest usa su propio esquema `test_<n>` en `calendarschool_test` y `resetDatabase()` vacía sus tablas antes de cada test; una salvaguarda impide ejecutarlo contra otra base o esquema. La URL sale de `TEST_DATABASE_URL`.
- **Cobertura:** 90 % en backend y 80 % en frontend, medida sobre unitarios + integración. `server.ts` y `main.tsx` están excluidos y no pueden contener lógica.
- **Backend:** `createApp()` recibe todas sus dependencias y nunca lee `process.env`; solo `server.ts` llama a `loadConfig()`. Formato de respuesta común (`success`/`data`/`error.code`) definido en `docs/api-spec.yml`.
- **Contrato primero:** cualquier cambio de la API empieza en `docs/api-spec.yml`. Los tipos del frontend se generan desde él en `frontend/src/api/generated/schema.ts` (`npm run api:types -w frontend`); ese fichero se versiona, no se edita a mano y está excluido de ESLint, Prettier y cobertura, porque `api:types:check` lo compara byte a byte. Un código de error nuevo se añade a la vez al enum `ErrorCode` del contrato y a `ERROR_CODES` de `backend/src/presentation/http/appError.ts`; `appError.test.ts` falla si no coinciden.
- **Dependencias con scripts de instalación (npm 11):** se aprueban o deniegan explícitamente en `allowScripts` del `package.json` raíz (`npm approve-scripts` / `npm deny-scripts`), nunca con `--all`.
- **TypeScript está fijado a `~6.0`** porque `typescript-eslint` aún no admite la 7. El `package.json` raíz lo fuerza además en todo el árbol (`"overrides": { "typescript": "~6.0.3" }`), porque `openapi-typescript` solo declara TypeScript 5 como peer; al subir TypeScript, sube también el override.
- **Hook de pre-commit:** husky + lint-staged con un `.lintstagedrc.json` por workspace; los ficheros fuera de `backend/` y `frontend/` no se procesan. El ESLint del hook del frontend lleva `--no-warn-ignored` para que un commit con el fichero de tipos generado no falle por el aviso de fichero ignorado.
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
- Para implementar, adopta el agente correspondiente de `ai-specs/agents/` (`backend-developer.md`, `frontend-developer.md`).
- `ai-specs/` es la fuente canónica de agentes y skills; `.claude/agents`, `.claude/skills`, `.cursor/agents` y `.cursor/skills` contienen enlaces a ella (ver README §1.4 para clonar en Windows). `AGENTS.md`, `codex.md` y `GEMINI.md` son ficheros de texto que solo apuntan a `docs/base-standards-castellano.md`. Usa la skill `sync-agent-symlinks` tras crear/mover artefactos.
- **Modelo por flujo (§5 de los estándares):** `enrich-us`, `openspec-ff-change` y `openspec-continue-change` se ejecutan con Opus y esfuerzo medio. Si la sesión no lo cumple, edita `.claude/settings.json` (`"model": "claude-opus-5-5"`, `"effortLevel": "medium"`) sin preguntar, y vuelve a Sonnet (`"model": "claude-sonnet-5-5"`, `"effortLevel": "medium"`) en el resto de pasos. Es un cambio esperado en un fichero versionado: el `model` de `settings.json` prevalece sobre el elegido con `/model` al reiniciar.
- Idioma: ver `docs/base-standards-castellano.md` §1. Commits en formato Conventional Commits.
