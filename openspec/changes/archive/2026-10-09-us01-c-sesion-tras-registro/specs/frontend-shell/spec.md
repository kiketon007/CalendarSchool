## ADDED Requirements

### Requirement: Sesión disponible para toda la aplicación
`main.tsx` MUST montar el proveedor de sesión alrededor de `App` sin contener lógica propia, y `App.tsx` MUST declarar la ruta `/onboarding` junto a las existentes. Las páginas que dependan de la sesión MUST leerla del contexto, sin hacer sus propias peticiones de renovación.

#### Scenario: Ruta de Onboarding declarada
- **WHEN** se monta `App` en `/onboarding` con una sesión autenticada
- **THEN** se muestra la página provisional de Onboarding

#### Scenario: Rutas existentes intactas
- **WHEN** se monta `App` en `/` o en `/registro`
- **THEN** se muestran la página inicial y el formulario de registro como antes, sin redirecciones

#### Scenario: Proxy de la cookie
- **WHEN** el navegador llama a `/api/auth/refresh` en `dev` o en `preview`
- **THEN** la petición llega al backend a través del proxy de Vite y la cookie `refresh_token` se envía y se recibe sin configuración adicional, porque frontend y API comparten origen
