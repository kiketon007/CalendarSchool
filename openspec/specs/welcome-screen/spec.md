# welcome-screen Specification

## Purpose
Define la pantalla de bienvenida `/onboarding`, la página de inicio de las páginas autenticadas: el saludo con el colegio, las funcionalidades principales con su estado («Próximamente» mientras no exista su módulo), el atajo a Usuarios para el administrador, el enlace de vuelta desde la cabecera, la accesibilidad, el diseño adaptable, los textos en i18n y su E2E.
## Requirements
### Requirement: Página de inicio con saludo y colegio
`/onboarding` MUST ser la página de inicio de las páginas autenticadas: cuelga del layout que aplica la guarda de sesión y es el destino tras el registro, tras el login y cuando la guarda de rol saca a un usuario de una página que no le corresponde. MUST mostrar un `h1` con el saludo y el nombre del usuario y una línea con el nombre de su colegio, ambos como texto plano. MUST conservar el `data-testid="onboarding-page"`. La pantalla MUST NOT guardar ningún estado (ni la elección del usuario ni si ya la vio) y MUST NOT impedir la navegación a otras rutas permitidas.

#### Scenario: Bienvenida tras el registro
- **GIVEN** un usuario que acaba de registrarse
- **WHEN** llega a `/onboarding`
- **THEN** ve «Te damos la bienvenida, {nombre}» como `h1` y el nombre de su colegio

#### Scenario: Bienvenida tras el login
- **GIVEN** un usuario que inicia sesión
- **WHEN** se le redirige
- **THEN** ve la misma pantalla que tras el registro

#### Scenario: Nombres con marcas o apóstrofos
- **GIVEN** un usuario o un colegio cuyo nombre contiene `<b>` o un apóstrofo
- **WHEN** se pinta la pantalla
- **THEN** los nombres aparecen como texto, sin interpretarse como HTML

#### Scenario: Sin estado guardado
- **GIVEN** un usuario en `/onboarding`
- **WHEN** recarga la página o abre directamente otra ruta permitida
- **THEN** la pantalla se muestra igual y la navegación funciona, sin nada guardado en almacenamiento

### Requirement: Funcionalidades principales con su estado
La página MUST mostrar, bajo un `h2` «Elige con qué quieres trabajar», una tarjeta por cada funcionalidad principal: **Gestión de horarios** (cursos, profesores, restricciones y generación de horarios) y **Gestión de comedor** (alumnos, inscripciones al comedor y asistencia), cada una con un icono decorativo (`aria-hidden`), un `h3` con su nombre y una descripción breve. Las funcionalidades MUST declararse como una lista de datos con una ruta opcional. Una funcionalidad **sin ruta** MUST pintarse como un bloque no interactivo (ni enlace ni botón, sin foco) con la insignia de texto «Próximamente»; una funcionalidad **con ruta** MUST pintarse como un enlace a esa ruta, sin la insignia. Hoy ninguna de las dos tiene ruta.

#### Scenario: Dos tarjetas próximamente
- **GIVEN** un usuario autenticado
- **WHEN** abre `/onboarding`
- **THEN** ve «Gestión de horarios» y «Gestión de comedor», cada una con su descripción y el texto «Próximamente»
- **AND** ninguna de las dos es un enlace ni un botón

#### Scenario: Tarjetas fuera del recorrido del teclado
- **GIVEN** un usuario en `/onboarding`
- **WHEN** recorre la página con Tab
- **THEN** el foco no se detiene en las tarjetas de horarios ni de comedor

#### Scenario: Funcionalidad con destino
- **GIVEN** una funcionalidad declarada con una ruta
- **WHEN** se pinta la pantalla
- **THEN** su tarjeta es un enlace a esa ruta y no lleva la insignia «Próximamente»

### Requirement: Atajo a Usuarios para el administrador
Solo cuando el rol de la sesión es `ADMIN`, la página MUST mostrar una sección con el `h2` «Administración» y una tarjeta **Usuarios**, con su descripción, que es un enlace a `/usuarios`. Un `MEMBER` MUST NOT ver la sección. El atajo es una comodidad de la interfaz: la autorización de `/usuarios` y de su API la siguen decidiendo la guarda de rol y el backend.

#### Scenario: Administrador
- **GIVEN** un `ADMIN` con sesión iniciada
- **WHEN** abre `/onboarding` y pulsa la tarjeta «Usuarios»
- **THEN** ve la sección «Administración» y llega a `/usuarios`

#### Scenario: Miembro
- **GIVEN** un `MEMBER` con sesión iniciada
- **WHEN** abre `/onboarding`
- **THEN** no ve la sección «Administración» ni la tarjeta «Usuarios»

### Requirement: Volver al inicio desde la cabecera
En la cabecera de las páginas autenticadas, el nombre de la aplicación MUST ser un enlace a `/onboarding`. Cuando la ruta actual es `/onboarding`, el enlace MUST marcarse con `aria-current="page"`.

#### Scenario: Desde otra página
- **GIVEN** un `ADMIN` en `/usuarios`
- **WHEN** pulsa «CalendarSchool» en la cabecera
- **THEN** llega a `/onboarding`

#### Scenario: Página actual
- **WHEN** un usuario autenticado está en `/onboarding`
- **THEN** el enlace del nombre de la aplicación lleva `aria-current="page"`

### Requirement: Accesibilidad, responsive e i18n de la bienvenida
La página MUST cumplir WCAG 2.1 AA: encabezados en orden `h1` → `h2` → `h3`, iconos ocultos a los lectores de pantalla, el estado «Próximamente» expresado con texto (no solo con color) y foco visible en los enlaces. No MUST haber regiones `role="alert"` ni `role="status"` en el contenido de la página. En pantallas estrechas (360 px) las tarjetas MUST apilarse en una columna sin desplazamiento horizontal, con los enlaces de al menos 44 × 44 px; desde el punto de corte `md` MUST mostrarse dos tarjetas por fila. Todos los textos MUST venir de i18n en `es.json` y `en.json`, y los iconos MUST ser SVG en línea, sin recursos de terceros.

#### Scenario: Sin violaciones de accesibilidad
- **WHEN** se analiza la página de un `ADMIN` y la de un `MEMBER` con `axe` (reglas WCAG 2.1 A y AA)
- **THEN** no hay violaciones

#### Scenario: Móvil
- **GIVEN** una ventana de 360 px de ancho
- **WHEN** se abre `/onboarding`
- **THEN** las tarjetas se apilan en una columna y no hay desplazamiento horizontal

#### Scenario: Textos traducidos
- **WHEN** se cambia el idioma a inglés
- **THEN** todos los textos de la página aparecen en inglés, con las mismas claves en `es.json` y `en.json`

### Requirement: Bienvenida de extremo a extremo
El E2E MUST cubrir, contra el build servido con `vite preview`, que un administrador recién registrado ve las dos tarjetas con «Próximamente», entra en `/usuarios` desde la tarjeta y vuelve a `/onboarding` con el nombre de la aplicación, y que un `MEMBER` del mismo colegio, creado con la tarea de Cypress `createUser`, inicia sesión y no ve la sección «Administración».

#### Scenario: Administrador en el E2E
- **WHEN** se ejecuta el E2E del administrador
- **THEN** ve las dos tarjetas próximamente, llega a `/usuarios` desde la tarjeta y vuelve a `/onboarding` desde la cabecera

#### Scenario: Miembro en el E2E
- **WHEN** se ejecuta el E2E del miembro
- **THEN** ve las dos tarjetas y no ve la sección «Administración»

