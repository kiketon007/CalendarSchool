# Paso 11: pruebas manuales con curl (2026-11-05)

Cambio: `us-algo-view-b`. El backend no cambia; se comprueba que la lectura del borrador, de la que parte la exportación, entrega los nombres tal cual (el escapado lo hace el frontend al exportar) y que los accesos siguen igual.

## Preparación

- Backend de desarrollo en `:3000` con el lanzador en memoria y un entorno temporal sin las claves de reCAPTCHA (captcha falso), contra `calendarschool`.
- `curl-export.sh`: registra dos colegios por la API, crea en el primero dos cursos, un calendario, dos asignaturas, dos profesores (uno con apellido `O'Brien-Smith`), las asignaciones y un miembro por invitación; genera el borrador y lo lee.

## Resultado: 24 comprobaciones, todas correctas

| Comprobación | Resultado |
| --- | --- |
| Preparación (registros, cursos, calendario, asignaturas, asignaciones, invitación de miembro) | 10 correctas |
| `POST /api/subjects` con el nombre `Lengua \| <b>Taller</b>` | `400` con `INVALID_CHARACTERS` |
| Generar | `202`; la generación termina `COMPLETED` |
| `GET /api/schedule/draft` como `ADMIN` | `200`, `no-store`, 6 entradas |
| Nombre de la asignatura `Lengua/Literatura - 2` y apellido `O'Brien-Smith` | llegan tal cual |
| Como `MEMBER` | `200`, el mismo borrador y los mismos nombres |
| Otro colegio | `200` con `schedule: null` |
| Sin token | `401` |

## Hallazgo

La API no admite `|`, `<`, `*`, `_` ni `` ` `` en los nombres de curso, clase ni asignatura (solo letras, dígitos, espacios, `º`, `ª`, `/` y `-`; el código de la asignatura, letras, dígitos, `/` y `-`) y el apellido de un profesor admite el apóstrofo. El ejemplo `Lengua | <b>Taller</b>` de la ficha no puede darse hoy por la aplicación. El escapado de la exportación sigue siendo necesario como defensa en profundidad (el apóstrofo ya llega a los documentos) y los tests unitarios lo cubren con ese ejemplo.

## Limpieza

- Backend parado; los puertos 3000, 3001 y 4173 quedan libres.
- La base de desarrollo se vació de nuevo (tablas de `public` salvo `_prisma_migrations` y `municipalities`) y los recuentos de las dos bases son idénticos a la línea base.
