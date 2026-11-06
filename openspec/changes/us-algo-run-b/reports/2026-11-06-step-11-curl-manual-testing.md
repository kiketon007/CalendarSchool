# Paso 11: pruebas manuales con curl (2026-11-06)

Cambio: `us-algo-run-b`. Se comprueba a mano, contra el backend de verdad, la mejora con las preferencias y su puntuación.

## Preparación

- Backend de desarrollo en `:3000` (`node --env-file=<entorno temporal> --import tsx src/server.ts`) con el lanzador en memoria y un entorno temporal **sin** las claves de reCAPTCHA (verificador falso), contra `calendarschool`, ya con la migración `schedule_score`. Los secretos del entorno no se muestran en ningún sitio.
- El guion `curl-score.sh` registra un colegio por la API y crea un curso con una clase, un calendario de 3 sesiones al día, la asignatura Lengua (5 sesiones a la semana) con las franjas preferidas «última sesión de lunes, miércoles y viernes», una profesora, su asignación y un miembro por invitación.

## Resultado: 47 comprobaciones, todas correctas a la primera

| Tramo | Comprobaciones |
| --- | --- |
| Generar sin cuerpo (11.1) | `202` con `improve` `true`, `phase` `SEARCHING`, `score` `null`, `improvementCancelled` `false` y sin `cancelRequested`; la generación termina `COMPLETED` con `improve` `true`, `preferredTotal` 5, `initialTotal` 54 y `total` menor que `initialTotal`; `GET /draft` lleva exactamente el mismo `score` y 5 entradas; el `overview` lo repite |
| Sin mejorar (11.2) | `{ "improve": false }`: `202`, `improve` `false`, `COMPLETED` con `total` igual a `initialTotal` (54: el del primer horario) |
| Cuerpos inválidos | `{ "improve": "si" }` y `{ "other": true }`: `400 VALIDATION_ERROR` con el campo `improve` / `other` |
| Roles | `MEMBER`: `403` con un cuerpo válido y con uno inválido (el rol se comprueba antes); sin token: `401` en `POST` y en `GET /generate`; el `MEMBER` lee el borrador con su `score` |
| Confirmar | `POST /{id}/confirm`: `200` con el mismo `score`; `GET /official` y `overview.official` lo repiten y el borrador ya no existe |
| Anteriores | tras generar y confirmar otra vez, `GET /previous` trae un anterior con el mismo `score`, y `GET /{id}` también |

## Limpieza (11.3)

- Backend parado (proceso terminado) y el puerto 3000 queda libre (comprobado con `Get-NetTCPConnection`).
- Antes de limpiar había en la base de desarrollo, además de lo fijo, 2 horarios, 10 entradas y 3 generaciones de la prueba. La base de desarrollo se vació (tablas de `public` salvo `_prisma_migrations` y `municipalities`) y los recuentos de las dos bases son idénticos a la línea base del paso 10.
