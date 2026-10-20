# Informe del paso 12 - Tests unitarios y verificación de la base de datos

- Fecha: 2026-10-20
- Cambio: us09-crear-profesor
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `docker compose ps` (PostgreSQL 17 `calendarschool-postgres-1`, sano). La migración `20261020142755_add_professors` (tabla `professors`, enum `ProfessorPosition`, columna `classes.tutor_id` única y `ON DELETE SET NULL`) ya estaba aplicada a la base de desarrollo con `npm run db:migrate`; los esquemas `test_1` a `test_4` la reciben al crearse.
- Línea base y estado posterior: `snapshot7.sh` (consultas con `psql` dentro del contenedor, sobre cada esquema que tiene la tabla `users`, con `courses`, `classes` y ahora `professors`), comparadas con `diff`.
- Tests de los módulos modificados:
  - Backend: `npm exec -w backend -- vitest run src/domain src/application/professors src/application/courses src/infrastructure/prisma/prismaProfessorRepository.int.test.ts src/infrastructure/prisma/prismaCourseRepository.int.test.ts src/presentation src/professors.int.test.ts src/courses.int.test.ts src/app.test.ts`
  - Frontend: `npm exec -w frontend -- vitest run src/services src/validation src/components src/pages/ProfessorsPage.test.tsx src/pages/CreateProfessorPage.test.tsx src/pages/CoursesPage.test.tsx src/pages/EditCoursePage.test.tsx src/App.test.tsx src/api src/i18n`
- Verificación completa: `npm test`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build`, `npm run api:types:check -w frontend`

## Resultados de los tests

- Tests dirigidos:
  - Backend: 50 ficheros, 764 pasan, 0 fallan, 0 omitidos.
  - Frontend: 32 ficheros, 1002 pasan, 0 fallan, 0 omitidos.
- Suite completa (`npm test`, con cobertura), segunda ejecución:
  - Backend (unitarios e integración): 129 ficheros, 1935 pasan, 0 fallan, 0 omitidos (antes: 123 ficheros y 1819).
  - Frontend: 66 ficheros, 1459 pasan, 0 fallan, 0 omitidos (antes: 62 ficheros y 1289).
  - Infraestructura: 4 ficheros, 57 pasan, 0 fallan, 0 omitidos.
- Cobertura (mínimos: 90 % backend, 80 % frontend):
  - Backend: 99,86 % de sentencias, 98,24 % de ramas, 99,73 % de funciones, 99,93 % de líneas.
  - Frontend: 97,41 % de sentencias, 94,36 % de ramas, 99,40 % de funciones, 97,38 % de líneas.
- Otras comprobaciones: `lint` (ESLint y `prettier --check`), `typecheck --workspaces` (incluidas las specs de Cypress), `build` de ambos workspaces y `api:types:check` terminan con código 0.

### Incidencia en la primera ejecución completa

- La primera ejecución de `npm test` terminó con código 1: **un worker de Vitest murió** (`Worker exited unexpectedly with exit code 3221226505`, es decir `0xC0000409`, un cierre del proceso de Node en Windows) mientras ejecutaba `backend/src/courses.int.test.ts`. No fue un fallo de aserción: 128 de 129 ficheros pasaron y los 22 tests que faltaban eran los de ese fichero.
- Ese fichero, ejecutado solo, pasó (34 de 34), y una segunda ejecución completa de `npm test` pasó entera (código 0, 129 ficheros y 1935 tests). No se cambió ningún fichero entre las dos ejecuciones.
- No se ha identificado la causa. La hipótesis más probable es un fallo nativo puntual del proceso (el fichero crea sesiones con Bcrypt y usa un servidor TCP que cierra conexiones), pero **no se ha reproducido ni demostrado**. Se deja constancia por si vuelve a aparecer; no se tomó ninguna medida.

## Notas de TDD

- Los tests de estas tareas se vieron en rojo antes de implementar: el repositorio de profesores con PostgreSQL real, las rutas con dobles (6.1: 18 en rojo), la tabla de ejemplos de validación del backend, el tutor en `coursesService` (7.1: 8 en rojo), la cabecera (8.2: 4 en rojo), `CoursesPage` (10.1: 4 en rojo) y el tutor de solo lectura de `CourseForm` y `EditCoursePage` (10.3: 5 en rojo).
- Excepciones: `professorsService` (7.3 y 7.4 se escribieron seguidos, así que no se vieron en rojo), `professorValidation` (7.5 y 7.6 igual), `ProfessorsPage` y `CreateProfessorPage` (sus tests pasaron a la primera con la implementación) y las pruebas HTTP de integración de 6.3 (la implementación de 6.2 ya existía).
- Tests existentes modificados: `AppHeader.test.tsx` (la lista de enlaces y el orden del tabulador incluyen «Profesores»), `appDoubles.ts` (dos dobles nuevos) y los de cursos que fijaban `tutor`. Los de creación, edición y borrado de cursos no cambian de comportamiento.
- Los E2E de Cypress no forman parte de este paso (grupo 14). En la tarea 11.2 se revisaron los que miran la cabecera o la columna «Tutores»: siguen siendo válidos sin cambios.

## Verificación de la base de datos

- Línea base previa a los tests (`calendarschool.public` y `calendarschool_test`, esquemas `public` y `test_1` a `test_4`):
  - `users`, `refresh_tokens`, `access_links`, `schools`, `rate_limit_attempts`, `courses`, `classes` y `professors`: 0 en todos los esquemas que tienen la tabla.
  - `municipalities`: 542 en todos.
  - `_prisma_migrations`: 9 en la base de desarrollo y en `test_1` a `test_4`; 8 en `calendarschool_test.public`, que no tiene la tabla `professors` porque solo la migra el E2E (`npm run test:e2e` migra esa base antes de arrancar).
- Validación posterior: idéntica a la línea base en todos los esquemas (comparada con `diff`, sin diferencias).
- Estado restaurado: no hizo falta; los tests vacían las tablas de cada worker antes de cada test y no tocan la base de desarrollo.
- Acciones de restauración: ninguna.
- Ficheros: solo han aparecido los del cambio (migración, módulos de profesores del backend y del frontend, tabla `professor-fields.json` y los artefactos de OpenSpec).

## Resultado

- Estado del paso 12: PASA
- Problemas bloqueantes: ninguno
