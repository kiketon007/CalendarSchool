# Paso 12: E2E con Cypress (2026-11-05)

Cambio: `us-algo-view-b`.

## Spec nueva: `cypress/e2e/scheduleExport.cy.ts` (5 tests)

Contra el build servido con `vite preview` y el backend de E2E (lanzador en memoria), con la CSP aplicada (las directivas que Cypress conserva, `experimentalCspAllowList`).

| Test | Qué comprueba |
| --- | --- |
| Descarga una clase en Markdown y todos los profesores en HTML | genera, abre el borrador, descarga `horario-1o-primaria-a.md` (título, cabecera con los cinco días, fila de la sesión 1, tres celdas «Lengua — García, Ana», «3 sesiones a la semana») y `horarios-profesores-<fecha>.html` (`<!doctype html>`, `lang="es"`, título general, la profesora, el color de la asignatura y sin `<script`, `<link`, `<img`, `@import` ni `url(`); lee los ficheros con `cy.readFile` en la carpeta de descargas |
| Arranca con lo que se ve | desde la vista por profesor, el diálogo abre en «Por profesor» y con «García, Ana» |
| Sin peticiones ni cambios en la dirección | tras exportar, `GET /api/schedule/draft` sigue con una sola petición y la dirección no cambia |
| Miembro | un `MEMBER` exporta el mismo horario |
| 360 px | el diálogo cabe, la página no se desplaza en horizontal, «Cancelar» lo cierra y el foco vuelve a «Exportar» |

Cambios de apoyo: una tarea `deleteDownloads` en `cypress.config.ts` (Chrome no sobrescribe un fichero que ya existe y le añade « (1)», así que cada test parte de una carpeta vacía) y `frontend/cypress/downloads/` en el `.gitignore`.

Primera ejecución: 4 de 5; el fallo era mío (el `input` de un radio de react-bootstrap no está dentro de su `label`). Corregido: 5 de 5.

## Suite completa (`npm run test:e2e`)

- **28 specs, 349 tests, 0 fallos** (antes 27 specs y 344 tests). Tiempo de Cypress: 8 min 23 s.
- Un primer intento se cortó en el spec 25 de 28: `scripts/e2e.mjs` cierra Cypress a los 600 s (`DEFAULT_CYPRESS_TIMEOUT_MS`) y esta máquina, más lenta que el CI, lo superó con un spec más. No fue un fallo de tests. Se repitió con `E2E_CYPRESS_TIMEOUT_MS=1500000` y terminó sin errores.
- Riesgo: el margen del límite por defecto es de unos 97 s en esta máquina. En el CI (el job de E2E entero tardó entre 7 y 9 minutos) hay más margen, pero cada spec nuevo lo reduce.

## Limpieza

- Base de test (`public` de `calendarschool_test`) vaciada de nuevo: los recuentos son idénticos a la línea base.
- Los puertos 3000, 3001 y 4173 no escuchan.
