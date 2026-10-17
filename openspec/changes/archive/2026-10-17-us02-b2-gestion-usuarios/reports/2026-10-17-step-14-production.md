# Informe del paso 14 - Despliegue y comprobación en producción

- Fecha: 2026-10-17
- Cambio: us02-b2-gestion-usuarios
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #47 (`feature/us02-b2-gestion-usuarios`), integrada por la persona usuaria en `main` (`c9a70ca`). El CI de la PR (`39019722680`) pasó entero a la primera.
- Ejecución de CI y despliegue sobre el commit de la integración (`39019909119`): **completada con éxito**. Lint, tests y build, E2E y «Desplegar en producción» pasan, incluidos los pasos de migraciones (sin migración pendiente), despliegue con CDK, invalidación de `index.html` en CloudFront y el **smoke test** (`GET /`, `POST /api/auth/login` llega al backend, `GET <execute-api>/api/health` sin `X-Origin-Verify` y `GET /api/health`).
- Sin migración de base de datos ni cambios de infraestructura: las rutas nuevas cuelgan de `/api`, que CloudFront ya reenvía.

## Comprobaciones con `curl` (sin crear datos)

Contra `https://app.calendarschools.es`, con `--ssl-no-revoke` (el almacén de certificados de Windows no puede comprobar la revocación desde esta red; el certificado se sigue validando):

| Petición | Respuesta |
|---|---|
| `PUT /api/users/<uuid>/role` con `{"role":"ADMIN"}`, sin `Authorization` | `401 INVALID_SESSION`, `www-authenticate: Bearer`, `cache-control: no-store`, más la `Content-Security-Policy` de CloudFront |
| `POST /api/users/<uuid>/suspend`, sin `Authorization` | `401 INVALID_SESSION`, `www-authenticate: Bearer`, `cache-control: no-store` |
| `POST /api/users/<uuid>/reactivate`, sin `Authorization` | `401 INVALID_SESSION`, `www-authenticate: Bearer`, `cache-control: no-store` |
| `POST /api/users/no-es-un-uuid/suspend`, sin `Authorization` | `401 INVALID_SESSION` (el `401` va antes que el `404`) |
| `GET /api/municipalities` | `200` |
| `GET /registro`, `/login`, `/usuarios` y `/onboarding` (la SPA) | `200`, `text/html` |

Ninguna de estas peticiones crea ni cambia datos: se rechazan antes, sin sesión.

## Comprobación con un navegador real

La hizo la persona usuaria, porque esta sesión no tiene acceso a producción, con una cuenta de prueba: se registró en `https://app.calendarschools.es/registro` con el colegio «Colegio17102026» (a esa dirección se llega escribiéndola: la página de inicio no enlaza al registro ni al login, ver «Observaciones») y recorrió el guion propuesto en `/usuarios`:

1. Registro y entrada a `/onboarding`, con la cabecera y el enlace «Usuarios».
2. La tabla con una única fila, la propia, con «(tú)» y sin «Dar de baja», y el aviso «El colegio debe tener al menos un administrador.» al pulsar «Hacer miembro» siendo el único administrador.
3. Para probar el resto, un segundo usuario del colegio, un miembro (`prueba.miembro.20261017@example.com`), que se creó con un `INSERT` en el editor SQL de Supabase (todavía no hay forma de crearlo por la aplicación: faltan las invitaciones, US02_b3 y US02_b4). El `INSERT` copia el hash de contraseña del administrador, de modo que el miembro entra con la misma contraseña y no se pasó ninguna por la conversación. Con él se probó:
   - ascender a administrador y volver a miembro;
   - pasarse a uno mismo a miembro habiendo otro administrador, que lleva a `/onboarding` sin el enlace «Usuarios»;
   - la baja, con el diálogo de confirmación (cancelar y confirmar);
   - que el usuario dado de baja no puede iniciar sesión;
   - la reactivación, tras la cual puede volver a entrar.
4. Consola del navegador abierta durante todo el recorrido: **sin errores de CSP**.

La persona usuaria confirmó que lo probó todo sin errores. Esta sesión no vio la pantalla, así que el detalle de cada paso lo da esa confirmación y no una captura propia.

No se probó en producción el reintento tras un fallo ni la renovación del token caducado: no se pueden provocar sin alterar el servicio, y los cubren los E2E.

## Datos de prueba en producción

- Las cuentas de prueba de los cambios anteriores, `prueba.usuarios.20261016@example.com` («Colegio Prueba Usuarios») y `prueba.cierre.20261015@example.com` («Colegio Prueba Cierre de Sesión»), **ya se han borrado** de la base de datos de producción por la persona usuaria.
- La cuenta de este cambio («Colegio17102026», su administrador y el miembro `prueba.miembro.20261017@example.com`, con sus sesiones) se borra con las dos sentencias `delete` que se le entregaron junto al `INSERT`: `delete from users where school_id = (select id from schools where name = 'Colegio17102026')` y `delete from schools where name = 'Colegio17102026'`. Las sesiones se borran solas con los usuarios (`ON DELETE CASCADE`). Los intentos del limitador que dejó el registro los purga la tarea diaria de `backup.yml`.

## Observaciones

- **La página de inicio no enlaza al registro ni al login.** `HomePage` es la página vacía de US00 (título y descripción) y nadie la ha ampliado: el registro y el login existen y funcionan, pero un visitante solo llega a ellos escribiendo `/registro` o `/login`. Es un hueco de producto, anterior a este cambio y fuera de su alcance (el PRD no se amplía sin validación); queda propuesto como una historia pequeña aparte.
- `LAST_ADMIN_REQUIRED` al dar de baja solo se alcanza en una carrera entre dos administradores y no se puede provocar a mano en producción; lo cubren los tests de integración.

## Resultado

- Estado del paso 14: **PASS**
- Incidencias: ninguna en producción.
