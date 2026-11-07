# Paso 4: tests y estado de la base de datos (2026-11-07)

Cambio: `us-ui-theme`.

## Línea base (4.1)

Recuentos exactos de filas por tabla, antes de ejecutar nada (solo las tablas no vacías):

| Base | Contenido |
| --- | --- |
| `calendarschool` (desarrollo) | `_prisma_migrations` 19 y `municipalities` 542 |
| `calendarschool_test`, esquemas `public` y `test_1` a `test_4` | `_prisma_migrations` 19 y `municipalities` 542 en cada uno |

El resto de las tablas estaban vacías.

## Tests de los ficheros nuevos (4.2)

`vitest run src/styles src/testSupport/contrast.test.ts src/components/PageHeader.test.tsx`: 3 ficheros, 29 tests, todos verdes (`theme.test.ts` 17, `contrast.test.ts` 6, `PageHeader.test.tsx` 6).

## Suite completa (4.3)

`npm test` desde la raíz (con cobertura), código de salida 0. `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend` también dieron 0 (paso 3.2).

| Workspace | Ficheros | Tests | Cobertura (líneas) | Umbral |
| --- | --- | --- | --- | --- |
| backend (unitarios + integración) | 245 | 4797 | 99,51 % (ramas 92,87 %) | 90 % |
| frontend | 150 | 4897 | 97,40 % (ramas 94,73 %) | 80 % |
| infrastructure | 4 | 66 | — | — |

## Estado de la base tras los tests (4.4)

Una diferencia: una fila en `test_3.rate_limit_attempts` que dejó el último test de ese worker (`resetDatabase()` vacía las tablas antes de cada test, no después). Se borró con `DELETE` y los recuentos quedaron **idénticos** a la línea base.

## Medidas del CSS (1.8)

| | Sin gzip | gzip |
| --- | --- | --- |
| Antes (hoja precompilada, 2026-11-06) | 230,06 kB | 30,68 kB |
| Con el tema (`theme.scss`) | 221,86 kB | 30,46 kB |
| Límite (+10 %) | — | 33,75 kB |

La bajada se debe a `$enable-dark-mode: false` (sin las variantes `data-bs-theme=dark`).

## Notas

- Todo se escribió con el test en rojo antes, salvo el CSS de `.cs-*` y `PageHeader`, que se vieron fallar por ausencia del módulo o de la clase.
- Ningún test falló tres veces seguidas.
- Latente: Sass escribe un color en porcentajes `rgb(…%)` dentro del SVG del icono activo del acordeón de Bootstrap. No usamos ese componente; si algún día se usa, habrá que comprobarlo.
