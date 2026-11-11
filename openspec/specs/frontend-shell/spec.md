# frontend-shell Specification

## Purpose
Define el esqueleto del frontend: la raíz que lleva a `/login`, textos siempre por i18n, proxy de `/api` hacia el backend con destino configurable y puertos estrictos. Origen: cambio `bootstrap-proyecto` (US00).
## Requirements
### Requirement: Textos por i18n
Todo texto visible MUST obtenerse mediante react-i18next a partir de los recursos `es.json` y `en.json`, con castellano como idioma por defecto. El código MUST NOT contener textos visibles *hardcoded*.

#### Scenario: Idioma por defecto
- **GIVEN** un navegador sin preferencia de idioma guardada
- **WHEN** se carga la página de inicio de sesión
- **THEN** los textos se muestran en castellano desde `es.json`

#### Scenario: Recursos completos
- **WHEN** se comparan las claves de `es.json` y `en.json`
- **THEN** ambos ficheros tienen exactamente las mismas claves

### Requirement: Proxy de la API
Las peticiones del frontend a `/api/*` MUST redirigirse al backend mediante el proxy de Vite, tanto en `vite` (desarrollo) como en `vite preview`, de modo que frontend y API compartan origen. El destino del proxy MUST leerse de una variable de entorno (`API_PROXY_TARGET`) con el backend de desarrollo como valor por defecto, por lo que el frontend no necesita `.env`.

#### Scenario: Proxy en desarrollo
- **GIVEN** `npm run dev` en marcha
- **WHEN** el navegador pide `http://localhost:5173/api/health`
- **THEN** la petición llega al backend de desarrollo y responde `200`

#### Scenario: Proxy con destino configurado
- **GIVEN** `vite preview` arrancado con `API_PROXY_TARGET` apuntando al backend de E2E
- **WHEN** se pide `http://localhost:4173/api/health`
- **THEN** la petición llega al backend de E2E y no al de desarrollo

### Requirement: Puertos estrictos
El servidor de desarrollo de Vite y `vite preview` MUST fallar si su puerto está ocupado en lugar de saltar a otro.

#### Scenario: Puerto de preview ocupado
- **GIVEN** el puerto 4173 está ocupado
- **WHEN** se arranca `vite preview`
- **THEN** el proceso falla indicando que el puerto está en uso

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

