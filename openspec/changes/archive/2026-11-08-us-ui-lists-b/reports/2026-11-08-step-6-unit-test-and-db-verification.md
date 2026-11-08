# Informe del paso 6 - Tests unitarios y verificación de la base de datos

- Fecha: 2026-11-08
- Cambio: us-ui-lists-b
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `bash counts.sh` antes y después: recuentos por tabla en `calendarschool` y en `public` y `test_*` de `calendarschool_test`.
- Tests de los módulos cambiados (6.2), durante el desarrollo: `ProfessorsPage` (127), `ProfessorsSummaryPage` (83), `StudentsPage` (184), `StudentFilters` (4), `theme` y `locales`, todos en verde.
- `npm exec -w frontend -- vitest run` completo (incluye `App.test.tsx`): 154 ficheros, 5053 tests, código 0.
- `npm test` completo (tres workspaces, con cobertura): código de salida 0.
- `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend` (paso 5.2): los tres con código 0.
- `npm run build -w frontend` para medir el tamaño.

## Resultados de los tests

- **Backend:** 245 ficheros, 4797 tests, 0 fallos. Cobertura: 99,47 % sentencias, 92,87 % ramas, 99,55 % funciones, 99,51 % líneas (mínimo 90 %).
- **Frontend:** 154 ficheros, 5053 tests, 0 fallos. Cobertura: 97,41 % sentencias, 94,68 % ramas, 99,22 % funciones, 97,34 % líneas (mínimo 80 %).
- **Infraestructura:** 4 ficheros, 66 tests, 0 fallos.
- **Tamaño del build:** CSS 225,22 kB (31,31 kB en gzip; `main`, 31,31 kB; límite 33,75 kB) y JS 892,07 kB (244,15 kB en gzip; `main`, 243,62 kB según el informe del cambio anterior, no se ha vuelto a medir).
- **Observaciones:**
  - Los tests de las tres páginas pasan de `h2` a `h3` en el nombre de cada elemento y leen el total sin filtros en la cabecera del bloque (`.cs-list-count`); la línea de resultados (`data-testid` de siempre) solo existe con búsqueda o filtros.
  - Las tablas se nombran por el título del bloque.
  - `StudentFilters.test.tsx` es nuevo: no existía.
- **Honestidad del TDD:** se vio el rojo en los tests de las tres páginas, de `StudentFilters` y de `.cs-search-wide`. Esta última regla se escribió antes que su test; se comprobó después, quitando la regla, que el test fallaba.

## Verificación de la base de datos

- **Línea base previa:** capturada antes de `npm test`.
- **Validación posterior:** `diff` con la línea base idéntico, sin filas residuales. Este cambio no añade migraciones.
- **Estado restaurado:** no hizo falta.

## Resultado

- Estado del paso 6: **PASS**
- Incidencias bloqueantes: ninguna.
