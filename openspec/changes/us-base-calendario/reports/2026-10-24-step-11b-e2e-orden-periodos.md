# Informe del paso 11b - Orden de los periodos (hallazgo en las pruebas de producción)

- Fecha: 2026-10-24
- Cambio: us-base-calendario
- Agente: Claude Sonnet 5.5

## Hallazgo

Durante la prueba en el navegador en producción, la persona usuaria vio que «Añadir recreo» añade la fila al final y que, aunque se cambien sus horas para dejarlo entre dos sesiones, al guardar salían «Un recreo va entre dos sesiones» y «Empieza antes de que acabe el periodo anterior». La validación, igual que el backend, lee los periodos por **posición**, y la fila seguía siendo la última.

No lo detectaron las pruebas anteriores porque los recreos de los E2E y de `curl` se creaban con el generador o se editaban en su sitio, nunca se añadían y se movían.

## Corrección (OpenSpec primero, §7)

1. Spec (`school-calendars`): el formulario ordena la tabla por hora al guardar, antes de validar; dos escenarios nuevos («Recreo añadido y colocado por hora» y «Recreo que sigue fuera de lugar»). Diseño: decisión en el punto 8 con las alternativas descartadas. Tareas 7.5, 11.5 y 12.5.
2. Código: `sortPeriods` (`utils/calendarPeriods.ts`, orden estable por inicio y fin, sin tocar nada si alguna hora está vacía o mal escrita) usado en `CalendarForm.handleSubmit`; el foco al primer error usa las filas ordenadas; la ayuda de los periodos dice que se ordenan por hora al guardar (`es.json` y `en.json`). Sin cambios de contrato ni de backend.

## Resultados

| Comprobación | Resultado |
|---|---|
| Tests nuevos antes de implementar | Fallaban (`sortPeriods is not a function`, el recreo no se reordenaba, la ayuda no lo decía) |
| `calendarPeriods`, `CalendarForm` y locales | 79 de 79 |
| Frontend completo con cobertura | 87 ficheros, 2509 tests, 97,3 % de sentencias |
| `npm run lint` y `npm run typecheck --workspaces` | Código de salida 0, leído directamente (no tras una tubería) |
| `calendars.cy.ts` | 8 de 8 (2 escenarios nuevos: recreo añadido y movido por horas, y recreo con solapes sin mover las sesiones) |
| `npm run test:e2e` completo | **214 de 214**, código de salida 0 |

Incidencias del propio arreglo: un tipo mal puesto (`DraftPeriod` en lugar de `PeriodRow`) y el foco al primer error, que usaba las filas antiguas; ambos corregidos antes de cerrar.

## Verificación de la base de datos

`calendarschool_test.public` se vació con un script temporal (ya borrado) y todo está a 0 salvo `municipalities` (542). `calendarschool.public` no se ha tocado.

## Resultado

- Estado del paso 11b: PASA
- Problemas bloqueantes: ninguno
