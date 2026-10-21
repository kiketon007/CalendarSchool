# Informe del paso 9 - Pruebas manuales con curl

- Fecha: 2026-10-21
- Cambio: us13-borrar-profesor
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local (`node --import tsx src/server.ts`, puerto 3000) contra la base de desarrollo `calendarschool`, con el verificador de captcha falso (variables de la plantilla `.env.example`, sin `RECAPTCHA_*`). Sin migraciones nuevas.
- Script `curl_us13.sh` (no imprime contraseñas, tokens ni cookies): registra dos colegios por `POST /api/auth/register` y obtiene el token con `POST /api/auth/refresh`. Los cuerpos con tildes se envían desde fichero (`--data-binary @fichero`).

## Datos creados

- Colegio A: curso «1º Primaria» con las clases A y B, y cinco profesores: Ana (tutora de 1º A), Luis, Eva (tutora de 1º B), Pau y Rosa (sin clase).
- Colegio B: curso «1º Primaria» con la clase A y un profesor.

## Casos y resultados (25 comprobaciones, todas correctas)

| Caso | Petición | Resultado |
| --- | --- | --- |
| Sin tutoría | `DELETE /api/professors/{Luis}` | `200`, `data.deleted.freedClass: null`; el listado pasa de 5 a 4 y `GET` del borrado da `404` |
| Con tutoría | `DELETE /api/professors/{Ana}` | `200`, `freedClass: { id: <1º A>, name: "A", courseName: "1º Primaria" }`; en `GET /api/courses` 1º A queda sin tutor y 1º B conserva a Eva |
| El mismo otra vez | `DELETE /api/professors/{Ana}` | `404`, `error.code: NOT_FOUND` |
| Otro colegio | `DELETE /api/professors/{Otro}` con el token de A | `404`; el profesor sigue en B (1) |
| Id mal formado | `DELETE /api/professors/abc` | `404` |
| Inexistente | `DELETE /api/professors/<uuid aleatorio>` | `404` |
| Sin token | `DELETE /api/professors/{Eva}` | `401`; Eva sigue en el listado (3 profesores) |
| Dos simultáneos | dos `DELETE` a la vez del mismo profesor (Pau) | un `200` y un `404`; quedan 2 profesores |
| `PUT` de un borrado | `PUT /api/professors/{Ana}` | `404`; el `PUT` de otro profesor vivo (Rosa) da `200` |

Forma de la respuesta de un borrado con tutoría:

```json
{ "success": true, "data": { "deleted": { "freedClass": { "id": "<uuid>", "name": "A", "courseName": "1º Primaria" } } } }
```

## Eventos del log

- Tres eventos `PROFESSOR_DELETED` (Luis, Ana y uno de los dos borrados simultáneos de Pau), con `school_id`, `actor_id`, `professor_id` y `freed_class` (`false`, `true`, `false`).
- Los cuatro `404` de `DELETE` (repetido, otro colegio, `abc` e inexistente) y el segundo borrado simultáneo no dejan ningún evento de borrado.
- Ningún nombre de profesor ni de colegio aparece en el log (se buscaron los usados: 0 coincidencias).

## Limpieza

- Datos creados borrados con `cleanup.sql` (colegios `Colegio Curl%`); recuentos de la base de datos **idénticos** a la línea base.
- Backend parado (`taskkill` del árbol de procesos) y puerto 3000 libre.

## Resultado

- Estado del paso 9: PASA
- Problemas bloqueantes: ninguno
