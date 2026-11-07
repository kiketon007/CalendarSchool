## MODIFIED Requirements

### Requirement: Cabecera de página reutilizable
El frontend MUST ofrecer el componente `PageHeader` con: un sobretítulo opcional (`.cs-eyebrow`), el título como `h1` con el `id` recibido, la ref recibida y `tabIndex={-1}` (para que las páginas sigan moviendo el foco a su título), una descripción opcional en texto secundario y un hueco opcional de acciones. Todo el texto MUST llegar por props ya traducidas (el componente no tiene textos propios) y pintarse como texto plano. En pantallas estrechas las acciones MUST pasar debajo del título sin desplazamiento horizontal. Las páginas de listado que adoptan el diseño (ver `list-page-layout`; hoy `/cursos` y `/calendarios`) MUST usarlo para su cabecera.

#### Scenario: Cabecera completa
- **GIVEN** un `PageHeader` con sobretítulo, título, descripción y un botón de acción
- **WHEN** se pinta
- **THEN** el sobretítulo precede al `h1`, el `h1` tiene el `id` indicado y `tabIndex=-1`, la descripción sigue al título y el botón aparece en la zona de acciones

#### Scenario: Foco programático en el título
- **GIVEN** una página que pasa una ref al `PageHeader`
- **WHEN** la página llama a `focus()` sobre esa ref
- **THEN** el foco queda en el `h1`

#### Scenario: Cabecera mínima
- **GIVEN** un `PageHeader` solo con título
- **WHEN** se pinta
- **THEN** no aparecen ni el sobretítulo, ni la descripción, ni un contenedor de acciones vacío

#### Scenario: Textos con marcas
- **GIVEN** un título o una descripción que contienen `<b>`
- **WHEN** se pinta la cabecera
- **THEN** se muestran como texto, sin interpretarse como HTML

#### Scenario: Accesible
- **GIVEN** un `PageHeader` completo
- **WHEN** se analiza con `axe`
- **THEN** no hay infracciones

#### Scenario: Adoptado por los listados
- **WHEN** se abren `/cursos` y `/calendarios`
- **THEN** su cabecera la pinta `PageHeader`, con sobretítulo y descripción
