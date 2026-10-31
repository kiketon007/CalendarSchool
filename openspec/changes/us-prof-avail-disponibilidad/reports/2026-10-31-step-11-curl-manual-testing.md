# Informe del paso 11 - Pruebas manuales con curl

- Fecha: 2026-10-31
- Cambio: us-prof-avail-disponibilidad
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local (`node --import tsx src/server.ts`, puerto 3000) con la plantilla de desarrollo, captcha falso y los límites de intentos a 1000, contra la base de desarrollo `calendarschool` con la migración `add_professor_unavailabilities` aplicada.
- Un script (`curlAvail.sh`, en el directorio temporal de la sesión, fuera del repositorio) registra dos colegios (A y B) y recorre los casos de abajo con `curl` y `jq`. No imprime contraseñas, tokens ni cookies. Los nombres van sin acentos, porque el `curl` de Git Bash no envía UTF-8 correctamente.
- Resultado global: **34 comprobaciones, 0 fallos.**

## Comandos y resultados

Todas las rutas son `http://localhost:3000/api/...`, con `Authorization: Bearer <token>` salvo donde se dice.

- **Lectura vacía:** `GET /professors/{id}/availability` de un profesor nuevo responde `200` con `unavailable: []`, el `professorId` y `Cache-Control: no-store`.
- **Escritura y normalización** (`PUT`):
  - tres tramos desordenados (el miércoles de 09:00 a 14:00, el lunes de 09:45 a 10:30 y el lunes de 09:17 a 09:45) quedan en dos, ordenados y unidos: lunes 09:17–10:30 y miércoles 09:00–14:00;
  - el `GET` devuelve lo mismo;
  - el mismo estado escrito de otra forma (el lunes partido en dos tramos que se tocan) responde `200` igual y sin cambios;
  - otro estado reemplaza todo, y dos tramos solapados el martes se unen en 10:00–12:00;
  - una lista vacía deja al profesor disponible siempre.
- **Recuento:** con dos tramos guardados, `GET /professors` da `unavailableCount` 2 para ese profesor y 0 para el otro; la lectura y la edición de un profesor (`PUT`) lo conservan, y un profesor recién creado lleva 0.
- **Validación (`400 VALIDATION_ERROR`):**
  - Un cuerpo con día 6, hora «25:00», fin anterior al inicio y un tramo sin día ni fin da `OUT_OF_RANGE`, `INVALID_FORMAT`, `INVALID_RANGE` y dos `REQUIRED`, cada uno en su campo `unavailable[i].…` y en el orden del cuerpo.
  - Sin lista, `REQUIRED` en `unavailable`.
  - 41 tramos el lunes dan `INVALID_LENGTH` en `unavailable[40]`.
  - Tras los rechazos, lo guardado no cambió.
- **`404` y sesión:**
  - `GET` y `PUT` de un profesor de otro colegio, de uno inexistente y de un id que no es UUID responden `404 NOT_FOUND`;
  - un id que no es UUID gana a un cuerpo inválido;
  - sin token, `401` con `WWW-Authenticate: Bearer`;
  - nada de esto cambió los tramos.
- **Permisos:** un `MEMBER` real (invitación, aceptación y login) lee `200` y guarda `200` la disponibilidad de otro profesor del colegio.
- **Concurrencia:** cinco rondas con dos `PUT` simultáneos de estados distintos sobre el mismo profesor. Siempre `200` en los dos y, después, el estado entero de uno de ellos, nunca una mezcla.
- **Cascada:** borrar el profesor (`DELETE /professors/{id}`) responde `200` y su disponibilidad pasa a `404`.
- **Log:** 13 `PROFESSOR_AVAILABILITY_UPDATED` y 2 `PROFESSOR_AVAILABILITY_UPDATE_REJECTED` (`reason: not_found`), solo con identificadores y el número de tramos. No aparece ningún nombre de profesor ni ninguna hora (se buscaron «Zuleima», «Quinonero», «Perez» y «09:17») ni ningún evento de nivel `error` o `fatal`. El `PUT` sin cambios no registró evento.

## Limpieza y estado

- Se borraron los datos creados (`TRUNCATE public.schools CASCADE` y `rate_limit_attempts` en `calendarschool`).
- La base de desarrollo vuelve a la línea base: sin datos propios, con la tabla `professor_unavailabilities` vacía.
- Se paró el backend y el puerto 3000 quedó libre (comprobado con `netstat`).

## Resultado

- Estado del paso 11: **PASS**
- Incidencias bloqueantes: ninguna.
