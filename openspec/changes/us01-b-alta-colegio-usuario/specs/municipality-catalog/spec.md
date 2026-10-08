## ADDED Requirements

### Requirement: Tabla de municipios como datos fijos
La base de datos MUST contener la tabla `municipalities` con todos los municipios de la Comunitat Valenciana según la relación oficial del INE, cargada por una migración Prisma. Cada municipio MUST tener `code` (código INE de 5 dígitos, clave primaria), `name` (nombre oficial, p. ej. «Alacant/Alicante») y `province`. La tabla MUST ser la única fuente de verdad: la usan el endpoint `GET /api/municipalities` y la validación del registro.

#### Scenario: Municipios cargados por la migración
- **WHEN** se aplican las migraciones sobre una base vacía
- **THEN** `municipalities` contiene los 542 municipios de la Comunitat Valenciana (141 de Alicante, 135 de Castellón y 266 de Valencia)
- **AND** cada código tiene 5 dígitos y empieza por `03`, `12` o `46`

#### Scenario: Municipio con dos nombres oficiales
- **WHEN** se consulta el municipio con código INE `03014`
- **THEN** su `name` es `Alacant/Alicante` y su `province` es `Alicante/Alacant`

### Requirement: Listado público de municipios
El sistema MUST exponer `GET /api/municipalities`, público (sin autenticación), que responde `200` con el formato de éxito común y en `data` la lista de municipios, cada uno con `code`, `name` y `province`, ordenada por `name`. La respuesta MUST incluir `Cache-Control: public` con una caducidad de al menos un día, porque los datos son fijos. El endpoint MUST estar documentado en `docs/api-spec.yml`.

#### Scenario: Listado sin autenticación
- **WHEN** un cliente sin sesión llama a `GET /api/municipalities`
- **THEN** recibe `200` con `success: true` y `data` con los municipios ordenados por `name`
- **AND** cada elemento tiene `code`, `name` y `province`

#### Scenario: Respuesta cacheable
- **WHEN** un cliente llama a `GET /api/municipalities`
- **THEN** la respuesta incluye una cabecera `Cache-Control` con `public` y `max-age` de al menos 86400 segundos

#### Scenario: Base de datos no disponible
- **WHEN** la base de datos no responde durante la llamada
- **THEN** recibe `503` con el código `DATABASE_UNAVAILABLE` en el formato de error común

### Requirement: Selección de municipio en el formulario
El formulario de registro MUST cargar la lista de `GET /api/municipalities` y ofrecer un buscador sobre ella que muestre el nombre oficial y la provincia de cada municipio. El usuario MUST elegir un municipio de la lista, sin admitir texto libre.

#### Scenario: Búsqueda de municipio
- **WHEN** el usuario escribe «alac» en el buscador de municipios
- **THEN** la lista muestra los municipios cuyo nombre oficial contiene ese texto sin distinguir mayúsculas ni acentos, cada uno con su provincia

#### Scenario: Texto libre no aceptado
- **WHEN** el usuario escribe un texto que no corresponde a ningún municipio y no elige ninguno de la lista
- **THEN** no hay municipio seleccionado y el formulario muestra el error inline «Selecciona el municipio del colegio en la lista» al enviarlo

#### Scenario: Fallo al cargar la lista
- **WHEN** la llamada a `GET /api/municipalities` falla
- **THEN** el formulario muestra un mensaje en lenguaje claro con la opción de reintentar y no permite enviar el registro
