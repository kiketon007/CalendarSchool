## MODIFIED Requirements

### Requirement: Redirección a Onboarding tras el registro
Tras un `201`, el frontend MUST obtener la sesión con `POST /api/auth/refresh`, guardarla en memoria y navegar a `/onboarding`, sin pedir al usuario que inicie sesión. Hasta que exista US04, `/onboarding` MUST ser una página provisional que da la bienvenida con el nombre del usuario y del colegio, con un `data-testid` estable. Si no hay sesión autenticada, `/onboarding` MUST redirigir a `/login`. Mientras se resuelve la sesión MUST mostrar un indicador de carga accesible.

#### Scenario: Registro y redirección
- **WHEN** el usuario completa un registro válido y el servidor responde `201`
- **THEN** la aplicación navega a `/onboarding` y muestra la bienvenida con el nombre del usuario y del colegio
- **AND** no se muestra el formulario ni ningún mensaje de confirmación intermedio

#### Scenario: Recarga en Onboarding
- **GIVEN** un usuario en `/onboarding` con la cookie vigente
- **WHEN** recarga la página
- **THEN** sigue en `/onboarding` con la sesión recuperada por `refresh`

#### Scenario: Acceso sin sesión
- **WHEN** un visitante sin sesión abre `/onboarding`
- **THEN** es redirigido a `/login`

#### Scenario: Indicador de carga
- **WHEN** la sesión aún se está resolviendo al abrir `/onboarding`
- **THEN** se muestra un indicador con `role="status"` y no se redirige hasta tener la respuesta

#### Scenario: E2E del flujo completo
- **WHEN** se ejecuta Cypress con un registro de datos únicos
- **THEN** el flujo Registro → `/onboarding` pasa, la cookie `refresh_token` existe como `httpOnly`, `secure` y `sameSite=lax`, y no es legible desde `document.cookie`

### Requirement: Página de política de privacidad
El frontend MUST ofrecer una página pública `/privacidad`, accesible sin sesión, con la política de privacidad de CalendarSchool y la fecha de su última actualización. El texto MUST venir de i18n (`es.json` y `en.json`) y MUST describir al menos: el responsable del tratamiento y su email de contacto; los datos que se tratan en el registro (nombre del colegio, municipio, nombre, apellidos, email y contraseña, esta solo como hash) y en el inicio de sesión (email y contraseña, que solo se compara); la IP de los intentos de registro y de los intentos fallidos de inicio de sesión, y su plazo de conservación; la cookie de sesión `refresh_token` y su duración; reCAPTCHA de Google en el registro y en el inicio de sesión, los datos que recibe y cuándo se carga; los proveedores que tratan los datos (Supabase y AWS en la Unión Europea, y Google); los plazos de conservación, incluidas las copias de seguridad (30 días) y los logs de actividad (30 días), que contienen la IP y el user agent de las peticiones; la base jurídica; y los derechos de las personas interesadas, con la posibilidad de reclamar ante la Agencia Española de Protección de Datos. La página MUST cumplir WCAG 2.1 AA y MUST NOT cargar el script de reCAPTCHA. Al ampliar el texto, la fecha de `privacyPolicy.lastUpdated` y `PRIVACY_POLICY_VERSION` MUST cambiar a la vez.

#### Scenario: Página visible sin sesión
- **GIVEN** un visitante sin sesión
- **WHEN** abre `/privacidad`
- **THEN** ve la política de privacidad con la fecha de última actualización, sin redirecciones

#### Scenario: Contenido mínimo
- **WHEN** se abre `/privacidad`
- **THEN** la página nombra al responsable y su email de contacto, los datos del registro y del inicio de sesión, la IP, la cookie `refresh_token`, reCAPTCHA en el registro y en el inicio de sesión, los proveedores, los plazos de conservación, los logs con la IP y el user agent durante 30 días, la base jurídica y los derechos con la reclamación ante la AEPD

#### Scenario: Versión actualizada
- **WHEN** se ejecutan los tests del frontend y del backend tras ampliar el texto
- **THEN** `privacyPolicy.lastUpdated` de `es.json` y `en.json` y `PRIVACY_POLICY_VERSION` tienen la misma fecha nueva

#### Scenario: Recarga directa en producción
- **GIVEN** el entorno desplegado
- **WHEN** se recarga `https://app.calendarschools.es/privacidad`
- **THEN** la respuesta es `200` con `index.html` y la aplicación pinta la política

#### Scenario: Accesibilidad
- **WHEN** se analiza la página con las herramientas automáticas de accesibilidad
- **THEN** no hay violaciones WCAG 2.1 AA

#### Scenario: Sin reCAPTCHA
- **WHEN** se abre `/privacidad`
- **THEN** no se realiza ninguna petición a dominios de Google
