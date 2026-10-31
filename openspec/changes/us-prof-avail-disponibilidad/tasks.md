## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-prof-avail-disponibilidad` desde `main` actualizada (`0492c13`, con US20 archivada), con los artefactos de este cambio
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene:
  - los artefactos de este cambio;
  - la ficha enriquecida;
  - `.claude/settings.json`, que debe volver a Sonnet con esfuerzo medio para la implementación.
- [x] 0.3 Comprobar que la ficha de US-PROF-AVAIL en `docs/User_Stories_MVP.md` tiene las decisiones de la exploración y no tiene caracteres corruptos

## 1. Contrato

- [x] 1.1 Documentar en `docs/api-spec.yml`:
  - `getProfessorAvailability` y `updateProfessorAvailability`, con respuestas y ejemplos;
  - `ProfessorUnavailability`, `ProfessorAvailabilityResponse` y `UpdateProfessorAvailabilityRequest`;
  - `unavailableCount` en `Professor`.
- [x] 1.2 Fijar en `api/schema.test.ts` las operaciones y los campos nuevos (test que falla) y regenerar los tipos (`npm run api:types -w frontend`)

## 2. Base de datos

- [x] 2.1 Test de esquema que falla (`professorUnavailabilitiesSchema.int.test.ts`), que intenta romper cada `CHECK` por su nombre (día, inicio, fin y rango) y comprueba la cascada al borrar el profesor
- [x] 2.2 Añadir el modelo `ProfessorUnavailability` a `schema.prisma` y crear la migración `add_professor_unavailabilities` con `--create-only`, con los cuatro `CHECK` escritos a mano. Aplicarla, revisar el SQL y ver el test en verde.

## 3. Backend: dominio

- [x] 3.1 Crear `test-fixtures/professor-unavailability-normalization.json` con los casos del requisito «Normalización de los tramos»: vacío, contiguos, solapados y desordenados, contenidos uno en otro, días distintos y tramos que no se tocan
- [x] 3.2 Tests que fallan (`availability.test.ts`, recorriendo la tabla) e implementación de `domain/professor/availability.ts`:
  - los tipos `UnavailableInterval` y `ProfessorAvailability`;
  - `normalizeUnavailability`;
  - el puerto `ProfessorAvailabilityRepository`, con su JSDoc.

## 4. Backend: aplicación

- [x] 4.1 Tests que fallan e implementación de `parseUpdateProfessorAvailabilityRequest`:
  - cada error de campo en el orden del cuerpo;
  - 200 tramos en total y 40 por día;
  - «HH:MM» con `parseClock`;
  - `schoolId` ignorado.
- [x] 4.2 Tests que fallan e implementación de `GetProfessorAvailability`: `ProfessorNotFound` y la respuesta en «HH:MM»
- [x] 4.3 Tests que fallan e implementación de `UpdateProfessorAvailability`:
  - normaliza;
  - `unchanged` sin evento;
  - `replaced` con `PROFESSOR_AVAILABILITY_UPDATED` y `interval_count`;
  - `not_found` con `_REJECTED` y `ProfessorNotFound`;
  - ningún nombre ni hora en el log.

## 5. Backend: infraestructura

- [x] 5.1 Tests de integración que fallan (`prismaProfessorAvailabilityRepository.int.test.ts`):
  - `find` ordenado y `null` para otro colegio;
  - `replace` crea, reemplaza, vacía y no escribe sin cambios (conserva `created_at`);
  - `notFound`;
  - `DatabaseUnavailable`.
- [x] 5.2 Implementar `PrismaProfessorAvailabilityRepository` (bloqueo `FOR UPDATE` del profesor, `deleteMany` y `createMany`) y cablearlo en `composeApp.ts`
- [x] 5.3 Tests de integración de concurrencia, varias rondas:
  - dos `PUT` en carrera, de los que queda uno entero;
  - `PUT` contra `DELETE` del profesor, sin `500` ni tramos huérfanos.
- [x] 5.4 Tests que fallan e implementación de `unavailableCount` en `PrismaProfessorRepository`, en el listado, la lectura, el alta y la edición. Actualizar el tipo `Professor` del dominio y sus fixtures.

## 6. Backend: presentación

- [x] 6.1 Tests que fallan (`professorsRoute.test.ts`) e implementación de `GET` y `PUT /:id/availability` en `professorsRouter`:
  - los dos roles;
  - `404` con un id que no es UUID antes de leer el cuerpo;
  - `400` con los campos;
  - `401`;
  - `no-store`;
  - el colegio de la identidad.
  También los dobles en `appDoubles.ts`.
- [x] 6.2 Tests de integración por HTTP (`professorAvailability.int.test.ts`) con los escenarios del requisito «Guardar la disponibilidad con PUT»:
  - `MEMBER` guarda y normaliza;
  - vaciar, sin cambios y validación;
  - 41 en un día;
  - `404` de otro colegio;
  - `401`;
  - `unavailableCount` en `GET /api/professors`;
  - cascada al borrar;
  - eventos sin nombres.

## 7. Frontend: servicios, utilidades y textos

- [x] 7.1 Tests que fallan e implementación de `services/professorAvailabilityService.ts` (`get` y `update`):
  - outcomes `loaded`, `updated`, `validationError`, `notFound`, `unauthenticated` y `unavailable`;
  - valida la forma;
  - codifica el id;
  - nunca lanza.
  Y de `unavailableCount`, ahora obligatorio, en `professorsService`, con sus fixtures.
- [x] 7.2 Tests que fallan (recorriendo también `test-fixtures/professor-unavailability-normalization.json`) e implementación de `utils/professorAvailability.ts`:
  - `normalizeUnavailability`, `sessionsOf`, `cellStates`, `addRange` y `subtractRange` (partir un tramo);
  - `outsideView` y `countAvailable`;
  - `defaultCalendar` (más cursos, empate por nombre).
- [x] 7.3 Añadir los textos en `es.json` y `en.json`:
  - en `availability.*`: título, calendario, resumen con plural, «También no disponible», «Disponible todo» y su confirmación, guardar, guardado, error, no existe, sin calendarios y estados de celda;
  - el enlace del listado con plural y su `aria-label`.

## 8. Frontend: componentes y páginas

- [x] 8.1 Tests que fallan (`SlotGrid.test.tsx`) e implementación del modo `unavailable` de `SlotGrid`:
  - celdas enteras y parciales con icono, texto y tramo en el nombre accesible;
  - `onToggle` y `onToggleLine` desde las cabeceras;
  - solo lectura;
  - `axe`;
  - los modos `forbidden` y `preferred` no cambian.
- [x] 8.2 Tests que fallan (`ProfessorAvailabilityPage.test.tsx`) e implementación de `pages/ProfessorAvailabilityPage.tsx` y de su ruta en `App.tsx`:
  - carga única con `StrictMode`, «Reintentar» y `404`;
  - calendario por defecto y selector;
  - marcar, desmarcar (partir un tramo) y cabeceras;
  - celda parcial;
  - tramos de otro calendario conservados y mencionados;
  - «Disponible todo» con confirmación;
  - «Guardar» solo con diferencias, guarda síncrona y aviso;
  - sin calendarios;
  - los dos roles;
  - `axe` a 1280 y a 360 px.
- [x] 8.3 Tests que fallan (`ProfessorsPage.test.tsx`, a 1280 y a 360 px) e implementación del enlace «Disponibilidad ({n} tramos)» en la tabla y en las tarjetas, con su `aria-label`

## 9. Revisar los tests existentes (MANDATORY)

- [x] 9.1 Revisar y actualizar, conservando lo que comprobaban:
  - los fixtures de `Professor` (`unavailableCount`) en backend y frontend;
  - `professors.int.test.ts`;
  - los E2E de profesores, cuyas columnas «Acciones» ganan un enlace.

## 10. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 10.1 Capturar la línea base: recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`. Vaciar antes los restos y aplicar la migración nueva a la base de desarrollo.
- [x] 10.2 Ejecutar los tests tocados y después `npm test` completo con cobertura (mínimos: 90 % en backend y 80 % en frontend):
  - guardar el log;
  - leer el código de salida del propio comando;
  - comprobar que no hay errores «Unhandled».
- [x] 10.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, cada uno con su código de salida
- [x] 10.4 Verificar que la base de datos coincide con la línea base, con la tabla nueva vacía, y restaurarla si no
- [x] 10.5 Documentar el resultado en `reports/YYYY-MM-DD-step-10-unit-test-and-db-verification.md`

## 11. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Arrancar el backend local y comprobar con `curl`:
  - **Lectura:** `GET` vacío.
  - **Escritura:** `PUT` con tramos contiguos y solapados que se unen; repetir sin cambios; vaciar.
  - **Validación:** día, formato, rango y 41 en un día.
  - **Errores:** `404` de otro colegio, de un inexistente y de un id que no es UUID.
  - **Permisos:** `MEMBER` real que lee y escribe; `401`.
  - **Recuento:** `unavailableCount` en el listado y en la lectura.
  - **Cascada:** borrar el profesor.
  - **Concurrencia:** varias rondas.
  - **Log:** eventos sin nombres ni horas.
- [x] 11.2 Borrar los datos creados, comprobar la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 11.3 Documentar los comandos y las respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-11-curl-manual-testing.md`

## 12. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 Crear `cypress/e2e/professor-availability.cy.ts` (requisito «Disponibilidad de extremo a extremo»), con cada `cy.intercept` registrado una sola vez
- [x] 12.2 Ejecutar en modo headless `professor-availability.cy.ts` y `professors.cy.ts`, y después `npm run test:e2e` completo
- [x] 12.3 Verificar y restaurar la base de datos de test
- [x] 12.4 Documentar el resultado en `reports/YYYY-MM-DD-step-12-e2e-cypress.md`

## 13. Documentación (MANDATORY)

- [x] 13.1 Aplicar la skill `update-docs` en `docs/backend-standards.md`, solo si el patrón es nuevo: guardar tramos en horas independientes del calendario, normalizados en el dominio y mostrados como una vista sobre un calendario
- [x] 13.2 Actualizar la documentación técnica:
  - `backend/CLAUDE.md`: rutas, bloqueo, eventos y la fila de la tabla de features;
  - `frontend/CLAUDE.md`: el modo `unavailable` de `SlotGrid` y la página;
  - `README.md`: endpoints, rutas y el módulo 6 a ✅. Además, los módulos 7 a 9 y lo no implementado de «Seguridad & Auditoría» pasan a 🎯.
  - `CLAUDE.md` raíz: estado actual;
  - `docs/Modelo_de_Datos/MODELO_DATOS.md`: `professor_unavailabilities` sustituye a `professor_availabilities` y la nota de estado;
  - la arquitectura (`ARQUITECTURA_COMPLETA.md`, con la fila de US-PROF-AVAIL a ✅ y «US21 en adelante» a «Por definir»; `DIAGRAMA_C4.md` y el DSL);
  - `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md`: HC4 por solape de horas y HC2 con calendarios distintos;
  - el resumen de épicas de `docs/User_Stories_MVP.md`.
- [x] 13.3 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 13.4 Verificar con `openspec validate us-prof-avail-disponibilidad --strict` que el cambio es válido

## 14. Despliegue y comprobación en producción

- [ ] 14.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–13. Tras integrarla la persona usuaria, verificar el despliegue automático, **la migración aplicada** y el smoke test.
- [ ] 14.2 Comprobar en producción:
  - **Con `curl`:**
    - `/profesores/<id>/disponibilidad` sirve la SPA con la CSP;
    - el bundle contiene los textos nuevos;
    - `GET` y `PUT /api/professors/<id>/availability` sin token responden `401`.
  - **La persona usuaria, con un navegador real**, en escritorio y en el móvil y sin violaciones de CSP:
    - marca y guarda la disponibilidad de un profesor;
    - ve el recuento en el listado;
    - lo prueba como `MEMBER`.
- [ ] 14.3 Documentar el resultado en `reports/YYYY-MM-DD-step-14-production.md`
