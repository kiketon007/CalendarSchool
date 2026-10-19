# Informe del paso 9 - Despliegue y comprobación en producción

- Fecha: 2026-10-19
- Cambio: us04-pantalla-bienvenida
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #58 (`feature/us04-pantalla-bienvenida`), integrada por la persona usuaria en `main` (`7d60b22`, 2026-10-19 11:59 UTC).
- Ejecución de CI y despliegue sobre el commit de la integración (`39248607940`): **completada con éxito**. Lint, tests y build, E2E con Cypress y «Desplegar en producción» pasan.
- Migraciones: el paso «Migraciones de la base de datos» no encontró nada pendiente. Era lo previsto: el cambio solo toca el frontend.
- Despliegue con CDK, publicación del frontend en S3 e invalidación de `index.html` en CloudFront: correctos. No hay cambios de infraestructura: `/onboarding` y `/usuarios` ya se servían con el `index.html` de la aplicación (la CloudFront Function de las rutas de la SPA).
- Smoke test (`scripts/smoke.mjs`) contra `https://app.calendarschools.es`: correcto.

## Comprobaciones con `curl` (sin crear datos)

Contra `https://app.calendarschools.es`, sin cabecera `Authorization` ni cookies:

| Petición | Respuesta |
|---|---|
| `GET /`, `/login`, `/onboarding` y `/usuarios` | `200`, `text/html` (el `index.html` de la SPA, con `id="root"`) |
| Cabecera `Content-Security-Policy` de esas cuatro rutas | idéntica entre sí y a la del build local (mismo hash SHA-256); estricta, sin `unsafe-*` |
| `GET /assets/index-BUVTCXeW.js` (el bundle principal) | `200`, contiene «Próximamente»: producción sirve el frontend nuevo |
| `GET /api/health` | `200` |
| `GET /api/users` sin sesión | `401` |

Ninguna de estas peticiones crea ni cambia datos.

Incidencia de la ejecución (no del producto): al principio `curl` devolvió `000` por un error del cliente TLS de Windows al consultar la revocación del certificado (`CRYPT_E_NO_REVOCATION_CHECK`) desde la red del equipo. Se repitieron las comprobaciones con `--ssl-no-revoke`, que solo omite esa consulta y sigue validando la cadena y el nombre del certificado.

## Comprobación con un navegador real

La hizo la persona usuaria, porque esta sesión no tiene acceso a producción, en `https://app.calendarschools.es`. Se le pidió comprobar: la bienvenida como administrador (saludo, colegio, tarjetas «Gestión de horarios» y «Gestión de comedor» con «Próximamente» fuera del recorrido del teclado, y la sección «Administración» con la tarjeta «Usuarios»); la entrada en `/usuarios` desde la tarjeta y la vuelta con el nombre de la aplicación; la consola sin errores de CSP; la legibilidad de la insignia «Próximamente»; la bienvenida como miembro, si tenía uno de prueba, sin la sección «Administración»; y el apilado en una columna con la ventana estrecha. Confirmó que **todas las pruebas fueron bien**, sin indicar ninguna incidencia.

El contraste de la insignia (blanco sobre `#6c757d`, 4,69:1, AA) no lo mide `axe` en jsdom; queda comprobado a simple vista por la persona usuaria en el navegador.

## Datos de prueba en producción

- Esta sesión no creó ningún dato en producción. Las pruebas del navegador usaron las cuentas de prueba que ya existían desde US02_c (que se conservan a petición de la persona usuaria para futuras historias); si se creó alguna cuenta más, la persona usuaria no la indicó.

## Resultado

- Estado del paso 9: PASA
- Problemas bloqueantes: ninguno
