## Context

Hoy `AuthenticatedLayout` pinta `components/AppHeader` y debajo el `<Outlet />`. `AppHeader` es una franja con:
- el nombre de la aplicación, enlace a `/onboarding` con `aria-current`;
- un `nav` «Navegación principal» con 8 enlaces (Usuarios solo para `ADMIN`);
- el usuario con su colegio;
- el botón «Cerrar sesión», con guarda síncrona, alerta si falla y navegación a `/login` con `replace`.

Cada página pinta su propio `<Container as="main">`.

US-UI-THEME dejó el tema en Sass (`styles/theme.scss`), las clases `cs-` y `PageHeader`. La maqueta define una barra lateral blanca de 254 px y una cabecera superior blanca con el menú de usuario.

Restricciones:
- CSP estricta (`style-src 'self'`), así que no hay estilos en línea en el marcado. Los estilos aplicados desde JavaScript, como los que react-bootstrap usa para colocar el menú, sí están permitidos.
- Textos solo por i18n.
- WCAG 2.1 AA y sin desplazamiento horizontal a 360 px.

Es un cambio **solo de presentación** del frontend: sin capas de dominio, aplicación ni infraestructura, sin cambios en la API, el modelo de datos, la autenticación (JWT en memoria) ni el aislamiento por colegio. No afecta al rendimiento de la generación de horarios.

## Goals / Non-Goals

**Goals:**
- Sustituir `AppHeader` por el marco de la maqueta (barra lateral responsive, cabecera con menú de usuario y «Saltar al contenido») sin cambiar rutas, permisos ni la lógica de cierre de sesión.
- Un solo marcado para escritorio y móvil.
- Mantener estables los selectores que usan los E2E (el nombre accesible de la navegación y el `data-testid="app-header"`) para que el cambio en las specs sea mínimo.

**Non-Goals:**
- Rediseñar el contenido de las páginas (US-UI-LISTS, HOME y REST) o las pantallas públicas.
- Buscador, «Más opciones», Configuración, «Ayuda y soporte», la tarjeta inferior de la barra lateral y los «Volver al inicio».
- Cambiar textos existentes, salvo el del enlace de `header.calendars`, que pasa a plural («Calendarios» / «Calendars») para que se lea como los demás de la lista (Cursos, Profesores, Alumnos…). Es un cambio de valor, no de clave.

## Decisions

### D1. `Offcanvas` con `responsive="lg"` para la barra lateral

Un solo `Offcanvas` (`placement="start"`, `responsive="lg"`). Desde 992 px, Bootstrap lo pinta en su sitio, como un bloque normal. Por debajo, es un panel modal con su fondo, la captura del foco, Escape, el clic fuera y la vuelta del foco al elemento que lo abrió (`restoreFocus`). react-bootstrap decide el modo con `matchMedia` (`useBreakpoint`), así que en los tests se controla con `testSupport/matchMedia.ts` (`installMatchMedia`).

Bootstrap oculta `.offcanvas-header` desde `lg`. Por eso la marca y el botón «Cerrar menú» no van en `Offcanvas.Header`, sino al principio de `Offcanvas.Body`:
- la marca se ve en las dos anchuras;
- el botón es un `CloseButton` con `aria-label` «Cerrar menú» y `d-lg-none`.

El panel lleva `aria-label` «Menú» porque en modo modal tiene `role="dialog"`.

**Alternativas descartadas:**
- *Dos marcados, una columna fija y un `Offcanvas` aparte para móvil:* duplica la navegación (dos `nav` con el mismo nombre en el DOM, los E2E encontrarían dos enlaces iguales) y su mantenimiento.
- *Un panel propio con CSS:* habría que reimplementar la captura del foco, Escape, el fondo y la vuelta del foco que `Offcanvas` ya resuelve.

### D2. Estructura y estilos del marco

```
AppShell
├── a.cs-skip-link «Saltar al contenido»          (visually-hidden-focusable)
└── div.cs-shell                                    (d-lg-flex)
    ├── div.cs-sidebar                              (envoltorio de la columna fija)
    │   └── Offcanvas responsive="lg"  data-testid="app-sidebar"
    │       └── Body: marca + CloseButton(d-lg-none) + nav «Navegación principal»
    │                ├── p#shell-workspace + ul[aria-labelledby]  (8 enlaces)
    │                └── p#shell-administration + ul[aria-labelledby]  (solo ADMIN)
    └── div.cs-shell-main                           (flex-grow-1, min-width: 0)
        ├── header.cs-topbar  data-testid="app-header"
        │   ├── Button «Abrir menú» (d-lg-none)
        │   └── UserMenu
        ├── Alert de cierre fallido (si lo hay)
        └── div#contenido[tabIndex=-1]  → children (<Outlet />, con su propio main)
```

Los estilos van en un parcial nuevo, `styles/_shell.scss`, que `theme.scss` importa al final, para poder usar los mixins de puntos de corte y las variables de Bootstrap:
- **`.cs-sidebar`** es el envoltorio del `Offcanvas`. Desde `lg`, Bootstrap pinta el `Offcanvas` responsive en su sitio con `background-color: transparent !important` y `width: auto !important`, así que la columna fija es del envoltorio: `width: 254px`, `position: sticky`, `top: 0`, `height: 100vh`, `overflow-y: auto`, fondo blanco y borde derecho. Por debajo de `lg` el envoltorio es `display: contents` (desaparece del diseño) y el panel es el modal de Bootstrap. Dos variables de Sass lo ajustan: `$offcanvas-horizontal-width: 254px` y `$offcanvas-bg-color: #fff`.
- **`.cs-topbar`**: `position: sticky`, `top: 0`, fondo blanco, borde inferior y una altura mínima de 4rem.
- **`.cs-nav-link`**: fila con icono y texto, radio `$border-radius`, relleno y texto secundario con peso 600. En `.active`, fondo lavanda (`#eeefff`), texto en el color de marca y peso 700. El peso es la pista que no depende del color.
- **`.cs-nav-heading`**: estilo de `.cs-eyebrow`, con el texto secundario en lugar del color de marca.
- **`.cs-avatar`**: círculo de 2.25rem con las iniciales, en el tono melocotón (`.cs-tone-peach`).
- **`#contenido:focus`**: sin contorno. Es un destino de foco por programa, no un control.

Las transiciones del panel son las de Bootstrap, que `$enable-reduced-motion` desactiva con `prefers-reduced-motion: reduce`.

`min-width: 0` en `.cs-shell-main` impide que una tabla ancha empuje la barra.

**Alternativa descartada:** *CSS Grid para el marco.* Con `d-lg-flex` basta y se reutilizan las utilidades de Bootstrap.

### D3. Enlaces y estado activo

Una constante de módulo, `WORKSPACE_LINKS` (`{ to, labelKey, Icon }[]`), define el orden y alimenta los enlaces.
- **«Inicio»** es un `NavLink` con `end`: solo está activo en `/onboarding`.
- **El resto** son `NavLink` sin `end`, así que siguen activos en sus subrutas (`/cursos/:id/carga`, `/horarios/borrador`). Ya ocurre hoy.
- **La marca** es un `Link`, no un `NavLink`. Así nunca hay dos `aria-current="page"` a la vez: `welcome-screen` pasa ese papel a «Inicio».

Los títulos de grupo son `<p id>` ligados a su `<ul>` con `aria-labelledby`, no encabezados. Un `h2` antes del `h1` de cada página rompería el orden de encabezados que las páginas y sus tests suponen.

Cada enlace llama a `closePanel()` al pulsarse. En escritorio no tiene efecto, y en móvil cierra el panel mientras el router navega. El foco vuelve a «Abrir menú» por `restoreFocus`, porque el marco no se desmonta al cambiar de ruta.

### D4. Menú de usuario

`components/UserMenu.tsx` es un componente de presentación y no conoce la sesión ni el servicio. Recibe:
- `user` (`firstName`, `lastName` y `role`);
- `schoolName`;
- `isClosing`;
- `onLogout`.

El menú es el `Dropdown` de react-bootstrap (`align="end"`). El botón que lo abre (`data-testid="user-menu-toggle"`) tiene:
- el nombre accesible `shell.userMenu` («Menú de {{name}}»), que contiene el nombre visible;
- el círculo de las iniciales (`aria-hidden`);
- el nombre y el rol, con `d-none d-sm-block`.

Al abrirse, el menú muestra:
- con `Dropdown.ItemText`, el nombre, el rol (`shell.role.ADMIN` «Administrador» o `MEMBER` «Miembro») y el colegio;
- un `Dropdown.Divider`;
- la opción `Dropdown.Item as="button"` «Cerrar sesión» (`header.logout`), con `disabled={isClosing}`.

react-bootstrap ya resuelve el teclado: flechas, Escape y la vuelta del foco.

Las iniciales salen de `utils/initials.ts` (`initialsOf(firstName, lastName)`), una función pura con su test. Toma el primer carácter de cada parte ya recortada, contando por puntos de código (`Array.from`, para no partir caracteres compuestos), y lo pasa a mayúsculas con el idioma (`toLocaleUpperCase`). Si una parte viene vacía, se omite.

**Lógica del cierre:** se mueve sin cambios de `AppHeader` a `AppShell`, que es quien tiene la sesión:
- guarda síncrona `isClosingRef` y estado espejo `isClosing`;
- `logout()`;
- con `loggedOut`, `navigate('/login', { replace: true })`;
- con un fallo, `role="alert"` bajo la cabecera.

El menú se cierra al elegir la opción (comportamiento por defecto del `Dropdown`), así que la alerta queda fuera del menú y se reintenta abriéndolo otra vez.

**Alternativa descartada:** *dejar «Cerrar sesión» como botón suelto en la cabecera.* Es más simple, pero no es el diseño aprobado, y a 360 px no cabría junto al botón del menú.

### D5. «Saltar al contenido»

Es un `<a href="#contenido" className="visually-hidden-focusable cs-skip-link">`, el primer elemento del marco. Su `onClick` hace `preventDefault()` y `contentRef.current?.focus()`. Así no se añade `#contenido` a la dirección (el router no tiene que interpretar el fragmento) y el foco llega aunque el navegador no lo mueva solo con el fragmento.

El destino es `div#contenido` con `tabIndex={-1}`, alrededor de `children`. No es un `main`: cada página ya pinta el suyo, y un segundo `main` sería una infracción de `axe` (`landmark-no-duplicate-main`).

### D6. Iconos

Los iconos son SVG en línea copiados de Lucide (licencia ISC), un componente por icono en `components/icons/` con el patrón de los actuales (`IconProps`, `aria-hidden`, `focusable="false"`, `currentColor`). La licencia ISC exige conservar el aviso, así que cada fichero lleva el comentario «Icono de Lucide (ISC)» y el texto de la licencia va en `components/icons/LUCIDE-LICENSE.txt`.

Los iconos son:
- `HouseIcon` (Inicio);
- `BookOpenIcon` (Cursos);
- `PresentationIcon` (Profesores);
- `UsersRoundIcon` (Alumnos);
- `CalendarDaysIcon` (Calendarios);
- `LibraryIcon` (Asignaturas);
- `SlidersHorizontalIcon` (Reglas);
- `CalendarClockIcon` (Horarios);
- `UserCogIcon` (Usuarios);
- `GraduationCapIcon` (la marca);
- `MenuIcon` («Abrir menú»).

Los iconos actuales de la bienvenida no cambian (US-UI-HOME).

**Alternativa descartada:** *`lucide-react`.* Es una dependencia más para once iconos, y la decisión de las US-UI fue copiarlos.

### D7. Cómo se prueba

- **`AppShell.test.tsx`** recoge los casos de `AppHeader.test.tsx`: navegación por rol, `aria-current` en subrutas, la marca, la visibilidad según la sesión y el cierre (correcto, doble pulsación, fallo y reintento) abriendo antes el menú. Añade:
  - el panel a 360 px (abrir, Escape, «Cerrar menú», elegir un enlace, vuelta del foco);
  - «Saltar al contenido»;
  - el menú de usuario (contenido, rol, teclado);
  - `axe` a 1280 y 360 px con el panel y el menú abiertos y cerrados.

  Usa `installMatchMedia` y `describe.each` donde el comportamiento es común.
- **Las transiciones** de `Offcanvas` y `Dropdown` terminan con el temporizador de respaldo de react-bootstrap, así que los tests esperan con `findBy` o `waitFor`, con el reloj real.
- **`utils/initials.test.ts`** cubre: nombres simples, con tilde y con espacios, partes vacías y un carácter fuera del plano básico.
- **`AuthenticatedLayout.test.tsx`** comprueba que pinta el marco con la página dentro de `#contenido`.
- **E2E `shell.cy.ts`** cubre el recorrido de la spec `app-shell`. Las specs existentes que cierran sesión usan un apoyo nuevo, `cypress/support/shell.ts` (`openUserMenu()` y `logOutFromMenu()`), y `onboarding.cy.ts` busca la marca en `[data-testid="app-sidebar"]`.

## Risks / Trade-offs

- **[Riesgo] El viewport por defecto de Cypress (1000 × 660 px) está muy cerca del corte `lg` (992 px).** → Con 1000 px la barra se ve y los E2E que pulsan enlaces de la navegación siguen funcionando. El riesgo es que cambie el viewport; `shell.cy.ts` fija su ancho en cada caso, y las specs que bajan a 360 px y luego navegan por la barra se revisan una a una (tarea 7.1).
- **[Riesgo] A 1000–1280 px el contenido pierde 254 px.** Una tabla de 768 px o más puede desbordar su contenedor (la maqueta ya desbordaba en `/cursos`). → `min-width: 0` en la columna principal evita que se desplace toda la página. Las tablas se adaptan en US-UI-LISTS. Se mide `/cursos` a 1280 px en el E2E del marco.
- **[Riesgo] El `Dropdown` coloca el menú con estilos de JavaScript.** → La CSP lo permite (no son estilos en línea del marcado). `csp.cy.ts` recorre el cierre de sesión con el menú abierto y vigila las violaciones.
- **[Compromiso] El nombre del usuario se oculta por debajo de 576 px.** → El nombre accesible del botón lo conserva y el menú lo muestra al abrirse.
- **[Compromiso] Cerrar sesión pasa a dos pulsaciones.** → Es el patrón de la maqueta y de casi cualquier aplicación. Cerrar sesión no se hace a menudo.

## Migration Plan

No hay datos ni contrato que migrar: se despliega con el frontend como siempre (S3 y CloudFront). Para volver atrás, basta revertir el commit; nada más depende de `AppShell`.

## Open Questions

Ninguna. Los textos y el orden de los enlaces se mantienen como hoy.
