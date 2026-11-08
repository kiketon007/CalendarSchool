# Paso 6: pruebas manuales con curl (2026-11-08)

Cambio: `us-ui-lists-c`. Build con `npm run build -w frontend` servido con `vite preview` (puerto 4173, desde `frontend/`).

## 6.1 Content-Security-Policy y CSS

- `curl -sI http://localhost:4173/` → `HTTP/1.1 200 OK` con la `Content-Security-Policy` serializada desde `frontend/content-security-policy.json`; `git diff main -- frontend/content-security-policy.json` está vacío.
- CSS enlazado desde `index.html` (`assets/index-Bw4d3ESW.css`, 225,22 kB, 31,31 kB en gzip; igual que `main`): sin reglas nuevas.
- Sin `@font-face` ni `@import`, y sin URLs externas: la única es el espacio de nombres `http://www.w3.org/2000/svg` de los iconos en línea.

## 6.2 Rutas de la SPA

`/asignaturas` y `/reglas` devuelven 200 `text/html` con la raíz (`id="root"`) de la SPA.

## 6.3 Parada

`vite preview` parado; los puertos 4173, 3000 y 3001 quedan libres.
