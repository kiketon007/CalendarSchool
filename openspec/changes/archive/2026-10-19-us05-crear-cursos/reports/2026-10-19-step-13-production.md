# Informe del paso 13 - Despliegue y comprobación en producción

- Fecha: 2026-10-19
- Cambio: us05-crear-cursos
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #62 (`feature/us05-crear-cursos`), integrada por la persona usuaria en `main` (`0672512`, 2026-10-19 19:21 UTC). La integración tardó porque los dos checks de la PR («Lint, tests y build» y «E2E con Cypress») estuvieron en cola unos 3 h y media durante un incidente de GitHub Actions; no hubo ningún fallo del código.
- Ejecución de CI y despliegue sobre el commit de la integración (`39310248051`): **completada con éxito**. Lint, tests y build, E2E con Cypress y «Desplegar en producción» pasan.
- Migraciones: el paso «Migraciones de la base de datos» aplicó `20261019142532_add_courses_and_classes` («All migrations have been successfully applied»). Es aditiva: dos tablas nuevas, sin tocar las existentes.
- Despliegue con CDK, publicación del frontend en S3 e invalidación de `index.html` en CloudFront: correctos. No hay cambios de infraestructura: `/cursos` y `/cursos/nuevo` ya se servían con el `index.html` de la aplicación (la CloudFront Function de las rutas de la SPA) y `/api/*` llega al backend.
- Smoke test (`scripts/smoke.mjs`) contra `https://app.calendarschools.es`: correcto.

## Comprobaciones con `curl` (sin crear datos)

Contra `https://app.calendarschools.es`, sin cabecera `Authorization` ni cookies:

| Petición | Respuesta |
|---|---|
| `GET /cursos`, `/cursos/nuevo` y `/onboarding` | `200`, el `index.html` de la SPA (`id="root"`); la cabecera `Content-Security-Policy` es idéntica en las tres rutas y a la de antes del cambio |
| `GET /assets/index-B6oS6_wl.js` (el bundle principal) | `200`, contiene «Crear curso»: producción sirve el frontend nuevo |
| `GET /api/courses` | `401 INVALID_SESSION` |
| `POST /api/courses` | `401 INVALID_SESSION` |
| `GET /api/health` | `200` |

Ninguna de estas peticiones crea ni cambia datos.

Incidencia de la ejecución (no del producto): `curl` de Windows no puede comprobar la revocación del certificado de este host desde la red del equipo (`CRYPT_E_NO_REVOCATION_CHECK`); se usó `--ssl-no-revoke`, que solo omite esa consulta y sigue validando la cadena y el nombre del certificado.

## Comprobación con un navegador real

La hizo la persona usuaria, porque esta sesión no tiene acceso a producción, en `https://app.calendarschools.es`. Se le pidió comprobar: «Cursos» en la cabecera antes de «Usuarios»; crear «1º Primaria» con las clases `A` y `B` y verlo en el listado con el aviso y «Sin tutor»; crear un curso con `º`, `ª` o `ñ`; el error al repetir el nombre con otras mayúsculas, bajo el campo y conservando lo escrito; la consola sin errores de CSP; la tarjeta «Gestión de horarios» de la bienvenida todavía «Próximamente», sin enlace; como miembro (si tenía uno de prueba), «Cursos» sin «Usuarios» y poder crear un curso; y el apilado sin desbordes con la ventana estrecha. Confirmó que **todas las pruebas fueron bien**, sin indicar ninguna incidencia.

Quedan comprobados a simple vista por la persona usuaria, en el navegador, los puntos que `axe` en jsdom no mide (el contraste de los textos nuevos).

## Datos de prueba en producción

- Esta sesión no creó ningún dato en producción. Los cursos y las clases que creó la persona usuaria en sus pruebas quedan en la base de datos de producción, en el colegio de la cuenta con la que probó; no indicó cuáles eran de prueba, así que aquí no se nombran.
- **Orden de borrado:** `courses` referencia a `schools` con `ON DELETE RESTRICT`, así que las filas de `courses` se borran **antes** que las del colegio; las de `classes` se borran solas con su curso (`ON DELETE CASCADE`). Para quitar solo los cursos de prueba de un colegio que se conserva:
  1. `select id, name from courses where school_id = '<id>'` (comprobar cuáles son de prueba)
  2. `delete from courses where id in ('<id1>', '<id2>')` (sus clases se borran en cascada)
- Para quitar además un colegio de prueba entero, el orden es: `access_links` y `courses` del colegio, después `users` (las sesiones se borran con ellos) y por último `schools`. Antes de borrar, comprueba que el colegio solo contiene datos de prueba y apunta su id.
- No se ha borrado nada en producción desde esta sesión.

## Observaciones

- No hay un tope de cursos por colegio ni de caracteres totales por curso más allá de las reglas (100 de nombre, 10 por clase, 12 clases). Para el tamaño de colegio previsto no es un problema.
- El tutor de las clases es siempre `null` hasta US09, que añadirá `classes.tutor_id` con la tabla `professors`.
- La documentación ya describe todo lo nuevo (tarea 12), así que no queda nada pendiente de documentar.

## Resultado

- Estado del paso 13: PASA
- Problemas bloqueantes: ninguno
