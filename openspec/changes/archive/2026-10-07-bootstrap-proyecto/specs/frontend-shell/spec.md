## ADDED Requirements

### Requirement: Página inicial
El frontend MUST servir una página inicial vacía mediante el enrutado de la aplicación, identificable por un atributo `data-testid` estable.

#### Scenario: Carga de la página inicial
- **WHEN** un usuario abre `/` en el navegador
- **THEN** se muestra la página inicial con su `data-testid` y sin errores en la consola

### Requirement: Textos por i18n
Todo texto visible MUST obtenerse mediante react-i18next a partir de los recursos `es.json` y `en.json`, con castellano como idioma por defecto. El código MUST NOT contener textos visibles *hardcoded*.

#### Scenario: Idioma por defecto
- **GIVEN** un navegador sin preferencia de idioma guardada
- **WHEN** se carga la página inicial
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
