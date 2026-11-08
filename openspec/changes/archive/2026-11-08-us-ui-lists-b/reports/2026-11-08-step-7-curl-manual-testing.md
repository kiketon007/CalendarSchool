# Paso 7: pruebas manuales con curl (2026-11-08)

Cambio: `us-ui-lists-b`. Build con `npm run build -w frontend` servido con `vite preview` (puerto 4173, desde `frontend/`).

## 7.1 Content-Security-Policy y CSS

- `curl -sI http://localhost:4173/` → `HTTP/1.1 200 OK` con la `Content-Security-Policy` serializada desde `frontend/content-security-policy.json`; `git diff main -- frontend/content-security-policy.json` está vacío.
- CSS enlazado desde `index.html` (`assets/index-Bw4d3ESW.css`, 225,22 kB, 31,31 kB en gzip): contiene `.cs-search-wide` (1 aparición).
- Sin `@font-face` ni `@import`, y sin URLs externas: la única es el espacio de nombres `http://www.w3.org/2000/svg` de los iconos en línea.

## 7.2 Rutas de la SPA

`/profesores`, `/profesores/resumen` y `/alumnos` devuelven 200 `text/html` con la raíz (`id="root"`) de la SPA.

## 7.3 Parada

`vite preview` parado; los puertos 4173, 3000 y 3001 quedan libres.
