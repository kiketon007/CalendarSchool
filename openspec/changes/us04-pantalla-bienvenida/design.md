## Context

`/onboarding` existe desde US01_c como página provisional (`pages/OnboardingPage.tsx`): un `h1` con el saludo y un párrafo con el colegio. Cuelga de `AuthenticatedLayout`, que monta `AppHeader` y aplica la guarda de sesión, y es el destino del registro (`RegisterPage`), del login (`LoginPage`), de `RequireRole` y de la salida de `UsersPage` ante un `403`. Unos 28 ficheros (código, tests unitarios y E2E) dependen de la ruta, del `data-testid="onboarding-page"` o de que el nombre del colegio aparezca en esa página. La cabecera muestra el nombre de la aplicación como texto, el enlace «Usuarios» para `ADMIN`, el usuario, el colegio y «Cerrar sesión».

Es un cambio solo de la capa de presentación del frontend: no toca el backend, el contrato (`docs/api-spec.yml`), el modelo de datos ni la infraestructura. Las decisiones de producto están en la ficha de US04: mantener `/onboarding`, sin `/dashboard`, las dos funcionalidades desactivadas con «Próximamente» y un atajo a «Usuarios» para el administrador.

## Goals / Non-Goals

**Goals:**
- Convertir `/onboarding` en la página de inicio definitiva, con las dos funcionalidades del PRD y el atajo de administración.
- Dejar un punto de extensión que permita a las historias de cada módulo activar su tarjeta con una sola línea (la ruta).
- Volver al inicio desde cualquier página autenticada a través del nombre de la aplicación.
- Cero regresiones en los flujos que ya llevan a `/onboarding`.

**Non-Goals:**
- Rutas `/welcome` o `/dashboard`, persistir la elección o si el usuario ya vio la pantalla, una bienvenida diferente la primera vez, asistentes de configuración.
- Las rutas y páginas de horarios, cursos, comedor o alumnos.
- Cualquier cambio de backend, API, base de datos, CSP o dependencias.

## Decisions

### D1. Se mantiene la ruta, el identificador de test y el saludo

`/onboarding`, `data-testid="onboarding-page"`, la clave `onboarding.title` y la presencia del nombre del colegio no cambian. Solo cambian el texto de `onboarding.message` y lo que se añade debajo.

*Alternativas descartadas:* renombrar a `/welcome` (como decía la ficha original) o a `/bienvenida`: tocaría ~28 ficheros y tres fichas anteriores sin valor para el usuario.

### D2. Las funcionalidades como datos y una tarjeta que decide por la ruta

`OnboardingPage` declara una lista constante de funcionalidades, cada una con una clave (`schedules`, `canteen`), un componente de icono y una ruta opcional (`to?: string`). Un componente de presentación, `components/FeatureCard.tsx`, recibe la clave (para los textos `onboarding.features.<clave>.*`), el icono y la ruta:
- sin ruta: un bloque (`article` con `aria-labelledby` a su `h3`) no interactivo, con la insignia «Próximamente» (`Badge` de react-bootstrap con `bg="secondary"`, texto blanco sobre `#6c757d`, contraste 4,69:1, AA para texto pequeño);
- con ruta: un `Link` de react-router con aspecto de tarjeta y sin la insignia, de al menos 44 px de alto.

El mismo `FeatureCard` pinta la tarjeta «Usuarios» de la sección de administración (siempre con ruta). Así el test de la tarjeta con ruta (CA9) se escribe contra `FeatureCard` sin tocar los datos reales, y activar un módulo en el futuro es añadir `to` a su entrada.

*Alternativas descartadas:* `button disabled` (no recibe foco y algunos lectores de pantalla no lo anuncian; además sugiere una acción), un `Link` con `aria-disabled` (sigue siendo enfocable y navegable con algunos lectores), y enlazar a rutas inexistentes (daría `404` en la primera pantalla).

### D3. Iconos en SVG en línea, sin dependencias

Tres iconos pequeños (calendario para horarios, cubiertos para comedor y personas para usuarios) como componentes React con SVG en línea, `aria-hidden="true"` y `focusable="false"`, en `components/icons/`. Se pueden basar en los trazos de Bootstrap Icons (licencia MIT, se cita en un comentario).

*Alternativa descartada:* el paquete `bootstrap-icons` o su CSS: una dependencia y una fuente para tres iconos, y una hoja de estilos adicional que vigilar con la CSP.

### D4. Rol en la sección de administración, leído de la sesión

La sección «Administración» se pinta si `state.data.user.role === 'ADMIN'`, igual que el enlace de la cabecera. Es una comodidad: `/usuarios` sigue protegida por `RequireRole` y por el backend, y un rol desfasado en memoria solo hace que el usuario vea o no el atajo hasta la siguiente renovación.

### D5. El nombre de la aplicación en la cabecera es un `NavLink`

`AppHeader` sustituye el `strong` por un `NavLink to="/onboarding"` con el mismo aspecto (negrita, sin subrayado). `NavLink` ya añade `aria-current="page"` cuando la ruta coincide; no se añade un enlace «Inicio» aparte en la navegación, para no duplicar el destino.

### D6. Maquetación con la cuadrícula de Bootstrap

`Row` con `xs={1} md={2}` y `g-3` para las dos funcionalidades y una fila propia para la administración. Las tarjetas ocupan todo el alto de su columna (`h-100`). Sin estilos propios salvo las utilidades de Bootstrap.

### D7. Textos

Se reescribe `onboarding.message` (ya no promete configurar el colegio «muy pronto», pero sigue nombrándolo) y se añaden `onboarding.features.title`, `onboarding.features.schedules.{name,description}`, `onboarding.features.canteen.{name,description}`, `onboarding.comingSoon`, `onboarding.admin.title` y `onboarding.admin.users.{name,description}`, en `es.json` y `en.json`.

## Risks / Trade-offs

- [Un E2E o test existente asierta el texto antiguo de `onboarding.message`] → los existentes solo comprueban el `data-testid` y que contenga el nombre del colegio; se revisan todos en la tarea de tests existentes y se ejecuta la suite E2E completa.
- [La historia de un módulo olvida activar su tarjeta] → la ficha y las specs de US04 lo dejan anotado; se recordará al crear los cambios de US05 y de alumnos/comedor.
- [Contraste de la insignia] → `bg="secondary"` cumple AA; `axe` en jsdom no mide contraste, así que se comprueba en el navegador (Cypress o manual).
- [Rol desfasado en memoria] → solo afecta a si se ve el atajo; la autorización real no depende de él.

## Migration Plan

Despliegue normal del frontend con el pipeline existente; no hay migraciones ni variables nuevas. Vuelta atrás: revertir el commit.

## Open Questions

Ninguna: las decisiones de producto quedaron cerradas en la ficha de US04.
