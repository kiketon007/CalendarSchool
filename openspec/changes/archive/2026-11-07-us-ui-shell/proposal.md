## Why

La cabecera actual (`AppHeader`) es una franja con ocho enlaces seguidos que a 360 px ocupa varias líneas y que no se parece al diseño aprobado. US-UI-SHELL (`docs/User_Stories_MVP.md`, módulo «Interfaz de usuario») la sustituye por la barra lateral y la cabecera de la maqueta. Es la segunda historia del orden THEME → SHELL → LISTS → HOME → REST: US-UI-THEME ya dejó el tema, las clases `cs-` y `PageHeader`, y las páginas de los listados necesitan este marco antes de rediseñarse. El PRD pide una interfaz responsive y accesible (WCAG 2.1 AA) para todos los módulos; esta historia no añade funcionalidad.

## What Changes

- **BREAKING (interno):** `components/AppShell.tsx` sustituye a `components/AppHeader.tsx` en `AuthenticatedLayout`. `AppHeader` y su test se eliminan; sus casos pasan a `AppShell.test.tsx`.
- **Barra lateral** con el `Offcanvas` de react-bootstrap (`responsive="lg"`): columna fija de 254 px desde 992 px y panel deslizante por debajo, con un solo marcado.
  - La marca (birrete y «Calendar**School**») enlaza a `/onboarding`.
  - Grupo «Espacio de trabajo»: Inicio, Cursos, Profesores, Alumnos, Calendarios, Asignaturas, Reglas y Horarios, cada uno con su icono.
  - Grupo «Administración» (solo `ADMIN`): Usuarios.
  - Enlace activo con `aria-current="page"`, también en las subrutas. En móvil, elegir un enlace cierra el panel.
- **Cabecera superior:** botón «Abrir menú» (solo por debajo de 992 px) y menú de usuario (`Dropdown`). El menú muestra las iniciales, el nombre, el rol, el colegio y «Cerrar sesión», con la misma lógica de cierre que hoy.
- **«Saltar al contenido»:** primer elemento enfocable de las páginas autenticadas; lleva el foco al contenedor de la página.
- **Iconos** SVG en línea copiados de Lucide (licencia ISC, con su aviso) en `components/icons/`, sin `lucide-react`.
- **Textos** nuevos en `shell.*` (`es.json` y `en.json`). Se conservan las claves `header.*` de los enlaces y del cierre de sesión, con un único cambio de texto: el enlace de `header.calendars` pasa de «Calendario» a «Calendarios» (en inglés, de «Calendar» a «Calendars»), como los demás enlaces de la lista.
- **E2E:** los recorridos que cierran sesión abren antes el menú de usuario. Los que buscan la navegación siguen usando su nombre accesible («Navegación principal»).

**Fuera de alcance:**
- Lo que la maqueta tiene y la aplicación no: buscador global, «Más opciones», «Configuración», «Ayuda y soporte», la tarjeta inferior de la barra lateral y los enlaces «Volver al inicio» de cada página.
- Rediseño del contenido de las páginas (US-UI-LISTS, US-UI-HOME y US-UI-REST) y de las pantallas públicas, que no llevan el marco.
- Cambios de textos existentes, rutas, permisos o lógica de sesión.

## Capabilities

### New Capabilities
- `app-shell`: el marco de las páginas autenticadas, es decir, barra lateral responsive con sus grupos y enlaces, cabecera con el menú de usuario, «Saltar al contenido» y su accesibilidad.

### Modified Capabilities
- `frontend-shell`: el layout de las páginas autenticadas pinta el marco (barra lateral, cabecera y contenedor del contenido) en lugar de la cabecera con la navegación.
- `user-logout`: «Cerrar sesión» pasa de un botón de la cabecera a una opción del menú de usuario, que muestra además el rol.
- `welcome-screen`: la vuelta al inicio es la marca y el enlace «Inicio» de la barra lateral; `aria-current` lo lleva «Inicio».
- `school-students`, `school-calendars`, `school-subjects`, `constraints-list` y `schedule-readiness`: sus requisitos citan «la cabecera» o `AppHeader` como sitio del enlace del módulo; pasan a la navegación de la barra lateral, con el mismo orden.

## Impact

- **Frontend:**
  - Nuevos: `components/AppShell.tsx` y su test, `components/icons/*` (iconos nuevos y el aviso de licencia de Lucide) y el parcial de estilos del marco que importa `styles/theme.scss`.
  - Modificados: `routes/AuthenticatedLayout.tsx` y su test, `i18n/es.json` y `en.json`.
  - Eliminados: `components/AppHeader.tsx` y su test.
  - E2E: el apoyo para abrir el menú de usuario y las specs que cierran sesión o buscan la cabecera por su `data-testid`.
- **Sin cambios** en backend, `docs/api-spec.yml`, modelo de datos, infraestructura ni CSP (react-bootstrap coloca el panel y el menú con estilos aplicados desde JavaScript, que `style-src 'self'` permite).
- **Documentación:** `frontend/CLAUDE.md` (las menciones a `AppHeader` pasan a `AppShell`), `README.md` (árbol de componentes) y la ficha de US-UI-SHELL en `docs/User_Stories_MVP.md`.
