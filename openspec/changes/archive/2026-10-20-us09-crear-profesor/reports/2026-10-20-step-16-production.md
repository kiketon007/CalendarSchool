# Informe del paso 16 - Despliegue y comprobación en producción

- Fecha: 2026-10-20
- Cambio: us09-crear-profesor
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #74 (`feature/us09-crear-profesor`), integrada por la persona usuaria en `main` (`4a27f26`, 2026-10-20 20:12 hora local).
- Ejecución de CI y despliegue sobre el commit de la integración (`39472787626`): **completada con éxito**. Lint, tests y build, E2E con Cypress y «Desplegar en producción» pasan.
- Migraciones: el paso de migraciones de producción aplicó `20261020142755_add_professors` (9 migraciones en total, la nueva era la única pendiente): tabla `professors`, enum `ProfessorPosition` y `classes.tutor_id` (nulo, único, `ON DELETE SET NULL`). Las tablas nuevas heredan los permisos del rol de aplicación por los `DEFAULT PRIVILEGES` de `app-role.sql`; no hizo falta tocar nada a mano.
- Despliegue con CDK, publicación del frontend en S3 e invalidación de `index.html` en CloudFront: correctos. No hay cambios de infraestructura: las rutas de la SPA ya se servían con el `index.html` de la aplicación.
- Smoke test (`scripts/smoke.mjs`) contra el dominio de producción: correcto.

## Comprobaciones con `curl` (sin crear ni borrar datos)

Contra el dominio de producción, sin cabecera `Authorization` ni cookies:

| Petición | Respuesta |
|---|---|
| `GET /api/health` | `200` |
| `GET /profesores` y `/profesores/nuevo` | `200`, el `index.html` de la SPA (`id="root"`) |
| Cabecera `Content-Security-Policy` | Presente, con 11 directivas y ninguna con `unsafe-` |
| Bundle principal desplegado | `200`; contiene «Crear profesor», «Todavía no hay profesores», «Clase que tutoriza», «Jefe de estudios», «Esa clase ya tiene tutor» y la ruta `/api/professors`: producción sirve el frontend nuevo |
| `GET /api/professors` y `POST /api/professors` | `401 INVALID_SESSION`, con `WWW-Authenticate: Bearer` y `Cache-Control: no-store` |
| `GET /api/professors` con un token inválido | `401` |

Ninguna de estas peticiones crea, cambia ni borra datos. Como en las comprobaciones anteriores, `curl` de Windows no puede comprobar la revocación del certificado de este host desde la red del equipo; se usó `--ssl-no-revoke`, que solo omite esa consulta y sigue validando la cadena y el nombre del certificado.

Un primer `GET /api/professors` dio `403` sin cuerpo JSON: era un error de mi comando, que enviaba un cuerpo `{}` con un `GET`, algo que CloudFront rechaza. Sin cuerpo, el `GET` da `401 INVALID_SESSION`.

## Comprobación con un navegador real

La hizo la persona usuaria, porque esta sesión no tiene acceso a producción. Se le pidió comprobar: crear un curso con dos clases; en «Profesores», que el desplegable ofrece las clases libres agrupadas por curso; crear un profesor con cargo y clase y verlo en `/profesores` con el aviso y como tutor en la columna «Tutores» de `/cursos`; que la edición del curso muestra «Tutor: …» y deja «Guardar» deshabilitado; que la clase asignada ya no se ofrece al crear otro profesor; el listado en el móvil o con la ventana estrecha, sin desplazamiento horizontal; y la consola sin violaciones de CSP. Confirmó que **sus pruebas fueron bien**, sin indicar ninguna incidencia.

## Datos de prueba en producción

- Esta sesión no creó ni borró ningún dato en producción. Los cursos y profesores que la persona usuaria creó en sus pruebas se quedan, como acordó para futuros tickets.
- Si quisiera quitarlos, el orden de borrado es `professors` antes que `schools` (la clave ajena); las clases siguen cayendo con su curso. Los cursos también pueden borrarse desde la aplicación, y los profesores quedan entonces sin clase (no hay todavía borrado de profesores: US13).

## Observaciones

- La primera ejecución de `npm test` en local (informe del paso 12) tuvo un worker de Vitest muerto en Windows; la ejecución de CI sobre `main` pasó entera, sin reintentos. No se ha vuelto a ver.
- Quedan para historias posteriores: elegir el tutor desde la edición del curso (US09_b), las asignaturas del profesor (`US-PROF-ASSIGN`, el contrato ya lleva `subjects: []`), y ampliar el listado, buscar, editar y borrar (US10 a US13). Sus fichas ya recogen lo que heredan de US09.
- La documentación ya describe todo lo nuevo (grupo 15), así que no queda nada pendiente de documentar.

## Resultado

- Estado del paso 16: PASA
- Problemas bloqueantes: ninguno
