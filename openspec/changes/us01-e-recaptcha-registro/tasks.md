## 0. Preparación: rama de trabajo (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us01-e-recaptcha-registro` desde `main` actualizado (con la PR #20 de US01_d ya fusionada)
- [x] 0.2 Verificar que la rama actual es `feature/us01-e-recaptcha-registro` y que el árbol de trabajo solo contiene los artefactos de este cambio

## 1. Spike: API de Google con claves reales (D1)

- [x] 1.1 Pedir al responsable las claves de Google Cloud (una basada en score para v3 y otra de checkbox para v2, con `localhost` entre los dominios permitidos). Si no están disponibles, dejar constancia en el informe del spike, continuar con `siteverify` según la documentación y hacer la prueba con claves reales en el grupo 11
- [x] 1.2 Documentar, de la documentación oficial de Google, la forma de las respuestas de `siteverify` (campos `success`, `score`, `action`, `challenge_ts`, `hostname` y `error-codes`, y los códigos de error) que usan los tests del adaptador. La prueba con claves reales (página local mínima que obtiene un token v3 con la acción `register` y uno v2, y los verifica con `curl` contra `https://www.google.com/recaptcha/api/siteverify`) pasa a la tarea 11.4, porque las claves aún no existen
- [x] 1.3 Registrar el resultado en `reports/YYYY-MM-DD-step-1-spike-recaptcha.md`, con el estado «prueba real pendiente». Si la tarea 11.4 muestra que `siteverify` no sirve con las claves nuevas, pausar y actualizar `design.md` (adaptador con la API de evaluaciones de Google Cloud) antes de publicar

## 2. Contrato: indisponibilidad del captcha (D6)

- [x] 2.1 Añadir `CAPTCHA_UNAVAILABLE` al enum `ErrorCode` de `docs/api-spec.yml`; verificar que `appError.test.ts` falla porque `ERROR_CODES` no lo tiene
- [x] 2.2 Añadir `CAPTCHA_UNAVAILABLE` a `ERROR_CODES` y verificar que `appError.test.ts` pasa
- [x] 2.3 Documentar en `POST /api/auth/register` el `503 CAPTCHA_UNAVAILABLE` (con su ejemplo, además de los comunes) y, en el `422`, las comprobaciones de score (≥ 0,6), acción `register` y dominio
- [x] 2.4 Validar el contrato con `npx @redocly/cli lint docs/api-spec.yml` sin avisos nuevos, regenerar los tipos desde la raíz (`npm run api:types -w frontend`), ampliar `frontend/src/api/schema.test.ts` con el código nuevo y verificar `api:types:check` y `typecheck --workspaces`

## 3. Configuración: secretos de reCAPTCHA (TDD, D4)

- [x] 3.1 Ampliar `config.test.ts`: sin secretos en desarrollo (sin configuración de reCAPTCHA), con los dos, solo uno de los dos (nombra el que falta), producción sin secretos (nombra los dos, sin valores) y producción con ellos; verificar que falla
- [x] 3.2 Añadir `RECAPTCHA_V3_SECRET` y `RECAPTCHA_V2_SECRET` al esquema Zod de `config.ts` (`recaptcha: { v3Secret, v2Secret } | undefined` en `AppConfig`); verificar que pasa
- [x] 3.3 Documentarlas comentadas en `backend/.env.example`; verificar que el test de la plantilla sigue pasando

## 4. Backend: errores y eventos (TDD, D2, D3 y D5)

- [x] 4.1 Ampliar los tests de `captchaVerifier.ts`: `CaptchaFailed` con `reason` (`MISSING`, `INVALID`, `EXPIRED_OR_DUPLICATE`, `ACTION_MISMATCH`, `HOSTNAME_MISMATCH`, `CHALLENGE_FAILED`), `CaptchaChallengeRequired` con `score`, y el nuevo `CaptchaUnavailable` con su causa; mensajes estables que no revelan el motivo; verificar que falla, implementarlo y verificar que pasa
- [x] 4.2 Ampliar `registerSchool.test.ts`: `USER_REGISTER_CAPTCHA_CHALLENGE` (`info`, con `score`, `ip` y `user_agent`) y `USER_REGISTER_CAPTCHA_FAILED` (`warn`, con `reason`, `version`, `ip` y `user_agent`), sin token ni email; `CaptchaUnavailable` se propaga sin evento; verificar que falla
- [x] 4.3 Registrar los eventos en `RegisterSchool` alrededor de `verify` y verificar que pasa

## 5. Backend: verificadores (TDD, D1, D2, D3 y D4)

- [x] 5.1 Escribir los tests de la comprobación de forma del `captcha` (`{ version: 'v3' | 'v2', token }` con token no vacío; si no, `CaptchaFailed('MISSING')`), compartida por los dos verificadores; verificar que falla, implementarla y verificar que pasa
- [x] 5.2 Escribir `fakeCaptchaVerifier.test.ts`: acepta cualquier token; `fake-low-score` (v3) pide el reto, `fake-fail` falla y `fake-unavailable` lanza `CaptchaUnavailable`; aplica la comprobación de forma; verificar que falla
- [x] 5.3 Implementar `FakeCaptchaVerifier` y verificar que pasa; borrar `AcceptAllCaptchaVerifier` y su test
- [x] 5.4 Escribir `recaptchaCaptchaVerifier.test.ts` con `fetch` simulado y respuestas con la forma de las de Google (las del spike si existen): petición `POST` a `siteverify` con el secreto de la versión y el token como formulario; v3 aceptado (score 0,9 y 0,6), reto (0,3), acción y dominio incorrectos, `timeout-or-duplicate`, `invalid-input-response`; v2 superado y no superado; `invalid-input-secret`, estado `500`, cuerpo no JSON, error de red y timeout de 3 segundos → `CaptchaUnavailable`; verificar que falla
- [x] 5.5 Implementar `RecaptchaCaptchaVerifier` (constante `RECAPTCHA_V3_MIN_SCORE = 0.6`, dominio esperado tomado de `APP_ORIGIN`, `AbortSignal.timeout(3000)`) y verificar que pasa

## 6. Backend: presentación y cableado (TDD, D3 y D4)

- [x] 6.1 Ampliar `errorHandler.test.ts`: `CaptchaUnavailable` responde `503 CAPTCHA_UNAVAILABLE` sin detalles y se registra como error con su causa; verificar que falla, implementarlo y verificar que pasa
- [x] 6.2 Ampliar `registerRoute.test.ts` con el `503 CAPTCHA_UNAVAILABLE` y comprobar que ninguna respuesta del captcha fija cookie
- [x] 6.3 Elegir el verificador en `createCaptchaVerifier` (`infrastructure/`, con su test, porque `server.ts` no se prueba): el real con los secretos y el dominio de `APP_ORIGIN`, o el falso sin secretos con un aviso en el log; cablearlo en `server.ts`; `test/support/realApp.ts` usa el falso por defecto
- [x] 6.4 Escribir el test de integración (`registrationCaptcha.int.test.ts`, sobre `realApp`): reto, fallo e indisponibilidad con los tokens reservados, sin validar ni crear nada ni fijar cookie y con sus eventos de log; captcha ausente → `422` y no `400`; el límite de US01_d sigue antes del captcha; un token cualquiera da `201`

## 7. Frontend: configuración y clientes de captcha (TDD, D7)

- [x] 7.1 Escribir `captchaConfig.test.ts`: sin claves → modo falso, con las dos → modo real, solo una → error que nombra la que falta; verificar que falla, implementar `captcha/captchaConfig.ts` (único módulo que lee `import.meta.env`) y verificar que pasa
- [x] 7.2 Escribir `fakeCaptchaClient.test.tsx`: `executeV3` devuelve el token fijo; `renderV2` pinta el botón «No soy un robot (simulado)», que entrega el token v2, y `reset` lo vuelve a pintar; verificar que falla, implementarlo y verificar que pasa
- [x] 7.3 Escribir `recaptchaClient.test.ts` con un `grecaptcha` simulado en `window`: carga el script una sola vez con la clave v3, `execute` con la acción `register` y un token nuevo por llamada, `render` del reto con la clave v2, y el script que no carga o no responde en 10 segundos se trata como indisponibilidad; verificar que falla, implementarlo y verificar que pasa
- [x] 7.4 Implementar `useCaptchaClient` (real o falso según la configuración) con su test, y documentar las claves de sitio comentadas en un nuevo `frontend/.env.example`

## 8. Frontend: servicio, formulario y textos (TDD, D7)

- [ ] 8.1 Ampliar `registrationService.test.ts`: `422 CAPTCHA_CHALLENGE_REQUIRED`, `422 CAPTCHA_FAILED` y `503 CAPTCHA_UNAVAILABLE` devuelven `captchaChallengeRequired`, `captchaFailed` y `captchaUnavailable`; verificar que falla, implementarlo y verificar que pasa
- [ ] 8.2 Añadir a `es.json` y `en.json` los textos del reto, de la verificación fallida, de la indisponibilidad y del aviso de privacidad; verificar que `locales.test.ts` pasa
- [ ] 8.3 Ampliar `RegisterPage.test.tsx` con un cliente falso controlado por el test: token v3 nuevo en cada envío; reto v2 que conserva todos los datos y bloquea el envío hasta resolverse; segundo envío con `version: 'v2'`; mensajes de fallo (reinicia el reto) y de indisponibilidad (también si el script no carga, sin llamar al backend); aviso de privacidad con sus enlaces; ningún token provisional; verificar que falla
- [ ] 8.4 Adaptar `RegisterPage` (sin `PROVISIONAL_CAPTCHA`) y verificar que pasa; añadir al test de accesibilidad el estado con el reto visible y con los mensajes del captcha

## 9. Revisar y actualizar los tests existentes (MANDATORY)

- [x] 9.1 Ajustar los tests de backend que registran sin `captcha` y esperaban `400` (ahora `422 CAPTCHA_FAILED`; el delta de `user-registration` modifica el escenario «Petición sin cuerpo» del límite de intentos) y los que importaban `AcceptAllCaptchaVerifier`
- [ ] 9.2 Revisar los tests de frontend y las specs de Cypress que dependían del token provisional

## 10. Ejecutar tests y verificar el estado de la base de datos (MANDATORY - AGENT MUST EXECUTE)

- [ ] 10.1 Levantar PostgreSQL y capturar la línea base de `calendarschool` y `calendarschool_test` (filas de `users`, `schools`, `refresh_tokens`, `rate_limit_attempts` y `municipalities` por esquema)
- [ ] 10.2 Ejecutar los tests de los módulos modificados de backend y frontend
- [ ] 10.3 Ejecutar `npm test`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, y verificar las coberturas (90 % backend, 80 % frontend)
- [ ] 10.4 Verificar el estado posterior de la base de datos y restaurarlo si hace falta
- [ ] 10.5 Crear el informe `reports/YYYY-MM-DD-step-10-unit-test-and-db-verification.md` con el formato de `docs/openspec-tasks-mandatory-steps.md`

## 11. Pruebas manuales de endpoints con curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 11.1 Arrancar el backend de desarrollo sin secretos (verificador falso) y comprobar el aviso en el log y la conexión a la base de datos
- [ ] 11.2 Probar con `curl`: token cualquiera (`201`), `fake-low-score` (`422 CAPTCHA_CHALLENGE_REQUIRED`), `fake-fail` (`422 CAPTCHA_FAILED`), `fake-unavailable` (`503 CAPTCHA_UNAVAILABLE`) y sin `captcha` (`422`), comprobando que solo el primero crea datos y fija cookie y que los eventos de log no llevan el token
- [ ] 11.3 Comprobar que con `NODE_ENV=production` y sin secretos el backend no arranca y nombra las variables
- [ ] 11.4 Prueba con claves reales (el spike pendiente del grupo 1): con las claves, servir una página local mínima que obtenga tokens v3 y v2 y verificarlos con `curl` contra `siteverify`; arrancar el backend con los secretos y el frontend con las claves de sitio, registrarse desde el navegador y verificar en el log el score y el `201`. Si aún no hay claves, dejar constancia en el informe de que la prueba real queda pendiente y es requisito antes de publicar
- [ ] 11.5 Restaurar la base de datos de desarrollo y verificar que coincide con la línea base
- [ ] 11.6 Documentar los comandos y respuestas en `reports/YYYY-MM-DD-step-11-curl-manual-testing.md`

## 12. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [ ] 12.1 Añadir a `frontend/cypress/e2e/registration.cy.ts`: el flujo del reto de extremo a extremo (`cy.intercept` cambia el token del primer envío por `fake-low-score`, se resuelve el reto simulado y el segundo envío, con `version: 'v2'`, da `201` y lleva a `/onboarding`); `fake-fail` y `fake-unavailable` muestran sus mensajes; el aviso de privacidad es visible con sus enlaces
- [ ] 12.2 Ejecutar en modo headless primero `npm run test:e2e -- --spec cypress/e2e/registration.cy.ts` y después la suite completa
- [ ] 12.3 Verificar la persistencia y restaurar la base de datos de test
- [ ] 12.4 Documentar los escenarios y resultados en `reports/YYYY-MM-DD-step-12-e2e-cypress.md`

## 13. Actualizar la documentación técnica (MANDATORY)

- [ ] 13.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` y `docs/frontend-standards.md` (verificadores real y falso, salvaguarda en producción, cliente de captcha y carga del script solo en el registro)
- [ ] 13.2 Actualizar `README.md` (variables de reCAPTCHA en backend y frontend, tokens reservados del verificador falso, árbol del proyecto y seguridad) y `CLAUDE.md` (estado: US01_e hecha; queda US01_f; arquitectura del captcha)
- [ ] 13.3 Actualizar `docs/User_Stories_MVP.md` con las decisiones de US01_e (verificador falso por configuración, fallo cerrado con `503 CAPTCHA_UNAVAILABLE`, dos intentos de US01_d al pasar por el reto) y los pendientes antes de publicar (prueba con claves reales si no se hizo y valoración legal del consentimiento)
- [ ] 13.4 Verificar con `openspec validate us01-e-recaptcha-registro` que el cambio es válido antes de archivarlo
