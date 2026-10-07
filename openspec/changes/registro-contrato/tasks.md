## 0. Preparación: rama de trabajo (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/registro-contrato` desde `main` actualizado (si ya se creó al proponer el cambio, verificar que existe y parte de `main`)
- [x] 0.2 Verificar que la rama actual es `feature/registro-contrato` y que el árbol de trabajo solo contiene los artefactos de este cambio

## 1. Backend: códigos de error comprobados contra el contrato (TDD, D6)

- [x] 1.1 Añadir la dependencia de desarrollo `yaml` al workspace `backend` (`npm install -D yaml -w backend`) y comprobar si pide aprobación en `allowScripts`
- [x] 1.2 Escribir el test unitario (`backend/src/presentation/http/appError.test.ts`) que lee `docs/api-spec.yml` y comprueba que `ERROR_CODES` contiene exactamente los códigos del enum `ErrorCode` del contrato; verificar que falla porque `ERROR_CODES` no existe
- [x] 1.3 Implementar `ERROR_CODES` (`as const`) en `appError.ts` con los 7 códigos actuales y derivar de él el tipo `ErrorCode`; verificar que el test pasa y que `npm run typecheck -w backend` no da errores

## 2. Contrato: errores reutilizables (D1, D2)

- [x] 2.1 Añadir al enum `ErrorCode` de `docs/api-spec.yml` los códigos `VALIDATION_ERROR`, `EMAIL_ALREADY_REGISTERED`, `CAPTCHA_CHALLENGE_REQUIRED`, `CAPTCHA_FAILED` y `TOO_MANY_REQUESTS`; verificar que el test de 1.2 falla porque el backend no los tiene
- [x] 2.2 Añadir los cinco códigos a `ERROR_CODES` del backend; verificar que el test de 1.2 pasa
- [x] 2.3 Añadir los esquemas `FieldErrorCode`, `FieldError` y `ValidationErrorResponse` (esquema independiente, no `allOf`) y la respuesta reutilizable `ValidationError` (`400`)
- [x] 2.4 Añadir la respuesta reutilizable `TooManyRequests` (`429`, `ErrorResponse`, cabecera `Retry-After` entera)
- [x] 2.5 Actualizar la descripción general de la API (`info.description`) si menciona la lista de errores, sin repetir los específicos del registro

## 3. Contrato: `POST /api/auth/register` (D1, D2)

- [x] 3.1 Añadir el tag `Auth` y los esquemas `CaptchaToken`, `RegisterRequest` (obligatorios, `additionalProperties: false` y `maxLength` 150/100/100/320/128) y `RegisterResponse` (`data.user` y `data.school`, `id` como `string` `uuid`, sin contraseña)
- [x] 3.2 Añadir la operación `POST /api/auth/register` (`operationId: registerUser`, `security: []`) con `201`, `400` (`ValidationError`), `409` (`EMAIL_ALREADY_REGISTERED`, con ejemplo), `422` (dos ejemplos: `CAPTCHA_CHALLENGE_REQUIRED` y `CAPTCHA_FAILED`), `429` (`TooManyRequests`), `413`, `415`, `500` y `503`
- [x] 3.3 Validar el contrato de forma puntual con `npx @redocly/cli lint docs/api-spec.yml` (sin añadirlo como dependencia) y corregir los errores que señale

## 4. Frontend: tipos generados desde el contrato (TDD, D3)

- [x] 4.1 Escribir un test de tipos (`frontend/src/api/schema.test.ts`, con `expectTypeOf` de Vitest) que comprueba los campos de la petición y de la respuesta `201` del registro, los dos códigos de `422` y la forma de `FieldError`; verificar que `npm run typecheck -w frontend` falla porque el fichero generado no existe
- [x] 4.2 Añadir al `package.json` raíz el `overrides` global `"typescript": "~6.0.3"` (D3, compatibilidad con TypeScript 6), añadir la dependencia de desarrollo `openapi-typescript` al workspace `frontend` y comprobar si pide aprobación en `allowScripts`
- [x] 4.3 Añadir el script `api:types` (`openapi-typescript ../docs/api-spec.yml -o src/api/generated/schema.ts`), elegir las opciones del generador (p. ej. `--root-types`) y generar el fichero; verificar que el test de 4.1 compila y pasa
- [x] 4.4 Verificar el escenario «Contrato inválido»: con un `api-spec.yml` roto de forma temporal, `api:types` falla y no escribe el fichero; restaurar el contrato

## 5. Frontend: fichero generado fuera de formato, lint y cobertura (D4)

- [x] 5.1 Añadir `frontend/src/api/generated/` a `.prettierignore`
- [x] 5.2 Añadir `src/api/generated/**` a los `ignores` de `frontend/eslint.config.js` (configuración base)
- [x] 5.3 Añadir `src/api/generated/**` a `coverage.exclude` de `frontend/vite.config.ts`, actualizando su comentario
- [x] 5.4 Añadir `--no-warn-ignored` al comando de ESLint de `frontend/.lintstagedrc.json` y verificar que la opción existe en la versión de ESLint instalada
- [x] 5.5 Verificar que `npm run lint` pasa y que `api:types` seguido de `npm run format` no modifica el fichero generado

## 6. Comprobación de tipos al día y CI (D3, D5)

- [ ] 6.1 Añadir el script `api:types:check` (mismo comando que `api:types` con `--check`) y verificar que pasa con el fichero recién generado
- [ ] 6.2 Verificar el escenario «Contrato cambiado sin regenerar»: con un cambio temporal en `api-spec.yml` que afecta a los tipos, `api:types:check` falla; deshacer el cambio
- [ ] 6.3 Añadir en el job `quality` de `.github/workflows/ci.yml`, después de «Lint y formato», el paso `npm run api:types:check -w frontend`, actualizando el comentario de cabecera del workflow
- [ ] 6.4 Verificar el hook de pre-commit con un commit que incluye el fichero generado: se confirma sin cambios de formato y el hook no falla

## 7. Revisar y actualizar los tests unitarios (MANDATORY)

- [ ] 7.1 Revisar los tests existentes que dependen de `ErrorCode` (`errorHandler`, `app.test.ts`, salud) y confirmar que siguen siendo válidos tras derivar el tipo de `ERROR_CODES`
- [ ] 7.2 Confirmar que la cobertura del backend (90 %) y del frontend (80 %) se mantiene con el nuevo test y las exclusiones

## 8. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 Capturar el estado de partida de `calendarschool` y `calendarschool_test` (tablas y migraciones aplicadas; este cambio no crea ninguna)
- [ ] 8.2 Ejecutar los tests afectados: `npm exec -w backend -- vitest run src/presentation/http/appError.test.ts` y `npm exec -w frontend -- vitest run src/api/schema.test.ts`
- [ ] 8.3 Ejecutar `npm test`, `npm run typecheck --workspaces`, `npm run lint` y `npm run api:types:check -w frontend`
- [ ] 8.4 Verificar que el estado de las bases coincide con el de partida
- [ ] 8.5 Crear el informe `openspec/changes/registro-contrato/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md` (en `reports/` del cambio y no en `specs/`, para que no lo procese el validador de specs)

## 9. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Arrancar el backend de desarrollo
- [ ] 9.2 `GET /api/health` responde `200` como antes del cambio
- [ ] 9.3 `POST /api/auth/register` responde `404 NOT_FOUND` con el formato de error común: este cambio solo define el contrato y el endpoint llega en US01_b
- [ ] 9.4 Documentar comandos y respuestas en `openspec/changes/registro-contrato/reports/YYYY-MM-DD-step-9-curl.md` (sin datos que restaurar)

## 10. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [ ] 10.1 Sin cambios de interfaz en este cambio: ejecutar `npm run test:e2e` para comprobar que no hay regresiones
- [ ] 10.2 Documentar el resultado en `openspec/changes/registro-contrato/reports/YYYY-MM-DD-step-10-e2e.md`

## 11. Actualizar la documentación técnica (MANDATORY)

- [ ] 11.1 Aplicar la skill `update-docs`
- [ ] 11.2 `CLAUDE.md`: comandos `api:types` y `api:types:check`, el fichero generado del frontend junto al cliente de Prisma generado (no se edita a mano) y el `overrides` de `openapi-typescript` junto a la nota de TypeScript `~6.0`
- [ ] 11.3 `docs/frontend-standards.md` (en inglés): los tipos de la API se importan del fichero generado y nunca se escriben a mano
- [ ] 11.4 Comprobar que `docs/api-spec.yml` y las specs del cambio son coherentes con lo implementado
