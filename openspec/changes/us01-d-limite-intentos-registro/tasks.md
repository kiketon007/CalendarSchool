## 0. Preparación: rama de trabajo (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us01-d-limite-intentos-registro` desde `main` actualizado (con la PR #19 de US01_c ya fusionada)
- [x] 0.2 Verificar que la rama actual es `feature/us01-d-limite-intentos-registro` y que el árbol de trabajo solo contiene los artefactos de este cambio

## 1. Contrato: descripción del límite (D9)

- [x] 1.1 Indicar en la descripción del `429` de `POST /api/auth/register` en `docs/api-spec.yml` el límite de 5 intentos por IP cada 15 minutos, contando todos los intentos con cuerpo JSON válido
- [x] 1.2 Validar el contrato con `npx @redocly/cli lint docs/api-spec.yml` (sin añadirlo como dependencia) y comprobar que no aparecen avisos nuevos
- [x] 1.3 Regenerar los tipos con `npm run api:types -w frontend` (desde la raíz) y verificar `npm run api:types:check -w frontend` y `npm run typecheck --workspaces`

## 2. Configuración: proxies de confianza y máximo de intentos (TDD, D5 y D6)

- [x] 2.1 Ampliar `config.test.ts` con los escenarios de `TRUST_PROXY_HOPS` y `REGISTRATION_ATTEMPTS_MAX` (por defecto, válidos e inválidos: `-1`, `abc`, `0`, `2.5`); verificar que falla
- [x] 2.2 Añadir ambas variables al esquema Zod y a `AppConfig` (`trustProxyHops`, `registrationAttemptsMax`); verificar que pasa
- [x] 2.3 Documentarlas comentadas en `backend/.env.example` con su valor por defecto y su propósito; verificar que el test de la plantilla sigue pasando
- [x] 2.4 Definir `REGISTRATION_ATTEMPTS_MAX=1000` en el entorno explícito del backend de `scripts/e2e.mjs`, con un comentario que explique por qué

## 3. Modelo de datos y migración (D1)

- [x] 3.1 Escribir el test de integración `rateLimitAttemptsSchema.int.test.ts`: se guardan clave e instante con identificador UUID, y varias filas pueden compartir clave; verificar que falla porque no existe la tabla
- [x] 3.2 Añadir el modelo `RateLimitAttempt` a `backend/prisma/schema.prisma` (`@@map("rate_limit_attempts")`, `snake_case`, `key VARCHAR(200)`, `attemptedAt TIMESTAMPTZ`, índice `(key, attemptedAt)`)
- [x] 3.3 Generar la migración con `prisma migrate dev --create-only`, revisar el SQL (nunca aplicar de forma implícita) y regenerar el cliente Prisma
- [x] 3.4 Aplicar la migración con `npm run db:migrate` y verificar que el test de 3.1 pasa
- [x] 3.5 Ampliar `resetDatabase.int.test.ts` y `e2eData.int.test.ts` para comprobar que `rate_limit_attempts` se vacía y que las listas de tablas conservadas siguen coincidiendo

## 4. Backend: dominio (TDD, D4)

- [x] 4.1 Escribir `tooManyAttempts.test.ts`: error con nombre y mensaje estables y `retryAfterSeconds`; verificar que falla, implementarlo en `domain/attempts` y verificar que pasa
- [x] 4.2 Definir el puerto `AttemptRepository` (`register(key, now, windowMs, maxAttempts)`, que devuelve si se aceptó y, si no, el instante en que se podrá reintentar) en `domain/attempts`

## 5. Backend: aplicación (TDD, D3 y D4)

- [x] 5.1 Escribir `attemptLimiter.test.ts` con un repositorio simulado y un reloj inyectado: acepta dentro del máximo, lanza `TooManyAttempts` al superarlo, calcula `retryAfterSeconds` redondeando hacia arriba y como mínimo 1, y pasa la política (máximo y ventana de 15 minutos) al repositorio; verificar que falla
- [x] 5.2 Implementar `AttemptLimiter.consume(key)` en `application/attempts` y verificar que pasa
- [x] 5.3 Escribir `limitRegistrationAttempts.test.ts`: clave `register:<ip>` (`register:unknown` sin IP), propaga `TooManyAttempts` y registra `USER_REGISTER_RATE_LIMITED` a nivel `warn` con `ip`, `user_agent` y `retry_after`, sin email; no registra nada si se acepta; propaga `DatabaseUnavailable` sin evento; verificar que falla
- [x] 5.4 Implementar `LimitRegistrationAttempts` en `application/registration` y verificar que pasa

## 6. Backend: infraestructura (TDD, D2)

- [x] 6.1 Escribir `prismaAttemptRepository.int.test.ts` (Prisma real): acepta hasta el máximo, rechaza sin insertar, ventana deslizante con instantes inyectados, claves independientes, borra solo los intentos caducados de esa clave y traduce los fallos de conexión a `DatabaseUnavailable`; verificar que falla
- [x] 6.2 Implementar `PrismaAttemptRepository` con una transacción que toma `pg_advisory_xact_lock(hashtextextended(key, 0))`, borra los caducados, cuenta, obtiene el más antiguo e inserta solo si se acepta; verificar que pasa
- [x] 6.3 Añadir al test de integración los escenarios de concurrencia: 10 intentos simultáneos con máximo 5 aceptan exactamente 5 y dejan 5 filas; dos repositorios sobre clientes Prisma distintos comparten el contador

## 7. Backend: presentación (TDD, D5, D7 y D8)

- [x] 7.1 Ampliar `errorHandler.test.ts`: `TooManyAttempts` responde `429 TOO_MANY_REQUESTS` con `Retry-After` en el formato de error común, sin revelar la clave ni el número de intentos; verificar que falla, implementarlo en `errorHandler.ts` y verificar que pasa
- [x] 7.2 Ampliar `registerRoute.test.ts` (Supertest con dobles): el límite se consulta con la IP y el user agent antes que el caso de uso; con `429` no se llama a `registerSchool` ni se fija cookie; un cuerpo que no es JSON responde `400` sin consultar el límite; `503` del límite sin llamar al registro; verificar que falla
- [x] 7.3 Montar el middleware del límite antes del handler de `/register` en `authRouter` y añadir `limitRegistrationAttempts` a `AppDependencies` y a `defaultDependencies`; verificar que pasa
- [x] 7.4 Escribir los tests de `trust proxy` en `app.test.ts`: con `0` se ignora `X-Forwarded-For`; con `1` se toma la última dirección y el cliente no puede elegir su IP cambiando la primera; verificar que falla
- [x] 7.5 Aplicar `app.set('trust proxy', trustProxyHops)` en `createApp` (nueva dependencia `trustProxyHops`, por defecto `0`) y verificar que pasa
- [x] 7.6 Cablear en `server.ts` el `PrismaAttemptRepository`, un `AttemptLimiter` con la política del registro (`registrationAttemptsMax`, 15 minutos) y `LimitRegistrationAttempts`, y `trustProxyHops` (sin lógica nueva en `server.ts`); ampliar `test/support/realApp.ts` con el máximo y los proxies como opciones
- [x] 7.7 Escribir el test de integración de extremo a extremo (`registrationAttempts.int.test.ts`, sobre `realApp`): 5 registros desde la misma IP (mezclando `201`, `400` y `409`) y el sexto `429` con `Retry-After` sin crear nada ni fijar cookie; otra IP no está limitada (con `trust proxy` 1 y `X-Forwarded-For`); reintento tras la ventana con un reloj inyectado; evento `USER_REGISTER_RATE_LIMITED` sin email ni contraseña en el log

## 8. Frontend: servicio y formulario (TDD, D9)

- [ ] 8.1 Ampliar `registrationService.test.ts`: `429 TOO_MANY_REQUESTS` devuelve `tooManyRequests` con `retryAfterSeconds` leído de `Retry-After`, y `undefined` si falta o no es un entero válido; verificar que falla
- [ ] 8.2 Añadir el resultado `tooManyRequests` a `registrationService` y verificar que pasa
- [ ] 8.3 Añadir las claves i18n del aviso (con minutos y sin ellos) a `es.json` y `en.json`; verificar que `locales.test.ts` pasa
- [ ] 8.4 Ampliar `RegisterPage.test.tsx`: aviso con `role="alert"` y los minutos redondeados hacia arriba (`840` → 14, `20` → 1), variante sin número, conserva los datos salvo la contraseña y no muestra el mensaje genérico; añadir el caso al test de accesibilidad; verificar que falla
- [ ] 8.5 Mostrar el aviso en `RegisterPage` y verificar que pasa

## 9. Revisar y actualizar los tests unitarios existentes (MANDATORY)

- [ ] 9.1 Revisar los tests de backend y frontend que asumen que el `429` es un error inesperado o que el registro no tiene límite, y ajustarlos
- [ ] 9.2 Comprobar que los tests de integración que registran varias veces desde la misma IP no superan el límite por defecto en un mismo test

## 10. Ejecutar tests y verificar el estado de la base de datos (MANDATORY - AGENT MUST EXECUTE)

- [ ] 10.1 Levantar PostgreSQL (`docker compose up -d`) y capturar la línea base de `calendarschool` y `calendarschool_test` (filas de `users`, `schools`, `refresh_tokens`, `rate_limit_attempts` y `municipalities` por esquema)
- [ ] 10.2 Ejecutar los tests de los módulos modificados (`npm exec -w backend -- vitest run <ruta>` y `npm exec -w frontend -- vitest run <ruta>`)
- [ ] 10.3 Ejecutar `npm test`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`, y verificar las coberturas (90 % backend, 80 % frontend)
- [ ] 10.4 Verificar el estado posterior de la base de datos (mismos indicadores que en 10.1) y restaurarlo si hace falta
- [ ] 10.5 Crear el informe `reports/YYYY-MM-DD-step-10-unit-test-and-db-verification.md` en la carpeta del cambio, con el formato de `docs/openspec-tasks-mandatory-steps.md`

## 11. Pruebas manuales de endpoints con curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 11.1 Arrancar el backend de desarrollo con la configuración por defecto (máximo 5, `TRUST_PROXY_HOPS=0`) y comprobar la conexión a la base de datos
- [ ] 11.2 Hacer 5 `POST /api/auth/register` desde la misma IP (mezclando un alta correcta, un `400` y un `409`) y verificar que el sexto responde `429` con `TOO_MANY_REQUESTS` y `Retry-After`, sin `Set-Cookie`
- [ ] 11.3 Verificar en la base de datos que el sexto intento no se guardó en `rate_limit_attempts` y que no creó colegio, usuario ni refresh token
- [ ] 11.4 Verificar que un cuerpo que no es JSON responde `400 INVALID_JSON` sin crear un intento, y que el log contiene `USER_REGISTER_RATE_LIMITED` sin email ni contraseña
- [ ] 11.5 Arrancar el backend con `TRUST_PROXY_HOPS=1` y verificar que otra IP en `X-Forwarded-For` no está limitada y que cambiar la primera dirección no evita el bloqueo
- [ ] 11.6 Restaurar la base de datos de desarrollo (borrar los colegios, usuarios, refresh tokens e intentos creados) y verificar que coincide con la línea base
- [ ] 11.7 Documentar los comandos y respuestas en `reports/YYYY-MM-DD-step-11-curl-manual-testing.md`

## 12. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [ ] 12.1 Añadir a `frontend/cypress/e2e/registration.cy.ts` el aviso de demasiados intentos simulando el `429` con `cy.intercept` (con y sin `Retry-After`): mensaje con `role="alert"`, datos conservados salvo la contraseña
- [ ] 12.2 Ejecutar con `npm run test:e2e -- --spec cypress/e2e/registration.cy.ts` y después la suite completa con `npm run test:e2e`, en modo headless; comprobar que ninguna spec recibe un `429` real
- [ ] 12.3 Verificar la persistencia y restaurar la base de datos de test
- [ ] 12.4 Documentar los escenarios y resultados en `reports/YYYY-MM-DD-step-12-e2e-cypress.md`

## 13. Actualizar la documentación técnica (MANDATORY)

- [ ] 13.1 Aplicar la skill `update-docs`: `docs/Modelo_de_Datos/MODELO_DATOS.md` (tabla `rate_limit_attempts` y nota de estado) y los estándares que correspondan (`docs/backend-standards.md`: limitador reutilizable y `trust proxy`)
- [ ] 13.2 Actualizar `README.md` (variables `TRUST_PROXY_HOPS` y `REGISTRATION_ATTEMPTS_MAX`, árbol del proyecto y seguridad) y `CLAUDE.md` (estado: US01_d hecha; quedan US01_e y US01_f; arquitectura del limitador)
- [ ] 13.3 Actualizar `docs/User_Stories_MVP.md` con las decisiones de US01_d (contador en PostgreSQL, solo IP, `TRUST_PROXY_HOPS`, el `429` no cuenta) y la tarea pendiente para `despliegue-aws` (cabecera secreta entre CloudFront y API Gateway)
- [ ] 13.4 Verificar con `openspec validate us01-d-limite-intentos-registro` que el cambio es válido antes de archivarlo
