# Paso 5: pruebas manuales con curl (2026-11-07)

Cambio: `us-ui-theme`. Build con `npm run build -w frontend` servido con `vite preview` (puerto 4173).

## 5.1 Cabecera Content-Security-Policy

`curl -sI http://localhost:4173/` → `HTTP/1.1 200 OK` y

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/; frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/; connect-src 'self' https://www.google.com/recaptcha/; img-src 'self' data:; style-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

`git diff main -- frontend/content-security-policy.json` está vacío: la política no ha cambiado.

## 5.2 CSS enlazado desde `index.html`

`assets/index-CZDBf4Bs.css` (`Content-Type: text/css`, 221,86 kB, 30,46 kB en gzip). Contiene `--bs-primary:#5b5bd6`, `--bs-body-bg:#f7f8fc`, `--bs-btn-bg:#5b5bd6` (botón primario), `.cs-card`, `.cs-eyebrow` y `.cs-tone-peach` (una vez cada uno).

Sin `@import` ni `@font-face`. Las únicas `url()` son 18 `data:image/svg+xml` en línea (iconos de Bootstrap), que `img-src 'self' data:` permite; la única URL con `http` que contienen es el espacio de nombres `http://www.w3.org/2000/svg`, que no se descarga.

## 5.3 Parada

`vite preview` parado; los puertos 4173, 3000 y 3001 quedan libres.
