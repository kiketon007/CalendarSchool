# Paso 5: tests y estado de la base de datos (2026-11-07)

Cambio: `us-ui-shell`.

## Línea base (5.1)

Recuentos exactos de filas por tabla, antes de ejecutar nada (solo las tablas no vacías):

| Base | Contenido |
| --- | --- |
| `calendarschool` (desarrollo) | `_prisma_migrations` 19 y `municipalities` 542 |
| `calendarschool_test`, esquemas `test_1` a `test_4` | `_prisma_migrations` 19 y `municipalities` 542 en cada uno |
| `calendarschool_test`, esquema `public` | además de esas dos, los datos que dejó el E2E del cambio anterior (por ejemplo `schools` 315, `users` 356, `courses` 263). Se vacían al empezar la siguiente ejecución del E2E, no al terminar |

## Tests de los ficheros nuevos y cambiados (5.2)

`vitest run` sobre `initials`, `theme`, `UserMenu`, `AppShell`, `routes`, `i18n` y `App`: 8 ficheros, 217 tests, todos verdes.

- `initials.test.ts` 6, `UserMenu.test.tsx` 10, `AppShell.test.tsx` 51 (navegación a 1280 y 360 px, panel, enlace de salto, cierre de sesión y `axe` con el panel y el menú abiertos y cerrados).
- `theme.test.ts` pasa de 17 a 26 con los estilos del marco.
- `App.test.tsx` (112) se adaptó: la navegación se busca en la barra lateral y el cierre de sesión abre antes el menú de usuario.

## Suite completa (5.3)

`npm test` desde la raíz (con cobertura), código de salida 0. `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend` también dieron 0 (paso 4.2).

| Workspace | Ficheros | Tests | Cobertura (líneas) | Umbral |
| --- | --- | --- | --- | --- |
| backend (unitarios + integración) | 245 | 4797 | 99,51 % (ramas 92,87 %) | 90 % |
| frontend | 152 | 4942 | 97,33 % (ramas 94,65 %) | 80 % |
| infrastructure | 4 | 66 | — | — |

## Estado de la base de datos tras los tests (5.4)

Los recuentos son **idénticos** a la línea base: no hizo falta restaurar nada.

## Tamaño del build (frente a producción, que es `main`)

| Fichero | Producción | Con el marco | Diferencia |
| --- | --- | --- | --- |
| CSS | 221.866 B (30,40 kB en gzip) | 223,93 kB (30,98 kB en gzip) | +0,6 kB en gzip; el límite de la spec del tema es 33,75 kB |
| JS | 839.448 B (224,13 kB en gzip) | 886,28 kB (242,12 kB en gzip) | +46,8 kB (+18 kB en gzip): `Offcanvas`, `Dropdown`, `AppShell` y los 11 iconos |

## Notas

- Todo se escribió con el test en rojo antes. El `matchMedia` simulado de `testSupport` no tenía la API antigua (`addListener`) que usa el `Offcanvas` responsive; se añadió y los 51 tests de `AppShell` pasaron a la vez.
- El menú de usuario no lleva roles `menu`/`menuitem`: con `role="menu"` todos sus hijos deberían ser elementos de menú y `axe` rechaza el texto informativo (nombre, rol y colegio). Es el patrón de botón desplegable.
- Ningún test falló tres veces seguidas.
