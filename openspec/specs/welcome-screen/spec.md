# welcome-screen Specification

## Purpose
Define la pantalla de bienvenida `/onboarding`, la página de inicio de las páginas autenticadas: el banner con la fecha, el saludo y el colegio, las siete secciones de trabajo como tarjetas enlace (las mismas que la barra lateral), el atajo a Usuarios para el administrador, el enlace de vuelta desde la barra lateral, la accesibilidad, el diseño adaptable (1, 2 o 4 columnas) con el movimiento reducido, los textos en i18n y su E2E.
## Requirements
### Requirement: Página de inicio con saludo y colegio
`/onboarding` MUST ser la página de inicio de las páginas autenticadas: cuelga del layout que aplica la guarda de sesión y es el destino tras el registro, tras el login y cuando la guarda de rol saca a un usuario de una página que no le corresponde. MUST conservar el `data-testid="onboarding-page"`. MUST abrir con un banner (una región nombrada por su `h1`) que muestra:
- la fecha de hoy en el idioma activo, con el formato largo del idioma (`dateStyle: 'full'`) y la mayúscula inicial, en un `time` con `dateTime` en formato ISO (`AAAA-MM-DD`);
- el `h1` «Hola, {nombre}»;
- la línea «Aquí tienes todo lo de {colegio}», con el colegio resaltado.

El nombre y el colegio MUST pintarse como texto plano. El texto del banner MUST tener un contraste de al menos 4,5:1 con su fondo, y su decoración MUST hacerse solo con CSS, sin elementos ni estilos en línea. La pantalla MUST NOT guardar ningún estado (ni la elección del usuario ni si ya la vio) y MUST NOT impedir la navegación a otras rutas permitidas.

#### Scenario: Bienvenida tras el registro
- **GIVEN** un usuario «José María» del colegio «CEIP Lluís Vives» que acaba de registrarse el domingo 8 de noviembre de 2026
- **WHEN** llega a `/onboarding`
- **THEN** ve «Domingo, 8 de noviembre de 2026» en un `time` con `dateTime="2026-11-08"`, el `h1` «Hola, José María» y «Aquí tienes todo lo de CEIP Lluís Vives», con el colegio resaltado

#### Scenario: Fecha en inglés
- **GIVEN** el mismo usuario el mismo día, con la aplicación en inglés
- **WHEN** abre `/onboarding`
- **THEN** ve «Sunday, November 8, 2026» y el `h1` «Hello, José María»

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

### Requirement: Atajo a Usuarios para el administrador
Solo cuando el rol de la sesión es `ADMIN`, la página MUST mostrar, después de las secciones, una sección con el `h2` «Administración» y una tarjeta **Usuarios**, con su descripción, que es un enlace a `/usuarios` con el mismo aspecto que las tarjetas de las secciones. Un `MEMBER` MUST NOT ver la sección. El atajo es una comodidad de la interfaz: la autorización de `/usuarios` y de su API la siguen decidiendo la guarda de rol y el backend.

#### Scenario: Administrador
- **GIVEN** un `ADMIN` con sesión iniciada
- **WHEN** abre `/onboarding` y pulsa la tarjeta «Usuarios»
- **THEN** ve la sección «Administración» y llega a `/usuarios`

#### Scenario: Miembro
- **GIVEN** un `MEMBER` con sesión iniciada
- **WHEN** abre `/onboarding`
- **THEN** no ve la sección «Administración» ni la tarjeta «Usuarios»

### Requirement: Volver al inicio desde la cabecera
En la barra lateral de las páginas autenticadas, la marca de la aplicación y el enlace «Inicio» MUST llevar a `/onboarding`. Cuando la ruta actual es `/onboarding`, «Inicio» MUST marcarse con `aria-current="page"` y la marca no, para que haya un solo enlace actual.

#### Scenario: Desde otra página
- **GIVEN** un `ADMIN` en `/usuarios`
- **WHEN** pulsa la marca «CalendarSchool» o «Inicio» en la barra lateral
- **THEN** llega a `/onboarding`

#### Scenario: Página actual
- **WHEN** un usuario autenticado está en `/onboarding`
- **THEN** «Inicio» lleva `aria-current="page"` y la marca no

### Requirement: Accesibilidad, responsive e i18n de la bienvenida
La página MUST cumplir WCAG 2.1 AA:
- encabezados en orden: `h1`, `h2` de las secciones con un `h3` por tarjeta y, para el `ADMIN`, el `h2` «Administración» con su `h3`;
- iconos y flechas ocultos a los lectores de pantalla;
- contraste AA de todo texto;
- solo las tarjetas son enfocables en el contenido, con foco visible.

No MUST haber regiones `role="alert"` ni `role="status"` en el contenido de la página. La cuadrícula de tarjetas MUST tener una columna por debajo de 576 px, dos desde 576 px y cuatro desde 1200 px, sin desplazamiento horizontal a 360 ni a 1280 px, y cada tarjeta MUST medir al menos 44 px de alto. La elevación de una tarjeta al pasar el ratón y cualquier transición MUST aplicarse solo cuando el usuario no pide reducir el movimiento (`prefers-reduced-motion`). Todos los textos MUST venir de i18n en `es.json` y `en.json`, y los iconos MUST ser SVG en línea, sin recursos de terceros.

#### Scenario: Sin violaciones de accesibilidad
- **WHEN** se analiza la página de un `ADMIN` y la de un `MEMBER` con `axe` (reglas WCAG 2.1 A y AA)
- **THEN** no hay violaciones

#### Scenario: Orden de encabezados
- **WHEN** un `ADMIN` abre `/onboarding`
- **THEN** los encabezados son `h1`, `h2`, siete `h3`, `h2` y `h3`, y para un `MEMBER` son `h1`, `h2` y siete `h3`

#### Scenario: Móvil
- **GIVEN** una ventana de 360 px de ancho
- **WHEN** se abre `/onboarding`
- **THEN** las tarjetas se apilan en una columna y no hay desplazamiento horizontal

#### Scenario: Pantalla ancha
- **GIVEN** una ventana de 1280 px de ancho, con la barra lateral visible
- **WHEN** se abre `/onboarding`
- **THEN** las cuatro primeras tarjetas están en la misma fila y no hay desplazamiento horizontal

#### Scenario: Movimiento reducido
- **GIVEN** el CSS compilado del tema
- **WHEN** se buscan las transiciones de las tarjetas de la portada
- **THEN** solo existen dentro de `@media (prefers-reduced-motion: no-preference)`

#### Scenario: Textos traducidos
- **WHEN** se cambia el idioma a inglés
- **THEN** todos los textos de la página aparecen en inglés, con las mismas claves en `es.json` y `en.json`

### Requirement: Bienvenida de extremo a extremo
El E2E MUST cubrir, contra el build servido con `vite preview`, lo siguiente:
- un administrador recién registrado ve su nombre, su colegio y las siete secciones como enlaces, entra en una sección desde su tarjeta, vuelve a `/onboarding`, entra en `/usuarios` desde su tarjeta y vuelve con el nombre de la aplicación;
- un `MEMBER` del mismo colegio, creado con la tarea de Cypress `createUser`, inicia sesión, ve las siete secciones y no ve la sección «Administración»;
- la cuadrícula tiene una columna a 360 px y cuatro tarjetas en la primera fila a 1280 px, sin desplazamiento horizontal en ninguna de las dos anchuras.

#### Scenario: Administrador en el E2E
- **WHEN** se ejecuta el E2E del administrador
- **THEN** ve las siete secciones como enlaces, llega a la de Horarios y vuelve, llega a `/usuarios` desde la tarjeta y vuelve a `/onboarding` desde la barra lateral

#### Scenario: Miembro en el E2E
- **WHEN** se ejecuta el E2E del miembro
- **THEN** ve las siete secciones y no ve la sección «Administración»

#### Scenario: Anchuras en el E2E
- **WHEN** se ejecuta el E2E a 360 y a 1280 px
- **THEN** a 360 px hay una columna, a 1280 px las cuatro primeras tarjetas comparten fila y en ninguna hay desplazamiento horizontal

### Requirement: Secciones del colegio
Bajo el sobretítulo «Tu colegio» y el `h2` «¿Qué quieres gestionar hoy?», la página MUST mostrar una tarjeta por cada sección de trabajo, en este orden: **Horarios** (`/horarios`), **Cursos** (`/cursos`), **Profesores** (`/profesores`), **Alumnos** (`/alumnos`), **Calendarios** (`/calendarios`), **Asignaturas** (`/asignaturas`) y **Reglas** (`/reglas`).

Cada tarjeta:
- MUST ser un enlace a su ruta, con el icono que la sección tiene en la barra lateral (decorativo), un tono, una flecha decorativa, un `h3` con su nombre y una descripción breve;
- tiene como nombre accesible el contenido del enlace;
- MUST llevar el mismo nombre que la sección en la barra lateral.

El conjunto de destinos de las tarjetas MUST coincidir con el de los enlaces de «Espacio de trabajo» de la barra lateral, salvo «Inicio». No MUST existir ninguna tarjeta sin destino ni ninguna insignia «Próximamente». La página no muestra «Comedor».

#### Scenario: Siete secciones enlazadas
- **GIVEN** un usuario autenticado
- **WHEN** abre `/onboarding`
- **THEN** ve, en orden, «Horarios», «Cursos», «Profesores», «Alumnos», «Calendarios», «Asignaturas» y «Reglas», cada una como un enlace a su ruta y con su descripción
- **AND** no ve «Gestión de comedor» ni el texto «Próximamente»

#### Scenario: Las mismas secciones que la barra lateral
- **GIVEN** los enlaces de «Espacio de trabajo» de la barra lateral
- **WHEN** se comparan con los destinos de las tarjetas
- **THEN** son los mismos, salvo «Inicio», que no tiene tarjeta

#### Scenario: Ir a una sección
- **GIVEN** un usuario en `/onboarding`
- **WHEN** pulsa la tarjeta «Horarios»
- **THEN** llega a `/horarios`

