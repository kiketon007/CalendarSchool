## MODIFIED Requirements

### Requirement: Sesión disponible para toda la aplicación
`main.tsx` MUST montar el proveedor de sesión alrededor de `App` sin contener lógica propia. `App.tsx` MUST declarar las rutas públicas (`/`, `/registro`, `/login` y `/privacidad`) fuera del layout de las páginas autenticadas, y `/onboarding` y `/usuarios` como rutas hijas de ese layout. Las páginas que dependan de la sesión MUST leerla del contexto, sin hacer sus propias peticiones de renovación, y MUST NOT repetir la guarda de sesión que ya aplica el layout.

#### Scenario: Ruta de Onboarding declarada
- **WHEN** se monta `App` en `/onboarding` con una sesión autenticada
- **THEN** se muestra la página provisional de Onboarding dentro del layout de las páginas autenticadas

#### Scenario: Rutas existentes intactas
- **WHEN** se monta `App` en `/` o en `/registro`
- **THEN** se muestran la página inicial y el formulario de registro como antes, sin redirecciones

#### Scenario: Proxy de la cookie
- **WHEN** el navegador llama a `/api/auth/refresh` en `dev` o en `preview`
- **THEN** la petición llega al backend a través del proxy de Vite y la cookie `refresh_token` se envía y se recibe sin configuración adicional, porque frontend y API comparten origen

## ADDED Requirements

### Requirement: Layout de las páginas autenticadas
Las páginas que exigen sesión MUST colgar de una única ruta de layout que aplica la guarda de sesión: mientras la sesión se resuelve MUST mostrar un indicador de carga con `role="status"` y no el contenido; sin sesión MUST navegar a `/login` reemplazando la entrada del historial; con sesión MUST mostrar la cabecera, la navegación y el contenido de la página hija. Los textos MUST venir de i18n.

#### Scenario: Sesión resolviéndose
- **WHEN** se abre una página protegida y la renovación inicial aún no ha respondido
- **THEN** se muestra un indicador con `role="status"` y no el contenido de la página

#### Scenario: Sin sesión
- **WHEN** un visitante sin sesión abre `/onboarding` o `/usuarios`
- **THEN** la aplicación navega a `/login`

#### Scenario: Con sesión
- **GIVEN** una sesión autenticada
- **WHEN** se abre `/onboarding`
- **THEN** se muestran la cabecera, la navegación y la bienvenida

#### Scenario: Sesión perdida con la página abierta
- **GIVEN** un usuario en una página protegida
- **WHEN** la sesión pasa a `anonymous` (cierre en otra pestaña o renovación fallida)
- **THEN** la aplicación navega a `/login`

### Requirement: Guarda de rol en el frontend
Las páginas reservadas a un rol MUST colgar además de una guarda que, si el rol de la sesión en memoria no es el exigido, navega a `/onboarding` reemplazando la entrada del historial, sin mostrar ningún mensaje. La guarda es solo una comodidad de la interfaz: la autorización la decide siempre el backend.

#### Scenario: Miembro abre una página de administrador
- **GIVEN** un `MEMBER` con sesión iniciada
- **WHEN** abre `/usuarios`
- **THEN** la aplicación navega a `/onboarding` sin mensaje y sin pedir la lista al backend

#### Scenario: Administrador
- **GIVEN** un `ADMIN` con sesión iniciada
- **WHEN** abre `/usuarios`
- **THEN** se muestra la página de usuarios
