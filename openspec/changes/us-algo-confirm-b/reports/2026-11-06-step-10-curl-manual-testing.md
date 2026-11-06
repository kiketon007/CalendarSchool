# Paso 10: pruebas manuales con curl (2026-11-06)

Cambio: `us-algo-confirm-b`. Se comprueban a mano las dos rutas nuevas (`GET /api/schedule/previous` y `GET /api/schedule/{id}`) con el backend de verdad.

## Preparación

- Backend de desarrollo en `:3000` (`node --env-file=<entorno temporal> --import tsx src/server.ts`) con el lanzador en memoria y un entorno temporal sin las claves de reCAPTCHA (captcha falso), contra `calendarschool`. Este cambio no tiene migración.
- `curl-previous.sh`: registra dos colegios por la API; en el primero crea un curso con dos clases, un calendario, una asignatura, una profesora, las asignaciones y un miembro por invitación; después genera y confirma tres veces seguidas.

## Resultado: 51 comprobaciones, todas correctas

La primera ejecución dio 50 correctas y 1 fallo, que era una expectativa mal escrita del propio script (esperaba 6 entradas, copiadas del paso anterior; con Lengua a 2 sesiones y dos clases son 4). Se corrigió el script y se repitió entero: 51 de 51.

| Tramo | Comprobaciones |
| --- | --- |
| Lista sin horarios | `GET /previous` `200`, `no-store` y lista vacía; con un solo oficial vigente sigue vacía |
| Lista tras sustituir | `200`; un anterior, el primero confirmado, `OFFICIAL`, con quién lo confirmó y `replacedAt`, y sin `entries` (solo la cabecera) |
| Tres confirmaciones | dos anteriores, el sustituido más recientemente primero; el vigente no sale; `overview` da `previousCount` 2 |
| Un oficial por id | sustituido: `200`, `no-store`, su id, `OFFICIAL`, `replacedAt` con fecha, 4 entradas y quién lo confirmó; vigente: `200` con `replacedAt` `null` |
| Ids que no valen | el del borrador, uno inexistente y `no-es-un-uuid` dan `404 NOT_FOUND` |
| Miembro | `MEMBER` lee la lista (dos anteriores) y un anterior por id: `200` |
| Otro colegio | su lista sale vacía y pedir el id de un oficial del colegio A da `404` |
| Sin token | `GET /previous` y `GET /{id}` dan `401` |
| Rutas literales | `GET /draft`, `/official`, `/overview` y `/readiness` responden `200`: no caen en `/:id` |

## Limpieza

- Backend parado (proceso terminado) y el puerto 3000 queda libre.
- La base de desarrollo se vació (tablas de `public` salvo `_prisma_migrations` y `municipalities`) y los recuentos de las dos bases son idénticos a la línea base del paso 9. Antes de vaciarla se vieron los datos de la prueba (2 calendarios, 2 cursos, 4 clases…), que ya no están.
