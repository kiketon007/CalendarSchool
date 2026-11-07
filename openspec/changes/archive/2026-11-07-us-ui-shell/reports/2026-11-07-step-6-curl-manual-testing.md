# Paso 6: pruebas manuales con curl (2026-11-07)

Cambio: `us-ui-shell`. Build con `npm run build -w frontend` servido con `vite preview` (puerto 4173).

## 6.1 Content-Security-Policy y CSS

- `curl -sI http://localhost:4173/` → `HTTP/1.1 200 OK` con una `Content-Security-Policy` idéntica a la serializada desde `frontend/content-security-policy.json`; `git diff main -- frontend/content-security-policy.json` está vacío.
- CSS enlazado desde `index.html` (`assets/index-DS_i7bMo.css`, 223,93 kB, 30,98 kB en gzip): contiene `.cs-sidebar`, `.cs-topbar`, `.cs-nav-link`, `.cs-avatar` y `.cs-skip-link` (una vez cada uno) y `--bs-offcanvas-width:254px`.
- Sin `@font-face` ni `@import`, y sin URLs externas: las únicas son los espacios de nombres `http://www.w3.org/2000/svg` de iconos en línea.

## 6.2 Rutas de la SPA

`/cursos`, `/horarios/borrador` y `/profesores/resumen` devuelven 200 `text/html` con la raíz de la SPA: añadir el marco no cambia el servidor ni la función de rutas de CloudFront.

## 6.3 Parada

`vite preview` parado; los puertos 4173, 3000 y 3001 quedan libres.
