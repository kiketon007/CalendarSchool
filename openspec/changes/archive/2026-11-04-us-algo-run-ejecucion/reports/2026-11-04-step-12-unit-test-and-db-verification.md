# Informe del paso 12 - Tests unitarios y verificación de la base de datos

- Fecha: 2026-11-04
- Cambio: us-algo-run-ejecucion
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- Recuentos de filas por tabla antes y después, con `psql` dentro del contenedor (`calendarschool-postgres-1`): `calendarschool` (esquema `public`) y `calendarschool_test` (`public` y `test_1` a `test_4`). Antes de la línea base se vaciaron los datos de los esquemas `test_*` (se conservan `_prisma_migrations` y `municipalities`).
- Tests de los módulos cambiados (12.2):
  - Backend: `application/schedule`, `domain/schedule`, `scheduleTables.int`, `prismaGenerationRepository.int`, `prismaScheduleRepository.int`, `infrastructure/aws`, el lanzador en memoria, `config`, `presentation/schedule`, `presentation/http` y `scheduleGeneration.int`.
  - Frontend: `scheduleGenerationService`, `ScheduleGenerationPanel`, `ScheduleReadinessPage` e `i18n`.
  - Infraestructura: los cuatro ficheros de `infrastructure/test`.
- `npm test` completo (tres workspaces, con cobertura), dos veces.
- `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend` (paso 11.2): los tres con código de salida 0.
- `CDK_DEFAULT_ACCOUNT=123456789012 npm run synth -w infrastructure` (paso 8.2): código de salida 0, con los dos bundles (API y worker) y `supabase-ca.crt` junto a cada uno.

## Resultados de los tests

- **Módulos cambiados:** backend 27 ficheros y 459 tests; frontend 4 ficheros y 184 tests; infraestructura 4 ficheros y 66 tests. Sin fallos.
- **Suite completa (segunda ejecución, código de salida 0):**
  - Backend: 229 ficheros, 4492 tests, 0 fallos. Cobertura: 99,56 % de sentencias, 95,38 % de ramas, 99,5 % de funciones y 99,62 % de líneas (mínimo, 90 %).
  - Frontend: 131 ficheros, 4336 tests, 0 fallos. Cobertura: 97,43 % de sentencias, 94,72 % de ramas, 99,22 % de funciones y 97,35 % de líneas (mínimo, 80 %).
  - Infraestructura: 4 ficheros, 66 tests, 0 fallos.
- **Observaciones:**
  - **Primera ejecución de `npm test` con 1 fallo:** `loginAttempts.int.test.ts` («counts only the failed ones…») superó los 5 s de Vitest con la máquina cargada (varios inicios de sesión con Bcrypt seguidos). Pasa en solitario (12 tests) y en la segunda ejecución completa. No toca nada de este cambio.
  - Los tests de plantilla de CDK que miraban `Object.values(findResources('AWS::Lambda::Function'))[0]` se cambiaron para recorrer todas las funciones, porque ahora hay dos (y otra de CDK para las referencias entre regiones).
  - `grantInvoke` de CDK concede también `<arn>:*`; se sustituyó por una declaración explícita sobre el ARN del worker, que es lo que pide el test.
  - **Fallo real encontrado después, al documentar el despliegue (paso 15):** la `ScheduleWorkerFunction` **no tenía permiso `ssm:GetParametersByPath`** y habría fallado al arrancar en producción. El test de plantilla lo daba por bueno porque filtraba las políticas que nombraban al worker, y la de la API también lo nombra (por el permiso de invocarlo). Se rehízo el test para mirar solo las políticas del rol del worker (en rojo), se dio el permiso al worker en `appStack.ts` y los 66 tests de infraestructura pasan otra vez. Ese cambio es posterior a las ejecuciones de arriba, que ya no cubren la infraestructura: se repite en el paso 16.1.
  - Los tests de `ScheduleReadinessPage` que contaban los `h2` o suponían que no había ninguno se actualizaron: el panel de la generación añade el suyo.
  - **El texto del resumen no lleva el número de clases** («Horario borrador generado: N sesiones colocadas»): la respuesta del contrato no lo trae, y se actualizó antes el spec.
- **Honestidad del TDD:** se vio el rojo en `appStack.test.ts` (8 fallos antes de la `ScheduleWorkerFunction`), en el servicio del frontend (el módulo no existía), en la vista de fallos del panel (11 fallos) y en la integración en la página (9 fallos). En cambio, los tests de polling, de estados que no son fallos y de acciones del panel se escribieron antes de implementar, pero el componente se escribió completo de una vez: pasaron 38 de 49 a la primera, y los de `axe` pasaron sin haber fallado antes (el panel ya se había construido accesible).

## Verificación de la base de datos

- **Línea base previa:** 131 líneas. `calendarschool`: `_prisma_migrations` = 17 (incluye la migración nueva, aplicada con `prisma migrate dev` en el paso 2.1) y `municipalities` = 542; el resto de las tablas, 0 filas, incluidas `schedules`, `schedule_entries` y `schedule_generations`. `calendarschool_test`: `public` con 16 migraciones y 542 municipios, y `test_1` a `test_4` con 17 y 542; el resto, 0.
- **Validación posterior:** `diff` de los recuentos sin diferencias, sin necesidad de limpiar (`resetDatabase()` vacía las tablas antes de cada test y los tests de integración no dejan filas).
- **Estado restaurado:** sí, sin acciones adicionales.

## Resultado

- Estado del paso 12: **PASS**
- Incidencias bloqueantes: ninguna.
