## 0. Rama de trabajo

- [x] 0.1 Crear la rama `feature/us01-f-resiliencia-formulario` desde `main` actualizado (con la PR #21 de US01_e ya fusionada)
- [x] 0.2 Verificar que la rama actual es `feature/us01-f-resiliencia-formulario` y que el árbol de trabajo solo contiene los artefactos de este cambio

## 1. Módulo de borrador del registro (TDD)

- [x] 1.1 Escribir los tests de `frontend/src/services/registrationDraft.test.ts` con un almacenamiento falso de `createRegistrationDraft`: guarda los cinco campos conservables tal como están y nunca la contraseña; restaura lo guardado; usa la clave `calendarschool:registration-draft:v1`; `clear` lo borra; y comprobar que fallan
- [x] 1.2 Implementar `createRegistrationDraft(getStorage)` y las funciones por defecto `loadRegistrationDraft`, `saveRegistrationDraft` y `clearRegistrationDraft` sobre `window.sessionStorage`, con la lista explícita de campos guardables, hasta que los tests pasen
- [x] 1.3 Añadir tests de lectura defensiva (`JSON` inválido, valor que no es objeto, `null`, array, campos desconocidos, valores que no son cadenas y cadenas de más de 1000 caracteres, ignorando solo esos campos y sin recortar ninguno) y de almacenamiento que lanza al obtenerse, al leer, al escribir y al borrar; comprobar que fallan e implementar hasta que pasen

## 2. Conservación del formulario en `RegisterPage` (TDD)

- [x] 2.1 Vaciar `sessionStorage` antes de cada test en `frontend/src/setupTests.ts` y comprobar que la suite actual del frontend sigue pasando
- [x] 2.2 Escribir tests de componente en `frontend/src/pages/RegisterPage.draft.test.tsx`: con un borrador guardado, los campos se restauran al montar, la contraseña está vacía y no hay errores visibles; al escribir en cada campo se guarda el borrador sin la contraseña; y comprobar que fallan
- [x] 2.3 Inicializar `values` de forma perezosa con el borrador y guardarlo en un efecto sobre `values`, hasta que los tests pasen
- [x] 2.4 Escribir tests de borrado y conservación: tras un `201` con sesión el borrador ya no existe; tras un `201` con sesión fallida (cookies y sin conexión) tampoco, y no se vuelve a escribir al vaciar la contraseña; ante `409`, `429` y error inesperado se conserva; y comprobar que fallan
- [x] 2.5 Implementar la marca de registro completado (`ref`) y la llamada a `clearRegistrationDraft()` tras el `201`, con el efecto de guardado detenido por la marca, hasta que los tests pasen
- [x] 2.6 Escribir el test del municipio restaurado que no está en la lista (queda sin elegir cuando la lista carga, y uno que sí está se muestra con su nombre) y el de almacenamiento roto (espiando `Storage.prototype` para que lance, el registro termina en `201`); comprobar que el primero falla e implementar el borrado del municipio desconocido cuando `useMunicipalities` está listo

## 3. Envíos repetidos (TDD)

- [x] 3.1 Escribir en `RegisterPage.draft.test.tsx` (o en el test de envío existente si encaja mejor) el test de dos `requestSubmit()` seguidos dentro del mismo `act`, que esperan una sola llamada a `registrationService.register`, y el de un segundo envío tras una respuesta de error, que sí llama de nuevo; comprobar que el primero falla
- [x] 3.2 Sustituir la guarda de `handleSubmit` por una `ref` (`isSubmittingRef`) activada de forma síncrona al empezar y liberada en todos los caminos de salida con `try/finally`, conservando `isPending` para la interfaz, hasta que los tests pasen
- [x] 3.3 Refactorizar `RegisterPage` si el borrador o la guarda han dejado lógica repetida, y comprobar que pasan todos los tests de `RegisterPage*` y el de accesibilidad

## 4. Revisar y actualizar los tests existentes (MANDATORY)

- [x] 4.1 Revisar los tests de `RegisterPage*`, `registrationService` y accesibilidad por dependencias del estado inicial vacío o de la guarda anterior, y ajustarlos si hace falta
- [x] 4.2 Confirmar que los registros simultáneos de `backend/src/registration.int.test.ts` (mismo email y mismo colegio) cubren el escenario «Dos pestañas con el mismo email» y dejarlo anotado en el informe del grupo 5

## 5. Ejecutar tests y verificar el estado de la base de datos (MANDATORY - AGENT MUST EXECUTE)

- [x] 5.1 Levantar PostgreSQL y capturar la línea base de `calendarschool` y `calendarschool_test` (filas de `users`, `schools`, `refresh_tokens`, `rate_limit_attempts` y `municipalities` por esquema)
- [x] 5.2 Ejecutar los tests de los módulos modificados del frontend
- [x] 5.3 Ejecutar `npm test`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, y verificar las coberturas (90 % backend, 80 % frontend)
- [x] 5.4 Verificar el estado posterior de la base de datos y restaurarlo si hace falta
- [x] 5.5 Crear el informe `reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md` con el formato de `docs/openspec-tasks-mandatory-steps.md`

## 6. Pruebas manuales de endpoints con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 Arrancar el backend de desarrollo y comprobar la conexión a la base de datos; este cambio no toca el backend, así que la prueba es de regresión del registro
- [x] 6.2 Probar con `curl` dos `POST /api/auth/register` simultáneos con el mismo email (un `201` y un `409 EMAIL_ALREADY_REGISTERED`, una sola cuenta creada) y un registro normal (`201` con cookie)
- [x] 6.3 Restaurar la base de datos de desarrollo y verificar que coincide con la línea base
- [x] 6.4 Documentar los comandos y respuestas en `reports/YYYY-MM-DD-step-6-curl-manual-testing.md`

## 7. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Añadir a `frontend/cypress/e2e/registration.cy.ts`: rellenar el formulario, recargar y comprobar que se conservan los cinco campos (el municipio con su nombre) y la contraseña está vacía; registrarse con éxito y, al volver a `/registro`, encontrar el formulario vacío
- [x] 7.2 Ejecutar en modo headless primero `npm run test:e2e -- --spec cypress/e2e/registration.cy.ts` y después la suite completa
- [x] 7.3 Verificar la persistencia y restaurar la base de datos de test
- [x] 7.4 Documentar los escenarios y resultados en `reports/YYYY-MM-DD-step-7-e2e-cypress.md`

## 8. Actualizar la documentación técnica (MANDATORY)

- [ ] 8.1 Aplicar la skill `update-docs`: `docs/frontend-standards.md` (borrador en `sessionStorage` solo para formularios sin datos sensibles, nunca la contraseña ni tokens; acceso defensivo; guarda de envío con `ref`)
- [ ] 8.2 Actualizar `README.md` si describe el formulario de registro y `CLAUDE.md` (estado: US01 completa; arquitectura del frontend: borrador del registro y guarda de envío)
- [ ] 8.3 Actualizar `docs/User_Stories_MVP.md`: decisiones de US01_f (`sessionStorage` por pestaña, sin token de formulario, unicidad en la base de datos y guarda de envío) fuera de «Pendiente de decidir», y US01 completa con sus pendientes antes de publicar
- [ ] 8.4 Verificar con `openspec validate us01-f-resiliencia-formulario` que el cambio es válido antes de archivarlo
