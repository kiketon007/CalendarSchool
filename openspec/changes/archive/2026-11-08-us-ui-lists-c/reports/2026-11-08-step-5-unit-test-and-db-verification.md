# Informe del paso 5 - Tests unitarios y verificación de la base de datos

- Fecha: 2026-11-08
- Cambio: us-ui-lists-c
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- Recuentos por tabla de `calendarschool.public` y de `public` y `test_1` a `test_4` de `calendarschool_test`, antes y después.
- Tests de los ficheros cambiados: `SubjectsPage`, `ConstraintsPage`, `subjectFilters`, `locales` y `App` (251 tests, 0 fallos).
- `npm test` completo (tres workspaces, con cobertura): código de salida 0.
- `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`: los tres con código 0.
- `npm run build -w frontend` para medir el tamaño.

## Resultados de los tests

- **Backend:** 245 ficheros, 4797 tests, 0 fallos. Cobertura: 99,47 % sentencias, 92,87 % ramas (mínimo 90 %).
- **Frontend:** 154 ficheros, 5087 tests (antes 5053), 0 fallos. Cobertura: 97,42 % sentencias, 94,69 % ramas (mínimo 80 %).
- **Infraestructura:** 4 ficheros, 66 tests, 0 fallos.
- **Tamaño del build:** CSS 225,22 kB (31,31 kB en gzip; `main`, 31,31 kB; límite 33,75 kB) y JS 893,84 kB (244,34 kB en gzip; `main`, 244,15 kB según el informe de US-UI-LISTS_b).
- **Observaciones:** los tests de las dos páginas pasan de `h2` a `h3`, leen el total en `.cs-list-count` y la línea de resultados solo existe con filtros; la tabla de reglas se nombra por el título del bloque; se borra `constraints.list` (sin uso en el código).
- **TDD:** se vio el rojo de `hasActiveSubjectFilters` (3 fallos) y de los bloques de diseño de las dos páginas (12 en asignaturas; 16 en reglas) antes de implementar.

## Verificación de la base de datos

- **Línea base previa:** todo a 0 salvo `_prisma_migrations` (19) y `municipalities` (542) en todos los esquemas.
- **Validación posterior:** `diff` con la línea base idéntico, sin filas residuales. Sin migraciones.
- **Estado restaurado:** no hizo falta.

## Resultado

- Estado del paso 5: **PASS**
- Incidencias bloqueantes: ninguna. Nota: Docker Desktop no estaba arrancado y otro contenedor ocupaba el puerto 5432; la persona usuaria lo resolvió y se recreó el contenedor de CalendarSchool (volumen conservado).
