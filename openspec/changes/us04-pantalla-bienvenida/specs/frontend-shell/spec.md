## MODIFIED Requirements

### Requirement: Sesión disponible para toda la aplicación
`main.tsx` MUST montar el proveedor de sesión alrededor de `App` sin contener lógica propia. `App.tsx` MUST declarar las rutas públicas (`/`, `/registro`, `/login`, `/privacidad`, `/invitacion` y `/restablecer`) fuera del layout de las páginas autenticadas, y `/onboarding` y `/usuarios` como rutas hijas de ese layout. Las páginas que dependan de la sesión MUST leerla del contexto, sin hacer sus propias peticiones de renovación, y MUST NOT repetir la guarda de sesión que ya aplica el layout.

#### Scenario: Ruta de Onboarding declarada
- **WHEN** se monta `App` en `/onboarding` con una sesión autenticada
- **THEN** se muestra la pantalla de bienvenida, la página de inicio de las páginas autenticadas, dentro de su layout

#### Scenario: Rutas existentes intactas
- **WHEN** se monta `App` en `/` o en `/registro`
- **THEN** se muestran la página inicial y el formulario de registro como antes, sin redirecciones

#### Scenario: Proxy de la cookie
- **WHEN** el navegador llama a `/api/auth/refresh` en `dev` o en `preview`
- **THEN** la petición llega al backend a través del proxy de Vite y la cookie `refresh_token` se envía y se recibe sin configuración adicional, porque frontend y API comparten origen
