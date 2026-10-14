# Validación local de la CSP con claves reales (grupo 8)

**Fecha:** 2026-10-14 · **Resultado:** la CSP publicada bloqueaba una petición de reCAPTCHA v3 (`connect-src`). Corregida la política, el registro completo y el reto v2 forzado se cargan con **cero violaciones**. Ninguna clave ni secreto se copia en este informe.

## Montaje

| Pieza | Cómo |
|---|---|
| Frontend | `npm run build -w frontend` con las dos claves de sitio en `frontend/.env.production.local` (copiadas de `.env.development.local`; ficheros ignorados por `.gitignore`). Se comprobó que cada clave (40 caracteres) aparece en `dist` |
| Servidor del build | `vite preview` en `localhost:4173`, con la CSP de `frontend/content-security-policy.json` en `preview.headers` y el proxy de `/api` al `:3000` |
| Backend | `server.ts` con `backend/.env` (secretos reales de v3 y v2) y `APP_ORIGIN=http://localhost:4173`; sin el aviso de captcha falso, así que usa Google `siteverify` |
| Navegador | Playwright. Un listener de `securitypolicyviolation` en el documento y el registro de la consola y de las peticiones externas |

## Resultados

| # | Prueba | Resultado |
|---|---|---|
| a | Envío v3 con la política inicial (`connect-src 'self'`) | Registro correcto (`/onboarding`), pero **4 violaciones** `connect-src` hacia `https://www.google.com/recaptcha/api2/clr` y 9 errores en la consola |
| b | Mismo envío tras cambiar el JSON, en el mismo navegador | Siguen las violaciones: el servidor ya enviaba la cabecera nueva, pero el navegador tenía en caché el HTML anterior y `originalPolicy` seguía mostrando `connect-src 'self'` |
| c | Mismo envío en un contexto de navegador limpio | **0 violaciones.** Registro correcto. Único error en consola: `401` de `/api/auth/refresh` |
| d | Reto v2 forzado: `POST /api/auth/register` interceptado con `422 CAPTCHA_CHALLENGE_REQUIRED` | Una sola petición de registro (v3); el formulario queda bloqueado hasta resolver el reto; se pinta el iframe `anchor` de la clave v2 y el `bframe`. **0 violaciones.** Errores en consola: el `401` de arriba y el `422` simulado |

### Peticiones externas del envío v3

Todas a `www.google.com` y `www.gstatic.com`, ambos permitidos: `recaptcha/api.js`, `recaptcha__es.js`, `api2/anchor`, `styles__ltr.css`, `api2/webworker.js`, `api2/reload` y `api2/clr`. La fuente Roboto de `fonts.gstatic.com` la carga el iframe, que no está sujeto a nuestra política.

## Hallazgo: `connect-src` y la telemetría de reCAPTCHA v3

El diseño (D2) suponía que las peticiones `api2/reload` y `api2/clr` las hacía el iframe de Google, que se rige por su propia política, y por eso fijó `connect-src 'self'`. La validación lo desmintió: el script de v3 se ejecuta en **nuestra** página y hace `fetch` a `api2/clr` desde ella. La CSP lo bloqueaba. El envío no fallaba, pero Google perdía una señal que usa para puntuar y la consola se llenaba de errores.

Corrección, en el orden que exige `docs/base-standards-castellano.md` §7:

1. `design.md` (D2) y `specs/cloud-deployment/spec.md`: `connect-src` pasa a `'self' https://www.google.com/recaptcha/`. Sin comodines y limitado a esa ruta.
2. `contentSecurityPolicy.test.ts`: el test de `connect-src` espera las dos fuentes. Falló con la política antigua.
3. `frontend/content-security-policy.json`. Frontend 357/357 e infraestructura 63/63 en verde: los tests de CDK comparan la plantilla con el JSON serializado.

## Límites

- **No se pulsó la casilla del widget v2**, porque podía abrir un reto de imágenes de Google. Quedan sin observar las peticiones posteriores a esa interacción. El spike del grupo 0 ya comprobó que el token v2 se verifica.
- **Caché del HTML:** un navegador que ya tenga `/registro` puede seguir aplicando la política antigua tras un cambio de CSP (prueba b). Con `vite preview` ocurrió. Con CloudFront no se ha comprobado; se revisa en el grupo 14 con un navegador que ya haya visitado la página.
- **`401` en la consola:** es la renovación de sesión que `SessionProvider` hace al montar la página sin cookie. No es una violación de CSP.
- **`404` de `/favicon.ico`:** el proyecto no tiene favicon. No tiene relación con la CSP.
- **`style-src`:** no hubo ninguna violación, así que no hace falta la excepción que preveía el Open Question de `design.md`. Queda por confirmar en producción.

## Limpieza

Paradas `vite preview` y el backend (puertos 3000 y 4173 libres). Borrados `frontend/.env.production.local`, la captura y la carpeta de Playwright. En la base de desarrollo se borraron en una transacción los 3 colegios «Colegio CSP …», sus usuarios y sus refresh tokens (0 filas restantes). Quedan filas de `rate_limit_attempts` de las pruebas, que la purga de 24 horas elimina en producción y que en desarrollo no molestan.
