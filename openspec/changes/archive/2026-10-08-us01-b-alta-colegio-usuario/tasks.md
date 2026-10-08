## 0. Preparación: rama de trabajo (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us01-b-alta-colegio-usuario` desde `main` actualizado (si ya se creó al proponer el cambio, verificar que existe y parte de `main`)
- [x] 0.2 Verificar que la rama actual es `feature/us01-b-alta-colegio-usuario` y que el árbol de trabajo solo contiene los artefactos de este cambio
- [x] 0.3 Comprobar con una prueba mínima que Vitest y `tsc` de ambos workspaces pueden importar un JSON de `test-fixtures/` en la raíz (D4); si no es viable, usar una copia por workspace con un test que verifique que son idénticas

## 1. Contrato: municipio, colegio ya registrado y listado de municipios (D8)

- [x] 1.1 Añadir `SCHOOL_ALREADY_REGISTERED` al enum `ErrorCode` de `docs/api-spec.yml`; verificar que `appError.test.ts` falla porque `ERROR_CODES` no lo tiene
- [x] 1.2 Añadir `SCHOOL_ALREADY_REGISTERED` a `ERROR_CODES` de `backend/src/presentation/http/appError.ts`; verificar que `appError.test.ts` pasa
- [x] 1.3 Añadir `municipalityCode` (obligatorio, `pattern: ^\d{5}$`) a `RegisterRequest` y el municipio (`code`, `name`, `province`) a `RegisteredSchool`; actualizar los ejemplos de la petición y de la respuesta `201`
- [x] 1.4 Ampliar la respuesta `409` de `POST /api/auth/register` con el ejemplo `SCHOOL_ALREADY_REGISTERED` y actualizar la descripción del orden de procesamiento
- [x] 1.5 Añadir el esquema `Municipality` y la operación pública `GET /api/municipalities` (`operationId: listMunicipalities`, `security: []`, `200` con la cabecera `Cache-Control`, `503` y `500`)
- [x] 1.6 Validar el contrato con `npx @redocly/cli lint docs/api-spec.yml` (sin añadirlo como dependencia)
- [x] 1.7 Regenerar los tipos con `npm run api:types -w frontend` y ampliar `frontend/src/api/schema.test.ts` con `expectTypeOf` del municipio y de `SCHOOL_ALREADY_REGISTERED`; verificar `npm run api:types:check -w frontend` y `npm run typecheck --workspaces`
- [x] 1.8 Aplicar el límite de contraseña de 72 bytes al contrato: `maxLength: 72` y descripción en `RegisterRequest.password`, y regenerar los tipos (D5)

## 2. Modelo de datos y migración (D7)

- [x] 2.1 Escribir el test de integración del esquema (`backend/src/infrastructure/prisma/schema.int.test.ts`): unicidad de `users.email`, unicidad de `(schools.normalizedName, schools.municipalityCode)`, clave foránea de `users.schoolId` y de `schools.municipalityCode`; verificar que falla porque no hay tablas
- [x] 2.2 Añadir a `backend/prisma/schema.prisma` los modelos `Municipality`, `School` y `User` y los enums `UserRole` y `UserStatus` según `MODELO_DATOS.md`, con `@@map` a `snake_case`, los índices de D7 y los identificadores `String @id @db.Uuid` sin valor por defecto
- [x] 2.3 Generar la migración con `prisma migrate dev --create-only` y revisar el SQL (nunca aplicar de forma implícita)
- [x] 2.4 Descargar la relación oficial de municipios del INE, filtrar las provincias 03, 12 y 46, comprobar el total (542: 141 + 135 + 266) y generar con un script puntual el `INSERT` de `municipalities`; añadirlo a la migración con un comentario que indique la fuente y la fecha
- [x] 2.5 Aplicar la migración con `npm run db:migrate` y verificar que el test de 2.1 pasa
- [x] 2.6 Actualizar `resetDatabase()` para conservar `municipalities` y ampliar `resetDatabase.int.test.ts`: vacía `schools` y `users` y no toca `municipalities` ni `_prisma_migrations`

## 3. Backend: dominio (TDD)

- [x] 3.1 Escribir `normalizeSchoolName.test.ts` con los ejemplos de la historia («C.E.I.P. Nº 3» y «ceip n 3» → `ceipn3`; «CEIP Lluís Vives» → `ceiplluisvives`; `ñ`, `ç`, `·`, NFD) y verificar que falla
- [x] 3.2 Implementar `normalizeSchoolName` en `domain/school` (NFD, quitar marcas, minúsculas, solo `[a-z0-9]`) y verificar que pasa
- [x] 3.3 Definir las entidades `School` y `User`, los tipos `UserRole` y `UserStatus` y los errores de dominio `EmailAlreadyRegistered` y `SchoolAlreadyRegistered`
- [x] 3.4 Definir el puerto `RegistrationRepository` (`existsUserByEmail`, `existsSchool`, `createSchoolWithAdmin`) en `domain/registration`

## 4. Backend: validación del payload (TDD, D4)

- [x] 4.1 Crear `test-fixtures/registration-fields.json` con la tabla de ejemplos válidos e inválidos de cada campo (nombre del colegio, municipio, nombre, apellidos, email, contraseña), incluyendo NFD, `º`, `localhost`, IP, contraseñas sin mayúscula/minúscula/número/símbolo y los límites 2/150, 100, 320 y 8 caracteres a 72 bytes
- [x] 4.2 Escribir `registerSchoolRequest.test.ts` que recorre la tabla y comprueba el `{ field, code }` esperado por caso, más: un error por campo inválido sin abortar en el primero, `trim()`, minúsculas del email y NFC; verificar que falla
- [x] 4.3 Implementar el esquema Zod en `application/registration` y su traducción a `ValidationError` con `details`; verificar que pasa
- [x] 4.4 Ampliar `appError.ts` y `errorHandler.ts` para serializar `ValidationError` como `400 VALIDATION_ERROR` con `details` (tests en `appError.test.ts` y `errorHandler.test.ts`, escritos primero)
- [x] 4.5 Aplicar el límite de 72 bytes en UTF-8 (D5): sustituir en la tabla compartida los casos de 128 por casos de 72/73 bytes (con ASCII y con acentos), ver fallar `registerSchoolRequest.test.ts` y medir la contraseña en bytes con `TextEncoder`

## 5. Backend: caso de uso `RegisterSchool` (TDD, D1, D2, D9, D10)

- [x] 5.1 Definir los puertos `PasswordHasher`, `IdGenerator`, `CaptchaVerifier` y `MunicipalityRepository`, y ampliar `ApplicationLogger` con `info`
- [x] 5.2 Escribir `registerSchool.test.ts` con dobles: orden captcha → validación → email → colegio → alta; el captcha rechazado no valida ni consulta la base; alta correcta (rol `ADMIN`, estado `ACTIVE`, email normalizado, hash, UUIDv7 del generador, `normalizedName`); `EmailAlreadyRegistered` antes que `SchoolAlreadyRegistered`; municipio inexistente → `INVALID_FORMAT`; eventos `USER_REGISTER_SUCCESS`, `USER_REGISTER_FAILED` y `USER_REGISTER_DUPLICATE` con `reason`, email enmascarado, IP y user agent, y sin contraseña; verificar que falla
- [x] 5.3 Implementar `maskEmail` (con su test) y `RegisterSchool`; verificar que pasa
- [x] 5.4 Escribir `listMunicipalities.test.ts` e implementar `ListMunicipalities`

## 6. Backend: infraestructura (TDD, D2, D5, D6, D10)

- [x] 6.1 Añadir las dependencias `@node-rs/bcrypt` y `uuid` al workspace `backend` y comprobar si piden aprobación en `allowScripts`
- [x] 6.2 Escribir y pasar `bcryptPasswordHasher.test.ts` (prefijo `$2` y `$12$`, verificación, hashes distintos para la misma contraseña) y `uuidV7IdGenerator.test.ts` (versión 7, orden temporal)
- [x] 6.3 Escribir `prismaRegistrationRepository.int.test.ts` con Prisma real: alta atómica; reversión si falla el usuario; `existsUserByEmail` y `existsSchool` por nombre normalizado y municipio; dos altas simultáneas con el mismo email y con el mismo colegio (una creada, la otra `EmailAlreadyRegistered` o `SchoolAlreadyRegistered`, sin restos); verificar que falla
- [x] 6.4 Implementar `PrismaRegistrationRepository` con `$transaction` y el mapeo de `P2002` por campo; verificar que pasa
- [x] 6.5 Escribir e implementar `PrismaMunicipalityRepository` (listado ordenado por nombre, comprobación de existencia) con su test de integración
- [x] 6.6 Implementar el adaptador provisional `acceptAllCaptchaVerifier` con su test, y configurar `redact` de pino (`password`, `*.password`, `passwordHash`, `*.passwordHash`) con un test en `logger.test.ts` que comprueba que no aparecen en la salida
- [x] 6.7 Escribir en `bcryptPasswordHasher.test.ts` que una contraseña de más de 72 bytes se rechaza y no se trunca, y pasar `rejectLongPasswords: true` en `BcryptPasswordHasher` (D5)

## 7. Backend: presentación y composición (TDD)

- [x] 7.1 Escribir `app.test.ts` (Supertest con dobles) para `POST /api/auth/register`: `201`, `400` con `details`, `409` de email y de colegio, JSON inválido, `413`, `415`, y que la respuesta nunca incluye la contraseña ni su hash; verificar que falla
- [x] 7.2 Implementar `presentation/auth/authRouter.ts` (IP y user agent de la petición) y montarlo en `api` en `app.ts`, antes de `notFoundHandler`; ampliar `AppDependencies`
- [x] 7.3 Escribir e implementar `presentation/municipality/municipalityRouter.ts` (`Cache-Control: public, max-age=86400`) y su test (`200`, cabecera, ordenación, `503`)
- [x] 7.4 Cablear en `server.ts` las implementaciones (repositorios, hasher, generador de ids, verificador de captcha) sin añadir lógica
- [x] 7.5 Escribir `registration.int.test.ts` (Supertest + Prisma real): registro correcto de extremo a extremo, ambos `409`, municipio inválido, dos peticiones simultáneas y las inyecciones SQL y XSS rechazadas con las tablas intactas
- [x] 7.6 Escribir los tests de la traducción de fallos de conexión (D12): `DatabaseUnavailable`, la función de traducción, los repositorios Prisma con una base inaccesible y el manejador central (`503` y causa en el log, nunca en la respuesta); verificar que fallan
- [x] 7.7 Implementar `DatabaseUnavailable`, la traducción en `PrismaRegistrationRepository` y `PrismaMunicipalityRepository` y su correspondencia en `errorHandler.ts`; verificar que pasan

## 8. Frontend: validación y servicios (TDD, D4, D11)

- [x] 8.1 Escribir `registrationValidation.test.ts` que recorre `test-fixtures/registration-fields.json` y comprueba el mismo `{ field, code }` que el backend; verificar que falla
- [x] 8.2 Implementar la validación del formulario (la contraseña se mide en bytes UTF-8, como en el backend) y verificar que pasa
- [x] 8.3 Escribir e implementar `services/registrationService.ts` (registro y listado de municipios, con los tipos generados) con tests de éxito, `400`, `409` de email y colegio, `500` y fallo de red
- [x] 8.4 Añadir las claves i18n en `es.json` y `en.json` (etiquetas, errores `registration.errors.<campo>.<código>`, `409`, mensaje de confirmación y errores genéricos); `locales.test.ts` debe seguir pasando

## 9. Frontend: formulario de registro (TDD, D11)

- [x] 9.1 Escribir el test del buscador de municipios: filtra sin acentos ni mayúsculas, muestra provincia, solo da por seleccionado un municipio de la lista y gestiona el fallo de carga con reintento; verificar que falla
- [x] 9.2 Implementar el componente del buscador de municipios (combobox accesible) y verificar que pasa
- [x] 9.3 Escribir `RegisterPage.test.tsx`: errores inline bajo cada campo con `aria-invalid`, `aria-describedby` y `role="alert"`; no se envía con errores; envío con el token fijo; `201` sustituye el formulario por la confirmación; `409` de email con enlace al login; `409` de colegio con el mensaje de invitación; `400` bajo cada campo; error genérico conservando los datos salvo la contraseña; verificar que falla
- [x] 9.4 Implementar `RegisterPage` y sus componentes, y añadir la ruta `/registro` en `App.tsx` (con su test en `App.test.tsx`)
- [x] 9.5 Añadir una comprobación de accesibilidad WCAG 2.1 AA de la página (axe) en los tests y corregir lo que señale

## 10. E2E: limpieza de datos (TDD)

- [x] 10.1 Ampliar los tests de `scripts/e2e.mjs` (o de la función de limpieza extraída): vacía las tablas salvo `_prisma_migrations` y `municipalities`, rechaza bases que no terminan en `_test` sin borrar nada, y no limpia al terminar; verificar que fallan
- [x] 10.2 Implementar la limpieza en `scripts/e2e.mjs` tras migrar y antes de arrancar el backend, con la misma salvaguarda que `resetDatabase()`; verificar que pasan

## 11. Revisar y actualizar los tests unitarios existentes (MANDATORY)

- [x] 11.1 Revisar los tests existentes afectados (`app.test.ts`, `appError.test.ts`, `errorHandler.test.ts`, `logger.test.ts`, `resetDatabase.int.test.ts`, `schema.test.ts`, `App.test.tsx`, `locales.test.ts`) y actualizarlos al nuevo comportamiento
- [x] 11.2 Verificar que la cobertura supera el 90 % en backend y el 80 % en frontend, y que `server.ts` y `main.tsx` siguen sin lógica

## 12. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 Capturar el estado previo de `calendarschool_test` (filas de `municipalities`, `schools` y `users`)
- [x] 12.2 Ejecutar los tests dirigidos de los módulos modificados
- [x] 12.3 Ejecutar `npm test`, `npm run lint` y `npm run typecheck --workspaces`
- [x] 12.4 Verificar el estado posterior de la base y restaurarlo si hace falta (`municipalities` intacta, `schools` y `users` vacías)
- [x] 12.5 Crear el informe `reports/YYYY-MM-DD-step-12-unit-test-and-db-verification.md` en la carpeta del cambio, con comandos, resultados, comparación previa/posterior y limpieza
- [x] 12.6 Marcar el paso como completado solo si los tests pasan y el informe existe

## 13. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 13.1 Arrancar el backend contra la base de desarrollo migrada y anotar el estado de `schools` y `users`
- [x] 13.2 `GET /api/municipalities`: `200`, 542 elementos, ordenados, con `Cache-Control`
- [x] 13.3 `POST /api/auth/register` con datos válidos: `201`; comprobar en la base el colegio, el usuario `ADMIN`/`ACTIVE`, el hash Bcrypt y el email normalizado
- [x] 13.4 Repetir con el mismo email: `409 EMAIL_ALREADY_REGISTERED`; con otro email y el mismo colegio escrito de otra forma: `409 SCHOOL_ALREADY_REGISTERED`
- [x] 13.5 Probar errores: campos inválidos con varios `details`, municipio inexistente, JSON mal formado, cuerpo demasiado grande y tipo de contenido no soportado
- [x] 13.6 Verificar que ninguna línea de log contiene la contraseña y que el email sale enmascarado
- [x] 13.7 Borrar el colegio y el usuario creados y verificar que la base coincide con el estado de 13.1
- [x] 13.8 Documentar los comandos y respuestas en `reports/YYYY-MM-DD-step-13-curl.md`

## 14. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 14.1 Escribir `frontend/cypress/e2e/registration.cy.ts`: registro correcto con confirmación, errores inline de cada campo, municipio sin elegir, email ya registrado con enlace al login y colegio ya registrado
- [x] 14.2 Ejecutar la spec y la suite completa en modo headless con `npm run test:e2e`
- [x] 14.3 Verificar en la base que el alta persiste (colegio y usuario) y que la siguiente ejecución parte de cero
- [x] 14.4 Documentar escenarios y resultados en `reports/YYYY-MM-DD-step-14-e2e.md`

## 15. Actualizar la documentación técnica (MANDATORY)

- [x] 15.1 Actualizar `docs/Modelo_de_Datos/MODELO_DATOS.md`: `municipalities`, `schools` y `users` pasan a estar implementadas en `schema.prisma`, y ajustar su nota de estado
- [x] 15.2 Confirmar que `docs/api-spec.yml` y los tipos generados están alineados con el backend
- [x] 15.3 Actualizar `CLAUDE.md` y `README.md` en lo que cambie (nuevas features del backend, ruta `/registro`, limpieza de datos del E2E, dependencias nuevas)
- [x] 15.4 Ejecutar la skill `update-docs` y aplicar lo que identifique
- [x] 15.5 Verificar `openspec validate us01-b-alta-colegio-usuario` y `npm run lint`
