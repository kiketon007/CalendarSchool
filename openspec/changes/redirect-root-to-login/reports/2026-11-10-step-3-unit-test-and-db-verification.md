# Paso 3 - Tests unitarios y verificación de la base de datos

- Fecha: 2026-11-10
- Cambio: redirect-root-to-login
- Agente: Claude

## Comandos ejecutados

- Línea base y comprobación posterior de recuentos de filas por tabla en `calendarschool` y en todos los esquemas de `calendarschool_test` (`counts.sh`).
- Tests de los módulos cambiados al implementar: `vitest run src/App.test.tsx src/i18n` (rojo antes de implementar, verde después).
- `npm test` (los tres workspaces, con cobertura), `npm run lint` (ESLint de los tres workspaces y `prettier --check`) y `npm run typecheck --workspaces`.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| Tests nuevos de `App` (raíz) antes de implementar | 4 de 4 fallan, como debían |
| Backend (unitarios e integración) | 4916 tests, todos correctos |
| Frontend | 157 ficheros, **5223 tests**, todos correctos (un fichero menos: `HomePage.test.tsx`) |
| Infraestructura | 89 tests, todos correctos |
| `npm run lint` | código de salida 0 |
| `npm run typecheck --workspaces` | código de salida 0 (incluidos los tipos de las specs de Cypress) |
| Cobertura del frontend (umbral 80 %) | sentencias 97,43 %, ramas 94,72 %, funciones 99,22 %, líneas 97,35 % |

El cambio de la cuenta de tests del frontend es: −2 de `HomePage.test.tsx`, −1 el test «renders the home page at the root path without redirecting» que se sustituyó, +4 de la redirección de la raíz.

## Verificación de la base de datos

- Línea base antes de los tests:
  - `calendarschool` (desarrollo): `_prisma_migrations` 21 y `municipalities` 542, todo lo demás vacío.
  - `calendarschool_test`: el esquema `public` conserva los datos del último E2E (se limpian al empezar el siguiente) y los `test_N` tenían las filas del último test de cada worker.
- Tras los tests:
  - `calendarschool`: idéntica.
  - `public` de `calendarschool_test`: **ninguna diferencia**.
  - Los esquemas `test_N`: una tabla más con filas que antes (9 frente a 8), que es lo que deja el último test de cada worker; `resetDatabase()` los vacía antes de cada test, así que no hay acumulación.
- Estado restaurado: no hizo falta restaurar nada. El cambio es solo de frontend y no toca la base de datos.

## Resultado

- Paso 3: **PASA**. Incidencias bloqueantes: ninguna.
