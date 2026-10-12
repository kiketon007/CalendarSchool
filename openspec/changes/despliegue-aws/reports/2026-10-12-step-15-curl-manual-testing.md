# Paso 15: pruebas manuales en producción (despliegue-aws)

Fecha: 2026-10-12. Entorno: `https://app.calendarschools.es` (cuenta AWS 411217898612, `eu-central-1`). Sin secretos: las cabeceras y las IP de visitante se han sustituido por marcadores.

## 15.2 Comprobaciones con curl

| Petición | Resultado |
| --- | --- |
| `GET /` | `200` |
| `GET /registro` | `200` |
| `GET http://app.calendarschools.es/` | `301` a `https://app.calendarschools.es/` |
| `GET /api/health` | `200` `{"success":true,"data":{"status":"ok","database":"up"}}` |
| `GET /api/municipalities` | `200` |
| `POST /api/auth/register` | `404 NOT_FOUND` (CloudFront Function `api-guard`) |
| `POST /api/auth/refresh` | `404 NOT_FOUND` |
| `POST /api/auth/%72egister` | `404` (se normaliza el %-encoding) |
| `POST //api//auth/register` | `404` (se normalizan las barras) |
| `POST /API/AUTH/register` | `403` de CloudFront: no coincide con `/api/*`, cae en S3 y no llega a la API |
| `GET <execute-api>/api/health` sin cabecera | `403` (`ORIGIN_NOT_ALLOWED`) |
| `GET https://<bucket>.s3.eu-central-1.amazonaws.com/index.html` | `403` (acceso directo cerrado) |
| Cabeceras de `GET /` | `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` |
| Conexión sin TLS a Supabase (rol de aplicación, `:6543`) | rechazada: `(ESSLREQUIRED) SSL connection is required` |
| Data API de Supabase sin clave | `401`; los roles `anon` y `authenticated` no tienen privilegios sobre ninguna tabla de `public` (sonda `probe-app`) |

`X-Forwarded-For` escrito por el cliente (`198.51.100.9`), con `LOG_LEVEL=debug`:

```
forwardedFor = "198.51.100.9, <IP del visitante>, <IP de CloudFront>"
ip           = <IP del visitante>
```

`req.ip` es la del visitante: `TRUST_PROXY_HOPS=2` es correcto (anotado en `design.md`).

Hallazgos de la puesta en marcha corregidos con artefactos y PR:

- Dominio equivocado (`calendarschool.es` en lugar de `calendarschools.es`): certificado recreado.
- El repositorio usa el *subject* inmutable de GitHub: la política de confianza de OIDC lleva ahora los IDs (#24).
- Con `LoggingFormat.JSON`, Lambda filtraba el `debug` (`ApplicationLogLevel` `INFO`): se fija `TRACE` (#25).
- `backup.yml` usaba el `pg_dump` 16 del `PATH`: se llama al binario 17 por su ruta (#27).

## 15.3 Petición tras más de 15 minutos sin uso

Tras 17 minutos sin tráfico a la Lambda:

| Petición | Resultado |
| --- | --- |
| 1.ª (arranque en frío y conexión nueva) | `200` en 1,89 s |
| 2.ª | `200` en 0,21 s |
| 3.ª | `200` en 0,17 s |

Las conexiones tras descongelar no fallan. No hace falta cambiar D10.

## 15.4 Copia de seguridad y restauración

- `backup.yml` lanzado a mano (`workflow_dispatch`): correcto. Fichero `calendarschool-2026-10-12.dump` (18 KB) en el bucket de copias.
- Restauración en un PostgreSQL 17 local vacío (`postgres:17`, `pg_restore --no-owner`): 6 tablas en `public`, 542 municipios y 4 migraciones. El único mensaje fue benigno (`schema "public" already exists`, porque la base nueva ya trae ese esquema). Contenedor y fichero descargado borrados.
- La primera ejecución falló por la versión de `pg_dump` (ver hallazgos).

## 15.5 Despliegue automático y rollback de prueba

- PR #23: el job `deploy` aparece como omitido (`skipping`); al integrarla, el despliegue automático desde `main` falló al asumir el rol OIDC (subject inmutable, corregido en #24). Con el rol corregido, el workflow lanzado con `workflow_dispatch` y los despliegues automáticos de #25 y #26 pasan completos, smoke test incluido.
- Rollback de prueba: `workflow_dispatch` con `ref` igual al SHA completo de la PR #24 (`d7c5d9c…`): todos los pasos correctos y `GET /api/health` `200`; la Lambda queda sin el arreglo de `TRACE` (`ApplicationLogLevel` `INFO`), como corresponde al commit anterior.
- Con el SHA abreviado el `checkout` falla (`A branch or tag with the name 'd7c5d9c' could not be found`): la guía exige el SHA completo.
- Vuelta al último commit de `main` (`a9753b4…`): correcto, `ApplicationLogLevel` `TRACE`, `LOG_LEVEL=info` y `/api/health` `200`.
