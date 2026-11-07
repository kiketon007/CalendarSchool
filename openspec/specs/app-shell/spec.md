# app-shell Specification

## Purpose
TBD - created by archiving change us-ui-shell. Update Purpose after archive.
## Requirements
### Requirement: Marco de las páginas autenticadas
Toda página que cuelga del layout de las páginas autenticadas MUST pintarse dentro del marco de la aplicación (`components/AppShell`). El marco tiene, en este orden de foco:
- el enlace «Saltar al contenido»;
- la barra lateral con la marca y la navegación;
- la cabecera superior con el botón «Abrir menú» (solo en pantallas estrechas) y el menú de usuario;
- el contenedor del contenido de la página.

Las páginas públicas (`/`, `/registro`, `/login`, `/privacidad`, `/invitacion` y `/restablecer`) MUST NOT mostrar el marco, aunque haya sesión. El marco MUST NOT añadir un segundo `main`: cada página sigue pintando el suyo dentro del contenedor del contenido.

#### Scenario: Página autenticada
- **GIVEN** un usuario con la sesión iniciada
- **WHEN** abre `/cursos`
- **THEN** ve la barra lateral, la cabecera con su menú de usuario y el listado de cursos
- **AND** la página tiene un solo `main`

#### Scenario: Página pública con sesión
- **GIVEN** un usuario con la sesión iniciada
- **WHEN** abre `/privacidad`
- **THEN** no ve ni la barra lateral ni la cabecera

### Requirement: Navegación de la barra lateral
La barra lateral MUST mostrar la marca (el icono del birrete y «Calendar» y «School» en dos colores) como enlace a `/onboarding`, y una sola navegación con el nombre accesible «Navegación principal» y dos grupos con su título visible:
- **«Espacio de trabajo»**, para los dos roles y en este orden: Inicio (`/onboarding`), Cursos (`/cursos`), Profesores (`/profesores`), Alumnos (`/alumnos`), Calendarios (`/calendarios`), Asignaturas (`/asignaturas`), Reglas (`/reglas`) y Horarios (`/horarios`).
- **«Administración»**, solo si el rol de la sesión es `ADMIN`: Usuarios (`/usuarios`). Para un `MEMBER`, MUST NOT pintarse ni el grupo ni su título.

Cada grupo MUST ser una lista ligada a su título. Cada enlace lleva un icono decorativo y su texto. El enlace de la sección actual MUST llevar `aria-current="page"` y el estilo activo (fondo lavanda y texto en el color de marca); también en sus subrutas (Cursos en `/cursos/<id>/carga`, Horarios en `/horarios/borrador`). «Inicio» solo lo lleva en `/onboarding` y ningún otro enlace lo lleva a la vez. La marca no lleva `aria-current`. El estado activo MUST NOT depender solo del color: lo anuncia `aria-current` y lo distingue además el peso del texto.

#### Scenario: Miembro
- **GIVEN** un `MEMBER` con sesión iniciada
- **WHEN** abre `/onboarding`
- **THEN** ve en «Espacio de trabajo» los 8 enlaces en ese orden
- **AND** no ve el grupo «Administración» ni «Usuarios»

#### Scenario: Administrador
- **GIVEN** un `ADMIN` con sesión iniciada
- **WHEN** abre `/onboarding`
- **THEN** ve además «Administración» con «Usuarios», que lleva a `/usuarios`

#### Scenario: Enlace activo en una subruta
- **WHEN** un usuario abre `/cursos/<id>/carga`
- **THEN** «Cursos» lleva `aria-current="page"` y ningún otro enlace lo lleva

#### Scenario: Inicio
- **WHEN** un usuario abre `/onboarding`
- **THEN** «Inicio» lleva `aria-current="page"` y la marca no

#### Scenario: Volver al inicio desde la marca
- **GIVEN** un usuario en `/reglas`
- **WHEN** pulsa la marca
- **THEN** llega a `/onboarding`

### Requirement: Barra lateral responsive
Desde 992 px de ancho, la barra lateral MUST verse siempre, como una columna fija de 254 px a la izquierda del contenido, que se queda en su sitio al desplazar la página. No hay botón «Abrir menú» ni «Cerrar menú».

Por debajo de 992 px, la barra MUST estar oculta y la cabecera MUST mostrar el botón «Abrir menú». Al pulsarlo, la barra se abre como un panel modal deslizante desde la izquierda, con el nombre accesible «Menú» y el foco dentro. El panel se cierra de cuatro formas, y en todas el foco MUST volver a «Abrir menú»:
- con Escape;
- con «Cerrar menú»;
- pulsando fuera;
- eligiendo un enlace, que además navega a su destino.

#### Scenario: Escritorio
- **GIVEN** una ventana de 1280 px
- **WHEN** un usuario abre `/cursos`
- **THEN** la barra lateral se ve junto al contenido y no hay botón «Abrir menú»

#### Scenario: Abrir el panel en móvil
- **GIVEN** una ventana de 360 px en `/cursos`
- **WHEN** el usuario pulsa «Abrir menú»
- **THEN** se abre el panel «Menú» con el foco dentro

#### Scenario: Cerrar con Escape
- **GIVEN** el panel abierto a 360 px
- **WHEN** el usuario pulsa Escape o «Cerrar menú»
- **THEN** el panel se cierra y el foco vuelve a «Abrir menú»

#### Scenario: Elegir un enlace en móvil
- **GIVEN** el panel abierto a 360 px en `/cursos`
- **WHEN** el usuario pulsa «Profesores»
- **THEN** llega a `/profesores` y el panel queda cerrado

### Requirement: Menú de usuario
La cabecera MUST mostrar a la derecha un botón de menú de usuario con estos elementos:
- las iniciales del usuario (la primera letra del nombre y la de los apellidos) en un círculo decorativo, oculto a los lectores de pantalla;
- el nombre y el rol: el nombre desde 576 px de ancho, y por debajo solo las iniciales;
- el nombre accesible «Menú de {nombre} {apellidos}».

Al abrirlo, el menú MUST mostrar como texto el nombre, el rol («Administrador» o «Miembro») y el colegio, y la opción «Cerrar sesión». El menú se maneja con el teclado (Intro o espacio para abrirlo, flechas para recorrer las opciones y Escape para cerrarlo con el foco de vuelta en el botón). Los nombres se pintan como texto plano.

#### Scenario: Contenido del menú
- **GIVEN** la administradora «Ana García» del colegio «CEIP Les Arts»
- **WHEN** abre el menú de usuario
- **THEN** ve «Ana García», «Administrador», «CEIP Les Arts» y «Cerrar sesión»
- **AND** el botón muestra las iniciales «AG»

#### Scenario: Rol de miembro
- **GIVEN** un `MEMBER`
- **WHEN** abre el menú de usuario
- **THEN** el rol dice «Miembro»

#### Scenario: Cerrar el menú con Escape
- **GIVEN** el menú de usuario abierto
- **WHEN** el usuario pulsa Escape
- **THEN** el menú se cierra y el foco vuelve a su botón

### Requirement: Saltar al contenido
El primer elemento enfocable de las páginas autenticadas MUST ser el enlace «Saltar al contenido». Está oculto hasta que recibe el foco del teclado y entonces se ve. Al activarlo, MUST mover el foco al contenedor del contenido de la página (`id="contenido"`, `tabIndex={-1}`) sin cambiar la dirección de la página.

#### Scenario: Saltar la navegación
- **GIVEN** un usuario de teclado que acaba de abrir `/cursos`
- **WHEN** pulsa Tab
- **THEN** el foco está en «Saltar al contenido», que se ve
- **WHEN** lo activa con Intro
- **THEN** el foco pasa al contenedor del contenido y la dirección sigue siendo `/cursos`

### Requirement: Accesibilidad, responsive e i18n del marco
El marco MUST cumplir lo siguiente:
- `axe` no encuentra infracciones WCAG 2.1 AA a 1280 px ni a 360 px, con el panel cerrado y abierto, y con el menú de usuario abierto.
- No hay desplazamiento horizontal a 360 px ni a 1280 px.
- Los iconos son decorativos (`aria-hidden`).
- Con `prefers-reduced-motion: reduce`, el panel se abre sin animación.
- Todos los textos nuevos están en `es.json` y `en.json` (`shell.*`). Los enlaces conservan sus claves `header.*`.
- Los estilos van en el tema y no hay estilos en línea en el marcado, por la CSP.

#### Scenario: Sin infracciones
- **WHEN** se ejecuta `axe` sobre el marco en cada uno de esos estados
- **THEN** no hay infracciones

#### Scenario: Sin desplazamiento horizontal
- **WHEN** se abre `/cursos` a 360 px y a 1280 px
- **THEN** el ancho del documento no supera el de la ventana

### Requirement: Marco de extremo a extremo
El E2E MUST cubrir con Cypress, contra el build servido con `vite preview` y un backend real:
- a 1280 px, la barra visible con los enlaces de cada rol y el enlace activo en una subruta;
- a 360 px, abrir el panel, cerrarlo con Escape con el foco de vuelta y navegar desde él;
- el menú de usuario con el nombre, el rol y el colegio, y «Cerrar sesión»;
- «Saltar al contenido» con el teclado;
- la ausencia de desplazamiento horizontal en las dos anchuras.

#### Scenario: Recorrido del marco
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** la spec del marco recorre esos casos y pasa

