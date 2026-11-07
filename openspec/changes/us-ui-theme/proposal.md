## Why

La aplicación usa el Bootstrap de serie: azul por defecto, fondo blanco y sin identidad propia, mientras que la maqueta de diseño (`kiketon007/diseno-interfaz-calendarschool`) define una identidad clara (índigo `#5b5bd6`, fondo `#f7f8fc`, tarjetas con radios amplios y tonos pastel). Es la primera de las historias técnicas de interfaz (**US-UI-THEME**, módulo «Interfaz de usuario» de `docs/User_Stories_MVP.md`) y la base de las demás (SHELL, LISTS, HOME), que necesitan los tokens y la cabecera de página. Responde al requisito no funcional del PRD §4 de una interfaz accesible (WCAG 2.1 AA) y responsive.

## What Changes

- **Tema de Bootstrap con Sass:** `sass` como dependencia de desarrollo del frontend y `src/styles/theme.scss`, que define las variables de Bootstrap con la paleta de la maqueta y después importa `bootstrap/scss/bootstrap`. `main.tsx` importa `theme.scss` en lugar de `bootstrap/dist/css/bootstrap.min.css`. Todos los componentes de Bootstrap (botones, enlaces, foco, casillas, paginación, insignias, alertas, tablas, tarjetas) toman los colores, radios y pesos nuevos sin tocarlos.
- **Corrección de contraste:** el texto secundario usa `#5b6478` (≥ 4,5:1 sobre `#f7f8fc` y sobre blanco) en lugar del gris de la maqueta (`#94a3b8`, unos 2,6:1).
- **Clases propias** para las historias siguientes: `.cs-card`, `.cs-eyebrow` y `.cs-tone-{lavender|peach|mint|yellow}`.
- **Componente `PageHeader`** (sobretítulo, H1 con `id`, ref y `tabIndex={-1}`, descripción y acciones). Se crea y se prueba, pero **no lo adopta ninguna página** en este cambio: lo harán las historias US-UI-LISTS.
- **Presupuesto de CSS:** el CSS compilado no crece más de un 10 % en gzip respecto a hoy (línea base medida el 2026-11-06: 230,06 kB y 30,68 kB en gzip según `vite build`).

**Fuera de alcance:** la barra lateral y la cabecera (US-UI-SHELL), aplicar `PageHeader` y las tarjetas a los listados (US-UI-LISTS), la portada (US-UI-HOME), el resto de pantallas (US-UI-REST), un modo oscuro, fuentes propias o externas y cualquier cambio de textos, lógica, rutas o datos.

## Capabilities

### New Capabilities

- `ui-theme`: identidad visual de la aplicación (tokens de color, contraste mínimo del texto, radios y tipografía aplicados a Bootstrap), las clases de presentación compartidas y la cabecera de página reutilizable `PageHeader`.

### Modified Capabilities

(ninguna: el esqueleto del frontend, la CSP y las páginas no cambian de comportamiento)

## Impact

- **Frontend:** `frontend/package.json` (`sass` en `devDependencies`), `src/main.tsx`, `src/styles/theme.scss` (nuevo), `src/components/PageHeader.tsx` y su test (nuevos). Las páginas cambian de aspecto, no de estructura.
- **Backend e infraestructura:** sin cambios. **No** altera `docs/api-spec.yml` ni el modelo de datos ni la CSP (`frontend/content-security-policy.json`).
- **Dependencias:** `sass` (JavaScript puro). Su dependencia opcional `@parcel/watcher` trae un script de instalación (compilar desde el código fuente si no hay binario precompilado) que solo sirve a `sass --watch`: se deniega explícitamente en `allowScripts` del `package.json` raíz.
- **Documentación:** `frontend/CLAUDE.md` (bullet «Tema»), `README.md` §2.3 (Sass en el stack) y la ficha de US-UI-THEME en `docs/User_Stories_MVP.md` (estado al terminar).
