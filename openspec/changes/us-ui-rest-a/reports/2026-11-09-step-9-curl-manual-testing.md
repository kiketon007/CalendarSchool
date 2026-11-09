# Paso 9: pruebas manuales con curl (us-ui-rest-a)

Fecha: 2026-11-09. Cambio solo de frontend: sin endpoints nuevos, sin peticiones de escritura que restaurar.

Se sirvió el build con `vite preview` (puerto 4173) y se comprobó:

- `GET /horarios` → `200` con la SPA (`<div id="root">`).
- La cabecera `Content-Security-Policy` es la de siempre (`frontend/content-security-policy.json` no cambia en este cambio): `style-src 'self'`, sin `unsafe-*`.
- El CSS enlazado (`/assets/index-BmkdJ2ix.css`, 32,05 kB en gzip) no tiene `url(http…)`, `@import url` ni fuentes externas, y contiene `.cs-generation-card`, `.cs-callout` y `.cs-stat-card`.

Tras las pruebas se paró `vite preview` y los puertos 4173, 3000 y 3001 quedaron libres.
