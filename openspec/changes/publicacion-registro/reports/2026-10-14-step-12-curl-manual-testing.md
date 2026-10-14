# Pruebas manuales con curl (grupo 12)

**Fecha:** 2026-10-14 · **Resultado:** PASS. El contrato del consentimiento se cumple con el backend real y la CSP se sirve en `/registro` y `/privacidad`. Sin secretos en este informe: no se muestran claves, contraseñas reales ni valores de cookies.

## 12.1 Registro con consentimiento (backend en local)

### Montaje

- Backend en `localhost:3000` (`node --env-file=<copia> --import tsx src/server.ts`), con una **copia de `backend/.env` sin las variables de reCAPTCHA**, guardada fuera del repositorio. El log lo confirma con el aviso `CAPTCHA_FAKE_VERIFIER`: se usó el verificador falso de los tests y no se consumieron claves reales.
- Base de desarrollo `calendarschool` (PostgreSQL 17 en Docker).
- Todas las peticiones llevan `Origin: http://localhost:5173` (el valor de `APP_ORIGIN` de `backend/.env`).
- `GET /api/health` → `{"success":true,"data":{"status":"ok","database":"up"}}`.

### Casos

El cuerpo base es `schoolName`, `municipalityCode: "46250"`, `firstName`, `lastName`, `email` único por caso y `password` de prueba.

| # | Petición `POST /api/auth/register` | Respuesta |
|---|---|---|
| 1 | Cuerpo válido, `privacyPolicyAccepted: true` y captcha `{ version: "v3", token: "token-ok" }` | `201 Created` con `{"success":true,"data":{"user":{…},"school":{…}…`; la cookie `refresh_token` no se muestra |
| 2 | Sin `privacyPolicyAccepted` | `400` `VALIDATION_ERROR`, `details: [{ "field": "privacyPolicyAccepted", "code": "REQUIRED" }]` |
| 3 | `privacyPolicyAccepted: false` | `400`, el mismo detalle |
| 4 | `privacyPolicyAccepted: "true"` (texto) | `400`, el mismo detalle |
| 5 | Sin `captcha` y sin `privacyPolicyAccepted` | `422` `CAPTCHA_FAILED`: el captcha se verifica antes que la validación |

### Efecto en la base de datos

Fila de `users` tras el caso 1:

| `email` | `privacy_policy_accepted_at` | `privacy_policy_version` |
|---|---|---|
| `curl.valido@example.com` | `2026-10-14 19:59:42.799+00` | `2026-10-14` |

La fecha es el instante del alta y la versión coincide con `PRIVACY_POLICY_VERSION` y con `privacyPolicy.lastUpdated` de `es.json` y `en.json`. Tras los casos 2 a 5, `SELECT count(*) FROM users WHERE email LIKE 'curl.%'` devolvió 1: **ningún intento rechazado dejó filas**.

### Limpieza y comparación con la línea base

1. Borrados en una transacción el colegio «Colegio Curl 12», su usuario y su refresh token (1 fila cada uno).
2. Backend parado y puerto 3000 libre (comprobado con `netstat`).
3. Recuentos comparados con la línea base de la tarea 11.1:

| Tabla (`calendarschool`, `public`) | Línea base | Después |
|---|---|---|
| `municipalities` | 542 | 542 |
| `schools` | 2 | 2 |
| `users` | 2 | 2 |
| `refresh_tokens` | 2 | 2 |
| `rate_limit_attempts` | 4 | **0** |

**Diferencia explicada en `rate_limit_attempts`.** Tras las cinco peticiones había 5 filas, todas de las 19:59–20:00, y ya no estaban las 4 de la línea base. El limitador borra en cada comprobación los intentos de su clave que han salido de la ventana de 15 minutos (`prismaAttemptRepository.ts`, `deleteMany` con `attemptedAt <= windowStart`). Las 4 filas eran de la validación local de la tarea 8.6, ya caducadas, y se podaron en la primera petición. Es el comportamiento previsto, no una mutación inesperada, y esas filas no se pueden ni conviene restaurarlas. Las 5 filas nuevas (clave `register:::1`, acotadas por clave y rango de hora) se borraron: con un máximo de 5 intentos cada 15 minutos habrían bloqueado el siguiente registro manual de desarrollo desde esta IP.

## 12.2 Cabecera de seguridad en `vite preview`

`vite preview` en `localhost:4173` sirviendo el `dist` de la tarea 11.3, construido sin claves de sitio. No se arrancó el backend.

| `curl -I` | Resultado |
|---|---|
| `/registro` | `200 OK`, con `Content-Security-Policy` completa (11 directivas, incluida `connect-src 'self' https://www.google.com/recaptcha/`); 0 cabeceras `Report-Only` |
| `/privacidad` | `200 OK`, la misma `Content-Security-Policy`; 0 cabeceras `Report-Only` |

Proceso parado y puerto 4173 libre. La cabecera completa y su identidad byte a byte con `frontend/content-security-policy.json` las comprueban `csp.cy.ts` y los tests de `contentSecurityPolicy` y de `appStack`.

## Límites

- El captcha era el falso, así que estas pruebas no ejercen `siteverify` de Google; eso lo cubrió el spike (grupo 0) y la validación de la tarea 8.6.
- Se probó solo contra el backend y `vite preview` en local. La cabecera real de CloudFront y la apertura efectiva del registro se comprueban en el grupo 14.
