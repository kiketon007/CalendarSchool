# ui-theme Specification

## Purpose
TBD - created by archiving change us-ui-theme. Update Purpose after archive.
## Requirements
### Requirement: Tema de Bootstrap con la identidad visual de la aplicación
La hoja de estilos de la aplicación MUST compilarse desde un único fichero Sass (`src/styles/theme.scss`) que defina las variables de Bootstrap con la paleta de la maqueta y después importe Bootstrap completo; `main.tsx` MUST importar ese fichero y MUST NOT importar además la hoja precompilada de Bootstrap. Los tokens MUST ser: color primario `#5b5bd6`, fondo de página `#f7f8fc`, texto `#17233b`, bordes `#e7e9f0`, radio base `.625rem` (con variantes mayores para tarjetas) y titulares con peso 800. Los componentes de Bootstrap (botones, enlaces, anillo de foco, casillas, paginación, insignias, tarjetas) MUST derivar sus colores de esos tokens sin que ningún componente de la aplicación los repita. La tipografía MUST ser la pila del sistema de Bootstrap: sin fuentes propias ni externas.

#### Scenario: Botón primario y enlaces con el color de marca
- **GIVEN** la aplicación compilada con el tema
- **WHEN** se pinta un botón `btn-primary` o un enlace
- **THEN** el fondo del botón y el color del enlace son `#5b5bd6` y el texto del botón es blanco

#### Scenario: Fondo y texto de la página
- **GIVEN** cualquier página de la aplicación, pública o autenticada
- **WHEN** se carga en un navegador real
- **THEN** el fondo del `body` es `#f7f8fc` y el color del texto es `#17233b`

#### Scenario: Una sola hoja de Bootstrap
- **GIVEN** el build de producción
- **WHEN** se inspecciona el CSS generado
- **THEN** hay una sola copia de Bootstrap, la compilada desde `theme.scss`, y el build no emite avisos de Sass

### Requirement: Contraste mínimo de los textos del tema
Toda pareja de texto y fondo definida por el tema MUST alcanzar un contraste de al menos 4,5:1 (WCAG 2.1 AA, texto normal): el texto principal, el texto secundario y los enlaces sobre el fondo de página y sobre blanco, y el texto de los botones sobre su color. El texto secundario MUST usar `#5b6478` (o uno más oscuro), no el gris de la maqueta (`#94a3b8`). El borde de los campos de formulario MUST alcanzar al menos 3:1 frente al fondo del campo (WCAG 1.4.11). El contraste MUST comprobarse con un test sobre los valores compilados del tema, porque jsdom no calcula los estilos.

#### Scenario: Texto secundario legible
- **GIVEN** el tema compilado
- **WHEN** se calcula el contraste del texto secundario sobre `#f7f8fc` y sobre `#fff`
- **THEN** ambos son ≥ 4,5:1

#### Scenario: Gris de la maqueta rechazado
- **GIVEN** que alguien cambia el texto secundario a `#94a3b8`
- **WHEN** se ejecutan los tests del tema
- **THEN** el test de contraste falla indicando la pareja y su contraste

#### Scenario: Borde de los campos perceptible
- **GIVEN** el tema compilado
- **WHEN** se calcula el contraste del borde de un campo de formulario frente a su fondo
- **THEN** es ≥ 3:1

### Requirement: Clases de presentación compartidas
El tema MUST ofrecer, con el prefijo `cs-` para no chocar con Bootstrap, las clases que usarán las pantallas: `.cs-card` (superficie blanca con borde del tema, radio de tarjeta y relleno), `.cs-eyebrow` (sobretítulo en mayúsculas, peso 700, color primario, al menos 12 px) y `.cs-tone-lavender`, `.cs-tone-peach`, `.cs-tone-mint` y `.cs-tone-yellow` (fondo pastel y color de primer plano de cada tono, con contraste ≥ 4,5:1 entre ambos). Las clases MUST NOT aplicarse por sí solas a elementos existentes: solo cambian lo que las use. Las transiciones del tema MUST desactivarse con `prefers-reduced-motion: reduce`.

#### Scenario: Tonos con contraste suficiente
- **GIVEN** el tema compilado
- **WHEN** se calcula el contraste de cada `.cs-tone-*` entre su color y su fondo
- **THEN** los cuatro son ≥ 4,5:1

#### Scenario: Sin efectos sobre lo que no las usa
- **GIVEN** una página que no usa ninguna clase `cs-`
- **WHEN** se carga con el tema nuevo
- **THEN** solo cambian los colores, radios y pesos heredados de Bootstrap, no su estructura

### Requirement: Cabecera de página reutilizable
El frontend MUST ofrecer el componente `PageHeader` con: un sobretítulo opcional (`.cs-eyebrow`), el título como `h1` con el `id` recibido, la ref recibida y `tabIndex={-1}` (para que las páginas sigan moviendo el foco a su título), una descripción opcional en texto secundario y un hueco opcional de acciones. Todo el texto MUST llegar por props ya traducidas (el componente no tiene textos propios) y pintarse como texto plano. En pantallas estrechas las acciones MUST pasar debajo del título sin desplazamiento horizontal. Las páginas de listado que adoptan el diseño (ver `list-page-layout`; hoy `/cursos` y `/calendarios`) MUST usarlo para su cabecera.

#### Scenario: Cabecera completa
- **GIVEN** un `PageHeader` con sobretítulo, título, descripción y un botón de acción
- **WHEN** se pinta
- **THEN** el sobretítulo precede al `h1`, el `h1` tiene el `id` indicado y `tabIndex=-1`, la descripción sigue al título y el botón aparece en la zona de acciones

#### Scenario: Foco programático en el título
- **GIVEN** una página que pasa una ref al `PageHeader`
- **WHEN** la página llama a `focus()` sobre esa ref
- **THEN** el foco queda en el `h1`

#### Scenario: Cabecera mínima
- **GIVEN** un `PageHeader` solo con título
- **WHEN** se pinta
- **THEN** no aparecen ni el sobretítulo, ni la descripción, ni un contenedor de acciones vacío

#### Scenario: Textos con marcas
- **GIVEN** un título o una descripción que contienen `<b>`
- **WHEN** se pinta la cabecera
- **THEN** se muestran como texto, sin interpretarse como HTML

#### Scenario: Accesible
- **GIVEN** un `PageHeader` completo
- **WHEN** se analiza con `axe`
- **THEN** no hay infracciones

#### Scenario: Adoptado por los listados
- **WHEN** se abren `/cursos` y `/calendarios`
- **THEN** su cabecera la pinta `PageHeader`, con sobretítulo y descripción

### Requirement: Tema compatible con la CSP y con presupuesto de tamaño
El tema MUST NOT exigir cambios en `frontend/content-security-policy.json`: sin estilos en línea en el marcado, sin fuentes ni hojas externas. El CSS compilado MUST NOT crecer más de un 10 % en gzip respecto a la línea base medida antes del cambio (30,68 kB en gzip según `vite build`, 2026-11-06); si lo supera, MUST importarse solo la parte de Bootstrap que la aplicación usa.

#### Scenario: Sin violaciones de la CSP
- **GIVEN** el build servido con la CSP de producción (`vite preview`)
- **WHEN** se recorren las páginas en el E2E
- **THEN** no hay violaciones de la CSP

#### Scenario: Presupuesto respetado
- **GIVEN** el build de producción con el tema
- **WHEN** se mide el CSS en gzip
- **THEN** no supera 33,75 kB (30,68 kB + 10 %)

