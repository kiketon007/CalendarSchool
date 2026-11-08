# Paso 8: pruebas manuales con curl (2026-11-08)

Cambio: `us-ui-home`. Build con `npm run build -w frontend` servido con `vite preview` (puerto 4173, desde `frontend/`). El cambio no añade endpoints: no hay peticiones de escritura que restaurar.

## 8.1 Content-Security-Policy y CSS

- `curl -sI http://localhost:4173/` → `HTTP/1.1 200 OK` con la `Content-Security-Policy` serializada desde `frontend/content-security-policy.json`; `git diff main -- frontend/content-security-policy.json` está vacío.
- CSS enlazado desde `index.html` (`assets/index-C3V2dryo.css`, 227,36 kB, 31,79 kB en gzip; `main`, 31,31 kB; límite 33,75 kB). Contiene `.cs-home-banner` y `.cs-feature-card`, y su transición dentro de `prefers-reduced-motion: no-preference`.
- Sin `@font-face` ni `@import`. Las únicas URLs son el espacio de nombres `http://www.w3.org/2000/svg` de los iconos de Bootstrap en `data:` URI (no son peticiones).

## 8.2 Rutas de la SPA

`/onboarding` y `/horarios` devuelven 200 `text/html` con la raíz (`id="root"`) de la SPA.

## 8.3 Parada

`vite preview` parado (PID 22684); los puertos 4173, 3000 y 3001 quedan libres.
