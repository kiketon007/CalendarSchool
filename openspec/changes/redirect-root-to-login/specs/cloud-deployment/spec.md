## MODIFIED Requirements

### Requirement: Mismo origen por HTTPS en el dominio propio
CloudFront MUST servir la aplicación en `https://app.calendarschools.es`, con el certificado de ACM, y MUST redirigir HTTP a HTTPS. CloudFront MUST servir el frontend desde un bucket de S3 privado, al que solo accede CloudFront (OAC), y MUST redirigir `/api/*` a la HTTP API sin caché y con todas las cabeceras, cookies y parámetros del visitante salvo `Host`. Una ruta de la SPA que no corresponde a un fichero MUST devolver `index.html` con `200`. Las rutas bajo `/api/` y los ficheros estáticos MUST NOT reescribirse.

#### Scenario: Raíz del dominio
- **GIVEN** un despliegue completado
- **WHEN** se abre `https://app.calendarschools.es`
- **THEN** se carga la aplicación y, sin sesión, la dirección pasa a `/login`

#### Scenario: Recarga en una ruta de la SPA
- **GIVEN** un despliegue completado
- **WHEN** se recarga `https://app.calendarschools.es/registro`
- **THEN** la respuesta es `200` con `index.html` y la aplicación pinta la página de registro

#### Scenario: Salud desde el mismo origen
- **GIVEN** un despliegue completado y la base de datos disponible
- **WHEN** se hace `GET https://app.calendarschools.es/api/health`
- **THEN** la respuesta es `200` con `{ "success": true, "data": { "status": "ok", "database": "up" } }`

#### Scenario: Ruta de la API desconocida
- **WHEN** se hace `GET https://app.calendarschools.es/api/no-existe`
- **THEN** la respuesta es la del backend, `404` con el código `NOT_FOUND` en JSON, y no `index.html`

#### Scenario: HTTP
- **WHEN** se abre `http://app.calendarschools.es`
- **THEN** CloudFront redirige a `https://app.calendarschools.es`

#### Scenario: Bucket privado
- **WHEN** se pide un fichero del frontend directamente a la URL del bucket de S3
- **THEN** S3 rechaza la petición
