## MODIFIED Requirements

### Requirement: Layout de las páginas autenticadas
Las páginas que exigen sesión MUST colgar de una única ruta de layout que aplica la guarda de sesión: mientras la sesión se resuelve MUST mostrar un indicador de carga con `role="status"` y no el contenido; sin sesión MUST navegar a `/login` reemplazando la entrada del historial; con sesión MUST pintar el marco de la aplicación (`AppShell`: «Saltar al contenido», la barra lateral con la navegación, la cabecera con el menú de usuario y el contenedor del contenido) con la página hija dentro del contenedor. Los textos MUST venir de i18n.

#### Scenario: Sesión resolviéndose
- **WHEN** se abre una página protegida y la renovación inicial aún no ha respondido
- **THEN** se muestra un indicador con `role="status"` y no el contenido de la página

#### Scenario: Sin sesión
- **WHEN** un visitante sin sesión abre `/onboarding` o `/usuarios`
- **THEN** la aplicación navega a `/login`

#### Scenario: Con sesión
- **GIVEN** una sesión autenticada
- **WHEN** se abre `/onboarding`
- **THEN** se muestran la barra lateral con la navegación, la cabecera con el menú de usuario y la bienvenida dentro del contenedor del contenido

#### Scenario: Sesión perdida con la página abierta
- **GIVEN** un usuario en una página protegida
- **WHEN** la sesión pasa a `anonymous` (cierre en otra pestaña o renovación fallida)
- **THEN** la aplicación navega a `/login`
