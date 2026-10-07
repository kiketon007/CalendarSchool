# Paso 16 — Tests y verificación del estado de la base de datos

- Fecha: 2026-10-06
- Cambio: bootstrap-proyecto (US00)
- Agente: Claude (Opus 5.5) en Claude Code
- Entorno: Windows 11, Node 24.14.1, PostgreSQL 18.6 en Docker Compose (`calendarschool-postgres-1`)

## Comandos ejecutados

- Estado previo y posterior de las bases (`psql` dentro del contenedor): bases `calendarschool*`, tablas de `calendarschool`, número de migraciones, esquemas y tablas de `calendarschool_test`.
- `npm run test:unit` — tests unitarios de backend (proyecto `unit`, sin base de datos) y tests del frontend.
- `npm test` (dos veces, para detectar tests intermitentes) — backend (proyectos `unit` e `integration`, con cobertura) y frontend (con cobertura).

## Resultados de los tests

- Tests de los módulos cambiados (`npm run test:unit`): backend 42 superados, 0 fallidos; frontend 5 superados, 0 fallidos. Duración: 8 s.
- Suite completa (`npm test`), ejecución 1: backend 53 superados (11 ficheros), frontend 5 superados (3 ficheros), 0 fallidos. Duración: 13 s.
- Suite completa (`npm test`), ejecución 2: mismo resultado, 0 fallidos. Duración: 13 s.
- Cobertura del backend (unitarios + integración): sentencias 100 % (85/85), ramas 100 % (24/24), funciones 100 % (27/27), líneas 100 % (83/83). Umbral: 90 %.
- Cobertura del frontend: sentencias 100 % (5/5), funciones 100 % (2/2), líneas 100 % (5/5). Umbral: 80 %.
- Tests intermitentes: ninguno observado en las dos ejecuciones.
- Verificación adicional (paso 15): un módulo sin tests que baja la cobertura por debajo del 90 % hace fallar `npm test` con código 1 en las cuatro métricas.

## Verificación del estado de la base de datos

- Estado previo:
  - Bases: `calendarschool`, `calendarschool_test`.
  - `calendarschool` / tablas: `public._prisma_migrations` (1 migración aplicada).
  - `calendarschool_test` / esquemas: `public`, `test_1`, `test_2`, `test_3`, `test_4`.
  - `calendarschool_test` / tablas: `_prisma_migrations` en `public` y en cada `test_<n>`.
- Estado posterior: idéntico (comparados como conjuntos ordenados).
  - La base de desarrollo `calendarschool` no se ha tocado.
  - Ninguna tabla de prueba (`reset_probe`, `isolation_probe`) queda en ningún esquema.
  - Los esquemas `test_<n>` se recrean en cada ejecución por diseño (`globalSetup`), por lo que su contenido tras los tests es el de una migración limpia.
- Estado restaurado: no fue necesario.
- Acciones de restauración: ninguna.

## Resultado

- Estado del paso 16: **PASS**
- Problemas bloqueantes: ninguno
