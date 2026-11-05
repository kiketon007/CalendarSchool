# Paso 12: pruebas manuales con curl (2026-11-05)

Cambio: `us-algo-confirm`. Se comprueban a mano las cuatro rutas nuevas (`GET /api/schedule/official`, `GET /api/schedule/overview`, `POST /api/schedule/{id}/confirm` y `DELETE /api/schedule/{id}`) con el backend de verdad.

## Preparación

- Backend de desarrollo en `:3000` con el lanzador en memoria y un entorno temporal sin las claves de reCAPTCHA (captcha falso), contra `calendarschool` con la migración `confirm_schedules` aplicada.
- `curl-confirm.sh`: registra dos colegios por la API; en el primero crea dos cursos, un calendario, dos asignaturas, dos profesores, las asignaciones y un miembro por invitación; después recorre el flujo.

## Resultado: 72 comprobaciones, todas correctas (y también en una segunda ejecución)

| Tramo | Comprobaciones |
| --- | --- |
| Sin horarios todavía | `overview` `200` y `no-store` con borrador y oficial `null` y 0 anteriores; `official` `200` con `null` |
| Generar | `202`, la generación termina `COMPLETED`, el resumen trae el borrador `DRAFT` sin confirmación |
| Quién no puede confirmar | `MEMBER` `403` al confirmar y al descartar; sin token `401`; id que no es UUID `404`; id inexistente `404`; el administrador de otro colegio `404`; el borrador sigue siendo borrador |
| Confirmar | `200`, `no-store`, `OFFICIAL`, `confirmedBy` con el nombre del administrador, `confirmedAt` y sin `replacedAt`; confirmar otra vez `409 SCHEDULE_NOT_DRAFT` |
| El oficial | `GET /official` `200`, el confirmado, 6 entradas y quién lo confirmó; ya no hay borrador; el `MEMBER` lo ve (`200`) y ve el resumen; otro colegio no ve nada; la generación sigue apuntando a su horario |
| Sustituir | una generación nueva deja el oficial como estaba y crea un borrador distinto; `DELETE` del oficial `409`; confirmar el segundo `200`, el oficial pasa a ser el segundo y `previousCount` 1; el sustituido no se confirma ni se descarta (`409`) |
| Descartar | otro colegio `404`; el administrador `204` sin cuerpo y `no-store`; el borrador desaparece, el oficial no cambia; la generación se conserva `COMPLETED` con `scheduleId` `null`; descartar otra vez `404` |
| Sin token | `GET official`, `GET overview` y `DELETE` responden `401` |

## Limpieza

- Backend parado; los puertos 3000, 3001 y 4173 no escuchan.
- La base de desarrollo se vació de nuevo (tablas de `public` salvo `_prisma_migrations` y `municipalities`) y los recuentos de las dos bases son idénticos a la línea base del paso 11.
