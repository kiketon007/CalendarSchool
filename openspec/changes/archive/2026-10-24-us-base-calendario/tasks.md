## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-base-calendario` desde `main` actualizada, llevando los artefactos de este cambio y la ficha de US-BASE de `docs/User_Stories_MVP.md` (sin el fichero de bloqueo `docs/prompts/~$rarios.docx`)
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha y `.claude/settings.json`, que vuelve a Sonnet con esfuerzo medio al empezar la implementación

## 1. Contrato

- [x] 1.1 Documentar en `docs/api-spec.yml` `createCalendar` y `listCalendars` (`/api/calendars`, Bearer, `POST` solo `ADMIN` con `201`, `400`, `401`, `403`, `409`, `500` y `503`; `GET` con `200`, `401`, `500` y `503`; `Cache-Control: no-store`), los esquemas `CreateCalendarRequest`, `CalendarPeriod`, `Calendar` y sus respuestas, `CALENDAR_ALREADY_EXISTS` en `ErrorCode` y `INVALID_RANGE`, `TOO_LONG` y `OVERLAP` en `FieldErrorCode`
- [x] 1.2 Regenerar los tipos (`npm run api:types -w frontend`) y fijar en `api/schema.test.ts` las dos operaciones, los tres esquemas y los códigos nuevos (test que falla antes de regenerar)

## 2. Modelo de datos

- [x] 2.1 Añadir a `backend/prisma/schema.prisma` `Calendar`, `CalendarPeriod` (con el enum `CalendarPeriodKind`) y `Course.calendarId` (nulo, `onDelete: SetNull`, con índice), y generar la migración `add_calendars` añadiéndole a mano el `CHECK` de los minutos; aplicarla a la base de desarrollo
- [x] 2.2 Tests de integración de la base de datos: el `CHECK` rechaza un periodo con `end_minute <= start_minute` y fuera de 0–1439; borrar un calendario borra sus periodos y deja `calendar_id` a `NULL` en sus cursos; el índice único de nombre por colegio

## 3. Backend: dominio y aplicación

- [x] 3.1 Dominio `domain/calendar/`: tipos `Calendar` y `CalendarPeriod`, `CalendarAlreadyExists`, el puerto `CalendarRepository` (`create` y `listBySchool`) y la conversión `HH:MM` ↔ minutos con sus tests
- [x] 3.2 Tests que fallan y luego implementación de las reglas puras de la lista de periodos (`domain/calendar/calendarPeriods.ts`): rango, 90 minutos, solape con el anterior, de 1 a 8 sesiones, como mucho 2 recreos y recreo entre dos sesiones, con los códigos y el orden de los errores
- [x] 3.3 Crear `test-fixtures/calendar-fields.json` (casos válidos e inválidos del nombre, de cada periodo y de la lista) y, con tests que fallan, `application/calendars/createCalendarRequest.ts` (`parseCreateCalendarRequest`: nombre con las reglas del curso, periodos y `courseIds` sin repetidos, UUID y como mucho 100)
- [x] 3.4 Tests que fallan (`createCalendar.test.ts`): `400` sin llamar al repositorio y sin evento; `CourseNotFound` con posiciones → `400` con `courseIds[<i>]` `NOT_FOUND` y `CALENDAR_CREATION_REJECTED` (`course_not_found`); `CalendarAlreadyExists` → `409` y `reason: duplicate`; `CALENDAR_CREATED` con los recuentos y sin nombres; implementar `CreateCalendar`
- [x] 3.5 Tests que fallan y luego implementación de `ListCalendars` (calendarios y cursos ordenados con `compareText`)

## 4. Backend: infraestructura

- [x] 4.1 Tests de integración que fallan (`prismaCalendarRepository.int.test.ts`): crear con periodos en orden y cursos; mover un curso que seguía otro calendario; curso de otro colegio o inexistente → `CourseNotFound` sin escribir nada; nombre repetido → `CalendarAlreadyExists`; atomicidad con un disparador temporal; `listBySchool` solo del colegio, con periodos y cursos
- [x] 4.2 Implementar `PrismaCalendarRepository` según el diseño (decisión 5: cursos `FOR UPDATE` en orden de `id`, calendario, periodos y asignaciones en una transacción, con `translateDatabaseErrors` y `violatedUniqueIndex`)
- [x] 4.3 Tests de integración de concurrencia: dos altas con el mismo nombre (un éxito y `CalendarAlreadyExists`); dos altas con cursos en común (sin error, cada curso en un calendario); alta contra el borrado de su curso varias rondas (éxito o `CourseNotFound`, nunca otro error ni interbloqueo)

## 5. Backend: presentación

- [x] 5.1 Tests que fallan (`calendarsRoute.test.ts`): `POST` con `201` y `no-store`, `403 FORBIDDEN` para un `MEMBER` sin llamar al caso de uso, `400`, `409`, `401`, `503`; `GET` con `200` para `ADMIN` y `MEMBER`, `401` y `503`; y `appError.test.ts` con `CALENDAR_ALREADY_EXISTS`
- [x] 5.2 Implementar `calendarsRouter` (`requireRole('ADMIN')` solo en `POST`), `CALENDAR_ALREADY_EXISTS` en `ERROR_CODES` y en `errorHandler`, y conectar los casos de uso en `app.ts`, `composeApp.ts` y `test/support/appDoubles.ts`
- [x] 5.3 Tests de integración por HTTP (`calendars.int.test.ts`): crear Primaria e Infantil, listar en orden, mover un curso, `MEMBER` (`200` al listar y `403` al crear sin crear nada), aislamiento entre colegios, `401`, eventos sin nombres, y que `GET /api/courses` y `GET /api/courses/{id}` no cambian para un curso con calendario

## 6. Frontend: servicio, validación y utilidades

- [x] 6.1 Tests que fallan (`calendarsService.test.ts`): `list` (`loaded`, `unauthenticated`, `unavailable` y forma incorrecta) y `create` (`created`, `validationError` con los campos, `alreadyExists`, `forbidden`, `unauthenticated` y `unavailable`); implementar `services/calendarsService.ts`
- [x] 6.2 Tests que fallan y luego implementación de `utils/calendarPeriods.ts` (`generatePeriods`, números de sesión, conversión de horas y resumen) y de `validation/calendarValidation.ts` (recorriendo `test-fixtures/calendar-fields.json`) con la traducción de los errores del servidor a las filas
- [x] 6.3 Añadir a `es.json` y `en.json` los textos `calendars.*` (listado, resumen, formulario, generar, filas, cursos, errores de campo y avisos) y `header.calendars`

## 7. Frontend: formulario, páginas y navegación

- [x] 7.1 Tests que fallan (`CalendarForm.test.tsx`): arranque con 6 sesiones generadas; «Generar» con y sin recreo; editar una hora; añadir y quitar sesiones y recreos con renumeración; etiquetas por fila; errores por fila con el foco en el primero; cursos con el aviso de los que se mueven; doble envío; `axe` con y sin errores; implementar `components/CalendarForm.tsx`
- [x] 7.2 Tests que fallan (`CalendarsPage.test.tsx`, a 1280 y 360 px): carga única con `StrictMode`, tarjetas con periodos, resumen y cursos, vacío según el rol, «Crear calendario» solo para `ADMIN`, aviso de llegada como texto plano, error con «Reintentar» y `axe`; implementar `pages/CalendarsPage.tsx`
- [x] 7.3 Tests que fallan (`CreateCalendarPage.test.tsx`): carga de cursos y calendarios, envío y navegación con `replace` y el aviso, `409` en el nombre, `400` con `NOT_FOUND` en un curso que recarga los cursos conservando lo escrito, `403` y fallo general; implementar `pages/CreateCalendarPage.tsx`
- [x] 7.4 Añadir las rutas `/calendarios` y `/calendarios/nuevo` (esta bajo `RequireRole role="ADMIN"`) en `App.tsx` y «Calendario» en `AppHeader`, con sus tests (`App.test.tsx`, `AppHeader.test.tsx`: los dos roles, `aria-current` en las subrutas y un `MEMBER` en `/calendarios/nuevo` que va a `/onboarding`)
- [x] 7.5 Tests que fallan y ajuste de `CalendarForm` y `utils/calendarPeriods.ts`: `sortPeriods` (orden por inicio y fin, estable, sin tocar nada si alguna hora está vacía o mal escrita); en el formulario, un recreo añadido y movido por hora queda entre dos sesiones al guardar (se renumeran las sesiones y se envía en ese orden), un recreo sin mover sigue fuera de lugar con su error, y el orden mostrado se conserva tras un error; la ayuda de los periodos lo dice (`es.json` y `en.json`)

## 8. Revisar los tests existentes (MANDATORY)

- [x] 8.1 Revisar los tests de `AppHeader`, `App`, `appError`, `errorHandler`, `api/schema.test.ts`, los repositorios y rutas de cursos (las respuestas no cambian) y los E2E que miran la cabecera, y actualizarlos conservando lo que comprobaban

## 9. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 9.1 Capturar la línea base de la base de datos (recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`, ahora también `calendars` y `calendar_periods`)
- [x] 9.2 Ejecutar los tests tocados y después `npm test` completo con cobertura (mínimos: 90 % backend, 80 % frontend), comprobando el código de salida y que no hay errores «Unhandled»
- [x] 9.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`
- [x] 9.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 9.5 Documentar el resultado en `reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md` y marcar el paso solo con los tests en verde y el informe creado

## 10. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Arrancar el backend local (plantilla de desarrollo, captcha falso y límites altos) y comprobar con `curl`: crear Primaria e Infantil (`201`, `no-store`), listar en orden, mover un curso, `400` con los códigos de periodos y de cursos, `409` de nombre repetido, `403` de un `MEMBER` real (creado con una invitación) al crear y `200` al listar, `401` sin token, aislamiento entre colegios, que `GET /api/courses` no cambia, y que el log no contiene nombres
- [x] 10.2 Borrar los datos creados, comprobar la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 10.3 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-10-curl-manual-testing.md`

## 11. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Añadir `cypress/e2e/calendars.cy.ts`: crear «Primaria» generando las sesiones y verla con su resumen; crear «Infantil» editando a mano el recreo y la cuarta sesión; mover un curso entre calendarios; nombre repetido; un `MEMBER` (tarea `createUser`) que ve los calendarios sin «Crear calendario» y al que `/calendarios/nuevo` lleva a `/onboarding`; el formulario a 360 px sin desplazamiento horizontal (registrando cada `cy.intercept` una sola vez)
- [x] 11.2 Ejecutar en modo headless `calendars.cy.ts` y después `npm run test:e2e` completo
- [x] 11.3 Verificar y restaurar la base de datos de test
- [x] 11.4 Documentar el resultado en `reports/YYYY-MM-DD-step-11-e2e-cypress.md`

- [x] 11.5 Ampliar `calendars.cy.ts` con el escenario de «Añadir recreo», cambiar sus horas y las de las sesiones siguientes y guardar (la tabla se reordena y el listado muestra el recreo entre las sesiones 3 y 4); ejecutar la spec y `npm run test:e2e` completo, restaurar la base de test y documentarlo en `reports/YYYY-MM-DD-step-11b-e2e-orden-periodos.md`

## 12. Documentación (MANDATORY)

- [x] 12.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` y `docs/frontend-standards.md` (lectura para los dos roles y escritura solo para `ADMIN`; horas como minutos desde medianoche; lista de hijos ordenada por posición y número derivado; bloqueo de varias filas en orden de `id`)
- [x] 12.2 Actualizar `docs/Modelo_de_Datos/MODELO_DATOS.md` (sustituir `calendars` y `sessions` por las tablas reales y `courses.calendar_id`), el glosario de `docs/PRD_CalendarSchool.md` (calendario base sin fechas), `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `README.md` (árbol, endpoints, modelo de datos y número de tablas) y la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL)
- [x] 12.3 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 12.4 Verificar con `openspec validate us-base-calendario --strict` que el cambio es válido
- [x] 12.5 Actualizar `frontend/CLAUDE.md`, `docs/frontend-standards.md` y el `README.md` con el orden de las filas por hora al guardar

## 13. Despliegue y comprobación en producción

- [x] 13.1 Abrir la PR con los grupos 0–12 y, tras integrarla la persona usuaria, verificar el despliegue automático, que la migración `add_calendars` se aplica y el smoke test
- [x] 13.2 Comprobar en producción con `curl` que `/calendarios` sirve la SPA con la CSP, que el bundle contiene los textos nuevos y que `GET` y `POST /api/calendars` sin token responden `401` (sin crear datos), y que la persona usuaria, con un navegador real, crea Primaria e Infantil, asigna cursos y ve el listado como `MEMBER`, en escritorio y en el móvil, sin violaciones de CSP
- [x] 13.3 Documentar el resultado en `reports/YYYY-MM-DD-step-13-production.md`
