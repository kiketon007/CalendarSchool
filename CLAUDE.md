# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@docs/base-standards-castellano.md

## Estado actual del repositorio

CalendarSchool (gestión y generación automática de horarios escolares, normativa de la Comunidad Valenciana) está en **fase de especificación**: todavía no existen `backend/`, `frontend/` ni `infrastructure/`, así que no hay comandos de build, lint o tests. El `package.json` raíz solo instala Cypress (herramienta de E2E elegida en lugar de Playwright). La estructura objetivo y el stack están en `README.md` §2.3 (React 18 + Vite + Bootstrap, Express + TypeScript + Prisma/PostgreSQL, BullMQ, Jest + Supertest + Cypress, AWS Lambda vía Serverless). Cuando se cree código, actualiza esta sección con los comandos reales.

Lo único ejecutable es `packages/specboot/` (`@lidr/lidr-specboot`): un CLI de Node (`bin/init.js [destino]`) que copia `template/` (`.cursor`, `ai-specs`, `docs`) en otro proyecto para arrancar el flujo OpenSpec. No es parte del producto y **no debe ejecutarse sobre este repo**: crea `CLAUDE.md`/`AGENTS.md`/`codex.md`/`GEMINI.md` como enlaces a `docs/base-standards.md`, que aquí no existe (este repo usa `docs/base-standards-castellano.md`).

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
- Modelo de datos: `docs/Modelo_de_Datos/MODELO_DATOS.md` (+ DDL en `MODELO_DATOS_SQL_DDAL.sql`).
- Contrato API: `docs/api-spec.yml`.
- Arquitectura: `docs/arquitectura/ARQUITECTURA_COMPLETA.md` y diagramas C4.
- Linear (team/proyecto, labels obligatorios `size:*`, `type:*`): `docs/base-project.md`.
- `docsMIO/`, `CLAUDE_MIO.md`, `docs/ENTREGAS/`, `docs/docsApoyo/` y `docs/arquitectura/old/` son notas, copias o entregas que solo existen en local (están en `.gitignore`) y no son fuentes de verdad.

## Inconsistencias conocidas en la documentación

- El backend sigue DDD por capas (`src/domain`, `src/application`, `src/presentation`, `src/infrastructure`), alineado en `README.md` §2.3, `docs/backend-standards.md` y `openspec/config.yaml`.
- `docs/backend-standards.md` y `docs/frontend-standards.md` proceden de una plantilla: sus ejemplos (`Candidate`, Create React App) no son de este dominio. Aplica las reglas, no los nombres.

## Flujo de trabajo (Spec-Driven con OpenSpec)

- Los cambios se gestionan en `openspec/changes/` (archivados en `openspec/changes/archive/`), y las specs consolidadas en `openspec/specs/` (ambas vacías por ahora). Configuración y reglas por artefacto en `openspec/config.yaml`; al crear `tasks.md` aplica `docs/openspec-tasks-mandatory-steps.md`.
- Para implementar, adopta el agente correspondiente de `ai-specs/agents/` (`backend-developer.md`, `frontend-developer.md`).
- `ai-specs/` es la fuente canónica de agentes y skills; `.claude/agents`, `.claude/skills`, `.cursor/agents` y `.cursor/skills` contienen enlaces a ella (ver README §1.4 para clonar en Windows). `AGENTS.md`, `codex.md` y `GEMINI.md` son ficheros de texto que solo apuntan a `docs/base-standards-castellano.md`. Usa la skill `sync-agent-symlinks` tras crear/mover artefactos.
- Todo el código, comentarios y documentación en castellano; commits en formato Conventional Commits.
