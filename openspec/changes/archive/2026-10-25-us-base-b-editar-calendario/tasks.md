## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-base-b-editar-calendario` desde `main` actualizada, llevando los artefactos de este cambio y la ficha de US-BASE_b de `docs/User_Stories_MVP.md` (sin el fichero de bloqueo `docs/prompts/~$rarios.docx`)
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha y `.claude/settings.json`, que vuelve a Sonnet con esfuerzo medio al empezar la implementación

## 1. Contrato

- [x] 1.1 Documentar en `docs/api-spec.yml` `getCalendar` (`GET /api/calendars/{id}`, Bearer, `ADMIN` y `MEMBER`: `200`, `401`, `404`, `500`, `503`) y `updateCalendar` (`PUT /api/calendars/{id}`, Bearer, solo `ADMIN`: `200`, `400`, `401`, `403`, `404`, `409`, `500`, `503`), con `Cache-Control: no-store`, el esquema `UpdateCalendarRequest` y la respuesta reutilizable `CalendarNotFound` (`NOT_FOUND`)
- [x] 1.2 Fijar en `api/schema.test.ts` las dos operaciones y `UpdateCalendarRequest` (test que falla) y regenerar los tipos (`npm run api:types -w frontend`)

## 2. Backend: dominio y aplicación

- [x] 2.1 Dominio: `CalendarNotFound` en `domain/calendar/calendarErrors.ts` y el puerto `CalendarRepository` con `findById` y `update` (devuelve `{ before, after }` o `null`)
- [x] 2.2 Tests que fallan y luego implementación de `parseUpdateCalendarRequest` (delega en `parseCreateCalendarRequest`; recorre `test-fixtures/calendar-fields.json` con el mismo resultado que el alta)
- [x] 2.3 Tests que fallan y luego implementación de `GetCalendar` (`null` → `CalendarNotFound`; cursos ordenados con `compareText`)
- [x] 2.4 Tests que fallan (`updateCalendar.test.ts`): `400` sin llamar al repositorio ni registrar nada; `null` → `CalendarNotFound` con `CALENDAR_UPDATE_REJECTED` (`not_found`); `CalendarCoursesNotFound` → `400` con `courseIds[<i>]` `NOT_FOUND` (`course_not_found`); `CalendarAlreadyExists` → `409` (`duplicate`); `CALENDAR_UPDATED` con `changed_fields` (cada combinación y vacío si nada cambia), `session_count`, `break_count`, `courses_added` y `courses_removed`, sin nombres; implementar `UpdateCalendar`

## 3. Backend: infraestructura

- [x] 3.1 Tests de integración que fallan (`prismaCalendarRepository.int.test.ts`): `findById` (del colegio, de otro colegio e inexistente); `update` que renombra, cambia solo mayúsculas del propio nombre y reemplaza los periodos con `position` desde 1; cursos añadidos, movidos desde otro calendario y liberados; `courseIds` vacío; curso inexistente o de otro colegio → `CalendarCoursesNotFound` sin cambiar nada; calendario inexistente o de otro colegio → `null` sin cambiar nada; nombre de otro calendario → `CalendarAlreadyExists`; atomicidad con un disparador de prueba que hace fallar el `UPDATE` de los cursos
- [x] 3.2 Implementar `findById` y `update` en `PrismaCalendarRepository` según el diseño (decisión 3: calendario `FOR UPDATE`, unión de cursos `FOR UPDATE` en orden de `id`, nombre, periodos reemplazados, cursos y relectura, con `translateDatabaseErrors` y `violatedUniqueIndex`)
- [x] 3.3 Tests de integración de concurrencia, varias rondas: dos ediciones del mismo calendario (las dos con éxito y el estado final igual al de una de ellas, nunca una mezcla); edición contra el borrado de uno de sus cursos (éxito o `CalendarCoursesNotFound`, nunca otro error); edición contra un alta con cursos en común (sin error ni interbloqueo)

## 4. Backend: presentación

- [x] 4.1 Tests que fallan (`calendarsRoute.test.ts`): `GET /:id` con `200` y `no-store` para `ADMIN` y `MEMBER`, `404` con un `id` que no es UUID sin llamar al caso de uso, `401` y `503`; `PUT /:id` con `200` y `no-store`, `403 FORBIDDEN` para un `MEMBER` sin validar el `id` ni el cuerpo ni llamar al caso de uso, `404` con un `id` que no es UUID, `400`, `404`, `409`, `401` y `503`; y en `errorHandler.test.ts`, `CalendarNotFound` → `404 NOT_FOUND`
- [x] 4.2 Implementar en `calendarsRouter` `parseCalendarId` y las rutas `GET /:id` y `PUT /:id` (`requireRole('ADMIN')` solo en el `PUT`), traducir `CalendarNotFound` en `errorHandler` y conectar los casos de uso en `app.ts`, `composeApp.ts` y `test/support/appDoubles.ts`
- [x] 4.3 Tests de integración por HTTP (`calendars.int.test.ts`): leer y editar (renombrar, jornada nueva, liberar, añadir y mover cursos), `PUT` idéntico con `200`, `MEMBER` (`200` al leer y `403` al editar sin cambiar nada, también con un `id` inexistente), `404` de otro colegio al leer y al editar, `409`, `400`, `401`, y eventos `CALENDAR_UPDATED` y `CALENDAR_UPDATE_REJECTED` sin nombres

## 5. Frontend: servicio y validación

- [x] 5.1 Tests que fallan (`calendarsService.test.ts`): `get` (`loaded`, `notFound`, `unauthenticated`, `unavailable` y forma incorrecta) y `update` (`updated`, `validationError`, `alreadyExists`, `notFound`, `forbidden`, `unauthenticated` y `unavailable`), con el `id` codificado; implementar
- [x] 5.2 Tests que fallan y luego implementación de `hasCalendarChanges` en `validation/calendarValidation.ts` (nombre limpio, periodos tras `sortPeriods`, conjunto de cursos; un espacio de más o deshacer un cambio no cuentan)
- [x] 5.3 Añadir a `es.json` y `en.json` los textos de la edición: título, «Editar», aviso «Calendario «X» actualizado», «Se quedará sin calendario», «Este calendario no existe o ya no está disponible» y el enlace a «Calendarios»

## 6. Frontend: formulario, páginas y rutas

- [x] 6.1 Tests que fallan (`CalendarForm.test.tsx`, modo edición): precarga de `initialValues` (nombre, periodos y cursos marcados) con «Guardar» deshabilitado; «Guardar» solo con cambios reales y otra vez deshabilitado al deshacerlos; «Se quedará sin calendario» bajo un curso propio desmarcado y «Ahora sigue «X»: se moverá» bajo uno de otro calendario, ligados por `aria-describedby`; el envío lleva el estado final; `axe`; el alta sin `initialValues` no cambia. Implementar las props `initialValues` y `requireChanges`; mientras los cursos cargan o fallan se envían los iniciales sin tocarlos
- [x] 6.2 Tests que fallan (`EditCalendarPage.test.tsx`): carga única del calendario, los cursos y los calendarios con `StrictMode`; carga, «no existe o ya no está disponible» con el enlace (`404` al cargar y al guardar, `id` que no es UUID), error con «Reintentar»; `followedBy` sin este calendario; `200` que navega a `/calendarios` con `replace` y `{ calendarUpdated }`; `409` en el nombre; `400` de `courseIds` que recarga los cursos conservando lo escrito; `403` y fallo general; implementar `pages/EditCalendarPage.tsx`
- [x] 6.3 Tests que fallan (`CalendarsPage.test.tsx`, a 1280 y 360 px): enlace «Editar {nombre}» hacia `/calendarios/<id>/editar` solo para `ADMIN`; aviso `calendarUpdated` como texto plano y la guarda de tipo; implementar
- [x] 6.4 Añadir la ruta `/calendarios/:id/editar` bajo `RequireRole role="ADMIN"` en `App.tsx`, con sus tests (`App.test.tsx`: un `ADMIN` la abre, un `MEMBER` va a `/onboarding`, y `aria-current` de «Calendario» en la subruta)

## 7. Revisar los tests existentes (MANDATORY)

- [x] 7.1 Revisar los tests de `CalendarForm`, `CreateCalendarPage`, `CalendarsPage`, `App`, `errorHandler`, `api/schema.test.ts`, el repositorio y la ruta de calendarios y `calendars.cy.ts`, y actualizarlos conservando lo que comprobaban

## 8. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 8.1 Capturar la línea base de la base de datos (recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`, incluidos `calendars` y `calendar_periods`)
- [x] 8.2 Ejecutar los tests tocados y después `npm test` completo con cobertura (mínimos: 90 % backend, 80 % frontend), guardando el log y leyendo el código de salida del propio comando (nunca tras una tubería) y comprobando que no hay errores «Unhandled»
- [x] 8.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, cada uno con su código de salida
- [x] 8.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 8.5 Documentar el resultado en `reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md` y marcar el paso solo con los tests en verde y el informe creado

## 9. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Arrancar el backend local (plantilla de desarrollo, captcha falso y límites altos) y comprobar con `curl`: leer un calendario (`200`, `no-store`) y uno de otro colegio, inexistente o con `id` mal escrito (`404`); editar (renombrar, jornada nueva, liberar, añadir y mover cursos) con `200`; `PUT` idéntico; `400` de periodos y de cursos; `409` de nombre de otro calendario; `403` de un `MEMBER` real (creado con una invitación) al editar, también con un `id` inexistente, y `200` al leer; `401` sin token; dos ediciones simultáneas del mismo calendario (estado de una de ellas, entero) y edición contra borrado de un curso, varias rondas; y que el log no contiene nombres
- [x] 9.2 Borrar los datos creados, comprobar la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 9.3 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-9-curl-manual-testing.md`

## 10. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Ampliar `cypress/e2e/calendars.cy.ts` con la edición: «Guardar» deshabilitado al abrir; renombrar y ver el aviso; mover el recreo reajustando las sesiones; quitar una sesión; liberar un curso y mover otro desde otro calendario (con los dos avisos); nombre de otro calendario; calendario borrado (por la API) antes de abrir la edición; un `MEMBER` sin «Editar» al que `/calendarios/<id>/editar` lleva a `/onboarding`; la edición a 360 px sin desplazamiento horizontal (cada `cy.intercept` registrado una sola vez y sin encadenar tras `clear()`)
- [x] 10.2 Ejecutar en modo headless `calendars.cy.ts` y después `npm run test:e2e` completo
- [x] 10.3 Verificar y restaurar la base de datos de test
- [x] 10.4 Documentar el resultado en `reports/YYYY-MM-DD-step-10-e2e-cypress.md`

## 11. Documentación (MANDATORY)

- [x] 11.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` (reemplazar una lista de hijos ordenada dentro de la transacción; bloquear el padre y después la unión de hijos actuales y pedidos en orden de `id`) y `docs/frontend-standards.md` (un formulario compartido con valores iniciales y avisos de lo que se moverá o se quedará sin asignar)
- [x] 11.2 Actualizar `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `README.md` (endpoints, árbol y módulo 2), `docs/Modelo_de_Datos/MODELO_DATOS.md` (la edición reemplaza los periodos) y la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL: edición en la tabla de lo construido, router, casos de uso y páginas)
- [x] 11.3 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 11.4 Verificar con `openspec validate us-base-b-editar-calendario --strict` que el cambio es válido

## 12. Despliegue y comprobación en producción

- [x] 12.1 Abrir la PR con los grupos 0–11 y, tras integrarla la persona usuaria, verificar el despliegue automático, que no hay migraciones pendientes y el smoke test
- [x] 12.2 Comprobar en producción con `curl` que `/calendarios/<id>/editar` sirve la SPA con la CSP, que el bundle contiene los textos nuevos y que `GET` y `PUT /api/calendars/{id}` sin token responden `401` (sin crear datos), y que la persona usuaria, con un navegador real, edita un calendario (nombre, recreo, sesiones y cursos) y lo ve como `MEMBER` sin «Editar», en escritorio y en el móvil, sin violaciones de CSP
- [x] 12.3 Documentar el resultado en `reports/YYYY-MM-DD-step-12-production.md`
