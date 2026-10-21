# Informe del paso 12 - Despliegue y comprobación en producción

- Fecha: 2026-10-21
- Cambio: us13-borrar-profesor
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #86 (`feature/us13-borrar-profesor`), integrada por la persona usuaria en `main` (`bd7670e`).
- Ejecución de CI y despliegue sobre el commit de la integración (`39619718410`): **completada con éxito**. Lint, tests y build, E2E con Cypress y «Desplegar en producción» pasan.
- Sin migraciones nuevas en el cambio. El despliegue del backend con CDK, la publicación del frontend en S3, la invalidación de `index.html` en CloudFront y el smoke test contra el dominio de producción son correctos.

## Comprobaciones con `curl` (sin crear ni borrar datos)

Contra `https://app.calendarschools.es`, sin cabecera `Authorization` ni cookies (con `--ssl-no-revoke`):

| Petición | Respuesta |
|---|---|
| `GET /api/health` | `200` |
| `GET /profesores` | `200`, el `index.html` de la SPA |
| Cabecera `Content-Security-Policy` | Presente, sin ninguna directiva con `unsafe-` |
| Bundle principal desplegado (`assets/index-BhDjeyyN.js`) | `200`; contiene «Borrar profesor», «Comprobando su tutoría», «quedará sin tutor», «Ese profesor ya no existe» y «queda sin tutor»: producción sirve el frontend nuevo |
| `DELETE /api/professors/<id>` sin token | `401` |

## Comprobación con un navegador real

La hizo la persona usuaria, porque esta sesión no tiene acceso a producción. Se le pidió comprobar, en escritorio y en el móvil o con la ventana a 360 px: borrar un profesor sin clase (aviso, fila fuera, foco en el título); borrar uno con tutoría (aviso en el diálogo y al terminar, y la clase en «Sin tutor» en `/cursos`); cancelar con «Cancelar» y con Escape sin borrar nada y con el foco de vuelta en «Borrar»; y que no hay violaciones de CSP en la consola ni desplazamiento horizontal. Confirmó que **las pruebas fueron bien**, sin indicar ninguna incidencia.

## Datos de prueba en producción

Esta sesión no creó ni borró ningún dato en producción. Los profesores borrados en la prueba del navegador los eligió y los borró la persona usuaria.

## Resultado

- Estado del paso 12: PASA
- Problemas bloqueantes: ninguno
