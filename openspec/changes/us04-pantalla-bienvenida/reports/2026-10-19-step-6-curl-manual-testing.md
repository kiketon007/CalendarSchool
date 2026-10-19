# Informe del paso 6 - Pruebas manuales con curl

- Fecha: 2026-10-19
- Cambio: us04-pantalla-bienvenida
- Agente: Claude Sonnet 5.5

## Entorno

- Build de producción (`npm run build`) servido con `vite preview` en `http://localhost:4173` (proxy de `/api` al backend) y backend local en `http://localhost:3000` contra `calendarschool` (PostgreSQL 17 en Docker), con el verificador de captcha **falso**: el `backend/.env` del equipo trae secretos reales de reCAPTCHA, así que el backend se arrancó cargando ese fichero sin las variables `RECAPTCHA_*`.
- Este cambio solo toca el frontend: no añade ni modifica endpoints. Las pruebas son de **no regresión**: la SPA sirve las rutas con la misma CSP y la API que usan los flujos que llevan a `/onboarding` responde como antes.
- Las comprobaciones imprimen solo estados: ningún token, enlace ni contraseña aparece en este informe. Las credenciales son de pruebas locales.

## SPA y CSP (6.1)

| Petición (`:4173`) | Resultado |
| --- | --- |
| `GET /` | `200`, `index.html` de la SPA (`id="root"`) |
| `GET /login` | `200`, SPA |
| `GET /onboarding` | `200`, SPA |
| `GET /usuarios` | `200`, SPA |

- La cabecera `Content-Security-Policy` es idéntica en las cuatro rutas (mismo hash SHA-256) y sigue siendo la estricta de siempre (`default-src 'self'`, `style-src 'self'`, sin `unsafe-*`). `frontend/content-security-policy.json` no está modificado en el cambio.
- Los iconos son SVG en línea con atributos de presentación (sin `style`), así que la CSP no necesita cambios.
- El bundle compilado contiene los textos nuevos («Próximamente»).

## API (6.1)

| Petición (`:3000`) | Resultado |
| --- | --- |
| `GET /api/health` | `200` |
| `POST /api/auth/register` (colegio y administrador de prueba) | `201` |
| `POST /api/auth/login` | `204` |
| `POST /api/auth/refresh` (con la cookie del login) | `200` |
| `GET /api/users` (con el access token) | `200`, 1 usuario con rol `ADMIN` |

## Limpieza (6.2)

- Se borraron las filas creadas (`refresh_tokens`, `access_links`, `rate_limit_attempts`, `users`, `schools`) de `calendarschool`.
- Estado posterior comparado con la línea base del paso 5: `calendarschool.public` es idéntica (0 filas en todas las tablas y 542 municipios). La única diferencia en `calendarschool_test` es la fila residual de `rate_limit_attempts` de `test_4`, que ya había vaciado `npm test` en el paso 5.
- Se paró el backend y `vite preview` y se comprobó que los puertos **3000 y 4173 quedan libres**.

## Incidencias

- Ninguna.

## Resultado

- Estado del paso 6: PASA
- Problemas bloqueantes: ninguno
