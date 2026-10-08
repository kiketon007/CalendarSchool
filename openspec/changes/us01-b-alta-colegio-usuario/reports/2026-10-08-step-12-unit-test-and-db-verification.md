# Informe del paso 12 - Tests y verificación de la base de datos

- Fecha: 2026-10-08
- Cambio: us01-b-alta-colegio-usuario
- Agente: Claude (Sonnet 5.5)

## Comandos ejecutados

- Estado de la base de datos antes y después (script que cuenta las filas de cada tabla de todos los esquemas de `calendarschool` y `calendarschool_test` con `docker exec … psql`)
- `npm exec -w backend -- vitest run src/domain src/application src/presentation src/infrastructure src/registration.int.test.ts src/app.test.ts src/app.int.test.ts test/support`
- `npm exec -w frontend -- vitest run src/validation src/services src/components src/hooks src/pages src/App.test.tsx src/api src/i18n`
- `npm test` (backend: unitarios + integración con cobertura; frontend con cobertura)
- `npm run lint`
- `npm run typecheck --workspaces`
- `npm run api:types:check -w frontend`
- `npm run build`
- `openspec validate us01-b-alta-colegio-usuario`

## Resultados de los tests

| Ejecución | Ficheros | Tests | Fallos | Omitidos |
|---|---|---|---|---|
| Backend dirigido a los módulos modificados | 31 | 310 | 0 | 0 |
| Frontend dirigido a los módulos modificados | 10 | 175 | 0 | 0 |
| Backend completo (`npm test`) | 32 | 312 | 0 | 0 |
| Frontend completo (`npm test`) | 10 | 175 | 0 | 0 |

- Duración: backend 18,5 s; frontend 38,3 s.
- Cobertura del backend (umbral 90 %): sentencias 100 %, ramas 99,05 %, funciones 100 %, líneas 100 %.
- Cobertura del frontend (umbral 80 %): sentencias 100 %, ramas 98,06 %, funciones 100 %, líneas 100 %.
- `lint`, `typecheck`, `api:types:check` y `build`: código de salida 0.
- `openspec validate`: el cambio es válido.
- Notas: sin tests inestables observados. Los tests de integración de altas simultáneas (mismo email y mismo colegio) se repitieron 3 veces en el grupo 7 sin fallos. La batería completa supera los 120 s de espera por defecto de la herramienta, por lo que se ejecutó en segundo plano.

## Verificación del estado de la base de datos

Se compararon las filas de todas las tablas de las dos bases antes y después de ejecutar los tests.

- Línea base previa:
  - `calendarschool` (desarrollo): `public._prisma_migrations` = 2, `public.municipalities` = 542, `public.schools` = 0, `public.users` = 0.
  - `calendarschool_test`: `public.*` con los mismos valores que desarrollo; los esquemas de worker `test_1` a `test_4` con los mismos valores (2, 542, 0, 0).
- Validación posterior:
  - Las 26 líneas del recuento son idénticas a la línea base (`diff` sin diferencias).
- Estado restaurado: Sí. No hizo falta restaurar nada: los tests de integración solo escriben en los esquemas de worker `test_<n>`, que el `globalSetup` elimina y migra de nuevo en cada ejecución, y `resetDatabase()` vacía `schools` y `users` antes de cada test conservando `municipalities` y `_prisma_migrations`. Los esquemas `public` de `calendarschool` y `calendarschool_test` no se tocan.
- Acciones de restauración: ninguna.

## Resultado

- Estado del paso 12: CORRECTO
- Incidencias bloqueantes: ninguna
