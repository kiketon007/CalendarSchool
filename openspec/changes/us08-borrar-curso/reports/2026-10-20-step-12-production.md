# Informe del paso 12 - Despliegue y comprobación en producción

- Fecha: 2026-10-20
- Cambio: us08-borrar-curso
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #71 (`feature/us08-borrar-curso`), integrada por la persona usuaria en `main` (`ff61813`, 2026-10-20 14:22 hora local).
- Ejecución de CI y despliegue sobre el commit de la integración (`39421765619`): **completada con éxito**. Lint, tests y build, E2E con Cypress y «Desplegar en producción» pasan.
- Migraciones: el cambio no añade ninguna (el borrado usa la cascada `ON DELETE CASCADE` que ya existía), así que el paso de migraciones de producción respondió `No pending migrations to apply` (8 migraciones, todas ya aplicadas).
- Despliegue con CDK, publicación del frontend en S3 e invalidación de `index.html` en CloudFront: correctos. No hay cambios de infraestructura: las rutas de la SPA ya se servían con el `index.html` de la aplicación.
- Smoke test (`scripts/smoke.mjs`) contra el dominio de producción: correcto.

## Comprobaciones con `curl` (sin crear ni borrar datos)

Contra el dominio de producción, sin cabecera `Authorization` ni cookies:

| Petición | Respuesta |
|---|---|
| `GET /api/health` | `200` |
| `GET /cursos`, `/cursos/nuevo` y `/cursos/<id>/editar` | `200`, el `index.html` de la SPA (`id="root"`) |
| Cabecera `Content-Security-Policy` | Presente, con 11 directivas y ninguna con `unsafe-` |
| Bundle principal desplegado | `200`; contiene «Esta acción no se puede deshacer», «Borrar curso», «Ese curso ya no existe», «Borrar {{name}}», «Se borrarán sus {{count}} clases», «No se pudo borrar el curso» y la ruta `/impact`: producción sirve el frontend nuevo |
| `GET /api/courses/<id>/impact` y `DELETE /api/courses/<id>` | `401 INVALID_SESSION`, con `WWW-Authenticate: Bearer` y `Cache-Control: no-store` |
| `GET /api/courses/abc/impact` y `DELETE /api/courses/abc` | `401 INVALID_SESSION` (la autenticación va antes de validar el id) |
| `GET …/impact` y `DELETE` con un token inválido | `401` |

Ninguna de estas peticiones crea, cambia ni borra datos. Como en las comprobaciones anteriores, `curl` de Windows no puede comprobar la revocación del certificado de este host desde la red del equipo (`CRYPT_E_NO_REVOCATION_CHECK`); se usó `--ssl-no-revoke`, que solo omite esa consulta y sigue validando la cadena y el nombre del certificado.

## Comprobación con un navegador real

La hizo la persona usuaria, porque esta sesión no tiene acceso a producción. Se le advirtió de que esta prueba **borra datos de verdad** y se le pidió comprobar: los botones «Editar» y «Borrar» en cada fila de la tabla y en cada tarjeta con la ventana estrecha o en el móvil; el diálogo de un curso con varias clases («¿Borrar «…»?», «Se borrarán sus N clases.», «Esta acción no se puede deshacer.» y el foco en «Cancelar»); que «Cancelar» y Escape no borran nada y devuelven el foco al botón «Borrar»; que al confirmar el curso desaparece, aparece «Curso «…» eliminado», **el foco queda en el título «Cursos»** (el defecto que solo vio el E2E y se corrigió en este cambio) y no vuelve al recargar; el estado vacío al borrar el último curso; opcionalmente, «Este curso no existe o ya no está disponible» al guardar una edición de un curso borrado desde otra pestaña; y la consola sin violaciones de CSP. Confirmó que **sus pruebas fueron bien**, sin indicar ninguna incidencia.

## Datos de prueba en producción

- Esta sesión no creó ni borró ningún dato en producción. Los cursos que la persona usuaria creó y borró en sus pruebas son cosa suya; los que dejó se quedan, como acordó para futuros tickets.
- Si quisiera quitar todos los datos de prueba, el orden de borrado está en el informe del paso 13 de US05 (`courses` antes que `schools`; las clases se borran en cascada), y desde esta historia también puede hacerse desde la aplicación, curso a curso.

## Observaciones

- El borrado es real e irreversible: la protección es el diálogo, que informa de las clases (y, desde US14, de los alumnos) antes de confirmar. Una papelera sería otra historia si el producto la pide.
- `studentCount` está en el contrato y vale `0` hasta US14; la nota de US14 recoge sustituir la constante `STUDENT_COUNT_UNTIL_US14` por el recuento real y añadir tests de integración con alumnos. La de US09, `ON DELETE SET NULL` para `classes.tutor_id`.
- El foco tras borrar necesitó un turno de espera (`setTimeout` de 0 ms) por la captura de foco de react-bootstrap; está documentado en el código, en el diseño (D7) y en los estándares del frontend, y lo fija un E2E con `have.focus`, porque jsdom no reproduce el problema.
- La documentación ya describe todo lo nuevo (grupo 11), así que no queda nada pendiente de documentar.

## Resultado

- Estado del paso 12: PASA
- Problemas bloqueantes: ninguno
