# Informe del paso 8 - Tests unitarios y verificación de la base de datos

- Fecha: 2026-10-21
- Cambio: us13-borrar-profesor
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- Tests tocados, en cada tarea de los grupos 2 a 7 (p. ej. `npm exec -w backend -- vitest run --project integration src/professors.int.test.ts`).
- `npm test` (unitarios e integración del backend, frontend e infraestructura, con cobertura).
- `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`.

## Resultados

- Suite completa: backend **2150** tests (133 ficheros; antes 2116 en 132), frontend **1716** (72 ficheros; antes 1668 en 71) e infraestructura **57**. Todos pasan, sin reintentos ni tests inestables.
- Cobertura: backend 99,87 % de sentencias (mínimo 90 %) y frontend 97,15 % (mínimo 80 %).
- `lint`, `typecheck`, `build` y `api:types:check` limpios (el único aviso es el del tamaño de los paquetes de Vite, que ya existía).
- Tests nuevos: caso de uso `DeleteProfessor` (6), repositorio (borrado con y sin tutoría, profesor de otro colegio, ya borrado y borrados simultáneos), ruta `DELETE /api/professors/{id}`, HTTP con la base real (32 en `professors.int.test.ts`, incluido el `PUT` de un curso con un tutor borrado), servicio del frontend, `DeleteProfessorModal` (17, con `axe`) y el borrado en `ProfessorsPage` en los dos anchos (20).
- Se adaptaron dos tests de `ProfessorsPage` de US12 (la celda de «Acciones» lleva ahora «Editar» y «Borrar», y los botones del listado son los de «Borrar»), conservando lo que comprobaban.

## Verificación de la base de datos

- Línea base (`counts.sh`: recuentos de `users`, `schools`, `refresh_tokens`, `rate_limit_attempts`, `access_links`, `municipalities`, `courses`, `classes` y `professors` en `calendarschool.public` y en `public` y `test_1` a `test_4` de `calendarschool_test`): todo a 0 salvo `municipalities` (542), igual que al terminar el cambio anterior.
- Tras los tests: **idéntica** (`diff` sin diferencias). No hizo falta restaurar nada.

## Resultado

- Estado del paso 8: PASA
- Problemas bloqueantes: ninguno
