## 0. Preparación: rama de trabajo (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/publicacion-registro` desde `main` actualizado, llevando los artefactos de este cambio
- [x] 0.2 Verificar que la rama actual es `feature/publicacion-registro` y que el árbol de trabajo solo contiene los artefactos de este cambio
- [x] 0.3 Guardar el resultado del spike de claves del 2026-10-14 (ver Context de `design.md`) en `reports/2026-10-14-spike-recaptcha-keys.md`: preguntas, comandos (sin claves ni secretos), respuestas y conclusión

## 1. Contrato de la API (D4)

- [x] 1.1 Añadir `privacyPolicyAccepted` (`type: boolean`, `const: true`, obligatorio, con descripción) a la petición de `POST /api/auth/register` en `docs/api-spec.yml`, y actualizar la nota de la descripción general sobre el registro cerrado («hasta el cambio que implemente US02»)
- [x] 1.2 Regenerar los tipos con `npm run api:types -w frontend`, ampliar `api/schema.test.ts` (`expectTypeOf`) para fijar el campo y verificar con `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`

## 2. Backend: dominio (TDD, D4)

- [x] 2.1 Escribir el test de `domain/privacy/privacyPolicy.ts`: `PRIVACY_POLICY_VERSION` tiene formato `AAAA-MM-DD` y coincide con la fecha de última actualización de `frontend/src/i18n/es.json` y `en.json` (`privacyPolicy.lastUpdated`); verificar que falla
- [x] 2.2 Crear la constante con la fecha de la versión inicial del texto; el test de la fecha de i18n seguirá fallando hasta la tarea 7.2
- [x] 2.3 Añadir `privacyPolicyAcceptance: { acceptedAt: Date; version: string } | null` a `User` (`domain/user/user.ts`) y adaptar los dobles y fábricas de tests que construyen usuarios; verificar `npm run typecheck --workspaces`

## 3. Backend: validación y caso de uso (TDD, D4)

- [x] 3.1 Añadir a `test-fixtures/registration-fields.json` los ejemplos de `privacyPolicyAccepted`: válido `true`; inválidos (todos `REQUIRED`) ausente, `false`, `"true"`, `1` y `null`
- [x] 3.2 Verificar que `registerSchoolRequest.test.ts` falla con los ejemplos nuevos; añadir `privacyPolicyAccepted: z.literal(true)` con su traducción a `REQUIRED` en `registerSchoolRequest.ts` y verificar que pasa
- [x] 3.3 Escribir en `registerSchool.test.ts` que el administrador creado lleva `privacyPolicyAcceptance` con `acceptedAt` igual al instante del alta y `version` igual a `PRIVACY_POLICY_VERSION`; verificar que falla, implementarlo en `RegisterSchool` y verificar que pasa
- [x] 3.4 Comprobar en `registerSchool.test.ts` el orden: con un captcha que falla y sin `privacyPolicyAccepted`, la respuesta es el error del captcha, no la validación

## 4. Backend: persistencia (TDD, D4)

- [x] 4.1 Añadir a `User` en `backend/prisma/schema.prisma` `privacyPolicyAcceptedAt` (`privacy_policy_accepted_at`, `timestamptz`, opcional) y `privacyPolicyVersion` (`privacy_policy_version`, `varchar(20)`, opcional); crear la migración con `prisma migrate dev --create-only`, añadir a mano el `CHECK` de «las dos o ninguna» y aplicarla con `npm run db:migrate`
- [x] 4.2 Escribir en el `*.int.test.ts` del repositorio de registro que el alta guarda las dos columnas, y que un alta fallida (`EmailAlreadyRegistered`) no deja ninguna aceptación; verificar que falla
- [x] 4.3 Implementar el mapeo en el repositorio Prisma de registro y verificar que pasa
- [x] 4.4 Escribir un test de integración que inserte un usuario con solo una de las dos columnas y compruebe que el `CHECK` lo rechaza
- [x] 4.5 Ampliar el test de integración de `POST /api/auth/register` (`realApp`): sin `privacyPolicyAccepted` responde `400` con `{ field: privacyPolicyAccepted, code: REQUIRED }` sin crear datos; con `true` responde `201` y el usuario tiene la fecha y la versión

## 5. Límite de intentos: conservación máxima (TDD, D6)

- [x] 5.1 Escribir el test de la constante `ATTEMPT_RETENTION_HOURS = 24` (junto a las políticas del limitador, en `application/attempts`): ninguna política conocida, empezando por la de registro, tiene una ventana igual o mayor que ese plazo; verificar que falla, implementarlo y verificar que pasa
- [x] 5.2 Crear `infrastructure/supabase/purge-rate-limit-attempts.sql` con el `DELETE` de D6 y escribir un test de integración que lo ejecute contra la base de test: con intentos de hace 25 horas, 23 horas y 1 minuto, solo se borra el de 25 horas; verificar que falla sin el fichero y pasa con él
- [x] 5.3 Añadir a `.github/workflows/backup.yml`, antes del volcado, el paso «Purgar intentos caducados» que ejecuta ese SQL con `psql -v ON_ERROR_STOP=1` (cliente de PostgreSQL 17 ya instalado) por la misma cadena del volcado; actualizar el comentario de cabecera del workflow

## 6. Frontend: casilla de consentimiento (TDD, D4)

- [x] 6.1 Ampliar `validation/registrationValidation.test.ts` con los ejemplos nuevos de la tabla compartida; verificar que falla, añadir la regla de `privacyPolicyAccepted` y verificar que pasa
- [x] 6.2 Escribir en `RegisterPage.test.tsx`: la casilla aparece sin marcar con el enlace a `/privacidad` (`target="_blank"`, `rel="noopener noreferrer"`); al enviar sin marcarla se muestra el error con `role="alert"` y `aria-describedby`, y no se llama a `executeV3` ni al servicio de registro; marcada, la petición lleva `privacyPolicyAccepted: true`. Verificar que falla
- [x] 6.3 Implementar la casilla en `RegisterPage` con `Form.Check`, sus textos en `es.json` y `en.json` y el campo en `registrationService.ts`; verificar que pasa
- [x] 6.4 Escribir en `RegisterPage.draft.test.tsx` que, tras marcar la casilla y recargar, los campos se restauran y la casilla aparece sin marcar; verificar que pasa sin tocar `registrationDraft.ts`
- [x] 6.5 Verificar que `RegisterPage.a11y.test.tsx` sigue sin violaciones con la casilla y su error

## 7. Frontend: página `/privacidad` (TDD, D5)

- [x] 7.1 Escribir `PrivacyPolicyPage.test.tsx` y ampliar el test de rutas de `App`: `/privacidad` se pinta sin sesión, muestra la fecha de última actualización y cada sección exigida por la spec (responsable, datos, IP, cookie, reCAPTCHA, proveedores, conservación, base jurídica, derechos y AEPD), sin violaciones de accesibilidad y sin usar el cliente de captcha; verificar que falla
- [x] 7.2 Redactar el borrador del texto en `es.json` y `en.json` (claves `privacyPolicy.*`) según D5, con los datos del responsable como `[PENDIENTE: …]`, y crear la página y su ruta; verificar que pasan los tests 7.1 y 2.1
- [x] 7.3 Pedir a la persona usuaria los datos del responsable del tratamiento y su revisión del texto; sustituir los marcadores en los dos idiomas y añadir un test que falle si queda algún `[PENDIENTE` en `privacyPolicy.*`

## 8. CSP (D2 y D3)

- [x] 8.1 Crear `frontend/content-security-policy.json` con las directivas de D2 y una función pura que lo serialice a la cabecera; escribir su test (orden estable, `script-src` sin `'unsafe-inline'` ni `'unsafe-eval'`, presencia de `object-src 'none'`, `base-uri`, `form-action` y `frame-ancestors 'none'`); verificar que falla, implementarlo y verificar que pasa
- [x] 8.2 Servir la cabecera en `preview.headers` de `vite.config.ts` (no en `server`) y comprobar con `curl -I` contra `vite preview` que la lleva
- [x] 8.3 Ampliar el test del stack de CDK: la `ResponseHeadersPolicy` lleva `ContentSecurityPolicy` con el valor del JSON y `Override: true`, y no hay ninguna cabecera `Report-Only`; verificar que falla, leer el JSON en `appStack.ts` con `readFileSync` y verificar que pasa; actualizar el comentario de la política
- [x] 8.4 Consultar la documentación de `experimentalCspAllowList` para la versión instalada de Cypress, configurarlo para conservar todas las directivas compatibles, y anotar la decisión en Open Questions de `design.md`
- [x] 8.5 Escribir el E2E `csp.cy.ts`: la respuesta de `/registro` lleva la cabecera completa y ninguna `Report-Only`, y el flujo de registro completo (cliente de captcha falso) termina sin violaciones de CSP en la consola
- [x] 8.6 Validación local con claves reales (D3), sin versionar ninguna clave: build con `frontend/.env.production.local`, `vite preview` con la CSP y backend con los secretos; registro completo con `201` y reto v2 forzado como en el spike, cero violaciones en la consola; cada violación se corrige primero en D2 y en la spec, luego en el test de `contentSecurityPolicy.test.ts` y por último en el JSON (con Playwright; si Google presenta un reto de imágenes, pedir a la persona usuaria que lo resuelva); borrar `.env.production.local` y los datos creados; ajustar `content-security-policy.json` y D2 si aparece una violación
- [x] 8.7 Documentar el resultado en `reports/YYYY-MM-DD-step-8-csp-local-validation.md`

## 9. Registro cerrado hasta US02 (D1)

- [x] 9.1 Actualizar los comentarios de `infrastructure/functions/apiGuard.js`, `infrastructure/lib/appStack.ts` y `scripts/smoke.mjs` a «hasta el cambio que implemente US02», sin cambiar el comportamiento; verificar que `npm test -w infrastructure` sigue pasando
- [x] 9.2 Ampliar el test de la CloudFront Function `spa-rewrite` (si no lo cubre ya) para que `/privacidad` se reescriba a `index.html`

## 10. Revisar y actualizar los tests unitarios (MANDATORY)

- [x] 10.1 Revisar los tests existentes afectados por el campo nuevo (dobles de `RegisterSchool`, fixtures de registro en E2E y `realApp`, `registrationService.test.ts`) y actualizarlos para que envíen `privacyPolicyAccepted: true`
- [x] 10.2 Verificar que ningún test depende de la ausencia de la CSP ni de usuarios sin aceptación

## 11. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 11.1 Levantar PostgreSQL 17 y capturar la línea base de `calendarschool` y `calendarschool_test` (filas de `users`, `schools`, `refresh_tokens`, `rate_limit_attempts` y `municipalities` por esquema)
- [x] 11.2 Ejecutar los tests de los módulos modificados de backend, frontend e infraestructura
- [x] 11.3 Ejecutar `npm test`, `npm test -w infrastructure`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, y verificar las coberturas (90 % backend, 80 % frontend)
- [x] 11.4 Verificar el estado posterior de la base de datos y restaurarlo si hace falta
- [x] 11.5 Crear el informe `reports/YYYY-MM-DD-step-11-unit-test-and-db-verification.md` con el formato de `docs/openspec-tasks-mandatory-steps.md`

## 12. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 En local, con el backend arrancado: `POST /api/auth/register` con un registro válido y `privacyPolicyAccepted: true` responde `201` y la fila de `users` tiene la fecha y la versión; sin el campo, con `false` y con `"true"` responde `400` con `{ field: privacyPolicyAccepted, code: REQUIRED }`; sin captcha responde `422` aunque falte el campo. Borrar los datos creados, comprobar que la base vuelve a la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 12.2 En local, con `vite preview`: `curl -I` de `/registro` y `/privacidad` lleva `Content-Security-Policy` y ninguna `Report-Only`
- [x] 12.3 Documentar los comandos y respuestas (sin secretos) en `reports/YYYY-MM-DD-step-12-curl-manual-testing.md`

## 13. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 13.1 Actualizar los E2E de registro para marcar la casilla, y añadir el escenario de envío sin aceptar la política (error visible, ninguna petición a `/api/auth/register`) y el de la página `/privacidad` (enlace desde el formulario, pintada sin sesión)
- [x] 13.2 Ejecutar en modo headless las specs afectadas (`npm run test:e2e -- --spec …`) y después `npm run test:e2e` completo
- [x] 13.3 Verificar y restaurar la base de datos de test
- [x] 13.4 Documentar el resultado en `reports/YYYY-MM-DD-step-13-e2e-cypress.md`

## 14. Despliegue y comprobación en producción

- [x] 14.1 Pedir a la persona usuaria que cargue las claves de producción (variables de GitHub `VITE_RECAPTCHA_SITE_KEY_V3`/`_V2` y SSM `RECAPTCHA_V3_SECRET`/`_V2_SECRET`, con `read -rs` según la guía) y confirme que incluyen el dominio `calendarschools.es`
- [x] 14.2 Integrar la PR en `main` y verificar el despliegue automático, la migración y su smoke test
- [x] 14.3 Comprobar con `curl`: `/registro` y `/privacidad` responden `200` con la CSP completa y sin `Report-Only`; `POST /api/auth/register` y `POST /api/auth/refresh` siguen respondiendo `404 NOT_FOUND`
- [x] 14.4 Comprobar con Playwright en `https://app.calendarschools.es/registro`: con la casilla marcada, enviar carga reCAPTCHA y obtiene el token sin violaciones de CSP, y la petición recibe `404` de CloudFront; borrar la carpeta `.playwright-mcp/` si se crea
- [x] 14.5 Lanzar `backup.yml` a mano y verificar en su log que la purga se ejecuta antes del volcado y que el workflow termina bien
- [x] 14.6 Documentar el resultado en `reports/YYYY-MM-DD-step-14-production-checks.md`

## 15. Actualizar la documentación técnica (MANDATORY)

- [x] 15.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` y `docs/frontend-standards.md` (consentimiento y CSP, si añaden una regla nueva)
- [x] 15.2 Actualizar `docs/despliegue/PUESTA_EN_MARCHA.md` según D7 (claves de Google Cloud y validación del secreto v2) y `frontend/.env.example` (`.env.development.local`)
- [x] 15.3 Actualizar `docs/Modelo_de_Datos/MODELO_DATOS.md` (columnas nuevas de `users` y conservación de `rate_limit_attempts`)
- [x] 15.4 Actualizar `docs/User_Stories_MVP.md`:
  - US00_b: el registro sigue cerrado hasta US02.
  - US01_e: lo «Pendiente antes de publicar» queda resuelto, con referencia al spike.
  - US02: abrir `/api/auth/*` (quitar la condición de `apiGuard.js` y cambiar el smoke test) es parte de su implementación, con la revisión legal del texto como condición.
- [x] 15.5 Actualizar `README.md` y `CLAUDE.md` (registro cerrado hasta US02, CSP, consentimiento, `/privacidad` y purga), y `docs/arquitectura/ARQUITECTURA_COMPLETA.md` (fila del registro cerrado y CSP)
- [x] 15.6 Verificar con `openspec validate publicacion-registro` que el cambio es válido
