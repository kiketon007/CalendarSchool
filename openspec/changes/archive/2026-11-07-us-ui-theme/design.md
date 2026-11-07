## Context

El frontend (React 19, Vite 8, react-bootstrap 2 y Bootstrap 5.3.8) carga la hoja precompilada `bootstrap/dist/css/bootstrap.min.css` desde `main.tsx` y no tiene estilos propios: todo usa las clases de Bootstrap. La maqueta de diseño (Next.js, Tailwind y shadcn) define una identidad que se lleva a Bootstrap en varias historias (US-UI-*). Esta es la primera: el tema y la cabecera de página. Solo afecta al frontend: no hay capas de dominio, aplicación ni infraestructura implicadas, ni cambios en la API, el modelo de datos, la autenticación o el aislamiento por colegio.

Restricciones vigentes: CSP estricta (`style-src 'self'`, `font-src 'self'`, sin `unsafe-*`), textos solo por i18n, WCAG 2.1 AA, sin desplazamiento horizontal a 360 px y la cobertura del 80 % en el frontend. jsdom no calcula estilos, por eso las pruebas de `axe` de los componentes desactivan `color-contrast`, y el E2E no ejecuta `axe`.

Línea base medida el 2026-11-06 con `npm run build -w frontend`: `index-*.css` 230,06 kB, **30,68 kB en gzip**.

## Goals / Non-Goals

**Goals:**
- Recolorear toda la aplicación con la paleta de la maqueta cambiando solo variables de Bootstrap.
- Garantizar por test el contraste AA de todas las parejas de color del tema.
- Dejar listas las piezas que usarán las historias siguientes: `PageHeader`, `.cs-card`, `.cs-eyebrow` y `.cs-tone-*`.

**Non-Goals:**
- Barra lateral, cabecera de la aplicación, listados, portada y resto de pantallas (otras US-UI).
- Adoptar `PageHeader` en alguna página.
- Modo oscuro, fuentes propias, iconos nuevos y cambios de textos, lógica o rutas.

## Decisions

### D1. Tema en Sass sobre el código fuente de Bootstrap

`src/styles/theme.scss` define las variables y después hace `@import 'bootstrap/scss/bootstrap'`; `main.tsx` importa `./styles/theme.scss` en lugar de la hoja precompilada. Vite compila Sass de forma nativa en cuanto `sass` está instalado (`devDependencies` del frontend; es JavaScript puro; su dependencia opcional `@parcel/watcher` solo sirve a `sass --watch` y su script de instalación se deniega en `allowScripts`).

**Alternativas descartadas:**
- *Sobrescribir variables CSS (`--bs-primary`) sobre la hoja precompilada:* los componentes de Bootstrap 5.3 llevan sus colores ya resueltos en variables propias (`.btn-primary { --bs-btn-bg: #0d6efd; … }`, el foco, las casillas, la paginación), así que habría que reescribir cada componente a mano y mantener esa lista.
- *Tailwind o shadcn:* descartado por la persona usuaria (reescritura completa sin ganancia visible).
- *CSS-in-JS:* exigiría estilos en línea o una excepción en la CSP.

### D2. Avisos de Sass

Bootstrap 5.3 usa `@import` y funciones globales que Dart Sass marca como obsoletas. En `vite.config.ts`, `css.preprocessorOptions.scss` lleva `quietDeps: true` (silencia lo que sale de `node_modules`) y `silenceDeprecations: ['import']` (el `@import` de nuestro propio `theme.scss`, inevitable mientras Bootstrap 5 no admita `@use` con configuración). Cualquier otro aviso se trata como un error a corregir: el build no debe emitir avisos de Sass. Se fija `sass` en `^1` (la 2.0 eliminará `@import`; subir de mayor implicará Bootstrap 6).

### D3. Tokens

| Variable de Bootstrap | Valor | Motivo |
|-----------------------|-------|--------|
| `$primary` | `#5b5bd6` | marca; texto blanco 5,37:1, sobre `#f7f8fc` 5,06:1 |
| `$body-bg` | `#f7f8fc` | fondo de página |
| `$body-color` | `#17233b` | texto; 14,77:1 sobre el fondo |
| `$body-secondary-color` | `#5b6478` | texto secundario (`text-body-secondary`, `text-muted`); 5,59:1 sobre el fondo y 5,93:1 sobre blanco. La maqueta usa `#94a3b8` (2,56:1) |
| `$border-color` | `#e7e9f0` | bordes de tarjetas y tablas (decorativos) |
| `$input-bg` / `$input-border-color`, `$form-check-input-border` | `#fff` / `#868e9f` | el borde de los campos es lo único que delimita el control: 3,29:1 (WCAG 1.4.11). La maqueta usa `#e8eaf1` (1,2:1) |
| `$border-radius`, `-sm`, `-lg`, `-xl` | `.625rem`, `.5rem`, `1rem`, `1.375rem` | radios de la maqueta |
| `$headings-font-weight` | `800` | titulares de la maqueta; `letter-spacing: -0.03em` en `h1`–`h3` con una regla propia |
| `$card-border-color`, `$card-bg` | `$border-color`, `#fff` | tarjetas blancas sobre el fondo |
| `$min-contrast-ratio` | `4.5` | el de Bootstrap; elige texto blanco en el botón primario |

Los colores de estado (`success`, `danger`, `warning`, `info`) se quedan como en Bootstrap. La tipografía es la pila del sistema que ya trae Bootstrap: la maqueta tampoco carga una fuente propia y la CSP no admite fuentes externas.

### D4. Clases propias con prefijo `cs-`

Definidas al final de `theme.scss`, con los tokens de Sass:
- `.cs-card`: `background: #fff`, borde `$border-color`, `border-radius: $border-radius-lg`, relleno `1.5rem` (`1rem` por debajo de 576 px) y una sombra muy suave.
- `.cs-eyebrow`: `0.75rem`, mayúsculas, `letter-spacing: .14em`, peso 700, color primario.
- `.cs-tone-*`: fondo pastel de la maqueta y un primer plano **oscurecido** para llegar a 4,5:1, porque se usarán con texto (insignias) además de iconos. Los primeros planos de la maqueta no llegan: melocotón `#d27b59` 2,81:1, menta `#30946d` 3,41:1, amarillo `#b5821e` 3,15:1.

| Clase | Fondo | Primer plano | Contraste |
|-------|-------|--------------|-----------|
| `.cs-tone-lavender` | `#eeefff` | `#5b5bd6` | 4,71:1 |
| `.cs-tone-peach` | `#fff0ea` | `#b0522f` | 4,62:1 |
| `.cs-tone-mint` | `#e6f8f0` | `#1f7a56` | 4,79:1 |
| `.cs-tone-yellow` | `#fff6d9` | `#8a5e0c` | 5,27:1 |

El prefijo evita colisiones con Bootstrap y deja claro qué es propio. `$enable-reduced-motion` (activo por defecto en Bootstrap) ya desactiva sus transiciones; las propias se envuelven en `@media (prefers-reduced-motion: no-preference)`.

### D5. `PageHeader`

`src/components/PageHeader.tsx`, componente de presentación sin estado ni textos propios:

```ts
type PageHeaderProps = {
  title: string;
  titleId: string;
  titleRef?: Ref<HTMLHeadingElement>;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
};
```

Reproduce el marcado que ya usan las páginas (`d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4` y `h1` con `id`, `ref`, `tabIndex={-1}` y `mb-0`), para que adoptarlo en US-UI-LISTS no cambie el foco ni los selectores de los tests. El sobretítulo es un `p.cs-eyebrow` antes del `h1` (lo leen juntos los lectores de pantalla) y la descripción un `p.text-body-secondary`. Sin `actions` no se pinta su contenedor. `ref` como prop normal (React 19), sin `forwardRef`.

### D6. Cómo se prueba

- **`src/styles/theme.test.ts`** (entorno por defecto de Vitest: `setupTests.ts` usa `window` en cada `afterEach`, así que el entorno `node` no sirve, y Sass compila igual): compila `theme.scss` con la API de `sass` (`compile`, con `loadPaths` a `node_modules` y las mismas opciones de avisos que Vite) y comprueba en el CSS resultante los valores clave (`--bs-primary`, `--bs-body-bg`, `--bs-body-color`, `--bs-secondary-color`, el `--bs-btn-bg` de `.btn-primary` y las clases `cs-`) y que la compilación no emite avisos.
- **Contraste:** el mismo test calcula con una función de luminancia relativa (WCAG 2.1, en `src/testSupport/contrast.ts`, excluido de la cobertura como el resto de `testSupport`) cada pareja de D3 y D4 leída del CSS compilado, y falla nombrando la pareja.
- **`PageHeader.test.tsx`:** los escenarios de la spec, con `axe`.
- **E2E `theme.cy.ts`:** en `/login` (pública, sin datos) comprueba con `getComputedStyle` el fondo del `body` (`rgb(247, 248, 252)`) y el del botón primario (`rgb(91, 91, 214)`). La ausencia de violaciones de la CSP la cubre `csp.cy.ts`.
- **Presupuesto:** se mide el gzip del CSS del build y se anota en el informe; el escenario de la spec fija el límite (33,75 kB).

## Risks / Trade-offs

- **Cambio visual en todas las pantallas de golpe** → Lo asumimos: es el objetivo. Solo cambian colores, radios y pesos; la estructura no. Los tests no comprueban colores (salvo el E2E nuevo), así que no deberían romperse.
- **Bordes de los campos más oscuros que en la maqueta** (`#868e9f` frente a `#e8eaf1`) → Se acepta por WCAG 1.4.11; queda anotado para que la persona usuaria lo vea en el navegador.
- **Primeros planos de los tonos más oscuros que en la maqueta** → Mismo motivo (texto en insignias).
- **Tamaño del CSS** → Bootstrap compilado desde la fuente pesa lo mismo que el precompilado; si superase el +10 %, se importan solo los parciales usados (D1 lo permite sin rehacer nada).
- **Sass 2.0 eliminará `@import`** → `sass` fijado en `^1`; la migración irá con Bootstrap 6.
- **Compilar Sass en el test añade tiempo a la suite** → Una sola compilación por fichero de test (en `beforeAll`), del orden de un segundo.
