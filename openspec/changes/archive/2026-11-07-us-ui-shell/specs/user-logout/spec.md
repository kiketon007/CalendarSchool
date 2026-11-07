## MODIFIED Requirements

### Requirement: Cabecera con el botón de cierre de sesión
El frontend MUST mostrar, en todas las páginas que cuelgan del layout de las páginas autenticadas, una cabecera con el menú de usuario. Al abrirlo, el menú muestra el nombre del usuario, su rol, el nombre de su colegio y la opción «Cerrar sesión». Las páginas públicas (`/`, `/registro`, `/login` y `/privacidad`) MUST NOT mostrar la cabecera, aunque haya sesión. «Cerrar sesión» MUST cerrar la sesión directamente, sin diálogo de confirmación. MUST estar deshabilitada mientras el cierre está en curso, con una guarda síncrona contra pulsaciones repetidas. Todos los textos MUST venir de i18n.

#### Scenario: Cabecera con sesión
- **GIVEN** un usuario con la sesión iniciada
- **WHEN** abre `/onboarding` o cualquier otra página protegida y abre el menú de usuario
- **THEN** ve su nombre, su rol, el nombre de su colegio y «Cerrar sesión»

#### Scenario: Sin cabecera sin sesión
- **WHEN** un visitante sin sesión abre `/login`, `/registro` o `/privacidad`
- **THEN** no ve la cabecera

#### Scenario: Sin cabecera en las páginas públicas
- **GIVEN** un usuario con la sesión iniciada
- **WHEN** abre `/privacidad`
- **THEN** no ve la cabecera

#### Scenario: Una sola petición por pulsación
- **WHEN** el usuario pulsa «Cerrar sesión» dos veces seguidas
- **THEN** se envía una única petición `POST /api/auth/logout`

### Requirement: Comportamiento del frontend al cerrar sesión
Tras un `204` de `POST /api/auth/logout`, el frontend MUST:
- descartar el access token y el usuario de la memoria;
- dejar la sesión como `anonymous`;
- descartar cualquier renovación de sesión en curso;
- navegar a `/login` reemplazando la entrada del historial.

Con un `503`, un error de red o cualquier otra respuesta, MUST mantener la sesión y mostrar «No se ha podido cerrar la sesión. Inténtalo de nuevo» con `role="alert"`, bajo la cabecera y fuera del menú, que se cierra. Se puede reintentar abriendo de nuevo el menú. El servicio que llama al endpoint MUST interpretar la respuesta por su código y MUST NOT lanzar excepciones.

#### Scenario: Cierre correcto
- **GIVEN** un usuario con la sesión iniciada en `/onboarding`
- **WHEN** abre el menú de usuario, pulsa «Cerrar sesión» y el backend responde `204`
- **THEN** llega a `/login` y la cabecera desaparece

#### Scenario: La sesión no vuelve al recargar ni con «Atrás»
- **GIVEN** un usuario que acaba de cerrar sesión
- **WHEN** recarga la página o vuelve atrás a `/onboarding`
- **THEN** se le redirige a `/login`

#### Scenario: Cierre fallido
- **GIVEN** un usuario con la sesión iniciada
- **WHEN** pulsa «Cerrar sesión» y el backend responde `503` o la red falla
- **THEN** sigue en la misma página con la sesión iniciada
- **AND** ve «No se ha podido cerrar la sesión. Inténtalo de nuevo»

#### Scenario: Reintento tras un fallo
- **GIVEN** el aviso de cierre fallido visible
- **WHEN** el usuario abre el menú, pulsa «Cerrar sesión» y el backend responde `204`
- **THEN** el aviso desaparece y llega a `/login`

### Requirement: Pruebas E2E del cierre de sesión
El E2E MUST cubrir con Cypress el flujo login → menú de usuario → «Cerrar sesión» → `/login`. También MUST comprobar que, tras recargar la página, sigue sin sesión y que el refresh token anterior responde `401 INVALID_SESSION`.

#### Scenario: Flujo de cierre de sesión
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** la spec de cierre de sesión hace lo siguiente:
  - inicia sesión;
  - abre el menú de usuario y cierra sesión;
  - comprueba la redirección a `/login`;
  - recarga sin recuperar la sesión;
  - comprueba el `401` del token anterior.
