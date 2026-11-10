## ADDED Requirements

### Requirement: Inicio de la aplicación
La ruta `/` MUST NOT tener contenido propio: MUST navegar a `/login` reemplazando la entrada del historial (`<Navigate to="/login" replace />`), sin guarda de sesión propia. Quien no tiene sesión ve así el formulario de inicio de sesión; quien la tiene llega a `/onboarding`, porque `/login` ya redirige a la pantalla de bienvenida a una sesión autenticada. Mientras la sesión se resuelve, la persona ve el indicador de carga de `/login`, nunca contenido de `/`. La redirección ocurre en el navegador (CloudFront no conoce la sesión).

#### Scenario: Sin sesión
- **GIVEN** un visitante sin sesión
- **WHEN** abre `/`
- **THEN** la dirección pasa a `/login`, se muestra el formulario de inicio de sesión y no aparece ningún aviso de error ni error en la consola

#### Scenario: Con sesión
- **GIVEN** una persona con una sesión autenticada
- **WHEN** abre `/`
- **THEN** acaba en `/onboarding`, la pantalla de bienvenida

#### Scenario: Mientras se resuelve la sesión
- **GIVEN** que la renovación de la sesión aún no ha contestado
- **WHEN** se abre `/`
- **THEN** se ve el indicador de carga de `/login` y no se pinta ninguna página de inicio

#### Scenario: La raíz no queda en el historial
- **WHEN** un visitante sin sesión abre `/` y pulsa «atrás»
- **THEN** no vuelve a `/` ni entra en un bucle de redirecciones

## MODIFIED Requirements

### Requirement: Textos por i18n
Todo texto visible MUST obtenerse mediante react-i18next a partir de los recursos `es.json` y `en.json`, con castellano como idioma por defecto. El código MUST NOT contener textos visibles *hardcoded*.

#### Scenario: Idioma por defecto
- **GIVEN** un navegador sin preferencia de idioma guardada
- **WHEN** se carga la página de inicio de sesión
- **THEN** los textos se muestran en castellano desde `es.json`

#### Scenario: Recursos completos
- **WHEN** se comparan las claves de `es.json` y `en.json`
- **THEN** ambos ficheros tienen exactamente las mismas claves

### Requirement: Sesión disponible para toda la aplicación
`main.tsx` MUST montar el proveedor de sesión alrededor de `App` sin contener lógica propia. `App.tsx` MUST declarar las rutas públicas (`/registro`, `/login`, `/privacidad`, `/invitacion` y `/restablecer`) fuera del layout de las páginas autenticadas, la ruta `/` como una redirección a `/login` (ver «Inicio de la aplicación»), y `/onboarding`, `/cursos`, `/cursos/nuevo` y `/usuarios` como rutas hijas de ese layout. Las páginas que dependan de la sesión MUST leerla del contexto, sin hacer sus propias peticiones de renovación, y MUST NOT repetir la guarda de sesión que ya aplica el layout.

#### Scenario: Ruta de Onboarding declarada
- **WHEN** se monta `App` en `/onboarding` con una sesión autenticada
- **THEN** se muestra la pantalla de bienvenida, la página de inicio de las páginas autenticadas, dentro de su layout

#### Scenario: Rutas de cursos declaradas
- **WHEN** se monta `App` en `/cursos` o en `/cursos/nuevo` con una sesión autenticada de cualquier rol
- **THEN** se muestran el listado de cursos o el formulario de creación dentro del layout, sin guarda de rol

#### Scenario: Rutas de cursos sin sesión
- **WHEN** un visitante sin sesión abre `/cursos` o `/cursos/nuevo`
- **THEN** la aplicación navega a `/login`

#### Scenario: Rutas existentes intactas
- **WHEN** se monta `App` en `/registro`
- **THEN** se muestra el formulario de registro como antes, sin redirecciones

#### Scenario: Proxy de la cookie
- **WHEN** el navegador llama a `/api/auth/refresh` en `dev` o en `preview`
- **THEN** la petición llega al backend a través del proxy de Vite y la cookie `refresh_token` se envía y se recibe sin configuración adicional, porque frontend y API comparten origen

## REMOVED Requirements

### Requirement: Página inicial
**Reason**: la página inicial vacía era un marcador de posición de la US00 (solo un título y una descripción, sin enlaces); la raíz pasa a redirigir a `/login`.
**Migration**: ver el requisito «Inicio de la aplicación». Se eliminan `HomePage`, sus textos `home.*` y su test; el E2E `home.cy.ts` comprueba ahora la redirección.
